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

  it('clarify creates a spec artifact and deep mode state', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-clarify-'));
    const result = await clarifyStage(wd, 'deep-flow', { profile: 'deep' });

    assert.equal(result.state.clarify_profile, 'deep');
    assert.equal(result.state.clarify_max_rounds, 25);
    assert.equal(existsSync(join(result.root, 'spec.md')), true);
    assert.equal(existsSync(result.state.spec_artifact_path), true);
  });

  it('status and next recommend plan-to-exec when clarify is handoff-ready', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-next-'));
    const clarified = await clarifyStage(wd, 'ready-flow');
    await writeResolvedSpec(clarified.root, 'ready-flow');

    const status = await statusSummary(wd, 'ready-flow');
    assert.equal(status.state.stage_status, 'ready');
    assert.equal(status.state.next_skill_command, '$plan-to-exec ready-flow');
    assert.equal(status.next_skill_command, '$plan-to-exec ready-flow');

    const payload = withNextSkill({ ok: true }, status.state);
    assert.deepEqual(payload, {
      ok: true,
      next_skill_command: '$plan-to-exec ready-flow',
      next_skill_hint: 'Next skill: $plan-to-exec ready-flow',
    });

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'next', 'ready-flow'], { cwd: wd });
    assert.match(stdout, /^next skill: \$plan-to-exec ready-flow$/m);
    assert.doesNotMatch(stdout, /next cli:/);
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
