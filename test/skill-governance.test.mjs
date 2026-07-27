import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const repoRoot = resolve(import.meta.dirname, '..');

describe('loopx docs-first governance', () => {
  it('packages every bundled skill and the working agreement', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    for (const skillName of LOOPX_BUNDLED_SKILLS) {
      assert.equal(existsSync(join(repoRoot, 'skills', skillName, 'SKILL.md')), true, skillName);
      assert.equal(packageJson.files.includes(`skills/${skillName}/`), true, skillName);
    }
    assert.equal(packageJson.files.includes('templates/working-agreement.md'), true);
  });

  it('keeps the working agreement explicit about stop, verification, review, and Git discipline', async () => {
    const agreement = await readFile(join(repoRoot, 'templates', 'working-agreement.md'), 'utf8');
    assert.match(agreement, /Run the repository test suite after your change/);
    assert.match(agreement, /Only claim completion from fresh command output/);
    assert.match(agreement, /independent subagent review the exact diff/);
    assert.match(agreement, /do not guess and do not write code/);
    assert.match(agreement, /Never commit, push, merge, or discard work unless the user explicitly asks/);
  });

  it('keeps issue and fix workflows beside support lenses', () => {
    for (const skillName of ['issue', 'fix', 'debug', 'tdd', 'verify', 'plan-reviewer', 'lancet']) {
      assert.equal(LOOPX_BUNDLED_SKILLS.includes(skillName), true, skillName);
    }
  });

  it('keeps benchmark and drill evidence in the repository but out of the runtime package', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(existsSync(join(repoRoot, 'evals', 'benchmark')), true);
    assert.equal(existsSync(join(repoRoot, 'evals', 'drills')), true);
    assert.equal(existsSync(join(repoRoot, 'scripts', 'run-benchmark-evals.mjs')), true);
    assert.equal(existsSync(join(repoRoot, 'scripts', 'run-drills.mjs')), true);
    assert.equal(packageJson.files.includes('evals/benchmark/'), false);
    assert.equal(packageJson.files.includes('evals/drills/'), false);
    assert.equal(packageJson.files.includes('scripts/run-benchmark-evals.mjs'), false);
    assert.equal(packageJson.files.includes('scripts/run-drills.mjs'), false);
  });
});
