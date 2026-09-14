import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { installSkillsForTargets } from '../src/install-discovery.mjs';
import { createTemplateBaseline, writeTemplateBaseline } from '../src/template-governance.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
// Fixed pre-upgrade records: expected hashes are not computed by the installer under test.
const legacy = JSON.parse(await readFile(join(repoRoot, 'test/fixtures/retired-skills.json'), 'utf8'));

for (const scenario of ['pristine', 'modified', 'modified support file', 'support file link', 'unknown file', 'root link', 'missing baseline', 'foreign owner']) {
  test(`both hosts preserve upgrade ownership with ${scenario} retired skills`, async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-review-upgrade-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = {
      ...process.env, LOOPX_HOME: home, LOOPX_PROJECT_ROOT: repoRoot,
      LOOPX_AGENTS_ROOT: join(home, '.agents'),
      LOOPX_SKILLS_ROOT: join(home, '.agents/skills'),
      LOOPX_CLAUDE_SKILLS_ROOT: join(home, '.claude/skills'),
      LOOPX_SKILL_LOCK_PATH: join(home, '.agents/.skill-lock.json'),
      LOOPX_TEMPLATE_BASELINE_PATH: join(home, '.loopx/template-hashes.json'),
    };
    const targets = [
      ['codex', env.LOOPX_SKILLS_ROOT, env.LOOPX_SKILL_LOCK_PATH, env.LOOPX_TEMPLATE_BASELINE_PATH],
      ['claude', env.LOOPX_CLAUDE_SKILLS_ROOT, join(home, '.claude/.loopx-skill-lock.json'), join(home, '.claude/.loopx-template-hashes.json')],
    ];
    const protectedFiles = [];
    for (const [target, root, lockPath, baselinePath] of targets) {
      const rows = {};
      const items = [];
      for (const [name, fixture] of Object.entries(legacy)) {
        const installedPath = join(root, name);
        for (const [file, content] of Object.entries(fixture.files)) {
          await mkdir(dirname(join(installedPath, file)), { recursive: true });
          await writeFile(join(installedPath, file), content);
        }
        rows[name] = {
          source: scenario === 'foreign owner' ? 'user' : 'loopx',
          sourceType: 'local', installationIdentity: 'loopx', sourceUrl: '/legacy-loopx',
          skillPath: `skills/${name}/SKILL.md`, installedPath, skillFolderHash: fixture.hash,
        };
        items.push({ path: join(installedPath, 'SKILL.md'), sourcePath: `/legacy-loopx/skills/${name}/SKILL.md`, kind: 'skill' });
      }
      await mkdir(dirname(lockPath), { recursive: true });
      await writeFile(lockPath, JSON.stringify({ version: 3, skills: rows }));
      if (scenario !== 'missing baseline') {
        await writeTemplateBaseline(baselinePath, await createTemplateBaseline(home, items));
      }
      for (const [name, fixture] of Object.entries(legacy)) {
        const path = join(root, name);
        if (['modified', 'modified support file', 'unknown file'].includes(scenario)) {
          const file = join(path, scenario === 'modified' ? Object.keys(fixture.files)[0]
            : scenario === 'modified support file' ? Object.keys(fixture.files).at(-1) : 'notes.md');
          await writeFile(file, 'User content must survive.\n');
          protectedFiles.push([file, 'User content must survive.\n']);
        } else if (scenario === 'support file link') {
          const file = Object.keys(fixture.files).at(-1);
          const actual = join(home, `${target}-${name}-user-file`);
          await rename(join(path, file), actual);
          await symlink(actual, join(path, file));
          protectedFiles.push([actual, fixture.files[file]]);
        } else if (scenario === 'root link') {
          const actual = join(home, `${target}-${name}`);
          await rename(path, actual);
          await symlink(actual, path);
          protectedFiles.push([join(actual, 'SKILL.md'), fixture.files['SKILL.md']]);
        } else if (scenario !== 'pristine') {
          protectedFiles.push([join(path, 'SKILL.md'), fixture.files['SKILL.md']]);
        }
      }
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await installSkillsForTargets(env, { targets: ['codex', 'claude'] });
      assert.equal(result.ok, true);
      for (const [target, root, lockPath] of targets) {
        const removed = result.results[target].removed.map(({ skillName }) => skillName).sort();
        assert.deepEqual(removed, scenario === 'pristine' && attempt === 0 ? Object.keys(legacy).sort() : []);
        const registry = JSON.parse(await readFile(lockPath, 'utf8'));
        for (const name of Object.keys(legacy)) {
          assert.equal(existsSync(join(root, name)), scenario !== 'pristine');
          assert.equal(Boolean(registry.skills[name]), scenario !== 'pristine');
          if (scenario === 'root link') assert.equal((await lstat(join(root, name))).isSymbolicLink(), true);
          if (scenario === 'support file link') {
            const file = Object.keys(legacy[name].files).at(-1);
            assert.equal((await lstat(join(root, name, file))).isSymbolicLink(), true);
          }
        }
        for (const path of ['clarify/SKILL.md', 'spec/SKILL.md', 'spec/REVIEW_BRIEF_TEMPLATE.md',
          'spec/references/design-review.md', 'plan2exec/references/plan-review.md',
          'refactor-plan/SKILL.md', 'refactor-plan/references/code-audit.md',
          'refactor-plan/scripts/audit_codebase.py', 'shared/evidence-contract.md']) {
          assert.equal(await readFile(join(root, path), 'utf8'), await readFile(join(repoRoot, 'skills', path), 'utf8'));
        }
      }
      for (const [path, content] of protectedFiles) assert.equal(await readFile(path, 'utf8'), content);
    }
  });
}
