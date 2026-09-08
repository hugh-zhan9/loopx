import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { it } from 'node:test';
import { promisify } from 'node:util';

import { installBundledSkills, installSkillsForTargets } from '../src/install-discovery.mjs';
import { createTemplateBaseline, writeTemplateBaseline } from '../src/template-governance.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const execFileAsync = promisify(execFile);

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

async function seedLegacyReadability(home, skillsRoot, lockPath, baselinePath) {
  const skillDir = join(skillsRoot, 'doc-readability');
  await mkdir(join(skillDir, 'references'), { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), '# Legacy readability\n');
  await writeFile(join(skillDir, 'references', 'prd.md'), 'Legacy PRD checks.\n');
  const row = {
    source: 'loopx',
    sourceType: 'local',
    installationIdentity: 'loopx',
    sourceUrl: '/legacy-loopx',
    skillPath: 'skills/doc-readability/SKILL.md',
    installedPath: skillDir,
    // Historical source-tree hash for these two files under /legacy-loopx.
    skillFolderHash: 'eddf313326e45bfe2bfa24542e7a2e8ea365071d',
  };
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, JSON.stringify({ version: 3, skills: { 'doc-readability': row } }));
  const baseline = await createTemplateBaseline(home, [{
    path: join(skillDir, 'SKILL.md'),
    sourcePath: '/legacy-loopx/skills/doc-readability/SKILL.md',
    kind: 'skill',
  }]);
  await writeTemplateBaseline(baselinePath, baseline);
  return skillDir;
}

it('upgrades both hosts to one document skill with assessment and rewrite references', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'loopx-merged-doc-skills-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const env = installEnv(home);
  const targets = [
    ['codex', env.LOOPX_SKILLS_ROOT, env.LOOPX_SKILL_LOCK_PATH, env.LOOPX_TEMPLATE_BASELINE_PATH],
    ['claude', env.LOOPX_CLAUDE_SKILLS_ROOT, join(home, '.claude', '.loopx-skill-lock.json'), join(home, '.claude', '.loopx-template-hashes.json')],
  ];
  for (const [, root, lock, baseline] of targets) {
    await seedLegacyReadability(home, root, lock, baseline);
  }

  const result = await installSkillsForTargets(env, { targets: ['codex', 'claude'] });

  assert.equal(result.ok, true);
  for (const [target, root, lock] of targets) {
    assert.deepEqual(result.results[target].removed.map(({ skillName }) => skillName), ['doc-readability']);
    assert.equal(existsSync(join(root, 'doc-readability')), false);
    const registry = JSON.parse(await readFile(lock, 'utf8'));
    assert.equal(registry.skills['doc-readability'], undefined);
    assert.ok(registry.skills['humanize-doc']);
    for (const file of ['SKILL.md', 'references/readability.md', 'references/examples.md', 'references/prd.md']) {
      assert.equal(await readFile(join(root, 'humanize-doc', file), 'utf8'),
        await readFile(join(repoRoot, 'skills', 'humanize-doc', file), 'utf8'));
    }
  }
  const repeated = await installSkillsForTargets(env, { targets: ['codex', 'claude'] });
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.results.codex.removed, []);
  assert.deepEqual(repeated.results.claude.removed, []);
});

it('reports a preserved retired skill in plugin installation output', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'loopx-plugin-retired-doc-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const env = installEnv(home);
  const skillDir = await seedLegacyReadability(home, env.LOOPX_SKILLS_ROOT,
    env.LOOPX_SKILL_LOCK_PATH, env.LOOPX_TEMPLATE_BASELINE_PATH);
  const referencePath = join(skillDir, 'references', 'prd.md');
  const customized = 'Keep these user-specific PRD checks.\n';
  await writeFile(referencePath, customized);

  const { stdout } = await execFileAsync(process.execPath,
    [join(repoRoot, 'plugins', 'loopx', 'scripts', 'plugin-install.mjs')], {
      cwd: repoRoot,
      env,
      maxBuffer: 4 * 1024 * 1024,
    });
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.deepEqual(result.skipped, [{
    skillName: 'doc-readability',
    reason: 'user-modified',
    installedPath: skillDir,
  }]);
  assert.equal(await readFile(referencePath, 'utf8'), customized);
  assert.equal(existsSync(join(env.LOOPX_SKILLS_ROOT, 'humanize-doc', 'SKILL.md')), true);
});

for (const scenario of ['edited body', 'edited reference', 'extra file', 'renamed reference', 'dangling link', 'root link', 'dangling root link', 'missing baseline', 'missing hash', 'foreign owner']) {
  it(`preserves retired readability with ${scenario} across repeated installs`, async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-preserve-doc-skill-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = installEnv(home);
    const skillDir = await seedLegacyReadability(home, env.LOOPX_SKILLS_ROOT,
      env.LOOPX_SKILL_LOCK_PATH, env.LOOPX_TEMPLATE_BASELINE_PATH);
    let protectedFile = join(skillDir, 'SKILL.md');
    let expected = '# Legacy readability\n';
    if (scenario === 'edited body' || scenario === 'edited reference' || scenario === 'extra file') {
      protectedFile = join(skillDir, scenario === 'edited body' ? 'SKILL.md'
        : scenario === 'edited reference' ? 'references/prd.md' : 'user-notes.md');
      expected = 'Keep this user customization.\n';
      await writeFile(protectedFile, expected);
    } else if (scenario === 'renamed reference') {
      protectedFile = join(skillDir, 'references', 'user-notes.md');
      expected = 'Legacy PRD checks.\n';
      await rename(join(skillDir, 'references', 'prd.md'), protectedFile);
    } else if (scenario === 'dangling link') {
      await symlink(join(home, 'missing-user-file'), join(skillDir, 'user-link'));
    } else if (scenario.endsWith('root link')) {
      const linkedDir = join(home, 'user-skill');
      await rename(skillDir, linkedDir);
      await symlink(scenario === 'root link' ? linkedDir : join(home, 'missing-user-skill'), skillDir);
      protectedFile = join(linkedDir, 'SKILL.md');
    } else if (scenario === 'missing baseline') {
      await rm(env.LOOPX_TEMPLATE_BASELINE_PATH);
    } else {
      const lock = JSON.parse(await readFile(env.LOOPX_SKILL_LOCK_PATH, 'utf8'));
      if (scenario === 'missing hash') delete lock.skills['doc-readability'].skillFolderHash;
      else lock.skills['doc-readability'].source = 'user';
      await writeFile(env.LOOPX_SKILL_LOCK_PATH, JSON.stringify(lock));
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await installBundledSkills(env);
      assert.equal(result.ok, true);
      assert.deepEqual(result.removed, []);
      assert.equal(await readFile(protectedFile, 'utf8'), expected);
      if (scenario === 'dangling link') {
        assert.equal((await lstat(join(skillDir, 'user-link'))).isSymbolicLink(), true);
      }
      if (scenario.endsWith('root link')) {
        assert.equal((await lstat(skillDir)).isSymbolicLink(), true);
      }
      assert.equal(existsSync(join(env.LOOPX_SKILLS_ROOT, 'humanize-doc', 'SKILL.md')), true);
      const lock = JSON.parse(await readFile(env.LOOPX_SKILL_LOCK_PATH, 'utf8'));
      assert.ok(lock.skills['doc-readability']);
      if (scenario !== 'foreign owner') {
        const skipped = result.skipped.find(({ skillName }) => skillName === 'doc-readability');
        assert.equal(skipped?.reason, scenario.startsWith('missing') || scenario.endsWith('root link')
          ? 'unknown' : 'user-modified');
      }
    }
  });
}
