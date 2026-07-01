import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { executionStartStage, finishAuditStage, finishRecordStage, finishStartStage, resolveExecutionRangePath } from '../src/finish-runtime.mjs';
import { installBundledSkills, LOOPX_BUNDLED_SKILLS, verifyInstallState } from '../src/install-discovery.mjs';
import { nextSkillCommand, withNextSkill } from '../src/next-skill.mjs';
import { clarifyStage, initWorkspace, readState, resolveWorkflowRoot, resolveWorkspaceRoot, statusSummary } from '../src/workflow.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd());
const cliPath = resolve(repoRoot, 'src/cli.mjs');
const SCHEMA_VERSION_FIELD = ['schema', 'version'].join('_');
const SCHEMA_VERSION_ONE = Number.parseInt('1', 10);
const SCHEMA_VERSION_LINE = `${SCHEMA_VERSION_FIELD}: ${SCHEMA_VERSION_ONE}`;
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

async function writeResolvedClarification(path, slug) {
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
- next_question: none
`,
  );
}

async function initGitRepo(wd) {
  await execFileAsync('git', ['init'], { cwd: wd });
  await execFileAsync('git', ['config', 'user.email', 'loopx@example.com'], { cwd: wd });
  await execFileAsync('git', ['config', 'user.name', 'LoopX'], { cwd: wd });
  await writeFile(join(wd, 'README.md'), 'finish audit\n');
  await execFileAsync('git', ['add', 'README.md'], { cwd: wd });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: wd });
}

async function execGit(wd, args) {
  await execFileAsync('git', args, { cwd: wd });
}

async function gitOutput(wd, args) {
  const { stdout } = await execFileAsync('git', args, { cwd: wd });
  return stdout.trim();
}

async function markFinishAuditReviewed(audit) {
  const state = JSON.parse(await readFile(audit.statePath, 'utf8'));
  state.status = 'audited';
  state.audit.no_candidates_reason = 'No multi-plan extraction candidates were accepted for this test.';
  state.audit.extraction_candidates = [];
  await writeFile(audit.statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function writeMultiPlanState(wd, featureSlug, state) {
  const root = join(wd, '.loopx', 'multi-plan', featureSlug);
  await mkdir(root, { recursive: true });
  const path = join(root, 'state.json');
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
  return path;
}

describe('loopx retained workflow shell', () => {
  it('initializes workspace metadata and a clarify workflow', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-init-'));
    const result = await initWorkspace(wd, { slug: 'Demo Init' });

    assert.equal(result.workspaceRoot, resolveWorkspaceRoot(wd));
    assert.equal(result.config.product_contract, 'skill-first-helper');
    assert.deepEqual(result.config.default_flow, [
      'clarify',
      'plan-to-exec',
      'exec-or-subagent-exec',
      'final-review',
      'fix-review',
      'finish',
    ]);
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
    assert.equal(result.state.test_cases_path, join(result.state.intake_package_path, 'test-cases.md'));
    assert.equal(result.state.spec_artifact_path, result.state.requirements_path);
    assert.equal(existsSync(result.state.clarification_path), true);
    assert.equal(existsSync(result.state.requirements_path), true);
    assert.equal(existsSync(result.state.test_cases_path), true);

    const requirements = await readFile(result.state.requirements_path, 'utf8');
    const testCases = await readFile(result.state.test_cases_path, 'utf8');
    assert.match(requirements, /## Acceptance Criteria/);
    assert.match(requirements, /### AC-001/);
    assert.match(testCases, /## Coverage Summary/);
    assert.match(testCases, /### TC-001/);
    assert.match(testCases, /Source AC: AC-001/);
  });

  it('status exposes clarify intake package paths', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-status-intake-'));
    const clarified = await clarifyStage(wd, 'package-status');

    const status = await statusSummary(wd, 'package-status');
    assert.equal(status.intake_package_path, status.state.intake_package_path);
    assert.equal(status.requirements_path, status.state.requirements_path);
    assert.equal(status.test_cases_path, status.state.test_cases_path);
    assert.equal(status.spec_artifact_path, status.state.requirements_path);
    assert.equal(status.artifacts.intake_package_exists, true);
    assert.equal(status.artifacts.requirements_exists, true);
    assert.equal(status.artifacts.test_cases_exists, true);

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'clarify', 'package-status'], { cwd: wd });
    assert.match(stdout, /^intake: .*\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-package-status/m);
    assert.match(stdout, /^requirements: .*requirements\.md$/m);
    assert.match(stdout, /^test cases: .*test-cases\.md$/m);

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

  it('status and next recommend plan-to-exec when clarify is handoff-ready', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-next-'));
    const clarified = await clarifyStage(wd, 'ready-flow');
    await writeResolvedClarification(clarified.state.clarification_path, 'ready-flow');

    const status = await statusSummary(wd, 'ready-flow');
    const expectedPlanCommand = `$plan-to-exec ${status.state.intake_package_path}`;
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
    assert.match(nextStdout, new RegExp(`^next skill: \\$plan-to-exec ${escapeRegExp(status.state.intake_package_path)}$`, 'm'));
    assert.doesNotMatch(nextStdout, /next cli:/);

    const { stdout: statusStdout } = await execFileAsync(process.execPath, [cliPath, 'status', 'ready-flow'], { cwd: wd });
    const intakePackageName = status.state.intake_package_path.split(/[/\\]/).at(-1);
    const pathSeparatorPattern = '(?:/|\\\\)';
    const intakeDisplayPath = `(?:${escapeRegExp(status.state.intake_package_path)}|\\.loopx${pathSeparatorPattern}intake${pathSeparatorPattern}${escapeRegExp(intakePackageName)})`;
    assert.match(statusStdout, new RegExp(`^intake: ${intakeDisplayPath}$`, 'm'));
    assert.match(statusStdout, new RegExp(`^requirements: (?:${escapeRegExp(status.state.requirements_path)}|${intakeDisplayPath}${pathSeparatorPattern}requirements\\.md)$`, 'm'));
    assert.match(statusStdout, new RegExp(`^test cases: (?:${escapeRegExp(status.state.test_cases_path)}|${intakeDisplayPath}${pathSeparatorPattern}test-cases\\.md)$`, 'm'));

    const { stdout: statusJsonStdout } = await execFileAsync(process.execPath, [cliPath, 'status', 'ready-flow', '--json'], { cwd: wd });
    const statusJson = JSON.parse(statusJsonStdout);
    assert.equal(statusJson.state.intake_package_path, status.state.intake_package_path);
    assert.equal(statusJson.state.requirements_path, status.state.requirements_path);
    assert.equal(statusJson.state.test_cases_path, status.state.test_cases_path);
  });

  it('status derives clarify readiness from Resume State when frontmatter is stale', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-resume-ready-'));
    const clarified = await clarifyStage(wd, 'resume-ready');
    await writeResolvedClarificationResumeOnly(clarified.state.clarification_path, 'resume-ready');

    const status = await statusSummary(wd, 'resume-ready');
    assert.equal(status.state.stage_status, 'ready');
    assert.equal(status.next_skill_command, `$plan-to-exec ${status.state.intake_package_path}`);
  });

  it('status uses the last Resume State section when clarification has stale earlier state', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-last-resume-'));
    const clarified = await clarifyStage(wd, 'last-resume');
    await appendResolvedClarificationResume(clarified.state.clarification_path);

    const status = await statusSummary(wd, 'last-resume');
    assert.equal(status.state.stage_status, 'ready');
    assert.equal(status.state.unresolved_ambiguity_count, 0);
    assert.equal(status.state.clarify_current_round, 2);
    assert.equal(status.next_skill_command, `$plan-to-exec ${status.state.intake_package_path}`);
  });

  it('next skill quotes handoff paths that contain spaces', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx space next-'));
    const clarified = await clarifyStage(wd, 'space-flow');
    await writeResolvedClarification(clarified.state.clarification_path, 'space-flow');

    const status = await statusSummary(wd, 'space-flow');
    assert.match(status.state.intake_package_path, /\s/);
    assert.match(status.next_skill_command, /^\$plan-to-exec '/);
    assert.match(status.next_skill_command, /'\s*$/);

    const { stdout: nextStdout } = await execFileAsync(process.execPath, [cliPath, 'next', 'space-flow'], { cwd: wd });
    assert.match(nextStdout, /^next skill: \$plan-to-exec '/m);
  });

  it('legacy-ready status falls back to workflow spec readiness for legacy clarify state', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-legacy-ready-'));
    const clarified = await clarifyStage(wd, 'legacy-ready');
    const statePath = join(clarified.root, 'state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    await writeFile(statePath, `${JSON.stringify({
      ...state,
      clarification_path: null,
      intake_package_path: null,
      requirements_path: null,
      test_cases_path: null,
      spec_artifact_path: join(clarified.root, 'spec.md'),
    }, null, 2)}\n`);
    await writeResolvedSpec(clarified.root, 'legacy-ready');

    const status = await statusSummary(wd, 'legacy-ready');
    assert.equal(status.state.stage_status, 'ready');
    assert.equal(status.next_skill_command, `$plan-to-exec ${join(clarified.root, 'spec.md')}`);
  });

  it('legacy status keeps absent intake package children out of missing artifacts', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-legacy-'));
    await initWorkspace(wd);
    const root = resolveWorkflowRoot(wd, 'legacy-flow');
    await mkdir(root, { recursive: true });
    const specPath = join(root, 'spec.md');
    await writeFile(specPath, 'legacy clarify source\n');
    await writeFile(join(root, 'state.json'), `${JSON.stringify({
      [SCHEMA_VERSION_FIELD]: SCHEMA_VERSION_ONE,
      slug: 'legacy-flow',
      current_stage: 'clarify',
      stage_status: 'blocked',
      spec_artifact_path: specPath,
    }, null, 2)}\n`);

    const status = await statusSummary(wd, 'legacy-flow');
    assert.equal(status.artifacts.spec_artifact_exists, true);
    assert.equal(status.artifacts.intake_package_exists, undefined);
    assert.equal(status.artifacts.clarification_exists, undefined);
    assert.equal(status.artifacts.test_cases_exists, undefined);
    assert.equal(status.missing_artifacts.includes('intake_package'), false);
    assert.equal(status.missing_artifacts.includes('clarification'), false);
    assert.equal(status.missing_artifacts.includes('test_cases'), false);

    await rm(specPath);
    const missingSpecStatus = await statusSummary(wd, 'legacy-flow');
    assert.equal(missingSpecStatus.artifacts.spec_artifact_exists, false);
    assert.equal(missingSpecStatus.missing_artifacts.includes('spec_artifact'), true);
  });

  it('next skill keeps retained review rollback guidance only', () => {
    assert.equal(nextSkillCommand({
      slug: 'review-plan',
      current_stage: 'review',
      review_verdict: 'request-changes',
      rollback_target: 'plan',
    }), '$plan-to-exec review-plan');
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
      'loopx finish-start',
      'loopx finish-audit',
      'loopx finish-record',
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
    ]) {
      assert.doesNotMatch(help, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const command of ['approve', 'plan', 'build', 'review', 'archive', 'autopilot', 'migrate']) {
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

    const verification = await verifyInstallState(loopxEnv(home), { targets: ['codex'] });
    assert.equal(verification.ok, true);
  });

  it('finish audit lifecycle records a local decision', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-'));
    await initGitRepo(wd);

    const baseline = await finishStartStage(wd, 'finish-flow', { source: 'docs/plan.md' });
    assert.equal(baseline.state.slug, 'finish-flow');
    assert.equal(existsSync(baseline.path), true);

    const audit = await finishAuditStage(wd, 'finish-flow');
    assert.equal(audit.state.status, 'needs-agent-audit');

    const recorded = await finishRecordStage(wd, audit.auditId, {
      action: 'keep',
      status: 'pending',
      summary: 'Kept local branch.',
      url: null,
    });
    assert.equal(recorded.state.choice.action, 'keep');
    assert.equal(recorded.state.choice.status, 'pending');
  });

  it('creates and reuses execution range state', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-execution-start-'));
    await initGitRepo(wd);
    await writeFile(join(wd, 'plan.md'), '# Plan\n');
    await execFileAsync('git', ['add', 'plan.md'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'initial plan'], { cwd: wd });
    const { stdout: headStdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: wd });
    const { stdout: worktreeStdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: wd });
    const head = headStdout.trim();
    const worktree = worktreeStdout.trim();

    const first = await executionStartStage(wd, 'feature-a', {
      source: 'docs/loopx/plans/feature-a.md',
      design: 'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md',
      date: new Date('2026-06-30T00:00:00.000Z'),
    });
    const second = await executionStartStage(wd, 'feature-a', {
      source: 'docs/loopx/plans/feature-a.md',
      design: 'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md',
      date: new Date('2026-06-30T00:01:00.000Z'),
    });

    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(first.path, resolveExecutionRangePath(worktree, 'feature-a'));
    assert.equal(first.state.start_commit, head);
    assert.equal(first.state.start_commit_short, head.slice(0, 7));
    assert.equal(first.state.source_artifact, 'docs/loopx/plans/feature-a.md');
    assert.equal(first.state.design_artifact, 'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md');
    assert.equal(first.state.canonical_final_review_report, '.loopx/final-review/2026-06-30-feature-a.md');
    assert.deepEqual(second.state, first.state);
  });

  it('rejects conflicting execution range identity for the same slug', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-execution-start-conflict-'));
    await initGitRepo(wd);
    await writeFile(join(wd, 'plan.md'), '# Plan\n');
    await execFileAsync('git', ['add', 'plan.md'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'initial plan'], { cwd: wd });

    await executionStartStage(wd, 'feature-a', {
      source: 'docs/loopx/plans/feature-a.md',
      design: 'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md',
    });

    await assert.rejects(
      () => executionStartStage(wd, 'feature-a', {
        source: 'docs/loopx/plans/feature-b.md',
        design: 'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md',
      }),
      /execution_start_slug_conflict/,
    );

    await assert.rejects(
      () => executionStartStage(wd, 'feature-a', {
        source: 'docs/loopx/plans/feature-a.md',
        design: 'docs/loopx/design/2026-06-30-feature-b/需求设计文档.md',
      }),
      /execution_start_slug_conflict/,
    );
  });

  it('uses execution-start error namespace when git HEAD is missing', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-execution-start-no-head-'));
    await execGit(wd, ['init']);
    await execGit(wd, ['config', 'user.email', 'loopx@example.com']);
    await execGit(wd, ['config', 'user.name', 'LoopX']);

    await assert.rejects(
      () => executionStartStage(wd, 'feature-a', {
        source: 'docs/loopx/plans/feature-a.md',
      }),
      /execution_start_no_valid_head/,
    );
  });

  it('CLI exposes execution-start in help and prints human and JSON output', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-execution-start-cli-'));
    await initGitRepo(wd);
    await writeFile(join(wd, 'plan.md'), '# Plan\n');
    await execFileAsync('git', ['add', 'plan.md'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'initial plan'], { cwd: wd });

    const { stdout: help } = await execFileAsync(process.execPath, [cliPath], { cwd: wd });
    assert.match(help, /loopx execution-start \[slug\] \[--source <path>\] \[--design <path>\] \[--json\]/);

    const humanResult = await execFileAsync(process.execPath, [
      cliPath,
      'execution-start',
      'feature-cli',
      '--source',
      'docs/loopx/plans/feature-cli.md',
      '--design',
      'docs/loopx/design/2026-06-30-feature-cli/需求设计文档.md',
    ], { cwd: wd });
    assert.match(humanResult.stdout, /execution start: feature-cli/);
    assert.match(humanResult.stdout, /reused: no/);
    assert.match(humanResult.stdout, /source: docs\/loopx\/plans\/feature-cli\.md/);
    assert.match(humanResult.stdout, /design: docs\/loopx\/design\/2026-06-30-feature-cli\/需求设计文档\.md/);

    const jsonResult = await execFileAsync(process.execPath, [
      cliPath,
      'execution-start',
      'feature-cli',
      '--source',
      'docs/loopx/plans/feature-cli.md',
      '--design',
      'docs/loopx/design/2026-06-30-feature-cli/需求设计文档.md',
      '--json',
    ], { cwd: wd });
    const payload = JSON.parse(jsonResult.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'execution-start');
    assert.equal(payload.reused, true);
    assert.equal(payload.state.source_artifact, 'docs/loopx/plans/feature-cli.md');
    assert.equal(payload.state.design_artifact, 'docs/loopx/design/2026-06-30-feature-cli/需求设计文档.md');
  });

  it('finish report includes requirement start commit from execution range', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-execution-range-'));
    await initGitRepo(wd);
    await writeFile(join(wd, 'README.md'), '# initial\n');
    await execGit(wd, ['add', 'README.md']);
    await execGit(wd, ['commit', '-m', 'initial']);
    const start = await gitOutput(wd, ['rev-parse', 'HEAD']);

    await executionStartStage(wd, 'feature-a', { source: 'docs/loopx/plans/feature-a.md' });
    await finishStartStage(wd, 'feature-a', { source: 'docs/loopx/plans/feature-a.md' });
    await writeFile(join(wd, 'README.md'), '# changed\n');
    await execGit(wd, ['add', 'README.md']);
    await execGit(wd, ['commit', '-m', 'implement feature']);
    const finalHead = await gitOutput(wd, ['rev-parse', 'HEAD']);

    const audit = await finishAuditStage(wd, 'feature-a');
    const report = await readFile(audit.reportPath, 'utf8');
    assert.equal(audit.state.audit.change_window.requirement_start_commit, start);
    assert.equal(audit.state.audit.change_window.requirement_start_source, 'execution-range');
    assert.equal(audit.state.audit.change_window.final_head, finalHead.slice(0, 7));
    assert.match(report, new RegExp(`requirement_start_commit: ${escapeRegExp(start.slice(0, 7))}`));
    assert.match(report, new RegExp(`final_HEAD: ${escapeRegExp(finalHead.slice(0, 7))}`));
  });

  it('finish report includes requirement start fallback to finish baseline when execution range missing', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-baseline-fallback-'));
    await initGitRepo(wd);
    const baseline = await finishStartStage(wd, 'feature-b', { source: 'docs/loopx/plans/feature-b.md' });
    await writeFile(join(wd, 'README.md'), '# changed\n');
    await execGit(wd, ['add', 'README.md']);
    await execGit(wd, ['commit', '-m', 'baseline fallback']);

    const audit = await finishAuditStage(wd, 'feature-b');
    const report = await readFile(audit.reportPath, 'utf8');
    assert.equal(audit.state.audit.change_window.requirement_start_commit, baseline.state.head);
    assert.equal(audit.state.audit.change_window.requirement_start_source, 'baseline');
    assert.match(report, new RegExp(`requirement_start_commit: ${escapeRegExp(baseline.state.head_short)}`));
    assert.match(report, /requirement_start_source: baseline/);
  });

  it('untracked files do not block finish done', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-untracked-'));
    await initGitRepo(wd);
    await finishStartStage(wd, 'feature-c', { source: 'docs/loopx/plans/feature-c.md' });
    const audit = await finishAuditStage(wd, 'feature-c');
    await markFinishAuditReviewed(audit);

    await writeFile(join(wd, 'notes.txt'), 'local scratch\n');
    const recorded = await finishRecordStage(wd, audit.auditId, {
      action: 'keep',
      status: 'done',
      summary: 'Done with an untracked scratch file.',
      url: null,
    });
    const report = await readFile(recorded.reportPath, 'utf8');
    assert.equal(recorded.state.status, 'completed');
    assert.deepEqual(recorded.state.audit.change_window.tracked_status, []);
    assert.deepEqual(recorded.state.audit.change_window.untracked_status, ['?? notes.txt']);
    assert.match(report, /### Tracked Status[\s\S]*- none/);
    assert.match(report, /### Untracked Status[\s\S]*- \?\? notes\.txt/);
  });

  it('untracked coverage still blocks finish done when tracked files are dirty', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-tracked-dirty-'));
    await initGitRepo(wd);
    await finishStartStage(wd, 'feature-d', { source: 'docs/loopx/plans/feature-d.md' });
    const audit = await finishAuditStage(wd, 'feature-d');
    await markFinishAuditReviewed(audit);

    await writeFile(join(wd, 'README.md'), 'tracked dirty\n');
    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Should fail with tracked changes.',
        url: null,
      }),
      /finish_record_tracked_dirty/,
    );
  });

  it('finish record by audit path refreshes status from the audited repo, not caller cwd', async () => {
    const auditedRepo = await mkdtemp(join(tmpdir(), 'loopx-finish-audit-path-target-'));
    await initGitRepo(auditedRepo);
    await finishStartStage(auditedRepo, 'feature-e', { source: 'docs/loopx/plans/feature-e.md' });
    const audit = await finishAuditStage(auditedRepo, 'feature-e');
    await markFinishAuditReviewed(audit);

    const callerRepo = await mkdtemp(join(tmpdir(), 'loopx-finish-audit-path-caller-'));
    await initGitRepo(callerRepo);

    await writeFile(join(auditedRepo, 'README.md'), 'tracked dirty in audited repo\n');
    const expectedFinalHead = await gitOutput(auditedRepo, ['rev-parse', '--short', 'HEAD']);

    const pendingRecord = await finishRecordStage(callerRepo, audit.root, {
      action: 'keep',
      status: 'pending',
      summary: 'Refresh evidence from the audited repo.',
      url: null,
    });
    assert.equal(pendingRecord.state.audit.change_window.final_head, expectedFinalHead);
    assert.deepEqual(pendingRecord.state.audit.change_window.tracked_status, ['M README.md']);
    assert.deepEqual(pendingRecord.state.audit.change_window.untracked_status, []);

    await assert.rejects(
      () => finishRecordStage(callerRepo, audit.root, {
        action: 'keep',
        status: 'done',
        summary: 'Should fail because the audited repo is dirty.',
        url: null,
      }),
      /finish_record_tracked_dirty/,
    );
  });

  it('blocks finish done when commits land after finish audit', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-stale-audit-'));
    await initGitRepo(wd);
    await finishStartStage(wd, 'feature-f', { source: 'docs/loopx/plans/feature-f.md' });
    const audit = await finishAuditStage(wd, 'feature-f');
    await markFinishAuditReviewed(audit);

    await writeFile(join(wd, 'README.md'), 'committed after audit\n');
    await execGit(wd, ['add', 'README.md']);
    await execGit(wd, ['commit', '-m', 'post-audit change']);

    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Should fail because committed evidence is stale.',
        url: null,
      }),
      /finish_record_stale_audit_head/,
    );
  });

  it('blocks finish done when matching multi-plan state is incomplete', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-block-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/01-core.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    await writeMultiPlanState(wd, featureSlug, {
      schema_version: 2,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      status: 'in_progress',
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          ready_for_spec_review: true,
          plan_review: {
            status: 'passed',
            reviewed_at: '2026-06-30T00:00:00.000Z',
            summary: 'No blocking issues',
          },
        },
        {
          path: `docs/loopx/plans/${featureSlug}/02-ui.md`,
          status: 'complete',
          ready_for_spec_review: true,
        },
      ],
      spec_final_review: null,
    });

    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Should be blocked.',
      }),
      /finish_record_multi_plan_incomplete:.*plan_review.status must be passed/,
    );
  });

  it('blocks finish done when multi-plan v2 child review timestamp is missing', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-review-time-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/01-core.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    await writeMultiPlanState(wd, featureSlug, {
      schema_version: 2,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          ready_for_spec_review: true,
          plan_review: {
            status: 'passed',
            summary: 'No blocking issues',
          },
        },
      ],
      spec_final_review: {
        path: `.loopx/final-review/${featureSlug}.md`,
        ready_for_finish: 'Yes',
      },
    });

    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Should be blocked.',
      }),
      /finish_record_multi_plan_incomplete:.*plan_review.reviewed_at is required/,
    );
  });

  it('blocks finish done when matching multi-plan state is missing', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-missing-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/01-core.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Should be blocked.',
      }),
      /finish_record_multi_plan_state_missing:\.loopx\/multi-plan\/2026-06-29-feature\/state\.json/,
    );
  });

  it('blocks finish done when matching multi-plan state is invalid JSON', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-invalid-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/01-core.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    const root = join(wd, '.loopx', 'multi-plan', featureSlug);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'state.json'), '{invalid json\n');

    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Should be blocked.',
      }),
      /finish_record_multi_plan_state_invalid:\.loopx\/multi-plan\/2026-06-29-feature\/state\.json/,
    );
  });

  it('allows finish done when matching multi-plan state has clean spec review', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-pass-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/00-overview.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    await writeMultiPlanState(wd, featureSlug, {
      schema_version: 2,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      status: 'ready_for_finish',
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          ready_for_spec_review: true,
          plan_review: {
            status: 'passed',
            reviewed_at: '2026-06-30T00:00:00.000Z',
            summary: 'No blocking issues',
          },
        },
        {
          path: `docs/loopx/plans/${featureSlug}/02-ui.md`,
          status: 'complete',
          ready_for_spec_review: true,
          plan_review: {
            status: 'passed',
            reviewed_at: '2026-06-30T01:00:00.000Z',
            summary: 'No blocking issues',
          },
        },
      ],
      spec_final_review: {
        path: `.loopx/final-review/${featureSlug}.md`,
        ready_for_finish: 'Yes',
      },
    });

    const recorded = await finishRecordStage(wd, audit.auditId, {
      action: 'keep',
      status: 'done',
      summary: 'Multi-plan package complete.',
    });
    assert.equal(recorded.state.status, 'completed');
    assert.equal(recorded.state.choice.status, 'done');
  });

  it('blocks finish done when matching multi-plan state uses legacy schema-version-one', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-legacy-block-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/00-overview.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    await writeMultiPlanState(wd, featureSlug, {
      [SCHEMA_VERSION_FIELD]: SCHEMA_VERSION_ONE,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          ready_for_spec_review: true,
        },
      ],
      spec_final_review: {
        path: `.loopx/final-review/${featureSlug}.md`,
        ready_for_finish: 'Yes',
      },
    });

    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Legacy multi-plan package should be blocked.',
      }),
      new RegExp(`finish_record_multi_plan_incomplete:.*${escapeRegExp(SCHEMA_VERSION_FIELD)} must be 2`),
    );
  });

  it('blocks finish done when matching multi-plan state records forbidden child commit metadata', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-child-commit-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/01-core.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    await writeMultiPlanState(wd, featureSlug, {
      schema_version: 2,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          ready_for_spec_review: true,
          plan_review: {
            status: 'passed',
            reviewed_at: '2026-06-30T00:00:00.000Z',
            summary: 'No blocking issues',
          },
          start_commit: 'abc1234',
        },
      ],
      spec_final_review: {
        path: `.loopx/final-review/${featureSlug}.md`,
        ready_for_finish: 'Yes',
      },
    });

    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Should be blocked.',
      }),
      /finish_record_multi_plan_incomplete:.*start_commit must not be recorded on child plan state/,
    );
  });

  it('keeps single-plan finish done unchanged when no multi-plan source matches', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-single-plan-done-'));
    await initGitRepo(wd);

    await finishStartStage(wd, 'single-plan', { source: 'docs/loopx/plans/2026-06-29-single-plan.md' });
    const audit = await finishAuditStage(wd, 'single-plan');
    await markFinishAuditReviewed(audit);

    const recorded = await finishRecordStage(wd, audit.auditId, {
      action: 'keep',
      status: 'done',
      summary: 'Single plan complete.',
    });
    assert.equal(recorded.state.status, 'completed');
    assert.equal(recorded.state.choice.summary, 'Single plan complete.');
  });
});

await rm(join(repoRoot, '.loopx', 'workflows', 'smoke-clean-runtime'), { recursive: true, force: true });
