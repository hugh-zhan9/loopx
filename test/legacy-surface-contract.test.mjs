import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  LOOPX_BUNDLED_SKILLS,
  LOOPX_CANONICAL_WORKFLOW_SKILLS,
} from '../src/install-discovery.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const removedSkills = [
  'exec',
  'review',
  'finish',
  'subagent-exec',
  'parallel-subagent-exec',
  'final-review',
  'fix-review',
];

test('discovery exposes only the three docs-first canonical intents', () => {
  assert.deepEqual(LOOPX_CANONICAL_WORKFLOW_SKILLS, ['clarify', 'spec', 'plan2exec']);
  for (const skillName of LOOPX_CANONICAL_WORKFLOW_SKILLS) {
    assert.equal(LOOPX_BUNDLED_SKILLS.includes(skillName), true);
  }
  for (const skillName of removedSkills) {
    assert.equal(LOOPX_BUNDLED_SKILLS.includes(skillName), false);
    assert.equal(existsSync(join(repoRoot, 'skills', skillName, 'SKILL.md')), false);
  }
});

test('removed orchestration and hook payloads stay absent', () => {
  for (const path of [
    'skills/exec',
    'skills/review',
    'skills/shared/agent-topology.md',
    'skills/shared/review-contract.md',
    'scripts/codex-workflow-hook.mjs',
    'scripts/claude-workflow-hook.mjs',
    'src/workflow-state.mjs',
  ]) {
    assert.equal(existsSync(join(repoRoot, path)), false, `${path} must remain removed`);
  }
});

test('public docs describe the docs-first product surface', async () => {
  for (const path of [
    'README.md',
    'README.zh-CN.md',
    'docs/loopx/cli.md',
    'docs/loopx/cli.zh-CN.md',
    'docs/loopx/skills.md',
    'docs/loopx/skills.zh-CN.md',
  ]) {
    const text = await readFile(join(repoRoot, path), 'utf8');
    assert.match(text, /docs-first|three canonical workflow intents|三个 canonical\s+workflow intents/i, path);
    assert.match(text, /working agreement/i, path);
    for (const skillName of LOOPX_CANONICAL_WORKFLOW_SKILLS) {
      assert.match(text, new RegExp(`\\b${skillName}\\b`), path);
    }
  }
});
