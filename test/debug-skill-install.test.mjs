import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { it } from 'node:test';

import { installBundledSkills, installSkillsForTargets } from '../src/install-discovery.mjs';
import { createTemplateBaseline, writeTemplateBaseline } from '../src/template-governance.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const legacy = {
  issue: { refs: ['ledger-template.md'], hash: 'b283e8eef06b9677ac38c057acd0325134a1cdfc' },
  fix: { refs: ['report-contract.md', 'resume-contract.md'], hash: '72efb95e2616980c7f602055abc02e45a3ddab4e' },
};

function installEnv(home) {
  return {
    ...process.env,
    LOOPX_HOME: home,
    LOOPX_AGENTS_ROOT: join(home, '.agents'),
    LOOPX_SKILLS_ROOT: join(home, '.agents', 'skills'),
    LOOPX_CLAUDE_SKILLS_ROOT: join(home, '.claude', 'skills'),
    LOOPX_SKILL_LOCK_PATH: join(home, '.agents', '.skill-lock.json'),
    LOOPX_TEMPLATE_BASELINE_PATH: join(home, '.loopx', 'template-hashes.json'),
    LOOPX_PROJECT_ROOT: repoRoot,
  };
}

async function seedLegacy(home, root, lockPath, baselinePath) {
  const rows = {};
  const items = [];
  for (const [name, fixture] of Object.entries(legacy)) {
    const path = join(root, name);
    await mkdir(join(path, 'references'), { recursive: true });
    await writeFile(join(path, 'SKILL.md'), `# Legacy ${name}\n`);
    for (const ref of fixture.refs) await writeFile(join(path, 'references', ref), `Legacy ${ref}\n`);
    rows[name] = {
      source: 'loopx', sourceType: 'local', installationIdentity: 'loopx',
      sourceUrl: '/legacy-loopx', skillPath: `skills/${name}/SKILL.md`,
      installedPath: path, skillFolderHash: fixture.hash,
    };
    items.push({ path: join(path, 'SKILL.md'), sourcePath: `/legacy-loopx/skills/${name}/SKILL.md`, kind: 'skill' });
  }
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, JSON.stringify({ version: 3, skills: rows }));
  await writeTemplateBaseline(baselinePath, await createTemplateBaseline(home, items));
}

it('upgrades both hosts from issue and fix to debug and repeats without deleting again', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'loopx-merged-debug-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const env = installEnv(home);
  const targets = [
    ['codex', env.LOOPX_SKILLS_ROOT, env.LOOPX_SKILL_LOCK_PATH, env.LOOPX_TEMPLATE_BASELINE_PATH],
    ['claude', env.LOOPX_CLAUDE_SKILLS_ROOT, join(home, '.claude/.loopx-skill-lock.json'), join(home, '.claude/.loopx-template-hashes.json')],
  ];
  for (const [, root, lock, baseline] of targets) await seedLegacy(home, root, lock, baseline);
  const result = await installSkillsForTargets(env, { targets: ['codex', 'claude'] });
  assert.equal(result.ok, true);
  for (const [target, root, lock] of targets) {
    assert.deepEqual(result.results[target].removed.map(({ skillName }) => skillName).sort(), ['fix', 'issue']);
    const registry = JSON.parse(await readFile(lock, 'utf8'));
    for (const name of ['issue', 'fix']) {
      assert.equal(existsSync(join(root, name)), false);
      assert.equal(registry.skills[name], undefined);
    }
    assert.ok(registry.skills.debug);
    for (const file of ['SKILL.md', 'references/existing-ledgers.md', 'references/diagnosis-contract.md']) {
      assert.equal(await readFile(join(root, 'debug', file), 'utf8'), await readFile(join(repoRoot, 'skills/debug', file), 'utf8'));
    }
  }
  const repeated = await installSkillsForTargets(env, { targets: ['codex', 'claude'] });
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.results.codex.removed, []);
  assert.deepEqual(repeated.results.claude.removed, []);
});

for (const scenario of ['edited body', 'edited reference', 'extra file', 'renamed reference', 'reference directory link', 'root link', 'dangling root link', 'missing baseline', 'missing hash', 'foreign owner']) {
  it(`preserves both retired repair skills with ${scenario} across repeated installs`, async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-preserve-debug-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = installEnv(home);
    await seedLegacy(home, env.LOOPX_SKILLS_ROOT, env.LOOPX_SKILL_LOCK_PATH, env.LOOPX_TEMPLATE_BASELINE_PATH);
    const protectedFiles = [];
    const links = [];
    for (const [name, fixture] of Object.entries(legacy)) {
      const path = join(env.LOOPX_SKILLS_ROOT, name);
      let protectedFile = join(path, 'SKILL.md');
      let expected = `# Legacy ${name}\n`;
      if (['edited body', 'edited reference', 'extra file'].includes(scenario)) {
        protectedFile = join(path, scenario === 'edited body' ? 'SKILL.md'
          : scenario === 'edited reference' ? `references/${fixture.refs[0]}` : 'user-notes.md');
        expected = 'Keep this user customization.\n';
        await writeFile(protectedFile, expected);
      } else if (scenario === 'renamed reference') {
        protectedFile = join(path, 'references/user-notes.md');
        expected = `Legacy ${fixture.refs[0]}\n`;
        await rename(join(path, 'references', fixture.refs[0]), protectedFile);
      } else if (scenario === 'reference directory link') {
        const linked = join(home, `${name}-references`);
        await rename(join(path, 'references'), linked);
        await symlink(linked, join(path, 'references'));
        protectedFile = join(linked, fixture.refs[0]);
        expected = `Legacy ${fixture.refs[0]}\n`;
        links.push(join(path, 'references'));
      } else if (scenario.endsWith('root link')) {
        const linked = join(home, `${name}-user-copy`);
        await rename(path, linked);
        await symlink(scenario === 'root link' ? linked : `${linked}-missing`, path);
        protectedFile = join(linked, 'SKILL.md');
        links.push(path);
      }
      protectedFiles.push({ path: protectedFile, expected });
    }
    if (scenario === 'missing baseline') await rm(env.LOOPX_TEMPLATE_BASELINE_PATH);
    if (scenario === 'missing hash' || scenario === 'foreign owner') {
      const lock = JSON.parse(await readFile(env.LOOPX_SKILL_LOCK_PATH, 'utf8'));
      for (const name of Object.keys(legacy)) {
        if (scenario === 'missing hash') delete lock.skills[name].skillFolderHash;
        else lock.skills[name].source = 'user';
      }
      await writeFile(env.LOOPX_SKILL_LOCK_PATH, JSON.stringify(lock));
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await installBundledSkills(env);
      assert.equal(result.ok, true);
      assert.deepEqual(result.removed, []);
      for (const file of protectedFiles) assert.equal(await readFile(file.path, 'utf8'), file.expected);
      for (const path of links) assert.equal((await lstat(path)).isSymbolicLink(), true);
      const lock = JSON.parse(await readFile(env.LOOPX_SKILL_LOCK_PATH, 'utf8'));
      for (const name of Object.keys(legacy)) {
        assert.ok(lock.skills[name]);
        if (scenario !== 'foreign owner') {
          assert.equal(result.skipped.find(({ skillName }) => skillName === name)?.reason,
            scenario.startsWith('missing') || scenario.endsWith('root link') ? 'unknown' : 'user-modified');
        }
      }
      assert.equal(existsSync(join(env.LOOPX_SKILLS_ROOT, 'debug/SKILL.md')), true);
    }
  });
}
