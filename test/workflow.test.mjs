import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import {
  inspectInstallTargets,
  installBundledSkills,
  installSkillsForTargets,
  LOOPX_BUNDLED_SKILLS,
  verifyInstallState,
} from '../src/install-discovery.mjs';
import { classifyTemplateDrift, createTemplateBaseline } from '../src/template-governance.mjs';
import { clarifyStage, initWorkspace, readDocumentIndex, resolveWorkflowRoot, resolveWorkspaceRoot, statusSummary } from '../src/workflow.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd());
const cliPath = resolve(repoRoot, 'src/cli.mjs');
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Drop inherited LOOPX_* variables so a developer's exports cannot redirect writes.
function loopxEnv(home) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LOOPX_'))),
    HOME: home,
    LOOPX_HOME: home,
    LOOPX_AGENTS_ROOT: join(home, '.agents'),
    LOOPX_SKILLS_ROOT: join(home, '.agents', 'skills'),
    LOOPX_SKILL_LOCK_PATH: join(home, '.agents', '.skill-lock.json'),
    LOOPX_PROJECT_ROOT: repoRoot,
  };
}

function managedBlock(text, id) {
  const pattern = new RegExp(
    `<!-- loopx:managed:block ${escapeRegExp(id)} -->\\n([\\s\\S]*?)\\n<!-- /loopx:managed:block ${escapeRegExp(id)} -->`,
  );
  return text.match(pattern)?.[1] ?? null;
}

async function simulateLegacySharedContractBaseline(home) {
  const baselinePath = join(home, '.loopx', 'template-hashes.json');
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  baseline.items = baseline.items.filter(({ kind }) => kind !== 'shared-contract');
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  for (const name of ['completion-check.md', 'evidence-contract.md']) {
    const original = await readFile(join(repoRoot, 'test', 'fixtures', 'legacy-shared-contracts', '0.9.0', name));
    await writeFile(join(home, '.agents', 'skills', 'shared', name), original);
  }
}

async function copySkillsWithSharedFiles(home, files) {
  const sourceRoot = join(home, 'package-skills');
  await cp(join(repoRoot, 'skills'), sourceRoot, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const sourcePath = join(sourceRoot, 'shared', relativePath);
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, content);
  }
  return sourceRoot;
}

