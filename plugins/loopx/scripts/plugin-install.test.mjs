import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOPX_BUNDLED_SKILLS, verifyInstallState } from '../../../src/install-discovery.mjs';

const execFileAsync = promisify(execFile);
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(MODULE_DIR, '..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '..', '..');
const MANIFEST_PATH = join(PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const INSTALL_SCRIPT = join(MODULE_DIR, 'plugin-install.mjs');
const ROOT_SKILLS_DIR = join(REPO_ROOT, 'skills');
const removedPluginPayloadDir = join(PLUGIN_ROOT, 'skills');
const LOOPX_SKILLS = LOOPX_BUNDLED_SKILLS;

function loopxEnv(home) {
  return {
    ...process.env,
    HOME: home,
    LOOPX_HOME: home,
    LOOPX_AGENTS_ROOT: join(home, '.agents'),
    LOOPX_SKILLS_ROOT: join(home, '.agents', 'skills'),
    LOOPX_SKILL_LOCK_PATH: join(home, '.agents', '.skill-lock.json'),
    LOOPX_PROJECT_ROOT: REPO_ROOT,
    LOOPX_SKILL_SOURCE_ROOT: ROOT_SKILLS_DIR,
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
    assert.equal(Object.hasOwn(manifest, 'skills'), false);
    assert.equal(manifest.interface.displayName, 'loopx');

    for (const key of ['mcpServers', 'apps']) {
      if (typeof manifest[key] === 'string') {
        assert.equal(manifest[key].startsWith('./'), true, `${key} must stay plugin-root-relative`);
      }
    }
  });

  it('keeps omitted manifest skills compatible with the Codex plugin loader contract', async () => {
    const manifestParser = await readFile(
      join(REPO_ROOT, 'ref', 'codex-main', 'codex-rs', 'core-plugins', 'src', 'manifest.rs'),
      'utf8',
    );
    const skillLoader = await readFile(
      join(REPO_ROOT, 'ref', 'codex-main', 'codex-rs', 'core-plugins', 'src', 'loader.rs'),
      'utf8',
    );

    assert.match(manifestParser, /#\[serde\(default\)\]\n\s+skills: Option<RawPluginManifestPaths>/);
    assert.match(manifestParser, /None => Vec::new\(\)/);
    assert.match(skillLoader, /if manifest_paths\.skills\.is_empty\(\) {\n\s+default_skill_roots\(plugin_root\)/);
    assert.match(skillLoader, /if skills_dir\.is_dir\(\) {\n\s+vec!\[skills_dir\]\n\s+} else {\n\s+Vec::new\(\)/);
  });

  it('uses the package-root canonical loopx skill payload without a plugin payload directory', async () => {
    assert.equal(existsSync(removedPluginPayloadDir), false);
    for (const skillName of LOOPX_SKILLS) {
      const rootSkill = await readFile(join(ROOT_SKILLS_DIR, skillName, 'SKILL.md'), 'utf8');
      assert.equal(rootSkill.startsWith('---\n'), true, `${skillName} root skill must start with YAML frontmatter`);
    }
  });

  it('locks plan-to-exec as the canonical implementation-planning contract', async () => {
    const planSkill = await readFile(join(ROOT_SKILLS_DIR, 'plan-to-exec', 'SKILL.md'), 'utf8');

    assert.match(planSkill, /Bite-Sized Task Granularity/);
    assert.match(planSkill, /No Placeholders/);
    assert.match(planSkill, /docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\.md/);
    assert.match(planSkill, /docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\//);
    assert.match(planSkill, /loopx:subagent-exec/);
    assert.match(planSkill, /Plan Boundary Commit Policy|Boundary Commit Policy/);
    assert.match(planSkill, /single-plan.*one.*commit|one.*commit.*single-plan/is);
    assert.doesNotMatch(planSkill, /Frequent commits|Step 5: Commit|"Commit" is a step/);
    assert.doesNotMatch(planSkill, /Planner -> Architect -> Critic/);
    assert.doesNotMatch(planSkill, /consensus-first/i);
  });

  it('locks clarify to use the conditional spec or plan handoff gate', async () => {
    const clarifySkill = await readFile(join(ROOT_SKILLS_DIR, 'clarify', 'SKILL.md'), 'utf8');

    assert.match(clarifySkill, /needs_spec/);
    assert.match(clarifySkill, /direct_to_plan/);
    assert.match(clarifySkill, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/需求设计文档\.md/);
    assert.match(clarifySkill, /docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\.md/);
    assert.match(clarifySkill, /docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\//);
    assert.doesNotMatch(clarifySkill, /Recommended invocation: `\$spec/);
    assert.doesNotMatch(clarifySkill, /Default handoff after normal loopx clarify: `\$plan <slug>`/);
    assert.doesNotMatch(clarifySkill, /hand off to `build` only/i);
    assert.doesNotMatch(clarifySkill, /direct execution/i);
    assert.doesNotMatch(clarifySkill, /direct implementation/i);
    assert.doesNotMatch(clarifySkill, /directly to implementation/i);
    assert.doesNotMatch(clarifySkill, /Proceed directly to implementation/i);
  });

  it('reuses the shared install core while materializing skills from the package root', async () => {
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
      const rootSkill = await readFile(join(ROOT_SKILLS_DIR, skillName, 'SKILL.md'), 'utf8');
      assert.equal(installedSkill, rootSkill, skillName);
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

    const installedSpecTemplate = await readFile(join(home, '.agents', 'skills', 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');
    const rootSpecTemplate = await readFile(join(ROOT_SKILLS_DIR, 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');
    const installedSpecProposal = await readFile(join(home, '.agents', 'skills', 'spec', 'references', 'design-proposal.md'), 'utf8');
    const rootSpecProposal = await readFile(join(ROOT_SKILLS_DIR, 'spec', 'references', 'design-proposal.md'), 'utf8');
    assert.equal(installedSpecTemplate, rootSpecTemplate);
    assert.equal(installedSpecProposal, rootSpecProposal);
  });
});
