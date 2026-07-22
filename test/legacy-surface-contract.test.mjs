import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  LOOPX_BUNDLED_SKILLS,
  LOOPX_CANONICAL_WORKFLOW_SKILLS,
  LOOPX_COMPATIBILITY_ALIAS_SKILLS,
  LOOPX_EXECUTION_PROFILE_SKILLS,
} from '../src/install-discovery.mjs';
import { clarifyStage, initWorkspace, statusSummary } from '../src/workflow.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const cliPath = join(repoRoot, 'src', 'cli.mjs');
const execFileAsync = promisify(execFile);

async function skillPayloadFiles(skillName) {
  const root = join(repoRoot, 'skills', skillName);
  const files = [];
  async function visit(path, prefix = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(join(path, entry.name), relativePath);
      } else if (entry.isFile() && entry.name !== '.DS_Store') {
        files.push(relativePath);
      }
    }
  }
  await visit(root);
  return files.sort();
}

test('discovery classifies canonical intents, execution profiles, and compatibility aliases', async () => {
  assert.deepEqual(LOOPX_CANONICAL_WORKFLOW_SKILLS, [
    'clarify',
    'spec',
    'plan2exec',
    'exec',
    'review',
    'finish',
  ]);
  assert.deepEqual(LOOPX_COMPATIBILITY_ALIAS_SKILLS, [
    'final-review',
    'fix-review',
  ]);
  assert.deepEqual(LOOPX_EXECUTION_PROFILE_SKILLS, ['subagent-exec', 'parallel-subagent-exec']);

  for (const skillName of [
    ...LOOPX_CANONICAL_WORKFLOW_SKILLS,
    ...LOOPX_EXECUTION_PROFILE_SKILLS,
    ...LOOPX_COMPATIBILITY_ALIAS_SKILLS,
  ]) {
    assert.equal(LOOPX_BUNDLED_SKILLS.includes(skillName), true, `${skillName} must remain installed`);
    const skill = await readFile(join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
    assert.equal(
      /disable-model-invocation:\s*true/.test(skill),
      [...LOOPX_EXECUTION_PROFILE_SKILLS, ...LOOPX_COMPATIBILITY_ALIAS_SKILLS].includes(skillName),
      `${skillName} discovery visibility`,
    );
  }
});

test('workspace routing and CLI expose canonical intents without a Golden path lifecycle', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'loopx-contract-routing-'));
  const initialized = await initWorkspace(cwd, { slug: 'canonical-routing' });
  assert.equal(Object.hasOwn(initialized.config, 'default_flow'), false);

  const clarified = await clarifyStage(cwd, 'canonical-routing');
  await writeFile(
    clarified.state.clarification_path,
    [
      '---',
      'schema_version: 2',
      'workflow_id: canonical-routing',
      'stage: clarify',
      'current_round: 2',
      'ambiguity_score: 0.1',
      'non_goals_resolved: true',
      'decision_boundaries_resolved: true',
      'pressure_pass_complete: true',
      'unresolved_ambiguity_count: 0',
      '---',
      '',
      '# Clarification Log: canonical-routing',
      '',
      '## Resume State',
      '',
      '- current_round: 2',
      '- unresolved_count: 0',
      '- non_goals_resolved: true',
      '- decision_boundaries_resolved: true',
      '- pressure_pass_complete: true',
      '- handoff_decision: direct_to_plan',
      '- next_question: none',
    ].join('\n'),
  );
  const status = await statusSummary(cwd, 'canonical-routing');
  assert.equal(status.next_skill_command, `$plan2exec ${status.intake_package_path}`);

  const { stdout: help } = await execFileAsync(process.execPath, [cliPath]);
  for (const removedCommand of ['finish-start', 'execution-start', 'finish-audit', 'finish-record']) {
    assert.doesNotMatch(help, new RegExp(`loopx ${removedCommand}`));
    await assert.rejects(
      execFileAsync(process.execPath, [cliPath, removedCommand]),
      (error) => error.code === 1 && new RegExp(`unknown_command:${removedCommand}`).test(error.stderr),
    );
  }
});

test('retired lifecycle payload stays removed while profiles and aliases remain installed', async () => {
  const obsoletePaths = [
    'src/codex-exec-runtime.mjs',
    'src/finish-runtime.mjs',
    'skills/shared/parallel-plan-contract.md',
    'skills/shared/scripts/parallel-plan-contract.mjs',
    'skills/exec/references/checkpoints-and-resume.md',
    'skills/exec/references/multi-plan-package-mode.md',
    'skills/final-review/final-reviewer.md',
    'skills/final-review/references/report-template.en.md',
    'skills/final-review/references/report-template.zh-CN.md',
    'skills/finish/references/final-review-and-finish-gates.md',
    'skills/finish/references/memory-and-spec-candidates.md',
    'skills/plan/SKILL.md',
    'skills/plan/references/plan-schema.md',
    'skills/plan-to-exec/SKILL.md',
    'skills/plan-to-exec/references/internal-plan-review.md',
    'skills/plan-to-exec/references/plan-schema.md',
    'skills/plan-to-exec/references/surface-change-planning.md',
  ];
  for (const path of obsoletePaths) {
    assert.equal(existsSync(join(repoRoot, path)), false, `${path} must be removed`);
  }

  for (const skillName of LOOPX_COMPATIBILITY_ALIAS_SKILLS) {
    assert.deepEqual(await skillPayloadFiles(skillName), ['SKILL.md']);
  }
  assert.equal((await skillPayloadFiles('subagent-exec')).includes('implementer-prompt.md'), true);
  assert.equal((await skillPayloadFiles('subagent-exec')).includes('task-reviewer-prompt.md'), true);
  assert.deepEqual(await skillPayloadFiles('parallel-subagent-exec'), ['SKILL.md']);

  for (const retainedSkill of ['issue', 'fix', 'plan-reviewer', 'api-designer', 'architecture-designer']) {
    assert.equal(LOOPX_BUNDLED_SKILLS.includes(retainedSkill), true, `${retainedSkill} must remain bundled`);
  }
});

test('English and Chinese product docs describe one six-intent prompt-first surface', async () => {
  const docs = [
    'README.md',
    'README.zh-CN.md',
    'docs/loopx/cli.md',
    'docs/loopx/cli.zh-CN.md',
    'docs/loopx/skills.md',
    'docs/loopx/skills.zh-CN.md',
  ];
  for (const path of docs) {
    const text = await readFile(join(repoRoot, path), 'utf8');
    assert.match(text, /six canonical (?:workflow )?intents|六个 canonical (?:workflow )?intents/i, path);
    for (const skillName of LOOPX_CANONICAL_WORKFLOW_SKILLS) {
      assert.match(text, new RegExp(`\\b${skillName}\\b`), `${path} missing ${skillName}`);
    }
    assert.match(text, /prompt-first/i, `${path} missing prompt-first routing`);
    assert.doesNotMatch(text, /Golden path|黄金路径/i, path);
    assert.doesNotMatch(text, /finish audit|finish-audit|finish-start|execution-start|finish-record/i, path);
  }

  for (const path of ['README.md', 'README.zh-CN.md', 'docs/loopx/skills.md', 'docs/loopx/skills.zh-CN.md']) {
    const text = await readFile(join(repoRoot, path), 'utf8');
    assert.match(text, /explicit-only compatibility|仅显式调用.*兼容|显式兼容/i, path);
    for (const alias of LOOPX_COMPATIBILITY_ALIAS_SKILLS) {
      assert.match(text, new RegExp(`\\b${alias}\\b`), `${path} missing compatibility alias ${alias}`);
    }
  }
});
