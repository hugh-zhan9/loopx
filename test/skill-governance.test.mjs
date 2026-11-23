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
      assert.equal(existsSync(join(repoRoot, 'skills', skillName, 'agents', 'openai.yaml')), true, skillName);
      assert.equal(packageJson.files.includes(`skills/${skillName}/`), true, skillName);
    }
    assert.equal(packageJson.files.includes('templates/working-agreement.md'), true);
  });

  it('keeps the working agreement concise and explicit about stop, verification, review, and Git discipline', async () => {
    const raw = await readFile(join(repoRoot, 'templates', 'working-agreement.md'), 'utf8');
    const lines = raw.trimEnd().split('\n').length;
    assert.ok(lines <= 65, `working-agreement.md should stay lean (<= 65 lines), got ${lines}`);

    const agreement = raw.replace(/\s+/g, ' ');
    assert.match(agreement, /Stop the affected work and ask only when a material decision is unresolved/);
    assert.match(agreement, /Prefer existing owning modules and extension points/);
    assert.match(agreement, /settle it in `\/spec` before editing/);
    assert.match(agreement, /Verify every claim with fresh command output/);
    assert.match(agreement, /Reserve independent subagent review \(`\/code-review`\)/);
    assert.match(agreement, /Never commit, push, merge, or discard work unless the user explicitly asks/);
  });

  it('keeps mutation checks scoped to explicit tdd instead of always-on working agreement', async () => {
    const agreement = await readFile(join(repoRoot, 'templates', 'working-agreement.md'), 'utf8');
    assert.doesNotMatch(agreement, /mutation-check\.md/);
    const tdd = await readFile(join(repoRoot, 'skills', 'tdd', 'SKILL.md'), 'utf8');
    assert.match(tdd, /\(references\/mutation-check\.md\)/);
  });

  it('keeps the mutation check independent of any specific tool', async () => {
    const contract = await readFile(join(repoRoot, 'skills', 'tdd', 'references', 'mutation-check.md'), 'utf8');
    assert.match(contract, /The repository decides the tool, command, and configuration/);
    assert.match(contract.replace(/\s+/g, ' '), /documented tool is missing or cannot run, use targeted manual mutations only/);
    for (const tool of [/gremlins/i, /mutago/i, /go-mutesting/i, /ooze/i, /pitest/i, /stryker/i, /mutmut/i, /cargo-mutants/i]) {
      assert.doesNotMatch(contract, tool);
    }
  });

  it('enforces dual-channel invocation split (only core autonomous disciplines are model-invoked)', async () => {
    const modelInvoked = [];
    const userInvoked = [];
    for (const skillName of LOOPX_BUNDLED_SKILLS) {
      const text = await readFile(join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
      if (/^disable-model-invocation:\s*true$/m.test(text)) {
        userInvoked.push(skillName);
      } else {
        modelInvoked.push(skillName);
      }
    }
    assert.deepEqual(modelInvoked.sort(), ['debug', 'go-kratos', 'tdd']);
    assert.ok(userInvoked.includes('code-review'));
    assert.ok(userInvoked.includes('spec'));
    assert.ok(userInvoked.includes('plan2exec'));
    assert.ok(userInvoked.includes('clarify'));
    assert.ok(userInvoked.includes('ask-loopx'));
  });

  it('retires redundant lenses and textbook skills cleanly', () => {
    for (const retired of [
      'issue', 'fix', 'lancet', 'api-designer', 'sql-style', 'cli-developer',
      'architecture-designer', 'requirement-analyzer', 'using-git-worktrees',
      'prompt-lint', 'maintain-project-docs', 'go-style', 'kratos',
    ]) {
      assert.equal(LOOPX_BUNDLED_SKILLS.includes(retired), false, retired);
      assert.equal(existsSync(join(repoRoot, 'skills', retired, 'SKILL.md')), false, retired);
    }
  });

  it('keeps benchmark, skill-ab, and drill evidence in the repository but out of the runtime package', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(existsSync(join(repoRoot, 'evals', 'benchmark')), true);
    assert.equal(existsSync(join(repoRoot, 'evals', 'skill-ab')), true);
    assert.equal(existsSync(join(repoRoot, 'evals', 'drills')), true);
    assert.equal(existsSync(join(repoRoot, 'scripts', 'run-benchmark-evals.mjs')), true);
    assert.equal(existsSync(join(repoRoot, 'scripts', 'run-skill-ab-evals.mjs')), true);
    assert.equal(existsSync(join(repoRoot, 'scripts', 'run-drills.mjs')), true);
    assert.equal(packageJson.files.includes('evals/benchmark/'), false);
    assert.equal(packageJson.files.includes('evals/skill-ab/'), false);
    assert.equal(packageJson.files.includes('evals/drills/'), false);
    assert.equal(packageJson.files.includes('scripts/run-skill-ab-evals.mjs'), false);
  });

  it('keeps superseded project documents outside current authority and default memory retrieval', async () => {
    const historicalPaths = [
      'docs/loopx/design/loopx-skill-suite-v1-design.md',
      'docs/loopx/plans/loopx-skill-suite-v1-implementation.md',
      'docs/loopx/specs/prompt-first-adaptive-execution.md',
      'docs/adr/0001-prompt-first-adaptive-execution.md',
    ];
    for (const path of historicalPaths) {
      assert.equal(existsSync(join(repoRoot, path)), false, `${path} must not remain current`);
      assert.equal(existsSync(join(repoRoot, 'docs', 'archive', path)), true, `${path} must be archived`);
    }

    assert.equal(existsSync(join(repoRoot, 'docs', 'loopx', 'decisions', 'docs-first-pivot.md')), true);
    const mempalIgnore = await readFile(join(repoRoot, '.mempalignore'), 'utf8');
    assert.match(mempalIgnore, /^docs\/archive\/$/m);
  });
});
