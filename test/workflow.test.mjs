import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import {
  installBundledSkills,
  installSkillsForTargets,
  LOOPX_BUNDLED_SKILLS,
  verifyInstallState,
} from '../src/install-discovery.mjs';
import { clarifyStage, initWorkspace, readDocumentIndex, resolveWorkflowRoot, resolveWorkspaceRoot, statusSummary } from '../src/workflow.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd());
const cliPath = resolve(repoRoot, 'src/cli.mjs');
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loopxEnv(home) {
  return {
    ...process.env,
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

describe('loopx docs-first document shell', () => {
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

    assert.match(codexRouting, /smallest change that satisfies it/i);
    assert.match(codexRouting, /Only claim completion from fresh command output/i);
    assert.match(codexRouting, /materially ambiguous.*clarify/is);
    assert.match(codexRouting, /public APIs and observable behavior stable/i);
    assert.match(codexRouting, /Never commit, push, merge, or discard work unless the user explicitly asks/i);
    for (const forbidden of [/\$direct/i, /direct mode/i, /risk score/i, /Golden[- ]path/i, /skills\/RESOLVER\.md/i]) {
      assert.doesNotMatch(codexRouting, forbidden);
    }

    const clarifySkill = await readFile(join(home, '.agents', 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const specSkill = await readFile(join(home, '.agents', 'skills', 'spec', 'SKILL.md'), 'utf8');
    assert.match(clarifySkill, /description:.*concrete ambiguity.*Not for clear bounded requests/i);
    assert.match(specSkill, /description:.*unresolved compatibility.*architecture decisions.*Not for clear local implementation/i);
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

    assert.match(planSkill, /explicit planning.*approval boundar.*interruption recovery.*durable coordination/is);
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
    for (const line of ['source:', 'status: ready', 'slices:', '- id: P-001', 'status: pending']) {
      assert.match(planSchema, new RegExp(`^\\s*${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
      assert.match(fixture, new RegExp(`^\\s*${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
    }
    assert.ok(fixture.startsWith('---\n'), 'lean plan fixture must open with a YAML frontmatter block');
    assert.ok(fixture.slice(4).includes('\n---\n'), 'lean plan fixture frontmatter must close before the body');
    assert.match(planSchema, /depends: \[P-001\]/);
    assert.match(planSchema, /depends: \[\]/);
    assert.match(fixture, /depends: \[\]/);
    for (const field of ['writes', 'anchors', 'verify', 'review']) {
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
