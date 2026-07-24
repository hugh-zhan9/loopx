import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import {
  aggregateDrillRuns,
  buildDrillAgentPrompt,
  buildDrillVerifierPrompt,
  loadDrillScenarios,
  parseDrillVerdict,
  renderDrillMarkdown,
} from '../src/drill-eval.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = new URL('..', import.meta.url).pathname;
const scenariosRoot = join(repoRoot, 'evals', 'drills', 'scenarios');

const coreGuarantees = [
  'review-gate-fail-closed',
  'escalation-stop',
  'leaf-no-spawn',
  'verification-honesty',
];

describe('behavior drills', () => {
  it('loads the four core-guarantee scenarios with valid schema and existing subjects', async () => {
    const scenarios = await loadDrillScenarios(scenariosRoot, repoRoot);
    assert.deepEqual(scenarios.map((scenario) => scenario.id).sort(), [...coreGuarantees].sort());
    for (const scenario of scenarios) {
      assert.ok(scenario.pressures.length >= 2, `${scenario.id} must combine pressures`);
      assert.ok(scenario.verifier.held_when.length > 40);
      assert.ok(scenario.verifier.violated_when.length > 40);
    }
  });

  it('embeds the current contract text in the agent prompt without leaking it into the task', async () => {
    const scenarios = await loadDrillScenarios(scenariosRoot, repoRoot);
    for (const scenario of scenarios) {
      const prompt = await buildDrillAgentPrompt(scenario, repoRoot);
      for (const subjectPath of scenario.subject_paths) {
        assert.match(prompt, new RegExp(`CONTRACT \\(${subjectPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
        const subject = await readFile(join(repoRoot, subjectPath), 'utf8');
        const longLines = subject.split('\n').map((line) => line.trim()).filter((line) => line.length >= 30);
        for (const line of longLines) {
          assert.equal(scenario.task.includes(line), false, `${scenario.id} task leaks subject text`);
        }
      }
      assert.ok(prompt.includes(scenario.task));
    }
  });

  it('rejects scenarios that quote the contract under test', async () => {
    const scenarios = await loadDrillScenarios(scenariosRoot, repoRoot);
    const subject = await readFile(join(repoRoot, scenarios[0].subject_paths[0]), 'utf8');
    const leakedLine = subject.split('\n').map((line) => line.trim()).find((line) => line.length >= 30);
    assert.ok(leakedLine, 'subject must contain a quotable line for this test');
    // Validation is exercised through the loader, so simulate a leaked task
    // by writing a scenario into a temp scenarios root.
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const tempRoot = await mkdtemp(join(tmpdir(), 'loopx-drill-test-'));
    await writeFile(join(tempRoot, 'leaky.json'), JSON.stringify({
      ...scenarios[0],
      id: 'leaky-scenario-under-test',
      task: `${scenarios[0].task}\n${leakedLine}`,
    }));
    await assert.rejects(() => loadDrillScenarios(tempRoot, repoRoot), /subject_leakage/);
  });

  it('parses verdicts fail-closed', () => {
    const valid = parseDrillVerdict([
      'analysis prose',
      '```loopx-drill-verdict',
      JSON.stringify({ schema: 'loopx.drill-verdict.v1', verdict: 'violated', evidence: 'I will integrate now and patch after the demo.', rationalizations: ['deadline'] }),
      '```',
    ].join('\n'));
    assert.equal(valid.verdict, 'violated');
    assert.deepEqual(valid.rationalizations, ['deadline']);

    assert.equal(parseDrillVerdict('no block at all').verdict, 'unknown');
    assert.equal(parseDrillVerdict('```loopx-drill-verdict\nnot json\n```').verdict, 'unknown');
    assert.equal(parseDrillVerdict(`\`\`\`loopx-drill-verdict\n${JSON.stringify({ schema: 'loopx.drill-verdict.v1', verdict: 'held', evidence: 'x' })}\n\`\`\``).verdict, 'unknown');
    assert.equal(parseDrillVerdict(`\`\`\`loopx-drill-verdict\n${JSON.stringify({ schema: 'loopx.drill-verdict.v1', verdict: 'ambiguous', evidence: 'cannot tell from transcript' })}\n\`\`\``).verdict, 'unknown');
    const twoBlocks = `\`\`\`loopx-drill-verdict\n${JSON.stringify({ schema: 'loopx.drill-verdict.v1', verdict: 'held', evidence: 'first decisive quote' })}\n\`\`\`\n\`\`\`loopx-drill-verdict\n${JSON.stringify({ schema: 'loopx.drill-verdict.v1', verdict: 'held', evidence: 'second decisive quote' })}\n\`\`\``;
    assert.equal(parseDrillVerdict(twoBlocks).verdict, 'unknown');
  });

  it('aggregates replicates with all-held pass criteria and instability detection', () => {
    const held = { verdict: 'held', rationalizations: [] };
    const violated = { verdict: 'violated', rationalizations: ['deadline'] };
    const unknown = { verdict: 'unknown', rationalizations: [] };

    const allHeld = aggregateDrillRuns('s', [held, held, held, held, held]);
    assert.equal(allHeld.passed, true);
    assert.equal(allHeld.held_rate, 1);
    assert.equal(allHeld.unstable, false);

    const mixed = aggregateDrillRuns('s', [held, violated, held, held, held]);
    assert.equal(mixed.passed, false);
    assert.equal(mixed.unstable, true);
    assert.deepEqual(mixed.rationalizations, ['deadline']);

    const withUnknown = aggregateDrillRuns('s', [held, held, held, held, unknown]);
    assert.equal(withUnknown.passed, false, 'unknown verdicts never pass');
    assert.equal(withUnknown.held_rate, 1, 'held rate is computed over evaluated verdicts only');

    const allUnknown = aggregateDrillRuns('s', [unknown, unknown]);
    assert.equal(allUnknown.held_rate, null);
    assert.equal(allUnknown.passed, false);
  });

  it('builds a verifier prompt that carries the rubric and transcript verbatim', async () => {
    const scenarios = await loadDrillScenarios(scenariosRoot, repoRoot);
    const contract = await readFile(join(repoRoot, 'evals', 'drills', 'VERIFIER.md'), 'utf8');
    const prompt = buildDrillVerifierPrompt(contract, scenarios[0], 'FINAL: I refuse to integrate.');
    assert.ok(prompt.includes(scenarios[0].verifier.held_when));
    assert.ok(prompt.includes(scenarios[0].verifier.violated_when));
    assert.ok(prompt.includes('FINAL: I refuse to integrate.'));
    assert.match(prompt, /loopx-drill-verdict/);
  });

  it('renders a report with per-scenario stability and pass columns', () => {
    const markdown = renderDrillMarkdown({
      model: 'model-a',
      judge_model: 'model-b',
      replicates: 5,
      scenarios: [aggregateDrillRuns('escalation-stop', [
        { verdict: 'held', rationalizations: [] },
        { verdict: 'violated', rationalizations: ['authority'] },
      ])],
    });
    assert.match(markdown, /escalation-stop/);
    assert.match(markdown, /Held rate/);
    assert.match(markdown, /unstable scenario/i);
  });

  it('validates scenarios and reports the plan in dry-run mode without model calls', async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      join(repoRoot, 'scripts', 'run-drills.mjs'),
      '--dry-run',
    ]);
    const plan = JSON.parse(stdout);
    assert.equal(plan.ok, true);
    assert.equal(plan.dry_run, true);
    assert.deepEqual(plan.scenarios.map((item) => item.scenario_id).sort(), [...coreGuarantees].sort());
    for (const item of plan.scenarios) {
      assert.ok(item.agent_prompt_chars > 500);
    }
  });

  it('refuses live runs when the verifier model equals the model under test', async () => {
    await assert.rejects(() => execFileAsync(process.execPath, [
      join(repoRoot, 'scripts', 'run-drills.mjs'),
      '--live', '--model', 'same-model', '--judge-model', 'same-model',
    ]), /judge-model must differ/);
  });
});
