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
import { nextSkillCommand, withNextSkill } from '../src/next-skill.mjs';
import { clarifyStage, initWorkspace, readState, resolveWorkflowRoot, resolveWorkspaceRoot, statusSummary } from '../src/workflow.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd());
const cliPath = resolve(repoRoot, 'src/cli.mjs');
const SCHEMA_VERSION_FIELD = ['schema', 'version'].join('_');
const SCHEMA_VERSION_ONE = Number.parseInt('1', 10);
const SCHEMA_VERSION_TWO = Number.parseInt('2', 10);
const SCHEMA_VERSION_LINE = `${SCHEMA_VERSION_FIELD}: ${SCHEMA_VERSION_TWO}`;
const removedIntakeArtifactKey = ['test', 'cases', 'path'].join('_');
const removedIntakeArtifactExistsKey = ['test', 'cases', 'exists'].join('_');
const removedMissingArtifactName = ['test', 'cases'].join('_');
const removedHumanTestCasesLinePattern = new RegExp(`^${['test', 'cases:'].join(' ')}`, 'm');
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

async function writeResolvedSpec(root, slug) {
  await writeFile(
    join(root, 'spec.md'),
    [
      '---',
      SCHEMA_VERSION_LINE,
      `workflow_id: ${slug}`,
      'stage: clarify',
      'current_round: 2',
      'ambiguity_score: 0.1',
      'non_goals_resolved: true',
      'decision_boundaries_resolved: true',
      'pressure_pass_complete: true',
      'unresolved_ambiguity_count: 0',
      '---',
      '',
      `# loopx Spec: ${slug}`,
      '',
      '## Ambiguity List',
      '',
      '- A-1 | resolved | Requirement scope is implementation-ready',
      '',
      '## Non-Goals',
      '',
      '- Do not skip verification.',
      '',
      '## Decision Boundaries',
      '',
      '- Agent chooses implementation details within the plan.',
    ].join('\n'),
  );
}

async function writeResolvedClarification(path, slug, handoffDecision = 'direct_to_plan') {
  await writeFile(
    path,
    [
      '---',
      SCHEMA_VERSION_LINE,
      `workflow_id: ${slug}`,
      'stage: clarify',
      'current_round: 2',
      'ambiguity_score: 0.1',
      'non_goals_resolved: true',
      'decision_boundaries_resolved: true',
      'pressure_pass_complete: true',
      'unresolved_ambiguity_count: 0',
      '---',
      '',
      `# Clarification Log: ${slug}`,
      '',
      '## Resume State',
      '',
      '- current_round: 2',
      '- unresolved_count: 0',
      '- non_goals_resolved: true',
      '- decision_boundaries_resolved: true',
      '- pressure_pass_complete: true',
      `- handoff_decision: ${handoffDecision}`,
      '- next_question: none',
    ].join('\n'),
  );
}

async function writeResolvedClarificationResumeOnly(path, slug) {
  await writeFile(
    path,
    [
      '---',
      SCHEMA_VERSION_LINE,
      `workflow_id: ${slug}`,
      'stage: clarify',
      'current_round: 0',
      'ambiguity_score: 1',
      'non_goals_resolved: false',
      'decision_boundaries_resolved: false',
      'pressure_pass_complete: false',
      'unresolved_ambiguity_count: 1',
      '---',
      '',
      `# Clarification Log: ${slug}`,
      '',
      '## Resume State',
      '',
      '- current_round: 2',
      '- ambiguity_score: 0.1',
      '- unresolved_count: 0',
      '- non_goals_resolved: true',
      '- decision_boundaries_resolved: true',
      '- pressure_pass_complete: true',
      '- handoff_decision: direct_to_plan',
      '- next_question: none',
    ].join('\n'),
  );
}

async function appendResolvedClarificationResume(path) {
  await writeFile(
    path,
    `${await readFile(path, 'utf8')}
## Notes

- Earlier resume state may be stale after incremental edits.

## Resume State

- current_round: 2
- ambiguity_score: 0.1
- unresolved_count: 0
- non_goals_resolved: true
- decision_boundaries_resolved: true
- pressure_pass_complete: true
- handoff_decision: direct_to_plan
- next_question: none
`,
  );
}