describe('loopx docs-first document shell', () => {
  it('doctor stays healthy without optional Ruby and still reports installation failures', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-doctor-optional-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = { ...loopxEnv(home), PATH: '' };
    assert.equal((await installBundledSkills(env, { yes: true })).ok, true);

    const runDoctor = (args = []) => execFileAsync(process.execPath, [cliPath, 'doctor', ...args], { cwd: home, env });
    const { stdout: json } = await runDoctor(['--json']);
    const result = JSON.parse(json);
    assert.equal(result.ok, true);
    assert.equal(result.runtimeDependencies.ruby.available, false);
    assert.equal(result.runtimeDependencies.ruby.optional, true);
    const { stdout: human } = await runDoctor();
    assert.match(human, /^loopx doctor: ok$/m);
    assert.match(human, /ruby: missing \(optional for OpenAPI pair validation\)/);
    assert.doesNotMatch(human, /repair-install/);

    await rm(join(home, '.agents', 'skills', 'generate-api-docs'), { recursive: true });
    const { stdout: broken } = await runDoctor(['--json']);
    assert.equal(JSON.parse(broken).ok, false);
    const { stdout: brokenHuman } = await runDoctor();
    assert.match(brokenHuman, /^loopx doctor: attention needed$/m);
    assert.match(brokenHuman, /repair-install/);
  });

  it('initializes workspace metadata and a document set', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-init-'));
    const result = await initWorkspace(wd, { slug: 'Demo Init' });

    assert.equal(result.workspaceRoot, resolveWorkspaceRoot(wd));
    assert.equal(result.config.product_contract, 'docs-first');
    assert.deepEqual(result.config.document_intents, ['clarify', 'spec', 'plan2exec']);
    assert.equal(existsSync(join(resolveWorkspaceRoot(wd), 'config.json')), true);
    assert.equal(existsSync(resolveWorkflowRoot(wd, 'demo-init')), true);

    const documents = await readDocumentIndex(wd, 'demo-init');
    assert.equal(documents.contract, 'loopx-docs-first');
    assert.equal(documents.slug, 'demo-init');
    assert.equal(existsSync(join(resolveWorkflowRoot(wd, 'demo-init'), 'documents.json')), true);
    assert.equal(existsSync(join(resolveWorkflowRoot(wd, 'demo-init'), 'state.json')), false);
  });

  it('clarify creates goal, decision, boundary, and evidence documents', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-clarify-'));
    const result = await clarifyStage(wd, 'docs-only');

    assert.equal(existsSync(join(result.root, 'spec.md')), true);
    assert.match(result.documents.intake_package_path, /\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-docs-only(?:-\d{6})?$/);
    assert.equal(existsSync(result.documents.clarification_path), true);
    assert.equal(existsSync(result.documents.requirements_path), true);

    const workingCopy = await readFile(result.documents.working_copy_path, 'utf8');
    for (const heading of ['Goal', 'Decisions', 'Boundaries', 'Evidence']) {
      assert.match(workingCopy, new RegExp(`^## ${heading}$`, 'm'));
    }
    for (const forbidden of ['current_stage', 'stage_status', 'next_skill', 'handoff_decision', 'max_rounds']) {
      assert.doesNotMatch(JSON.stringify(result.documents), new RegExp(forbidden));
      assert.doesNotMatch(workingCopy, new RegExp(forbidden));
    }
  });

  it('status reports document paths without routing model execution', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-status-intake-'));
    const clarified = await clarifyStage(wd, 'package-status');

    const status = await statusSummary(wd, 'package-status');
    assert.equal(status.contract, 'loopx-docs-first');
    assert.equal(status.documents.intake_package_path, clarified.documents.intake_package_path);
    assert.equal(status.artifacts.intake_package_exists, true);
    assert.equal(status.artifacts.requirements_exists, true);
    assert.equal(Object.hasOwn(status, 'next_skill_command'), false);
    assert.equal(Object.hasOwn(status, 'next_action'), false);

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'clarify', 'package-status'], { cwd: wd });
    assert.match(stdout, /^intake: .*\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-package-status/m);
    assert.match(stdout, /^requirements: .*requirements\.md$/m);
    assert.doesNotMatch(stdout, /blocked:|next skill:|next:/);
  });

  it('clarify does not overwrite an existing same-day intake package', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-intake-repeat-'));
    const first = await clarifyStage(wd, 'repeat-flow');
    const second = await clarifyStage(wd, 'repeat-flow');

    assert.notEqual(first.documents.intake_package_path, second.documents.intake_package_path);
    assert.equal(existsSync(first.documents.requirements_path), true);
    assert.equal(existsSync(second.documents.requirements_path), true);
  });

  it('reads legacy state only as a document index', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-legacy-state-'));
    const root = resolveWorkflowRoot(wd, 'legacy');
    const intake = join(wd, '.loopx', 'intake', 'legacy');
    await mkdir(root, { recursive: true });
    await mkdir(intake, { recursive: true });
    const legacy = {
      schema_version: 2,
      slug: 'legacy',
      current_stage: 'review',
      stage_status: 'blocked',
      intake_package_path: intake,
      clarification_path: join(intake, 'clarification.md'),
      requirements_path: join(intake, 'requirements.md'),
    };
    await writeFile(join(root, 'state.json'), `${JSON.stringify(legacy, null, 2)}\n`);

    const documents = await readDocumentIndex(wd, 'legacy');
    assert.equal(documents.contract, 'loopx-docs-first');
    assert.equal(documents.requirements_path, legacy.requirements_path);
    assert.equal(Object.hasOwn(documents, 'current_stage'), false);
    assert.equal(existsSync(join(root, 'documents.json')), false);
  });

  it('renders document sets without workflow state', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-render-docs-'));
    await clarifyStage(wd, 'render-docs');
    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'render', 'render-docs'], { cwd: wd });
    const payload = JSON.parse(stdout);
    assert.equal(existsSync(payload.workflowViewPath), true);
    assert.equal(existsSync(payload.workspaceViewPath), true);
  });

  it('CLI exposes document commands and rejects orchestration commands', async () => {
    const { stdout: help } = await execFileAsync(process.execPath, [cliPath]);
    for (const command of [
      'loopx --version',
      'loopx init',
      'loopx clarify',
      'loopx render',
      'loopx status',
      'loopx setup-context',
      'loopx install-skills',
      'loopx doctor',
      'loopx repair-install',
    ]) {
      assert.match(help, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const removed of [
      'loopx approve',
      'loopx plan',
      'loopx build',
      'loopx review',
      'loopx archive',
      'loopx autopilot',
      'loopx help advanced',
      'loopx migrate',
      'loopx finish-start',
      'loopx execution-start',
      'loopx finish-audit',
      'loopx finish-record',
      'loopx next',
      'loopx lancet',
    ]) {
      assert.doesNotMatch(help, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const command of [
      'approve', 'plan', 'build', 'review', 'archive', 'autopilot', 'migrate',
      'finish-start', 'execution-start', 'finish-audit', 'finish-record', 'next', 'lancet',
    ]) {
      await assert.rejects(
        execFileAsync(process.execPath, [cliPath, command, 'demo']),
        (error) => {
          assert.notEqual(error.code, 0);
          assert.match(error.stderr, new RegExp(`unknown_command:${command}`));
          return true;
        },
      );
    }
    await assert.rejects(
      execFileAsync(process.execPath, [cliPath, 'help', 'advanced']),
      (error) => {
        assert.notEqual(error.code, 0);
        assert.match(error.stderr, /unknown_command:help/);
        return true;
      },
    );
  });

  it('install discovery installs and verifies bundled skills', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-install-'));
    const result = await installBundledSkills(loopxEnv(home), { yes: true });
    assert.equal(result.ok, true);
    assert.equal(result.installed.length, LOOPX_BUNDLED_SKILLS.length);
    assert.equal(existsSync(join(home, '.agents', 'skills', 'shared', 'evidence-contract.md')), true);

    const verification = await verifyInstallState(loopxEnv(home), { targets: ['codex'] });
    assert.equal(verification.ok, true);

    const sharedContract = join(home, '.agents', 'skills', 'shared', 'evidence-contract.md');
    assert.equal(existsSync(sharedContract), true);
    await writeFile(sharedContract, '# drifted\n');
    const drifted = await verifyInstallState(loopxEnv(home), { targets: ['codex'] });
    assert.equal(drifted.ok, false);
    assert.ok(drifted.failures.includes('shared_contracts_drifted'));
  });

  it('adds a new shared contract when upgrading a pristine older install', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-upgrade-'));
    const env = loopxEnv(home);
    const contract = join(home, '.agents', 'skills', 'shared', 'architecture-conformance.md');

    const initial = await installBundledSkills(env, { yes: true });
    assert.equal(initial.ok, true);
    await rm(contract);
    await simulateLegacySharedContractBaseline(home);

    const upgraded = await installBundledSkills(env, { yes: true });

    assert.equal(upgraded.ok, true);
    assert.equal(existsSync(contract), true);
    for (const name of ['completion-check.md', 'evidence-contract.md']) {
      assert.equal(await readFile(join(home, '.agents', 'skills', 'shared', name), 'utf8'),
        await readFile(join(repoRoot, 'skills', 'shared', name), 'utf8'));
    }
    assert.equal((await verifyInstallState(env)).ok, true);
    assert.equal((await installBundledSkills(env, { yes: true })).ok, true);
  });

  it('adds a new shared contract without overwriting another modified contract', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-preserve-'));
    const env = loopxEnv(home);
    const sharedRoot = join(home, '.agents', 'skills', 'shared');
    const existingContract = join(sharedRoot, 'evidence-contract.md');
    const newContract = join(sharedRoot, 'architecture-conformance.md');

    const initial = await installBundledSkills(env, { yes: true });
    assert.equal(initial.ok, true);
    await rm(newContract);
    await simulateLegacySharedContractBaseline(home);
    const modified = `${await readFile(existingContract, 'utf8')}\nUser-owned rule: retain this customization.\n`;
    await writeFile(existingContract, modified);

    const upgraded = await installBundledSkills(env, { yes: true });

    assert.equal(upgraded.ok, false);
    assert.equal(await readFile(existingContract, 'utf8'), modified);
    assert.equal(existsSync(newContract), true);
    assert.ok(upgraded.conflicts.some(({ skillName }) => skillName === 'shared/evidence-contract.md'));
  });

  it('removes a shared contract that a newer package no longer ships', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sharedRoot = join(home, '.agents', 'skills', 'shared');
    const sourceRoot = await copySkillsWithSharedFiles(home, {
      'retired-contract.md': '# Retired contract\n',
      'scripts/retired-helper.mjs': 'export {};\n',
    });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);
    assert.equal(existsSync(join(sharedRoot, 'scripts', 'retired-helper.mjs')), true);

    await rm(join(sourceRoot, 'shared', 'retired-contract.md'));
    await rm(join(sourceRoot, 'shared', 'scripts'), { recursive: true });
    await writeFile(join(sharedRoot, 'user-notes.md'), '# Not installed by loopx\n');
    const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.equal(upgraded.ok, true);
    assert.deepEqual(upgraded.removed.map(({ skillName }) => skillName).sort(),
      ['shared/retired-contract.md', 'shared/scripts/retired-helper.mjs']);
    assert.equal(existsSync(join(sharedRoot, 'retired-contract.md')), false);
    assert.equal(existsSync(join(sharedRoot, 'scripts')), false);
    assert.equal(existsSync(join(sharedRoot, 'evidence-contract.md')), true);
    assert.equal(await readFile(join(sharedRoot, 'user-notes.md'), 'utf8'), '# Not installed by loopx\n');
    const baseline = JSON.parse(await readFile(join(home, '.loopx', 'template-hashes.json'), 'utf8'));
    assert.equal(baseline.items.some(({ path }) => path.includes('retired-')), false);
  });

  it('keeps a modified shared contract that a newer package no longer ships', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-modified-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const installed = join(home, '.agents', 'skills', 'shared', 'retired-contract.md');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'retired-contract.md': '# Retired contract\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await rm(join(sourceRoot, 'shared', 'retired-contract.md'));
    const modified = '# Retired contract\nUser-owned rule: keep this.\n';
    await writeFile(installed, modified);
    const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.equal(upgraded.ok, true);
    assert.deepEqual(upgraded.removed, []);
    assert.ok(upgraded.skipped.some(({ skillName, reason }) =>
      skillName === 'shared/retired-contract.md' && reason === 'user-modified'));
    assert.equal(await readFile(installed, 'utf8'), modified);
    await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });
    const baseline = JSON.parse(await readFile(join(home, '.loopx', 'template-hashes.json'), 'utf8'));
    assert.equal(baseline.items.filter(({ path }) => path.endsWith('shared/retired-contract.md')).length, 1);
    assert.equal(await readFile(installed, 'utf8'), modified);

    await writeFile(installed, '# Retired contract\n');
    const reverted = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.deepEqual(reverted.removed.map(({ skillName }) => skillName), ['shared/retired-contract.md']);
    assert.equal(existsSync(installed), false);
  });

  it('does not remove a retired shared contract through a directory symlink', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-symlink-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sharedRoot = join(home, '.agents', 'skills', 'shared');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'scripts/retired-helper.mjs': 'export {};\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    const userDirectory = join(home, 'user-scripts');
    await mkdir(userDirectory);
    await writeFile(join(userDirectory, 'retired-helper.mjs'), 'export {};\n');
    await rm(join(sharedRoot, 'scripts'), { recursive: true });
    await symlink(userDirectory, join(sharedRoot, 'scripts'), 'dir');
    await rm(join(sourceRoot, 'shared', 'scripts'), { recursive: true });
    const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.equal(upgraded.ok, true);
    assert.ok(upgraded.skipped.some(({ skillName, reason }) =>
      skillName === 'shared/scripts/retired-helper.mjs' && reason === 'symlinked_shared_contract_directory'));
    assert.equal(await readFile(join(userDirectory, 'retired-helper.mjs'), 'utf8'), 'export {};\n');
  });

  it('does not remove a retired shared contract that is itself a symlink', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-link-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const installed = join(home, '.agents', 'skills', 'shared', 'retired-contract.md');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'retired-contract.md': '# Retired contract\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    const userFile = join(home, 'user-contract.md');
    await writeFile(userFile, '# Retired contract\n');
    await rm(installed);
    await symlink(userFile, installed);
    await rm(join(sourceRoot, 'shared', 'retired-contract.md'));
    const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.deepEqual(upgraded.removed, []);
    assert.ok(upgraded.skipped.some(({ skillName, reason }) =>
      skillName === 'shared/retired-contract.md' && reason === 'unknown'));
    assert.equal((await lstat(installed)).isSymbolicLink(), true);
    assert.equal(await readFile(userFile, 'utf8'), '# Retired contract\n');
  });

  it('keeps installed shared contracts when the package has no shared directory', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-missing-source-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sourceRoot = await copySkillsWithSharedFiles(home, {});
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await rm(join(sourceRoot, 'shared'), { recursive: true });
    const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.deepEqual(upgraded.removed, []);
    assert.equal(existsSync(join(home, '.agents', 'skills', 'shared', 'evidence-contract.md')), true);
    const baseline = JSON.parse(await readFile(join(home, '.loopx', 'template-hashes.json'), 'utf8'));
    assert.ok(baseline.items.some(({ kind, path }) => kind === 'shared-contract' && path.endsWith('evidence-contract.md')));
  });

  it('keeps user text outside a managed block in a retired shared contract', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-block-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const installed = join(home, '.agents', 'skills', 'shared', 'retired-block.md');
    const original = '<!-- loopx:managed:block retired -->\nShipped rule.\n<!-- /loopx:managed:block retired -->\n';
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'retired-block.md': original });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await rm(join(sourceRoot, 'shared', 'retired-block.md'));
    await writeFile(installed, `${original}User note outside the block.\n`);
    const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.deepEqual(upgraded.removed, []);
    assert.equal(await readFile(installed, 'utf8'), `${original}User note outside the block.\n`);
  });

  it('replaces a retired shared file with a shipped directory of the same name', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-file-to-dir-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sharedRoot = join(home, '.agents', 'skills', 'shared');
    const sourceRoot = await copySkillsWithSharedFiles(home, { thing: '# Old file\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await rm(join(sourceRoot, 'shared', 'thing'));
    await mkdir(join(sourceRoot, 'shared', 'thing'));
    await writeFile(join(sourceRoot, 'shared', 'thing', 'inner.md'), '# New file\n');
    const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.equal(upgraded.ok, true);
    assert.deepEqual(upgraded.removed.map(({ skillName }) => skillName), ['shared/thing']);
    assert.equal(await readFile(join(sharedRoot, 'thing', 'inner.md'), 'utf8'), '# New file\n');
  });

  it('keeps a modified retired shared file that the package replaces with a directory', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-file-to-dir-modified-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const installed = join(home, '.agents', 'skills', 'shared', 'thing');
    const sourceRoot = await copySkillsWithSharedFiles(home, { thing: '# Old file\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await writeFile(installed, '# Old file\nUser note.\n');
    await rm(join(sourceRoot, 'shared', 'thing'));
    await mkdir(join(sourceRoot, 'shared', 'thing'));
    await writeFile(join(sourceRoot, 'shared', 'thing', 'inner.md'), '# New file\n');

    for (let run = 0; run < 2; run += 1) {
      const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });
      assert.equal(upgraded.ok, false);
      assert.deepEqual(upgraded.removed, []);
      assert.ok(upgraded.skipped.some(({ skillName, reason }) => skillName === 'shared/thing' && reason === 'user-modified'));
      assert.ok(upgraded.conflicts.some(({ skillName, reason }) =>
        skillName === 'shared/thing/inner.md' && reason === 'non_directory_shared_contract_parent'));
      assert.equal(await readFile(installed, 'utf8'), '# Old file\nUser note.\n');
    }
  });

  it('survives a symlink loop at a retired shared path or a skill file', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-loop-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const retired = join(home, '.agents', 'skills', 'shared', 'retired-contract.md');
    const skillFile = join(home, '.agents', 'skills', 'tdd', 'SKILL.md');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'retired-contract.md': '# Retired contract\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await rm(join(sourceRoot, 'shared', 'retired-contract.md'));
    for (const path of [retired, skillFile]) {
      await rm(path);
      await symlink(path, path);
    }

    for (let run = 0; run < 2; run += 1) {
      const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });
      assert.deepEqual(upgraded.removed, []);
      assert.ok(upgraded.skipped.some(({ skillName, reason }) =>
        skillName === 'shared/retired-contract.md' && reason === 'unknown'));
      assert.equal((await lstat(retired)).isSymbolicLink(), true);
    }
  });

  for (const replacement of ['directory', 'directory symlink']) {
    it(`keeps a retired shared path the user replaced with a ${replacement}`, async (t) => {
      const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-replaced-'));
      t.after(() => rm(home, { recursive: true, force: true }));
      const env = loopxEnv(home);
      const installed = join(home, '.agents', 'skills', 'shared', 'retired-contract.md');
      const sourceRoot = await copySkillsWithSharedFiles(home, { 'retired-contract.md': '# Retired contract\n' });
      assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

      const userDirectory = replacement === 'directory' ? installed : join(home, 'user-directory');
      await rm(installed);
      await mkdir(userDirectory);
      await writeFile(join(userDirectory, 'note.md'), '# User note\n');
      if (replacement !== 'directory') {
        await symlink(userDirectory, installed, 'dir');
      }
      await rm(join(sourceRoot, 'shared', 'retired-contract.md'));

      for (let run = 0; run < 2; run += 1) {
        const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });
        assert.equal(upgraded.ok, true);
        assert.deepEqual(upgraded.removed, []);
        assert.equal(await readFile(join(userDirectory, 'note.md'), 'utf8'), '# User note\n');
      }
      // A real directory leaves no loopx file to track; a symlink stays recorded.
      const baseline = JSON.parse(await readFile(join(home, '.loopx', 'template-hashes.json'), 'utf8'));
      assert.equal(baseline.items.some(({ path }) => path.endsWith('shared/retired-contract.md')),
        replacement !== 'directory');
    });
  }

  it('forgets a retired shared file whose parent directory the user replaced with a file', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-parent-file-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const parent = join(home, '.agents', 'skills', 'shared', 'scripts');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'scripts/retired-helper.mjs': 'export {};\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await rm(parent, { recursive: true });
    await writeFile(parent, '# User file\n');
    await rm(join(sourceRoot, 'shared', 'scripts'), { recursive: true });
    const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    assert.equal(upgraded.ok, true);
    assert.deepEqual(upgraded.removed, []);
    assert.equal(upgraded.skipped.some(({ skillName }) => skillName === 'shared/scripts/retired-helper.mjs'), false);
    assert.equal(await readFile(parent, 'utf8'), '# User file\n');
    const baseline = JSON.parse(await readFile(join(home, '.loopx', 'template-hashes.json'), 'utf8'));
    assert.equal(baseline.items.some(({ path }) => path.endsWith('retired-helper.mjs')), false);
  });

  it('removes no shared contract when the package shared path is not a directory', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-source-file-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sourceRoot = await copySkillsWithSharedFiles(home, {});
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await rm(join(sourceRoot, 'shared'), { recursive: true });
    await writeFile(join(sourceRoot, 'shared'), 'not a directory\n');
    // Installing from a malformed package still fails as before; it must not delete first.
    await assert.rejects(installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot }));

    assert.equal(existsSync(join(home, '.agents', 'skills', 'shared', 'evidence-contract.md')), true);
  });

  for (const locked of ['file', 'directory']) {
    it(`keeps an unreadable retired shared ${locked} without failing the install`, async (t) => {
      if (process.platform === 'win32' || process.getuid?.() === 0) {
        t.skip('permission bits do not restrict this user');
        return;
      }
      const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-locked-'));
      const env = loopxEnv(home);
      const lockedDirectory = join(home, '.agents', 'skills', 'shared', 'locked');
      const installed = join(lockedDirectory, 'retired-contract.md');
      const lockedPath = locked === 'file' ? installed : lockedDirectory;
      t.after(async () => {
        await chmod(lockedPath, locked === 'file' ? 0o644 : 0o755).catch(() => {});
        await rm(home, { recursive: true, force: true });
      });
      const sourceRoot = await copySkillsWithSharedFiles(home, { 'locked/retired-contract.md': '# Retired contract\n' });
      assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

      await rm(join(sourceRoot, 'shared', 'locked'), { recursive: true });
      await chmod(lockedPath, locked === 'file' ? 0o000 : 0o555);

      for (let run = 0; run < 2; run += 1) {
        const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });
        assert.equal(upgraded.ok, true);
        assert.deepEqual(upgraded.removed, []);
        assert.ok(upgraded.skipped.some(({ skillName, reason }) =>
          skillName === 'shared/locked/retired-contract.md' && reason === 'unreadable:EACCES'));
      }
      assert.equal(existsSync(installed), true);
    });
  }

  it('does not delete files that a baseline item places outside the shared directory', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-outside-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    assert.equal((await installBundledSkills(env, { yes: true })).ok, true);

    const content = '# Outside the shared directory\n';
    const hash = createHash('sha256').update(content).digest('hex');
    const outside = [join(home, 'outside.md'), join(home, '.agents', 'skills', 'outside.md')];
    for (const path of outside) {
      await writeFile(path, content);
    }
    const baselinePath = join(home, '.loopx', 'template-hashes.json');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    baseline.items.push(
      { path: 'outside.md', kind: 'shared-contract', hash, registry_hash: hash },
      { path: outside[1], kind: 'shared-contract', hash, registry_hash: hash },
      { path: '.agents/skills/shared/../outside.md', kind: 'shared-contract', hash, registry_hash: hash },
      { kind: 'shared-contract', hash, registry_hash: hash },
    );
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

    const upgraded = await installBundledSkills(env, { yes: true });

    assert.deepEqual(upgraded.removed, []);
    for (const path of outside) {
      assert.equal(await readFile(path, 'utf8'), content);
    }
  });

  it('keeps dry-run read-only when a retired shared contract is installed', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-dry-run-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const installed = join(home, '.agents', 'skills', 'shared', 'retired-contract.md');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'retired-contract.md': '# Retired contract\n' });
    const env = { ...loopxEnv(home), LOOPX_SKILL_SOURCE_ROOT: sourceRoot };
    assert.equal((await installBundledSkills(env, { yes: true })).ok, true);
    await rm(join(sourceRoot, 'shared', 'retired-contract.md'));
    const baselinePath = join(home, '.loopx', 'template-hashes.json');
    const baselineBefore = await readFile(baselinePath, 'utf8');

    const preview = await inspectInstallTargets(env, { targets: ['codex'] });

    assert.equal(preview.dryRun, true);
    assert.equal(await readFile(installed, 'utf8'), '# Retired contract\n');
    assert.equal(await readFile(baselinePath, 'utf8'), baselineBefore);
  });

  it('reports removed retired shared contracts in install summaries', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-summary-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'retired-contract.md': '# Retired contract\n' });
    const env = { ...loopxEnv(home), LOOPX_SKILL_SOURCE_ROOT: sourceRoot };
    const postinstall = join(repoRoot, 'scripts', 'install-skills.mjs');
    await execFileAsync(process.execPath, [postinstall], { env });
    await rm(join(sourceRoot, 'shared', 'retired-contract.md'));

    const cli = await execFileAsync(process.execPath, [cliPath, 'install-skills', '--target', 'codex', '--yes'], { env });
    assert.match(cli.stdout, /^removed retired: 1$/m);
    const postinstallRun = await execFileAsync(process.execPath, [postinstall], { env });
    assert.match(postinstallRun.stdout, /^removed retired: 1$/m);
    assert.match(postinstallRun.stdout, /^skipped \(preserved\): 0$/m);
    const repair = JSON.parse((await execFileAsync(process.execPath, [cliPath, 'repair-install'], { env })).stdout);
    assert.deepEqual(repair.removed, []);
    assert.equal(existsSync(join(home, '.claude', 'skills', 'shared', 'retired-contract.md')), false);
  });

  it('upgrades a shared contract renamed only by letter case on a case-insensitive filesystem', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-case-rename-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    await writeFile(join(home, 'case-probe'), '');
    if (!existsSync(join(home, 'CASE-PROBE'))) {
      t.skip('filesystem is case-sensitive');
      return;
    }
    const env = loopxEnv(home);
    const sharedRoot = join(home, '.agents', 'skills', 'shared');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'Retired-Case.md': '# Old name\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await rm(join(sourceRoot, 'shared', 'Retired-Case.md'));
    await writeFile(join(sourceRoot, 'shared', 'retired-case.md'), '# New name\n');
    for (let run = 0; run < 2; run += 1) {
      const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });
      assert.equal(upgraded.ok, true);
      assert.deepEqual(upgraded.removed, []);
      assert.equal(await readFile(join(sharedRoot, 'retired-case.md'), 'utf8'), '# New name\n');
    }
    const baseline = JSON.parse(await readFile(join(home, '.loopx', 'template-hashes.json'), 'utf8'));
    assert.deepEqual(baseline.items.filter(({ path }) => /retired-case\.md$/i.test(path)).map(({ path }) => path.split('/').pop()),
      ['retired-case.md']);
  });

  it('keeps a user-modified shared contract renamed only by letter case', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-case-rename-modified-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    await writeFile(join(home, 'case-probe'), '');
    if (!existsSync(join(home, 'CASE-PROBE'))) {
      t.skip('filesystem is case-sensitive');
      return;
    }
    const env = loopxEnv(home);
    const installed = join(home, '.agents', 'skills', 'shared', 'Retired-Case.md');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'Retired-Case.md': '# Old name\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await writeFile(installed, '# Old name\nUser note.\n');
    await rm(join(sourceRoot, 'shared', 'Retired-Case.md'));
    await writeFile(join(sourceRoot, 'shared', 'retired-case.md'), '# New name\n');

    for (let run = 0; run < 2; run += 1) {
      const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });
      assert.ok(upgraded.conflicts.some(({ skillName, reason }) =>
        skillName === 'shared/retired-case.md' && reason === 'foreign_or_modified_shared_contract:conflict'));
      assert.equal(await readFile(installed, 'utf8'), '# Old name\nUser note.\n');
    }
  });

  it('removes every known version of shared files retired before baselines', async (t) => {
    const fixtures = join(repoRoot, 'test', 'fixtures', 'legacy-shared-contracts', 'retired');
    const versions = [];
    for (const hash of (await readdir(fixtures)).sort()) {
      for (const entry of await readdir(join(fixtures, hash), { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) {
          const source = join(entry.parentPath, entry.name);
          versions.push({ hash, source, relativePath: source.slice(join(fixtures, hash).length + 1) });
        }
      }
    }
    assert.equal(versions.length, 10);
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-legacy-retired-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sharedRoot = join(home, '.agents', 'skills', 'shared');
    assert.equal((await installBundledSkills(env, { yes: true })).ok, true);

    for (const { hash, source, relativePath } of versions) {
      const content = await readFile(source);
      assert.equal(createHash('sha256').update(content).digest('hex'), hash, relativePath);
      await mkdir(dirname(join(sharedRoot, relativePath)), { recursive: true });
      await writeFile(join(sharedRoot, relativePath), content);
      const upgraded = await installBundledSkills(env, { yes: true });
      assert.deepEqual(upgraded.removed.map(({ skillName }) => skillName), [`shared/${relativePath}`], hash);
      assert.equal(existsSync(join(sharedRoot, relativePath)), false, hash);
    }
    assert.equal(existsSync(join(sharedRoot, 'scripts')), false);

    await writeFile(join(sharedRoot, 'review-contract.md'), '# Review contract\nUser-owned edits.\n');
    const kept = await installBundledSkills(env, { yes: true });
    assert.deepEqual(kept.removed, []);
    assert.ok(kept.skipped.some(({ skillName, reason }) =>
      skillName === 'shared/review-contract.md' && reason === 'user-modified'));
    assert.equal(await readFile(join(sharedRoot, 'review-contract.md'), 'utf8'), '# Review contract\nUser-owned edits.\n');
  });

  it('does not remove legacy shared file versions in a root loopx never installed into', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-legacy-fresh-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const fixture = join(repoRoot, 'test', 'fixtures', 'legacy-shared-contracts', 'retired',
      '9aac27bbd9cf95104707cdd7946821e7982fa51f3e72115871ef1c51c269e56b', 'parallel-plan-contract.md');
    const userCopy = join(home, '.agents', 'skills', 'shared', 'parallel-plan-contract.md');
    await mkdir(dirname(userCopy), { recursive: true });
    await cp(fixture, userCopy);

    const installed = await installBundledSkills(env, { yes: true });

    assert.equal(installed.ok, true);
    assert.deepEqual(installed.removed, []);
    assert.equal(existsSync(userCopy), true);
  });

  it('does not report missing legacy files behind a symlinked shared directory', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-legacy-linked-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    assert.equal((await installBundledSkills(env, { yes: true })).ok, true);
    const userDirectory = join(home, 'user-scripts');
    await mkdir(userDirectory);
    await symlink(userDirectory, join(home, '.agents', 'skills', 'shared', 'scripts'), 'dir');

    const upgraded = await installBundledSkills(env, { yes: true });

    assert.equal(upgraded.ok, true);
    assert.equal(upgraded.skipped.some(({ skillName }) => skillName.startsWith('shared/scripts/')), false);
  });

  it('records a kept retired shared contract once when another shipped name links to it', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-shared-retired-hardlink-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sharedRoot = join(home, '.agents', 'skills', 'shared');
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'old.md': '# Old\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);

    await writeFile(join(sharedRoot, 'old.md'), '# Old\nUser note.\n');
    await rm(join(sourceRoot, 'shared', 'old.md'));
    await writeFile(join(sourceRoot, 'shared', 'new.md'), '# New\n');
    await link(join(sharedRoot, 'old.md'), join(sharedRoot, 'new.md'));

    for (let run = 0; run < 3; run += 1) {
      const upgraded = await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });
      assert.ok(upgraded.conflicts.some(({ skillName, reason }) =>
        skillName === 'shared/new.md' && reason === 'foreign_or_modified_shared_contract:unknown'));
      const baseline = JSON.parse(await readFile(join(home, '.loopx', 'template-hashes.json'), 'utf8'));
      assert.equal(baseline.items.filter(({ path }) => path.endsWith('shared/old.md')).length, 1);
    }
    assert.equal(await readFile(join(sharedRoot, 'old.md'), 'utf8'), '# Old\nUser note.\n');
  });

  for (const replacement of ['directory', 'directory symlink']) {
    it(`preserves a ${replacement} where a shipped shared contract belongs`, async (t) => {
      const home = await mkdtemp(join(tmpdir(), 'loopx-shared-shipped-dir-'));
      t.after(() => rm(home, { recursive: true, force: true }));
      const env = loopxEnv(home);
      const contract = join(home, '.agents', 'skills', 'shared', 'evidence-contract.md');
      assert.equal((await installBundledSkills(env, { yes: true })).ok, true);

      const userDirectory = replacement === 'directory' ? contract : join(home, 'user-directory');
      await rm(contract);
      await mkdir(userDirectory);
      await writeFile(join(userDirectory, 'note.md'), '# User note\n');
      if (replacement !== 'directory') {
        await symlink(userDirectory, contract, 'dir');
      }

      for (let run = 0; run < 2; run += 1) {
        const upgraded = await installBundledSkills(env, { yes: true });
        assert.equal(upgraded.ok, false);
        assert.ok(upgraded.conflicts.some(({ skillName, reason }) =>
          skillName === 'shared/evidence-contract.md' && reason === 'non_file_shared_contract_target'));
        assert.equal(await readFile(join(userDirectory, 'note.md'), 'utf8'), '# User note\n');
      }
      const verification = await verifyInstallState(env);
      assert.ok(verification.failures.includes('shared_contracts_drifted'));
    });
  }

  it('preserves a directory where a skill file belongs', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-skill-file-dir-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const skillFile = join(home, '.agents', 'skills', 'tdd', 'SKILL.md');
    assert.equal((await installBundledSkills(env, { yes: true })).ok, true);

    await rm(skillFile);
    await mkdir(skillFile);
    await writeFile(join(skillFile, 'note.md'), '# User note\n');

    for (let run = 0; run < 2; run += 1) {
      const upgraded = await installBundledSkills(env, { yes: true });
      assert.ok(upgraded.skipped.some(({ skillName, reason }) => skillName === 'tdd' && reason === 'unknown'));
      assert.equal(await readFile(join(skillFile, 'note.md'), 'utf8'), '# User note\n');
    }
  });

  for (const directory of ['', 'nested']) {
    it(`preserves source files behind a shared ${directory || 'root'} directory symlink`, async (t) => {
      const home = await mkdtemp(join(tmpdir(), 'loopx-shared-symlink-'));
      t.after(() => rm(home, { recursive: true, force: true }));
      const sourceRoot = join(home, 'package-skills');
      await cp(join(repoRoot, 'skills'), sourceRoot, { recursive: true });
      const sourceDirectory = join(sourceRoot, 'shared', directory);
      await mkdir(sourceDirectory, { recursive: true });
      const sourceFile = join(sourceDirectory, 'link-probe.md');
      const content = '# Shared contract\nPreserve canonical source.\n';
      await writeFile(sourceFile, content);
      const targetDirectory = join(home, '.agents', 'skills', 'shared', directory);
      await mkdir(join(targetDirectory, '..'), { recursive: true });
      await symlink(sourceDirectory, targetDirectory, 'dir');

      const result = await installBundledSkills(loopxEnv(home), { yes: true, skillSourceRoot: sourceRoot });

      assert.equal(result.ok, false);
      assert.ok(result.conflicts.some(({ reason }) => reason === 'symlinked_shared_contract_directory'));
      assert.equal(await readFile(sourceFile, 'utf8'), content);
      assert.equal((await lstat(targetDirectory)).isSymbolicLink(), true);
    });
  }

  it('removes retired loopx-owned planning skills during installation', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-retired-skills-'));
    const env = loopxEnv(home);
    const skillsRoot = join(home, '.agents', 'skills');
    const retiredSkills = ['plan', 'plan-to-exec'];

    for (const skillName of retiredSkills) {
      await mkdir(join(skillsRoot, skillName), { recursive: true });
      await writeFile(join(skillsRoot, skillName, 'SKILL.md'), `# ${skillName}\n`);
    }
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      env.LOOPX_SKILL_LOCK_PATH,
      `${JSON.stringify({
        version: 3,
        skills: Object.fromEntries(retiredSkills.map((skillName) => [
          skillName,
          {
            source: 'loopx',
            sourceType: 'local',
            installationIdentity: 'loopx',
            sourceUrl: repoRoot,
            skillPath: `skills/${skillName}/SKILL.md`,
            installedPath: join(skillsRoot, skillName),
          },
        ])),
      }, null, 2)}\n`,
    );

    const result = await installBundledSkills(env);

    assert.deepEqual(result.removed.map((item) => item.skillName), retiredSkills);
    for (const skillName of retiredSkills) {
      assert.equal(existsSync(join(skillsRoot, skillName)), false);
    }
    assert.equal(existsSync(join(skillsRoot, 'plan2exec', 'SKILL.md')), true);
    const lock = JSON.parse(await readFile(env.LOOPX_SKILL_LOCK_PATH, 'utf8'));
    assert.equal(lock.skills.plan, undefined);
    assert.equal(lock.skills['plan-to-exec'], undefined);
    assert.ok(lock.skills.plan2exec);
  });

  it('preserves retired planning skill names that are not loopx-owned', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-foreign-retired-skill-'));
    const env = loopxEnv(home);
    const foreignSkill = join(home, '.agents', 'skills', 'plan', 'SKILL.md');
    await mkdir(join(home, '.agents', 'skills', 'plan'), { recursive: true });
    await writeFile(foreignSkill, '# user-owned plan\n');

    const result = await installBundledSkills(env);

    assert.deepEqual(result.removed, []);
    assert.equal(await readFile(foreignSkill, 'utf8'), '# user-owned plan\n');
    assert.equal(existsSync(join(home, '.agents', 'skills', 'plan2exec', 'SKILL.md')), true);
  });

  it('installs the same prompt-first routing authority for Codex and Claude', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-routing-'));
    const env = loopxEnv(home);

    const result = await installSkillsForTargets(env, { targets: ['codex', 'claude'] });

    assert.equal(result.ok, true);
    const codexGuidance = await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8');
    const claudeGuidance = await readFile(join(home, '.claude', 'CLAUDE.md'), 'utf8');
    const codexRouting = managedBlock(codexGuidance, 'prompt-first-routing');
    const claudeRouting = managedBlock(claudeGuidance, 'prompt-first-routing');
    assert.ok(codexRouting, 'Codex guidance must contain prompt-first routing');
    assert.equal(claudeRouting, codexRouting, 'Codex and Claude routing must be byte-consistent');

    const agreement = await readFile(join(repoRoot, 'templates', 'working-agreement.md'), 'utf8');
    assert.equal(codexRouting, agreement.trim(), 'installed rules must match the canonical agreement');
    for (const forbidden of [/\$direct/i, /direct mode/i, /risk score/i, /Golden[- ]path/i, /skills\/RESOLVER\.md/i]) {
      assert.doesNotMatch(codexRouting, forbidden);
    }

    const clarifySkill = await readFile(join(home, '.agents', 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const specSkill = await readFile(join(home, '.agents', 'skills', 'spec', 'SKILL.md'), 'utf8');
    assert.equal(clarifySkill, await readFile(join(repoRoot, 'skills/clarify/SKILL.md'), 'utf8'));
    assert.equal(specSkill, await readFile(join(repoRoot, 'skills/spec/SKILL.md'), 'utf8'));
  });

  it('installs plan2exec as a traceable document contract', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lean-plan-'));
    const result = await installBundledSkills(loopxEnv(home));

    assert.equal(result.ok, true);
    assert.equal(LOOPX_BUNDLED_SKILLS.includes('plan2exec'), true);
    assert.equal(LOOPX_BUNDLED_SKILLS.includes('plan'), false);
    assert.equal(LOOPX_BUNDLED_SKILLS.includes('plan-to-exec'), false);
    const planSkill = await readFile(join(home, '.agents', 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const planSchema = await readFile(join(home, '.agents', 'skills', 'plan2exec', 'references', 'plan-schema.md'), 'utf8');
    const fixture = await readFile(join(repoRoot, 'test', 'fixtures', 'lean-plan.md'), 'utf8');

    assert.equal(planSkill, await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8'));
    assert.match(planSkill, /clear, bounded request.*prompt-first/is);
    for (const heading of [
      'Goal And Boundaries',
      'Integration And Final Verification',
      'Handoff And Residual Risks',
      'Execution rules for the consuming agent',
    ]) {
      assert.match(planSchema, new RegExp(`^## ${heading}$`, 'm'));
      assert.match(fixture, new RegExp(`^## ${heading}$`, 'm'));
    }
    assert.match(planSchema, /^## P-001 <coherent outcome>$/m);
    assert.match(fixture, /^## P-001 /m);
    for (const line of ['schema: loopx-plan/v1', 'source:', 'status: ready', 'slices:', '- id: P-001', 'status: pending']) {
      assert.match(planSchema, new RegExp(`^\\s*${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
      assert.match(fixture, new RegExp(`^\\s*${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
    }
    assert.ok(fixture.startsWith('---\n'), 'lean plan fixture must open with a YAML frontmatter block');
    assert.ok(fixture.slice(4).includes('\n---\n'), 'lean plan fixture frontmatter must close before the body');
    assert.match(planSchema, /depends: \[P-001\]/);
    assert.match(planSchema, /depends: \[\]/);
    assert.match(fixture, /depends: \[\]/);
    for (const field of ['writes', 'anchors', 'architecture', 'verify', 'review']) {
      assert.match(planSchema, new RegExp(`^> ${field}:`, 'm'));
      assert.match(fixture, new RegExp(`^> ${field}:`, 'm'));
    }
    for (const field of ['Blockers', 'Residual risks', 'Resume note']) {
      assert.match(planSchema, new RegExp(`^- ${field}:`, 'm'));
      assert.match(fixture, new RegExp(`^- ${field}:`, 'm'));
    }
    assert.match(planSkill, /every implementation-relevant.*AC-\*.*D-\*.*TC-\*/is);
    assert.match(planSkill, /deferred-with-rationale/i);
    assert.match(planSchema, /Execution rules for the consuming agent/i);
    assert.doesNotMatch(planSchema, /loopx\.execution-graph\.v1|selected_profile|parallel_safe/);
    for (const forbidden of [
      /Bite-Sized Task Granularity/i,
      /minute-scale/i,
      /loopx-parallel-(?:plan|task|package)/i,
      /implementation code/i,
    ]) {
      assert.doesNotMatch(planSchema, forbidden);
      assert.doesNotMatch(fixture, forbidden);
    }
  });

  it('installs exec without restoring retired orchestration or review skills', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-docs-first-surface-'));
    const result = await installBundledSkills(loopxEnv(home));

    assert.equal(result.ok, true);
    const installedRoot = join(home, '.agents', 'skills');
    assert.equal(existsSync(join(installedRoot, 'exec', 'SKILL.md')), true);
    for (const removed of [
      'subagent-exec',
      'parallel-subagent-exec',
      'review',
      'final-review',
      'fix-review',
      'code-darwin',
      'verify',
      'design-review',
      'plan-reviewer',
      'clarify-v2',
      'spec-v2',
      'finish',
    ]) {
      assert.equal(existsSync(join(installedRoot, removed, 'SKILL.md')), false, removed);
    }

    const agreement = managedBlock(
      await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8'),
      'prompt-first-routing',
    );
    assert.match(agreement, /Only claim completion from fresh command output/i);
    assert.match(agreement, /independent subagent review the exact diff/i);
    assert.match(agreement, /Never commit, push, merge, or discard work unless the user explicitly asks/i);
  });

  it('preserves a pristine legacy exec install when its template baseline entry is unavailable', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-pristine-legacy-exec-'));
    const env = loopxEnv(home);
    await installBundledSkills(env);

    const baselinePath = join(home, '.loopx', 'template-hashes.json');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    baseline.items = baseline.items.filter((item) => item.path !== '.agents/skills/exec/SKILL.md');
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

    const result = await installBundledSkills(env);

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.skipped.filter((item) => item.skillName === 'exec').map((item) => item.reason),
      ['unknown'],
    );
  });

  it('preserves a modified legacy exec install without a template baseline entry', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-modified-legacy-exec-'));
    const env = loopxEnv(home);
    await installBundledSkills(env);

    const baselinePath = join(home, '.loopx', 'template-hashes.json');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    baseline.items = baseline.items.filter((item) => item.path !== '.agents/skills/exec/SKILL.md');
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    const execPath = join(home, '.agents', 'skills', 'exec', 'SKILL.md');
    const modified = `${await readFile(execPath, 'utf8')}\n# user edit\n`;
    await writeFile(execPath, modified);

    const result = await installBundledSkills(env);

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.skipped.filter((item) => item.skillName === 'exec').map((item) => item.reason),
      ['unknown'],
    );
    assert.equal(await readFile(execPath, 'utf8'), modified);

    const again = await installBundledSkills(env);
    assert.deepEqual(
      again.skipped.filter((item) => item.skillName === 'exec').map((item) => item.reason),
      ['unknown'],
    );
    assert.equal(await readFile(execPath, 'utf8'), modified);
  });

  it('upgrades a pristine legacy skill on the install after its baseline is adopted', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-pristine-legacy-adopt-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    await installBundledSkills(env);
    const baselinePath = join(home, '.loopx', 'template-hashes.json');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    baseline.items = baseline.items.filter((item) => item.path !== '.agents/skills/exec/SKILL.md');
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

    const first = await installBundledSkills(env);
    const second = await installBundledSkills(env);

    assert.deepEqual(first.skipped.filter((item) => item.skillName === 'exec').map((item) => item.reason), ['unknown']);
    assert.equal(second.skipped.some((item) => item.skillName === 'exec'), false);
    assert.ok(second.installed.some((row) => row.installedPath.endsWith('/exec')));
  });

  it('keeps a regular file where a skill directory belongs', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-skill-dir-file-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    await installBundledSkills(env);
    const skillDir = join(home, '.agents', 'skills', 'tdd');
    await rm(skillDir, { recursive: true });
    await writeFile(skillDir, '# User file\n');

    const result = await installBundledSkills(env);

    assert.equal(result.ok, false);
    assert.ok(result.conflicts.some(({ skillName, reason }) => skillName === 'tdd' && reason === 'non_directory_skill_target'));
    assert.equal(await readFile(skillDir, 'utf8'), '# User file\n');
    const verification = await verifyInstallState(env);
    assert.ok(verification.failures.includes('missing_installed_skill_dir:tdd'));
    assert.ok(verification.failures.includes('discovery_incomplete:tdd'));
  });

  it('keeps a foreign dangling link where a skill directory belongs', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-foreign-dangling-skill-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const skillDir = join(home, '.agents', 'skills', 'tdd');
    await mkdir(dirname(skillDir), { recursive: true });
    await symlink(join(home, 'unmounted-volume', 'my-tdd'), skillDir, 'dir');

    const result = await installBundledSkills(env);

    assert.equal(result.ok, false);
    assert.ok(result.conflicts.some(({ skillName, reason }) => skillName === 'tdd' && reason === 'foreign_or_unowned_target'));
    assert.equal((await lstat(skillDir)).isSymbolicLink(), true);
  });

  it('does not adopt a skill directory that links somewhere other than a source', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-legacy-foreign-link-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    await installBundledSkills(env);
    await dropSkillBaseline(home, 'tdd');
    const skillDir = join(home, '.agents', 'skills', 'tdd');
    const userCopy = join(home, 'my-tdd');
    await cp(skillDir, userCopy, { recursive: true });
    await rm(skillDir, { recursive: true });
    await symlink(userCopy, skillDir, 'dir');

    for (let run = 0; run < 2; run += 1) {
      const result = await installBundledSkills(env);
      assert.deepEqual(result.skipped.filter((item) => item.skillName === 'tdd').map((item) => item.reason), ['unknown']);
      assert.equal((await lstat(skillDir)).isSymbolicLink(), true);
    }
    assert.equal(existsSync(join(userCopy, 'SKILL.md')), true);
  });

  it('reports an unreadable shared contract as a conflict without throwing', async (t) => {
    if (process.platform === 'win32' || process.getuid?.() === 0) {
      t.skip('permission bits do not restrict this user');
      return;
    }
    const home = await mkdtemp(join(tmpdir(), 'loopx-unreadable-shared-'));
    const contract = join(home, '.agents', 'skills', 'shared', 'evidence-contract.md');
    t.after(async () => {
      await chmod(contract, 0o644).catch(() => {});
      await rm(home, { recursive: true, force: true });
    });
    const env = loopxEnv(home);
    assert.equal((await installBundledSkills(env)).ok, true);
    await chmod(contract, 0o000);

    const result = await installBundledSkills(env);

    assert.equal(result.ok, false);
    assert.ok(result.conflicts.some(({ skillName }) => skillName === 'shared/evidence-contract.md'));
    assert.ok((await verifyInstallState(env)).failures.includes('shared_contracts_drifted'));
  });

  it('keeps a dangling link at the new skills root and the old copy during a root move', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-root-move-dangling-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    assert.equal((await installBundledSkills(env)).ok, true);
    const newRoot = join(home, 'other-skills');
    await mkdir(newRoot);
    await symlink(join(home, 'unmounted-volume', 'my-tdd'), join(newRoot, 'tdd'), 'dir');

    const moved = await installBundledSkills({ ...env, LOOPX_SKILLS_ROOT: newRoot });

    assert.ok(moved.conflicts.some(({ skillName, reason }) => skillName === 'tdd' && reason === 'canonical_target_occupied'));
    assert.equal((await lstat(join(newRoot, 'tdd'))).isSymbolicLink(), true);
    assert.equal(existsSync(join(home, '.agents', 'skills', 'tdd', 'SKILL.md')), true);
  });

  it('removes pristine copies at a previous skills root installed from a custom source', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-stale-custom-root-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const skillSourceRoot = await copySkillsWithSharedFiles(home, {});
    assert.equal((await installBundledSkills(env, { skillSourceRoot })).ok, true);

    const moved = await installBundledSkills({ ...env, LOOPX_SKILLS_ROOT: join(home, 'other-skills') }, { skillSourceRoot });

    assert.equal(moved.skipped.some(({ reason }) => reason.startsWith('stale_install')), false);
    assert.equal(existsSync(join(home, '.agents', 'skills', 'tdd')), false);
  });

  it('removes a dangling symlink install left at a previous skills root', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-stale-dangling-link-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const packageRoot = join(home, 'package');
    await cp(join(repoRoot, 'skills'), join(packageRoot, 'skills'), { recursive: true });
    assert.equal((await installBundledSkills(env, {
      installMethod: 'symlink',
      sourceUrl: packageRoot,
      skillSourceRoot: join(packageRoot, 'skills'),
    })).ok, true);
    await rm(packageRoot, { recursive: true });

    const moved = await installBundledSkills({ ...env, LOOPX_SKILLS_ROOT: join(home, 'other-skills') });

    assert.equal(moved.skipped.some(({ reason }) => reason.startsWith('stale_install')), false);
    assert.equal(await lstat(join(home, '.agents', 'skills', 'tdd')).catch(() => null), null);
  });

  async function dropSkillBaseline(home, skillName) {
    const baselinePath = join(home, '.loopx', 'template-hashes.json');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    baseline.items = baseline.items.filter((item) => !item.path.endsWith(`skills/${skillName}/SKILL.md`));
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  }

  it('keeps an edited reference file of a skill without a baseline across installs', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-legacy-reference-edit-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    await installBundledSkills(env);
    await dropSkillBaseline(home, 'tdd');
    const reference = join(home, '.agents', 'skills', 'tdd', 'references', 'red-green-refactor.md');
    const edited = `${await readFile(reference, 'utf8')}\n# user note\n`;
    await writeFile(reference, edited);

    for (let run = 0; run < 2; run += 1) {
      const result = await installBundledSkills(env);
      assert.deepEqual(result.skipped.filter((item) => item.skillName === 'tdd').map((item) => item.reason), ['unknown']);
      assert.equal(await readFile(reference, 'utf8'), edited);
    }
  });

  for (const layout of ['symlink install', 'custom source root']) {
    it(`adopts a pristine ${layout} skill without a baseline`, async (t) => {
      const home = await mkdtemp(join(tmpdir(), 'loopx-legacy-adopt-layout-'));
      t.after(() => rm(home, { recursive: true, force: true }));
      const env = loopxEnv(home);
      // Link into a copy, never the repository's own skills directory.
      const skillSourceRoot = await copySkillsWithSharedFiles(home, {});
      const options = layout === 'symlink install' ? { installMethod: 'symlink', skillSourceRoot } : { skillSourceRoot };
      assert.equal((await installBundledSkills(env, options)).ok, true);
      await dropSkillBaseline(home, 'tdd');

      const first = await installBundledSkills(env, options);
      const second = await installBundledSkills(env, options);

      assert.deepEqual(first.skipped.filter((item) => item.skillName === 'tdd').map((item) => item.reason), ['unknown']);
      assert.equal(second.skipped.some((item) => item.skillName === 'tdd'), false);
    });
  }

  it('reinstalls a skill whose symlinked source has moved away', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-broken-skill-link-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sourceRoot = await copySkillsWithSharedFiles(home, {});
    assert.equal((await installBundledSkills(env, { installMethod: 'symlink', skillSourceRoot: sourceRoot })).ok, true);
    await rm(sourceRoot, { recursive: true });

    const result = await installBundledSkills(env);

    assert.equal(result.ok, true);
    assert.equal(existsSync(join(home, '.agents', 'skills', 'tdd', 'SKILL.md')), true);
  });

  it('keeps an edited skill at a previous skills root and removes pristine ones', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-stale-skills-root-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    assert.equal((await installBundledSkills(env)).ok, true);
    const oldRoot = join(home, '.agents', 'skills');
    const edited = join(oldRoot, 'tdd', 'references', 'red-green-refactor.md');
    await writeFile(edited, '# user notes\n');

    const moved = await installBundledSkills({ ...env, LOOPX_SKILLS_ROOT: join(home, 'other-skills') });

    assert.ok(moved.skipped.some(({ skillName, reason }) => skillName === 'tdd' && reason === 'stale_install_unverified'));
    assert.equal(await readFile(edited, 'utf8'), '# user notes\n');
    assert.equal(existsSync(join(oldRoot, 'debug')), false);
    assert.equal(existsSync(join(home, 'other-skills', 'tdd', 'SKILL.md')), true);
  });

  it('keeps an unreadable skill file without failing the install', async (t) => {
    if (process.platform === 'win32' || process.getuid?.() === 0) {
      t.skip('permission bits do not restrict this user');
      return;
    }
    const home = await mkdtemp(join(tmpdir(), 'loopx-unreadable-skill-'));
    const skillFile = join(home, '.agents', 'skills', 'tdd', 'SKILL.md');
    t.after(async () => {
      await chmod(skillFile, 0o644).catch(() => {});
      await rm(home, { recursive: true, force: true });
    });
    const env = loopxEnv(home);
    assert.equal((await installBundledSkills(env)).ok, true);
    await chmod(skillFile, 0o000);

    for (let run = 0; run < 2; run += 1) {
      const result = await installBundledSkills(env);
      assert.ok(result.skipped.some(({ skillName, reason }) => skillName === 'tdd' && reason === 'conflict'));
    }
  });

  it('records a duplicated baseline item once', async (t) => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-baseline-duplicate-'));
    t.after(() => rm(home, { recursive: true, force: true }));
    const env = loopxEnv(home);
    const sourceRoot = await copySkillsWithSharedFiles(home, { 'retired-contract.md': '# Retired contract\n' });
    assert.equal((await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot })).ok, true);
    const baselinePath = join(home, '.loopx', 'template-hashes.json');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    const retired = baseline.items.find(({ path }) => path.endsWith('shared/retired-contract.md'));
    baseline.items.push({ ...retired });
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    // A kept retired file carries its existing baseline items forward.
    await rm(join(sourceRoot, 'shared', 'retired-contract.md'));
    await writeFile(join(home, '.agents', 'skills', 'shared', 'retired-contract.md'), '# Retired contract\nUser note.\n');

    await installBundledSkills(env, { yes: true, skillSourceRoot: sourceRoot });

    const after = JSON.parse(await readFile(baselinePath, 'utf8'));
    assert.equal(after.items.filter(({ path }) => path === retired.path).length, 1);
  });

  it('classifies an unreadable baseline target as a conflict', async (t) => {
    if (process.platform === 'win32' || process.getuid?.() === 0) {
      t.skip('permission bits do not restrict this user');
      return;
    }
    const home = await mkdtemp(join(tmpdir(), 'loopx-unreadable-target-'));
    const target = join(home, 'target.md');
    t.after(async () => {
      await chmod(target, 0o644).catch(() => {});
      await rm(home, { recursive: true, force: true });
    });
    await writeFile(target, '# Target\n');
    const [item] = (await createTemplateBaseline(home, [{ path: target }])).items;
    await chmod(target, 0o000);

    const drift = await classifyTemplateDrift(item, { root: home });

    assert.deepEqual([drift.status, drift.reason], ['conflict', 'unreadable_target']);
  });

  it('preserves an unowned same-name exec skill', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-foreign-exec-'));
    const env = loopxEnv(home);
    const execPath = join(home, '.agents', 'skills', 'exec', 'SKILL.md');
    await mkdir(join(home, '.agents', 'skills', 'exec'), { recursive: true });
    await writeFile(execPath, '# user-owned exec\n');

    const result = await installBundledSkills(env);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.conflicts.filter((item) => item.skillName === 'exec').map((item) => item.reason),
      ['foreign_or_unowned_target'],
    );
    assert.equal(await readFile(execPath, 'utf8'), '# user-owned exec\n');
  });

});

await rm(join(repoRoot, '.loopx', 'workflows', 'smoke-clean-runtime'), { recursive: true, force: true });
