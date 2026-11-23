import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  aggregateSkillAbRuns,
  classifySkillVerdict,
  loadSkillAbTasks,
  verifyTaskDiscrimination,
} from '../src/skill-ab-eval.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');
const tasksRoot = join(repoRoot, 'evals', 'skill-ab', 'tasks');
const fixturesRoot = join(repoRoot, 'evals', 'skill-ab', 'fixtures');

test('loads all 16 skill A/B tasks across debug, spec, plan2exec, clarify, and exec', async () => {
  const tasks = await loadSkillAbTasks(tasksRoot);
  assert.equal(tasks.length, 16);
  const byCategory = tasks.reduce((acc, task) => {
    acc[task.category] = (acc[task.category] ?? 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(byCategory, { clarify: 2, debug: 4, exec: 2, plan2exec: 3, spec: 5 });
});

test('all 16 skill A/B hidden suites and guardrails discriminate pristine vs reference solution', async () => {
  const tasks = await loadSkillAbTasks(tasksRoot);
  for (const task of tasks) {
    const result = await verifyTaskDiscrimination(fixturesRoot, task);
    assert.equal(
      result.pristinePassed,
      false,
      `${task.id}: pristine fixture must FAIL hidden suite or guardrails`,
    );
    assert.equal(
      result.solvedPassed,
      true,
      `${task.id}: reference solution must PASS hidden suite and guardrails (hidden=${result.solvedHidden.passed}, guardrails=${JSON.stringify(result.solvedGuardrails.findings)})`,
    );
  }
});

test('classifySkillVerdict applies pre-registered KEEP / CUT_OR_FOLD / INCONCLUSIVE rules', () => {
  assert.equal(
    classifySkillVerdict({
      newVsSlimDelta: 0.2,
      newVsSlimCi: [0.05, 0.35],
      newVsOldDelta: 0.1,
      newMedianTokens: 25000,
      slimMedianTokens: 20000,
      oldMedianTokens: 45000,
    }),
    'KEEP',
  );
  assert.equal(
    classifySkillVerdict({
      newVsSlimDelta: 0.0,
      newVsSlimCi: [-0.1, 0.1],
      newVsOldDelta: 0.0,
      newMedianTokens: 35000,
      slimMedianTokens: 20000,
      oldMedianTokens: 35000,
    }),
    'CUT_OR_FOLD',
  );
  assert.equal(
    classifySkillVerdict({
      newVsSlimDelta: 0.05,
      newVsSlimCi: [-0.05, 0.15],
      newVsOldDelta: 0.0,
      newMedianTokens: 21000,
      slimMedianTokens: 20000,
      oldMedianTokens: 22000,
    }),
    'INCONCLUSIVE',
  );
});

test('skill A/B dry-run runner produces v1 report across all 4 arms and 9 tasks', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'loopx-skill-ab-dry-'));
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [join(repoRoot, 'scripts', 'run-skill-ab-evals.mjs'), '--dry-run', '--out', outDir],
      { cwd: repoRoot },
    );
    assert.match(stdout, /64\/64 scored/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('aggregateSkillAbRuns computes per-category arm stats and bootstrap pairs', () => {
  const runs = [
    { category: 'debug', arm: 'bare', passed: false, blocked: false, total_tokens: 10000, duration_ms: 100 },
    { category: 'debug', arm: 'slim-agents', passed: false, blocked: false, total_tokens: 12000, duration_ms: 110 },
    { category: 'debug', arm: 'loopx-old', passed: true, blocked: false, total_tokens: 40000, duration_ms: 300 },
    { category: 'debug', arm: 'loopx-new', passed: true, blocked: false, total_tokens: 18000, duration_ms: 150 },
  ];
  const agg = aggregateSkillAbRuns(runs, { seed: 1, iterations: 200 });
  assert.equal(agg.categories.debug.verdict, 'KEEP');
  assert.equal(agg.categories.debug.pairs['loopx-new vs slim-agents'].delta, 1);
});