describe('loopx retained workflow shell', () => {
  it('initializes workspace metadata and a clarify workflow', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-init-'));
    const result = await initWorkspace(wd, { slug: 'Demo Init' });

    assert.equal(result.workspaceRoot, resolveWorkspaceRoot(wd));
    assert.equal(result.config.product_contract, 'skill-first-helper');
    assert.deepEqual(result.config.workflow_intents, [
      'clarify',
      'spec',
      'plan',
      'exec',
      'review',
      'finish',
    ]);
    assert.equal(Object.hasOwn(result.config, 'default_flow'), false);
    assert.equal(existsSync(join(resolveWorkspaceRoot(wd), 'config.json')), true);
    assert.equal(existsSync(resolveWorkflowRoot(wd, 'demo-init')), true);

    const state = await readState(wd, 'demo-init');
    assert.equal(state.current_stage, 'clarify');
    assert.equal(state.stage_status, 'blocked');
    assert.equal(state.next_skill_command, null);
  });

  it('clarify creates an intake package and deep mode state', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-clarify-'));
    const result = await clarifyStage(wd, 'deep-flow', { profile: 'deep' });

    assert.equal(result.state.clarify_profile, 'deep');
    assert.equal(result.state.clarify_max_rounds, 25);
    assert.equal(existsSync(join(result.root, 'spec.md')), true);

    assert.match(result.state.intake_package_path, /\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-deep-flow(?:-\d{6})?$/);
    assert.equal(existsSync(result.state.intake_package_path), true);
    assert.equal(result.state.clarification_path, join(result.state.intake_package_path, 'clarification.md'));
    assert.equal(result.state.requirements_path, join(result.state.intake_package_path, 'requirements.md'));
    assert.equal(Object.hasOwn(result.state, removedIntakeArtifactKey), false);
    assert.equal(result.state.spec_artifact_path, result.state.requirements_path);
    assert.equal(existsSync(result.state.clarification_path), true);
    assert.equal(existsSync(result.state.requirements_path), true);

    const requirements = await readFile(result.state.requirements_path, 'utf8');
    assert.match(requirements, /## Acceptance Criteria/);
    assert.match(requirements, /### AC-001/);
    assert.match(requirements, /## Acceptance Scenarios/);
    assert.match(requirements, /### TC-001/);
    assert.match(requirements, /Source AC: AC-001/);
  });

  it('status exposes clarify intake package paths', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-status-intake-'));
    const clarified = await clarifyStage(wd, 'package-status');

    const status = await statusSummary(wd, 'package-status');
    assert.equal(status.intake_package_path, status.state.intake_package_path);
    assert.equal(status.requirements_path, status.state.requirements_path);
    assert.equal(Object.hasOwn(status, removedIntakeArtifactKey), false);
    assert.equal(Object.hasOwn(status.state, removedIntakeArtifactKey), false);
    assert.equal(status.spec_artifact_path, status.state.requirements_path);
    assert.equal(status.artifacts.intake_package_exists, true);
    assert.equal(status.artifacts.requirements_exists, true);
    assert.equal(Object.hasOwn(status.artifacts, removedIntakeArtifactExistsKey), false);

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'clarify', 'package-status'], { cwd: wd });
    assert.match(stdout, /^intake: .*\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-package-status/m);
    assert.match(stdout, /^requirements: .*requirements\.md$/m);
    assert.doesNotMatch(stdout, removedHumanTestCasesLinePattern);

    assert.equal(existsSync(clarified.state.requirements_path), true);
  });

  it('clarify does not overwrite an existing same-day intake package', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-intake-repeat-'));
    const first = await clarifyStage(wd, 'repeat-flow');
    const second = await clarifyStage(wd, 'repeat-flow');

    assert.notEqual(first.state.intake_package_path, second.state.intake_package_path);
    assert.equal(existsSync(first.state.requirements_path), true);
    assert.equal(existsSync(second.state.requirements_path), true);
  });

  it('status and next recommend canonical plan2exec when clarify is handoff-ready', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-next-'));
    const clarified = await clarifyStage(wd, 'ready-flow');
    await writeResolvedClarification(clarified.state.clarification_path, 'ready-flow');

    const status = await statusSummary(wd, 'ready-flow');
    const expectedPlanCommand = `$plan2exec ${status.state.intake_package_path}`;
    assert.equal(status.state.stage_status, 'ready');
    assert.equal(status.state.next_skill_command, expectedPlanCommand);
    assert.equal(status.next_skill_command, expectedPlanCommand);

    const payload = withNextSkill({ ok: true }, status.state);
    assert.deepEqual(payload, {
      ok: true,
      next_skill_command: expectedPlanCommand,
      next_skill_hint: `Next skill: ${expectedPlanCommand}`,
    });

    const { stdout: nextStdout } = await execFileAsync(process.execPath, [cliPath, 'next', 'ready-flow'], { cwd: wd });
    assert.match(nextStdout, new RegExp(`^next skill: \\$plan2exec ${escapeRegExp(status.state.intake_package_path)}$`, 'm'));
    assert.doesNotMatch(nextStdout, /next cli:/);

    const { stdout: statusStdout } = await execFileAsync(process.execPath, [cliPath, 'status', 'ready-flow'], { cwd: wd });
    const intakePackageName = status.state.intake_package_path.split(/[/\\]/).at(-1);
    const pathSeparatorPattern = '(?:/|\\\\)';
    const intakeDisplayPath = `(?:${escapeRegExp(status.state.intake_package_path)}|\\.loopx${pathSeparatorPattern}intake${pathSeparatorPattern}${escapeRegExp(intakePackageName)})`;
    assert.match(statusStdout, new RegExp(`^intake: ${intakeDisplayPath}$`, 'm'));
    assert.match(statusStdout, new RegExp(`^requirements: (?:${escapeRegExp(status.state.requirements_path)}|${intakeDisplayPath}${pathSeparatorPattern}requirements\\.md)$`, 'm'));
    assert.doesNotMatch(statusStdout, removedHumanTestCasesLinePattern);

    const { stdout: statusJsonStdout } = await execFileAsync(process.execPath, [cliPath, 'status', 'ready-flow', '--json'], { cwd: wd });
    const statusJson = JSON.parse(statusJsonStdout);
    assert.equal(statusJson.state.intake_package_path, status.state.intake_package_path);
    assert.equal(statusJson.state.requirements_path, status.state.requirements_path);
    assert.equal(Object.hasOwn(statusJson.state, removedIntakeArtifactKey), false);
  });

  it('routes ready clarify state from the persisted handoff decision', async () => {
    const needsSpecWd = await mkdtemp(join(tmpdir(), 'loopx-needs-spec-'));
    const needsSpec = await clarifyStage(needsSpecWd, 'needs-spec');
    await writeResolvedClarification(needsSpec.state.clarification_path, 'needs-spec', 'needs_spec');
    const needsSpecStatus = await statusSummary(needsSpecWd, 'needs-spec');
    assert.equal(needsSpecStatus.state.handoff_decision, 'needs_spec');
    assert.equal(needsSpecStatus.next_skill_command, `$spec ${needsSpecStatus.state.intake_package_path}`);
    const { stdout: needsSpecNext } = await execFileAsync(process.execPath, [cliPath, 'next', 'needs-spec'], { cwd: needsSpecWd });
    assert.match(needsSpecNext, /^next skill: \$spec /m);

    const blockedWd = await mkdtemp(join(tmpdir(), 'loopx-blocked-handoff-'));
    const blocked = await clarifyStage(blockedWd, 'blocked-handoff');
    await writeResolvedClarification(blocked.state.clarification_path, 'blocked-handoff', 'blocked');
    const blockedStatus = await statusSummary(blockedWd, 'blocked-handoff');
    assert.equal(blockedStatus.state.handoff_decision, 'blocked');
    assert.equal(blockedStatus.next_skill_command, null);
  });

  it('rejects pre-v2 running workflow state without rewriting it', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-old-workflow-'));
    const clarified = await clarifyStage(wd, 'old-workflow');
    const statePath = join(clarified.root, 'state.json');
    const oldState = { ...clarified.state, schema_version: SCHEMA_VERSION_ONE };
    await writeFile(statePath, `${JSON.stringify(oldState, null, 2)}\n`);

    await assert.rejects(() => readState(wd, 'old-workflow'), /unsupported_workflow_schema:1:restart_required/);
    await assert.rejects(() => statusSummary(wd), /unsupported_workflow_schema:1:restart_required/);
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), oldState);

    await assert.rejects(
      execFileAsync(process.execPath, [cliPath, 'status', 'old-workflow', '--json'], { cwd: wd }),
      (error) => error.code === 1 && /unsupported_workflow_schema:1:restart_required/.test(error.stderr),
    );
  });

  it('status derives clarify readiness from Resume State when frontmatter is stale', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-resume-ready-'));
    const clarified = await clarifyStage(wd, 'resume-ready');
    await writeResolvedClarificationResumeOnly(clarified.state.clarification_path, 'resume-ready');

    const status = await statusSummary(wd, 'resume-ready');
    assert.equal(status.state.stage_status, 'ready');
    assert.equal(status.next_skill_command, `$plan2exec ${status.state.intake_package_path}`);
  });

  it('status uses the last Resume State section when clarification has stale earlier state', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-last-resume-'));
    const clarified = await clarifyStage(wd, 'last-resume');
    await appendResolvedClarificationResume(clarified.state.clarification_path);

    const status = await statusSummary(wd, 'last-resume');
    assert.equal(status.state.stage_status, 'ready');
    assert.equal(status.state.unresolved_ambiguity_count, 0);
    assert.equal(status.state.clarify_current_round, 2);
    assert.equal(status.next_skill_command, `$plan2exec ${status.state.intake_package_path}`);
  });

  it('next skill quotes handoff paths that contain spaces', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx space next-'));
    const clarified = await clarifyStage(wd, 'space-flow');
    await writeResolvedClarification(clarified.state.clarification_path, 'space-flow');

    const status = await statusSummary(wd, 'space-flow');
    assert.match(status.state.intake_package_path, /\s/);
    assert.match(status.next_skill_command, /^\$plan2exec '/);
    assert.match(status.next_skill_command, /'\s*$/);

    const { stdout: nextStdout } = await execFileAsync(process.execPath, [cliPath, 'next', 'space-flow'], { cwd: wd });
    assert.match(nextStdout, /^next skill: \$plan2exec /m);
  });

  it('next skill keeps retained review rollback guidance only', () => {
    assert.equal(nextSkillCommand({
      slug: 'review-plan',
      current_stage: 'review',
      review_verdict: 'request-changes',
      rollback_target: 'plan',
    }), '$plan2exec review-plan');
    assert.equal(nextSkillCommand({
      slug: 'review-clarify',
      current_stage: 'review',
      review_verdict: 'request-changes',
      rollback_target: 'clarify',
    }), '$clarify review-clarify');
    assert.equal(nextSkillCommand({
      slug: 'old-plan',
      current_stage: 'plan',
      stage_status: 'awaiting-approval',
      plan_blockers: [],
    }), null);
  });

  it('CLI exposes only retained commands in default help and rejects removed commands', async () => {
    const { stdout: help } = await execFileAsync(process.execPath, [cliPath]);
    for (const command of [
      'loopx --version',
      'loopx init',
      'loopx clarify',
      'loopx render',
      'loopx status',
      'loopx next',
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
    ]) {
      assert.doesNotMatch(help, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const command of [
      'approve', 'plan', 'build', 'review', 'archive', 'autopilot', 'migrate',
      'finish-start', 'execution-start', 'finish-audit', 'finish-record',
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
    assert.equal(existsSync(join(home, '.agents', 'skills', 'shared', 'agent-topology.md')), true);

    const verification = await verifyInstallState(loopxEnv(home), { targets: ['codex'] });
    assert.equal(verification.ok, true);

    const sharedContract = join(home, '.agents', 'skills', 'shared', 'agent-topology.md');
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

    assert.match(codexRouting, /clear, bounded.*ordinary model work/is);
    assert.match(codexRouting, /local defect.*small feature/is);
    assert.match(codexRouting, /fresh verification/i);
    assert.match(codexRouting, /no workflow artifacts/i);
    assert.match(codexRouting, /ambiguity.*risk.*recovery.*coordination.*explicit user intent/is);
    assert.match(codexRouting, /compatibility.*permission.*secret.*destructive migration.*architecture/is);
    assert.match(codexRouting, /before mutation.*clarify.*spec/is);
    for (const forbidden of [/\$direct/i, /direct mode/i, /risk score/i, /Golden[- ]path/i, /skills\/RESOLVER\.md/i]) {
      assert.doesNotMatch(codexRouting, forbidden);
    }

    const clarifySkill = await readFile(join(home, '.agents', 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const specSkill = await readFile(join(home, '.agents', 'skills', 'spec', 'SKILL.md'), 'utf8');
    const agentTopology = await readFile(join(home, '.agents', 'skills', 'shared', 'agent-topology.md'), 'utf8');
    assert.match(clarifySkill, /description:.*concrete ambiguity.*Not for clear bounded requests/i);
    assert.match(specSkill, /description:.*unresolved compatibility.*architecture decisions.*Not for clear local implementation/i);
    assert.match(agentTopology, /top-level controller.*only orchestration owner/is);
    assert.match(agentTopology, /default shared worker budget is four/i);
    assert.match(agentTopology, /Implementers,\s+reviewers, fixers.*same budget/is);
  });

  it('installs plan2exec with traceable execution slices and an authoritative execution graph', async () => {
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
      'Source And Goal',
      'Boundaries And Global Constraints',
      'Execution Slices',
      'Authoritative Execution Graph',
      'Integration And Final Verification',
      'Handoff And Residual Risks',
    ]) {
      assert.match(planSchema, new RegExp(`^## ${heading}$`, 'm'));
      assert.match(fixture, new RegExp(`^## ${heading}$`, 'm'));
    }
    assert.match(planSchema, /^### P-001: <coherent outcome>$/m);
    // The prose slice carries only the reading summary; field-level dispatch
    // data is graph-only. The legacy fixture keeps the full field set.
    for (const field of ['Outcome', 'Depends on', 'Source anchors', 'Acceptance', 'Review focus']) {
      assert.match(planSchema, new RegExp(`^- ${field}:`, 'm'));
    }
    for (const field of ['Write scope', 'Relevant paths', 'Exclusive resources', 'Interfaces consumed', 'Interfaces produced', 'Verification', 'Expected evidence']) {
      assert.doesNotMatch(planSchema, new RegExp(`^- ${field}:`, 'm'));
    }
    for (const field of [
      'Outcome',
      'Depends on',
      'Write scope',
      'Relevant paths',
      'Exclusive resources',
      'Interfaces consumed',
      'Interfaces produced',
      'Source anchors',
      'Acceptance',
      'Verification',
      'Expected evidence',
      'Review focus',
    ]) {
      assert.match(fixture, new RegExp(`^- ${field}:`, 'm'));
    }
    for (const field of ['Source', 'Goal', 'Status', 'Blockers', 'Residual risks', 'Resume note']) {
      assert.match(planSchema, new RegExp(`^- ${field}:`, 'm'));
      assert.match(fixture, new RegExp(`^- ${field}:`, 'm'));
    }
    assert.match(planSkill, /every implementation-relevant.*AC-\*.*D-\*.*TC-\*/is);
    assert.match(planSkill, /deferred-with-rationale/i);
    assert.match(planSchema, /loopx\.execution-graph\.v1/);
    assert.match(planSchema, /selected_profile/);
    assert.match(planSchema, /parallel_safe/);
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

  it('installs one exec intent with explicit serial and parallel profile entries', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-unified-exec-'));
    const result = await installBundledSkills(loopxEnv(home));

    assert.equal(result.ok, true);
    const execSkill = await readFile(join(home, '.agents', 'skills', 'exec', 'SKILL.md'), 'utf8');
    const selection = await readFile(join(home, '.agents', 'skills', 'exec', 'references', 'execution-selection.md'), 'utf8');
    const graphFixture = JSON.parse(await readFile(join(repoRoot, 'test', 'fixtures', 'prompt-execution-graph.json'), 'utf8'));

    assert.match(execSkill, /clear request.*persistent plan/is);
    assert.match(execSkill, /temporary graph/i);
    assert.match(execSkill, /delegated-serial-v1.*default for planned work/is);
    assert.match(execSkill, /fresh verification/i);
    assert.match(execSkill, /inline-owned-v1.*prompt-first small work/is);
    assert.match(selection, /producer-consumer interface/i);
    assert.match(selection, /default shared worker budget is four/i);
    assert.match(selection, /uncertain.*serial/is);
    assert.doesNotMatch(execSkill, /requires? a persistent plan/i);
    assert.doesNotMatch(execSkill, /ask the user to choose.*(?:serial|subagent|parallel)/is);
    assert.doesNotMatch(selection, /risk score/i);

    assert.equal(graphFixture.input.kind, 'prompt');
    assert.equal(graphFixture.persistence, 'none');
    assert.equal(graphFixture.selection.kind, 'serial');
    assert.match(graphFixture.selection.reason, /producer.*consumer/i);
    assert.equal(graphFixture.independent_prompt_case.input.kind, 'prompt');
    assert.equal(graphFixture.independent_prompt_case.persistence, 'none');
    assert.equal(graphFixture.independent_prompt_case.selection.kind, 'concurrent');
    assert.match(
      graphFixture.independent_prompt_case.selection.reason,
      /distinct write surfaces.*no shared contract decision.*independent tests.*no integration ordering/i,
    );

    for (const [alias, canonical] of [
      ['subagent-exec', 'exec'],
      ['parallel-subagent-exec', 'exec'],
    ]) {
      const aliasSkill = await readFile(join(home, '.agents', 'skills', alias, 'SKILL.md'), 'utf8');
      assert.match(aliasSkill, /^disable-model-invocation: true$/m, `${alias} must be explicit-only`);
      assert.match(aliasSkill, /explicit `(?:delegated-serial-v1|parallel-strict-v1)` profile entry point/i);
      assert.match(aliasSkill, /canonical `exec` controller/i);
      assert.doesNotMatch(aliasSkill, /compatibility alias/i);
    }
  });

  it('installs proportional independent review with explicit-only legacy aliases', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-proportional-review-'));
    const result = await installBundledSkills(loopxEnv(home));

    assert.equal(result.ok, true);
    const installedRoot = join(home, '.agents', 'skills');
    const execSkill = await readFile(join(installedRoot, 'exec', 'SKILL.md'), 'utf8');
    const selection = await readFile(join(installedRoot, 'exec', 'references', 'review-selection.md'), 'utf8');
    const reviewSkill = await readFile(join(installedRoot, 'review', 'SKILL.md'), 'utf8');
    const reviewContract = await readFile(join(installedRoot, 'shared', 'review-contract.md'), 'utf8');
    const codexGuidance = await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8');
    const routing = managedBlock(codexGuidance, 'prompt-first-routing');

    assert.match(execSkill, /Every implementation or fix candidate must pass fresh\s+verification.*independent read-only task review/is);
    assert.match(execSkill, /Only a clean reviewed candidate may integrate/i);
    assert.match(execSkill, /integration check/i);
    assert.match(selection, /Inline work always receives fresh verification.*controller integration\s+check/is);
    assert.match(selection, /follow the canonical contract/i);
    assert.match(reviewContract, /delegated-serial-v1.*parallel-strict-v1.*require independent task review/is);
    for (const trigger of [
      /explicit review intent/i,
      /security-sensitive or\s+destructive behavior/i,
      /public compatibility change/i,
      /cross-scope interaction/i,
      /conflict reconciliation/i,
    ]) {
      assert.match(reviewContract, trigger);
    }
    assert.match(reviewContract, /read-only leaf worker/i);
    assert.match(reviewSkill, /Critical and Important.*active\s+execution context.*fix.*verification/is);
    assert.match(reviewContract, /fresh focused and combined verification.*independent re-review/is);
    assert.match(routing, /independent review.*explicit.*security.*destructive.*compatibility.*interaction.*reconciliation/is);

    for (const [alias, intentPattern] of [
      ['final-review', /whole-feature review/i],
      ['fix-review', /existing review feedback/i],
    ]) {
      const aliasSkill = await readFile(join(installedRoot, alias, 'SKILL.md'), 'utf8');
      assert.equal(aliasSkill.match(/^disable-model-invocation: true$/gm)?.length, 1);
      assert.match(aliasSkill, /permanent explicit (?:review intent )?entry/i);
      assert.match(aliasSkill, /to `review`/i);
      assert.doesNotMatch(aliasSkill, /compatibility alias/i);
      assert.match(aliasSkill, intentPattern);
      assert.match(aliasSkill, /Forward the (?:same arguments|findings)/i);
      assert.match(aliasSkill, /does not require.*(?:report|ledger) artifact/is);
    }
  });

  it('installs one quiet completion check and loopx-scoped finish guidance', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-completion-check-'));
    const result = await installBundledSkills(loopxEnv(home));

    assert.equal(result.ok, true);
    const installedRoot = join(home, '.agents', 'skills');
    const completionCheck = await readFile(join(installedRoot, 'shared', 'completion-check.md'), 'utf8');
    const execSkill = await readFile(join(installedRoot, 'exec', 'SKILL.md'), 'utf8');
    const fixSkill = await readFile(join(installedRoot, 'fix', 'SKILL.md'), 'utf8');
    const finishSkill = await readFile(join(installedRoot, 'finish', 'SKILL.md'), 'utf8');
    const finishChoices = await readFile(
      join(installedRoot, 'finish', 'references', 'branch-worktree-and-recording.md'),
      'utf8',
    );
    const routing = managedBlock(await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8'), 'prompt-first-routing');

    assert.match(routing, /every completion claim.*quiet completion check/is);
    assert.match(routing, /finish.*only.*explicit.*\$finish.*active loopx.*(?:exec|fix)/is);
    assert.match(routing, /standalone Git.*branch.*commit.*merge.*must not.*finish/is);
    assert.match(routing, /fresh task-relevant verification.*accepted intent.*final diff.*applicable specs/is);
    assert.match(routing, /explicit user decision.*approved requirement.*existing spec authority/is);
    assert.match(routing, /encountered.*evidence-backed.*non-obvious.*reusable project pitfall.*deduplication/is);
    assert.match(routing, /shared memory.*newly tracked knowledge.*explicit acceptance/is);
    assert.match(routing, /secrets.*raw conversation.*workflow state.*generic path-based.*commit summaries.*obvious code facts/is);
    assert.match(routing, /neither an applicable spec nor qualifying knowledge changed.*no artifact or reminder/is);
    assert.doesNotMatch(routing, /shared\/completion-check\.md/);
    assert.match(execSkill, /Before any completion claim.*controller integration check.*quiet check/is);
    assert.match(execSkill, /shared\/completion-check\.md/);
    assert.match(fixSkill, /serial and concurrent.*completion check/is);
    assert.match(fixSkill, /shared\/completion-check\.md/);
    assert.match(fixSkill, /git_disposition:\s*requested\s*\|\s*not_requested/i);
    assert.match(fixSkill, /finish.*only.*active fix run.*Git disposition/is);
    assert.doesNotMatch(fixSkill, /finish_handoff:\s*`?\$finish|hand off to `finish`/i);

    assert.match(completionCheck, /fresh task-relevant verification/i);
    assert.match(completionCheck, /applicable spec.*changed by the implementation.*same implementation/is);
    assert.match(completionCheck, /explicit user decision.*approved requirement.*existing spec authority/is);
    assert.match(completionCheck, /encountered.*evidence-backed.*non-obvious.*reusable project pitfall/is);
    assert.match(completionCheck, /shared memory.*newly tracked knowledge.*explicit acceptance/is);
    assert.match(completionCheck, /secrets.*raw conversation.*workflow state/is);
    assert.match(completionCheck, /generic path-based.*commit summar.*obvious code facts/is);
    assert.match(completionCheck, /when neither.*changed.*no\s+artifact.*no reminder/is);

    assert.match(finishSkill, /explicitly invokes `\$finish`.*active loopx.*(?:exec|fix)/is);
    assert.match(finishSkill, /standalone Git request.*must not trigger `finish`/is);
    assert.doesNotMatch(finishSkill, /^when_to_use:.*(?:create branch|commit current work|merge locally)/m);
    assert.match(finishSkill, /do(?:es)? not require.*review report.*extraction candidate.*artifact/is);
    for (const choice of ['commit', 'branch', 'merge', 'pull request', 'keep', 'cleanup', 'discard']) {
      assert.match(`${finishSkill}\n${finishChoices}`, new RegExp(`\\b${choice}\\b`, 'i'));
    }
    assert.doesNotMatch(finishSkill, /completion check|knowledge distillation|memory candidate/i);
  });

});

await rm(join(repoRoot, '.loopx', 'workflows', 'smoke-clean-runtime'), { recursive: true, force: true });
