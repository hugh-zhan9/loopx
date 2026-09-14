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

  it('installs plan2exec as the only planning skill name', async () => {
    const planSkill = await readFile(join(ROOT_SKILLS_DIR, 'plan2exec', 'SKILL.md'), 'utf8');
    const planSchema = await readFile(join(ROOT_SKILLS_DIR, 'plan2exec', 'references', 'plan-schema.md'), 'utf8');

    assert.ok(LOOPX_SKILLS.includes('plan2exec'));
    assert.match(planSchema, /^schema: loopx-plan\/v1$/m);
    assert.match(planSkill, /docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\.md/);
    for (const retired of ['plan-reviewer', 'design-review', 'clarify-v2', 'spec-v2', 'code-darwin', 'verify']) {
      assert.ok(!LOOPX_SKILLS.includes(retired));
      assert.equal(existsSync(join(ROOT_SKILLS_DIR, retired)), false);
    }
    assert.equal(existsSync(join(ROOT_SKILLS_DIR, 'plan')), false);
    assert.equal(existsSync(join(ROOT_SKILLS_DIR, 'plan-to-exec')), false);
  });

  it('publishes clarify intake fields without a forced downstream gate', async () => {
    const clarifySkill = await readFile(join(ROOT_SKILLS_DIR, 'clarify', 'SKILL.md'), 'utf8');
    for (const field of ['clarification.md', 'requirements.md', 'AC-*', 'TC-*']) {
      assert.ok(clarifySkill.includes(field));
    }
    assert.doesNotMatch(clarifySkill, /needs_spec|direct_to_plan/);
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

    const codexGuidance = await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8');
    assert.match(codexGuidance, /loopx:managed:block prompt-first-routing/);
    const agreement = await readFile(join(REPO_ROOT, 'templates/working-agreement.md'), 'utf8');
    assert.ok(codexGuidance.includes(agreement.trim()));
    assert.doesNotMatch(codexGuidance, /skills\/RESOLVER\.md/);

    const installedSpecTemplate = await readFile(join(home, '.agents', 'skills', 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');
    const rootSpecTemplate = await readFile(join(ROOT_SKILLS_DIR, 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');
    assert.equal(installedSpecTemplate, rootSpecTemplate);
    for (const file of ['REVIEW_BRIEF_TEMPLATE.md', 'references/design-review.md', 'references/design-quality.md', 'references/design-diagrams.md']) {
      assert.equal(await readFile(join(home, '.agents/skills/spec', file), 'utf8'),
        await readFile(join(ROOT_SKILLS_DIR, 'spec', file), 'utf8'));
    }
    assert.equal(existsSync(join(home, '.agents/skills/spec/references/design-proposal.md')), false);
  });
});
