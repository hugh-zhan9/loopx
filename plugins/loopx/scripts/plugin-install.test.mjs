import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyInstallState } from '../../../src/install-discovery.mjs';

const execFileAsync = promisify(execFile);
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(MODULE_DIR, '..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '..', '..');
const MANIFEST_PATH = join(PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const INSTALL_SCRIPT = join(MODULE_DIR, 'plugin-install.mjs');
const ROOT_SKILLS_DIR = join(REPO_ROOT, 'skills');
const PLUGIN_SKILLS_DIR = join(PLUGIN_ROOT, 'skills');
const RALPLAN_SKILL_PATH = join(ROOT_SKILLS_DIR, 'ralplan', 'SKILL.md');
const LOOPX_SKILLS = [
  'clarify',
  'plan',
  'build',
  'review',
  'archive',
  'autopilot',
];

function loopxEnv(home) {
  return {
    ...process.env,
    HOME: home,
    LOOPX_HOME: home,
    LOOPX_AGENTS_ROOT: join(home, '.agents'),
    LOOPX_SKILLS_ROOT: join(home, '.agents', 'skills'),
    LOOPX_SKILL_LOCK_PATH: join(home, '.agents', '.skill-lock.json'),
    LOOPX_PROJECT_ROOT: REPO_ROOT,
    LOOPX_SKILL_SOURCE_ROOT: PLUGIN_SKILLS_DIR,
  };
}

describe('loopx plugin shell', () => {
  it('defines a plugin manifest that only references plugin-root-relative assets', async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    const packageJson = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
    const codexPluginEntries = await readdir(join(PLUGIN_ROOT, '.codex-plugin'));

    assert.deepEqual(codexPluginEntries.sort(), ['plugin.json']);
    assert.equal(manifest.name, 'loopx');
    assert.equal(manifest.version, packageJson.version);
    assert.equal(manifest.skills, './skills/');
    assert.equal(manifest.interface.displayName, 'loopx');

    for (const key of ['skills', 'mcpServers', 'apps']) {
      if (typeof manifest[key] === 'string') {
        assert.equal(manifest[key].startsWith('./'), true, `${key} must stay plugin-root-relative`);
      }
    }
  });

  it('mirrors the canonical loopx skill payload into the plugin shell', async () => {
    for (const skillName of LOOPX_SKILLS) {
      const rootSkill = await readFile(join(ROOT_SKILLS_DIR, skillName, 'SKILL.md'), 'utf8');
      const pluginSkill = await readFile(join(PLUGIN_SKILLS_DIR, skillName, 'SKILL.md'), 'utf8');
      assert.equal(rootSkill.startsWith('---\n'), true, `${skillName} root skill must start with YAML frontmatter`);
      assert.equal(pluginSkill.startsWith('---\n'), true, `${skillName} plugin skill must start with YAML frontmatter`);
      assert.equal(pluginSkill, rootSkill, skillName);
    }
  });

  it('locks plan as the canonical consensus-first planning contract', async () => {
    const planSkill = await readFile(join(ROOT_SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    const pluginPlanSkill = await readFile(join(PLUGIN_SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    const ralplanSkill = await readFile(RALPLAN_SKILL_PATH, 'utf8');

    assert.match(planSkill, /consensus-first/i);
    assert.match(planSkill, /Planner -> Architect -> Critic/);
    assert.match(planSkill, /Critic verdict is `approve`/);
    assert.match(planSkill, /Default planning is consensus-first/);
    assert.equal(pluginPlanSkill, planSkill);
    assert.equal(ralplanSkill.includes('compatibility alias for `$plan`'), true);
    assert.equal(ralplanSkill.includes('$plan --consensus'), false);
  });

  it('reuses the shared install core while materializing skills from the plugin shell', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-plugin-home-'));
    const env = loopxEnv(home);

    await execFileAsync(process.execPath, [INSTALL_SCRIPT], {
      cwd: REPO_ROOT,
      env,
    });

    const inspection = await verifyInstallState(env);
    assert.equal(inspection.ok, true);
    for (const skillName of LOOPX_SKILLS) {
      const installedSkill = await readFile(join(home, '.agents', 'skills', skillName, 'SKILL.md'), 'utf8');
      const pluginSkill = await readFile(join(PLUGIN_SKILLS_DIR, skillName, 'SKILL.md'), 'utf8');
      assert.equal(installedSkill, pluginSkill, skillName);
      assert.equal(inspection.inspection.skills[skillName].registryRow.installationIdentity, 'loopx');
      assert.equal(inspection.inspection.skills[skillName].registryRow.distributionChannel, 'plugin');
      assert.equal(inspection.inspection.skills[skillName].registryRow.sourceUrl, PLUGIN_ROOT);
      assert.equal(
        inspection.inspection.skills[skillName].registryRow.provenance.some(
          (entry) => entry.distributionChannel === 'plugin' && entry.sourceUrl === PLUGIN_ROOT,
        ),
        true,
      );
    }
  });
});
