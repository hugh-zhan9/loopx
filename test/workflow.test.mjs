import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { finishAuditStage, finishRecordStage, finishStartStage } from '../src/finish-runtime.mjs';
import { installBundledSkills, LOOPX_BUNDLED_SKILLS, verifyInstallState } from '../src/install-discovery.mjs';
import { nextSkillCommand, withNextSkill } from '../src/next-skill.mjs';
import { clarifyStage, initWorkspace, readState, resolveWorkflowRoot, resolveWorkspaceRoot, statusSummary } from '../src/workflow.mjs';

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

async function writeResolvedSpec(root, slug) {
  await writeFile(
    join(root, 'spec.md'),
    [
      '---',
      'schema_version: 1',
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
      'schema_version: 1',
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
      '- next_question: none',
    ].join('\n'),
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
    assert.match(statusStdout, new RegExp(`^intake: ${escapeRegExp(status.state.intake_package_path)}$`, 'm'));
    assert.match(statusStdout, new RegExp(`^requirements: ${escapeRegExp(status.state.requirements_path)}$`, 'm'));
    assert.match(statusStdout, new RegExp(`^test cases: ${escapeRegExp(status.state.test_cases_path)}$`, 'm'));

    const { stdout: statusJsonStdout } = await execFileAsync(process.execPath, [cliPath, 'status', 'ready-flow', '--json'], { cwd: wd });
    const statusJson = JSON.parse(statusJsonStdout);
    assert.equal(statusJson.state.intake_package_path, status.state.intake_package_path);
    assert.equal(statusJson.state.requirements_path, status.state.requirements_path);
    assert.equal(statusJson.state.test_cases_path, status.state.test_cases_path);
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
      schema_version: 1,
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
      schema_version: 1,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}/`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      status: 'in_progress',
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          plan_final_review: `.loopx/final-review/${featureSlug}-01-core.md`,
          ready_for_spec_review: true,
        },
        {
          path: `docs/loopx/plans/${featureSlug}/02-ui.md`,
          status: 'in_progress',
          plan_final_review: null,
          ready_for_spec_review: false,
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
      /finish_record_multi_plan_incomplete/,
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
      schema_version: 1,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}/`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      status: 'ready_for_finish',
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          plan_final_review: `.loopx/final-review/${featureSlug}-01-core.md`,
          ready_for_spec_review: true,
        },
        {
          path: `docs/loopx/plans/${featureSlug}/02-ui.md`,
          status: 'complete',
          plan_final_review: `.loopx/final-review/${featureSlug}-02-ui.md`,
          ready_for_spec_review: true,
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
