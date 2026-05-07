import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { installBundledSkills, verifyInstallState } from '../src/install-discovery.mjs';
import { createScriptedAutopilotAdapter } from '../src/autopilot-runtime.mjs';
import { createScriptedBuildAdapter } from '../src/build-runtime.mjs';
import { withNextSkill } from '../src/next-skill.mjs';
import { createScriptedPlanAdapter } from '../src/plan-runtime.mjs';
import { createScriptedReviewAdapter } from '../src/review-runtime.mjs';
import { doctorRuntime, migrateLegacyRuntime, resolveLegacyRoot, resolveLoopxRoot } from '../src/runtime-maintenance.mjs';
import {
  approveStage,
  autopilotStage,
  buildStage,
  clarifyStage,
  initWorkspace,
  planStage,
  readState,
  resolveWorkflowRoot,
  resolveWorkspaceRoot,
  reviewStage,
  statusSummary,
} from '../src/workflow.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd());
const cliPath = resolve(repoRoot, 'src/cli.mjs');
const installScript = resolve(repoRoot, 'scripts/install-skills.mjs');

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return {};
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return {};
  }
  return Object.fromEntries(
    text
      .slice(4, end)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(':');
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        if (rawValue === 'null') return [key, null];
        if (rawValue.startsWith('[') || rawValue.startsWith('{')) return [key, JSON.parse(rawValue)];
        return [key, rawValue];
      }),
  );
}

async function writeResolvedSpec(root, slug, overrides = {}) {
  const meta = {
    current_round: 3,
    ambiguity_score: 0.1,
    non_goals_resolved: true,
    decision_boundaries_resolved: true,
    pressure_pass_complete: true,
    unresolved_ambiguity_count: 0,
    ...overrides,
  };
  await writeFile(
    join(root, 'spec.md'),
    [
      '---',
      'schema_version: 1',
      `workflow_id: ${slug}`,
      'stage: clarify',
      'approval_status: requested',
      `current_round: ${meta.current_round}`,
      `ambiguity_score: ${meta.ambiguity_score}`,
      `non_goals_resolved: ${meta.non_goals_resolved}`,
      `decision_boundaries_resolved: ${meta.decision_boundaries_resolved}`,
      `pressure_pass_complete: ${meta.pressure_pass_complete}`,
      `unresolved_ambiguity_count: ${meta.unresolved_ambiguity_count}`,
      '---',
      '',
      `# loopx Spec: ${slug}`,
      '',
      '## Ambiguity List',
      '',
      '- A-1 | resolved | Requirement scope is implementation-ready',
      '',
      '## Clarified Answers',
      '',
      '- loopx should continue to the next stage.',
      '',
      '## In Scope',
      '',
      '- Run the bounded loopx flow.',
      '',
      '## Non-Goals',
      '',
      '- Reintroduce team.',
      '',
      '## Decision Boundaries',
      '',
      '- Human approval is required before stage promotion.',
      '',
      '## Execution Inputs',
      '',
      '- workflow slug: CLI argument provided by the operator',
      '- source spec path: resolved from the approved clarify artifact',
      '',
      '## Success Criteria',
      '',
      '- Plan stage is unblocked.',
      '',
    ].join('\n'),
  );
}

async function writePassingExecutionRecord(root, slug, { actorId = 'builder-1' } = {}) {
  await writeFile(
    join(root, 'execution-record.md'),
    [
      '---',
      'schema_version: 1',
      `workflow_id: ${slug}`,
      `run_id: ${slug}-build-run-1`,
      'stage: build',
      `actor_id: ${actorId}`,
      'actor_role: build',
      `plan_digest: plan@${slug}`,
      'started_at: 2026-04-29T11:00:00.000Z',
      'completed_at: 2026-04-29T11:05:00.000Z',
      'checkpoint_count: 2',
      'evidence_manifest: [{"id":"test-1","kind":"test","summary":"unit tests passed","ref":"node --test test/*.test.mjs"}]',
      '---',
      '',
      `# loopx Execution Record: ${slug}`,
      '',
      '## Changes',
      '',
      '- Implemented the approved workflow behavior.',
      '',
      '## Checkpoint Log',
      '',
      '- checkpoint 1: generated artifacts',
      '- checkpoint 2: ran verification',
      '',
      '## Execution Evidence',
      '',
      '- `node --test test/*.test.mjs`',
      '',
      '## Verification Evidence',
      '',
      '- PASS: contract tests',
      '- PASS: status smoke check',
      '',
      '## Limitations',
      '',
      '- none',
    ].join('\n'),
  );
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

describe('loopx skill-first workflow contract', () => {
  it('postinstall bootstrap creates discoverable loopx skills with local registry rows', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-install-home-'));
    const env = loopxEnv(home);

    const before = await verifyInstallState(env);
    assert.equal(before.ok, false);

    await execFileAsync(process.execPath, [installScript], { cwd: repoRoot, env });
    const after = await verifyInstallState(env);

    assert.equal(after.ok, true);
    for (const [skillName, info] of Object.entries(after.inspection.skills)) {
      assert.equal(info.installedDirExists, true, skillName);
      assert.equal(info.registryRowExists, true, skillName);
      assert.equal(info.registryRow.source, 'loopx');
      assert.equal(info.registryRow.sourceType, 'local');
      assert.equal(info.registryRow.installationIdentity, 'loopx');
      assert.equal(info.registryRow.distributionChannel, 'npm');
      assert.equal(info.registryRow.skillPath, `skills/${skillName}/SKILL.md`);
      assert.equal(Array.isArray(info.registryRow.provenance), true);
      assert.equal(info.registryRow.provenance.length, 1);
      assert.equal(info.registryRow.provenance[0].distributionChannel, 'npm');
      assert.equal(info.registryRow.provenance[0].sourceUrl, repoRoot);
    }
  });

  it('npm install followed by plugin install converges on one loopx identity with merged provenance', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-dual-install-home-'));
    const env = loopxEnv(home);
    const pluginInstallScript = resolve(repoRoot, 'plugins/loopx/scripts/plugin-install.mjs');
    const pluginRoot = resolve(repoRoot, 'plugins/loopx');

    await execFileAsync(process.execPath, [installScript], { cwd: repoRoot, env });
    await execFileAsync(process.execPath, [pluginInstallScript], { cwd: repoRoot, env });

    const after = await verifyInstallState(env);
    assert.equal(after.ok, true);
    for (const [skillName, info] of Object.entries(after.inspection.skills)) {
      assert.equal(info.registryRow.installationIdentity, 'loopx', skillName);
      assert.equal(Array.isArray(info.registryRow.provenance), true, skillName);
      assert.equal(info.registryRow.provenance.length, 2, skillName);
      assert.equal(
        info.registryRow.provenance.some((entry) => entry.distributionChannel === 'npm' && entry.sourceUrl === repoRoot),
        true,
        `${skillName}-npm-provenance`,
      );
      assert.equal(
        info.registryRow.provenance.some((entry) => entry.distributionChannel === 'plugin' && entry.sourceUrl === pluginRoot),
        true,
        `${skillName}-plugin-provenance`,
      );
    }
  });

  it('postinstall fails loudly when a foreign same-name skill blocks loopx ownership', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-postinstall-conflict-'));
    const env = loopxEnv(home);
    const foreignSkillDir = join(home, '.agents', 'skills', 'clarify');
    const lockPath = join(home, '.agents', '.skill-lock.json');

    await mkdir(foreignSkillDir, { recursive: true });
    await writeFile(join(foreignSkillDir, 'FOREIGN.txt'), 'foreign skill\n');
    await writeFile(lockPath, `${JSON.stringify({
      version: 3,
      skills: {
        'clarify': {
          source: 'ForeignVendor',
          sourceType: 'github',
          sourceUrl: 'https://example.com/foreign.git',
          skillPath: 'skills/clarify/SKILL.md',
          installedPath: foreignSkillDir,
          installMethod: 'copy',
          installedAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:00.000Z',
          skillFolderHash: 'foreign-hash',
        },
      },
    }, null, 2)}\n`);

    let failed = false;
    try {
      await execFileAsync(process.execPath, [installScript], { cwd: repoRoot, env });
    } catch (error) {
      failed = true;
      assert.match(String(error.stderr || error.stdout || error), /foreign_or_unowned_target/);
    }
    assert.equal(failed, true);
  });

  it('repair-install does not overwrite foreign same-name skill ownership', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-foreign-home-'));
    const env = loopxEnv(home);
    const foreignSkillDir = join(home, '.agents', 'skills', 'clarify');
    const lockPath = join(home, '.agents', '.skill-lock.json');

    await mkdir(foreignSkillDir, { recursive: true });
    await writeFile(join(foreignSkillDir, 'FOREIGN.txt'), 'foreign skill\n');
    await writeFile(lockPath, `${JSON.stringify({
      version: 3,
      skills: {
        'clarify': {
          source: 'ForeignVendor',
          sourceType: 'github',
          sourceUrl: 'https://example.com/foreign.git',
          skillPath: 'skills/clarify/SKILL.md',
          installedPath: foreignSkillDir,
          installMethod: 'copy',
          installedAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:00.000Z',
          skillFolderHash: 'foreign-hash',
        },
      },
    }, null, 2)}\n`);

    let failed = false;
    try {
      await execFileAsync(process.execPath, [cliPath, 'repair-install'], { cwd: repoRoot, env });
    } catch (error) {
      failed = true;
      const payload = JSON.parse(String(error.stdout || error.stderr));
      assert.equal(payload.ok, false);
      assert.equal(payload.conflicts.length, 1);
      assert.equal(payload.conflicts[0].reason, 'foreign_or_unowned_target');
    }
    assert.equal(failed, true);

    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    assert.equal(lock.skills['clarify'].source, 'ForeignVendor');
    assert.equal(existsSync(join(foreignSkillDir, 'FOREIGN.txt')), true);
  });

  it('repair-install repairs stale loopx-owned installedPath entries', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-stale-home-'));
    const env = loopxEnv(home);
    const staleDir = join(home, '.agents', 'skills-stale', 'clarify');
    const canonicalDir = join(home, '.agents', 'skills', 'clarify');
    const lockPath = join(home, '.agents', '.skill-lock.json');

    await mkdir(staleDir, { recursive: true });
    await writeFile(join(staleDir, 'STALE.txt'), 'stale skill\n');
    await writeFile(lockPath, `${JSON.stringify({
      version: 3,
      skills: {
        'clarify': {
          source: 'loopx',
          sourceType: 'local',
          sourceUrl: repoRoot,
          skillPath: 'skills/clarify/SKILL.md',
          installedPath: staleDir,
          installMethod: 'copy',
          installedAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:00.000Z',
          skillFolderHash: 'stale-hash',
        },
      },
    }, null, 2)}\n`);

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'repair-install'], { cwd: repoRoot, env });
    const payload = JSON.parse(stdout);
    assert.equal(payload.ok, true);
    assert.equal(existsSync(canonicalDir), true);
    assert.equal(existsSync(join(staleDir, 'STALE.txt')), false);

    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    assert.equal(lock.skills['clarify'].installedPath, canonicalDir);
    assert.equal(lock.skills['clarify'].source, 'loopx');
  });

  it('repair-install rejects stale loopx-owned rows when the canonical target is occupied by foreign content', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-stale-foreign-canonical-'));
    const env = loopxEnv(home);
    const staleDir = join(home, '.agents', 'skills-stale', 'clarify');
    const canonicalDir = join(home, '.agents', 'skills', 'clarify');
    const lockPath = join(home, '.agents', '.skill-lock.json');

    await mkdir(staleDir, { recursive: true });
    await mkdir(canonicalDir, { recursive: true });
    await writeFile(join(staleDir, 'STALE.txt'), 'stale skill\n');
    await writeFile(join(canonicalDir, 'FOREIGN.txt'), 'foreign canonical\n');
    await writeFile(lockPath, `${JSON.stringify({
      version: 3,
      skills: {
        'clarify': {
          source: 'loopx',
          sourceType: 'local',
          sourceUrl: repoRoot,
          skillPath: 'skills/clarify/SKILL.md',
          installedPath: staleDir,
          installMethod: 'copy',
          installedAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:00.000Z',
          skillFolderHash: 'stale-hash',
        },
      },
    }, null, 2)}\n`);

    let failed = false;
    try {
      await execFileAsync(process.execPath, [cliPath, 'repair-install'], { cwd: repoRoot, env });
    } catch (error) {
      failed = true;
      const payload = JSON.parse(String(error.stdout || error.stderr));
      assert.equal(payload.ok, false);
      assert.equal(payload.conflicts.length, 1);
      assert.equal(payload.conflicts[0].reason, 'canonical_target_occupied');
    }
    assert.equal(failed, true);
    assert.equal(existsSync(join(canonicalDir, 'FOREIGN.txt')), true);
    assert.equal(existsSync(join(staleDir, 'STALE.txt')), true);

    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    assert.equal(lock.skills['clarify'].installedPath, staleDir);
  });

  it('initializes a loopx workspace and requires approval before planning', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-init-'));
    const result = await initWorkspace(wd, { slug: 'demo-init' });
    const workspaceRoot = resolveWorkspaceRoot(wd);
    const workflowRoot = resolveWorkflowRoot(wd, 'demo-init');

    assert.equal(result.workspaceRoot, workspaceRoot);
    assert.equal(workspaceRoot, resolve(wd, '.loopx'));
    assert.equal(existsSync(join(workflowRoot, 'spec.md')), true);
    assert.equal(existsSync(join(workspaceRoot, 'context')), true);

    const state = await readState(wd, 'demo-init');
    assert.equal(state.current_stage, 'clarify');
    assert.equal(state.unresolved_ambiguity_count, 1);
    assert.equal(state.clarify_profile, 'standard');
    assert.equal(state.clarify_target_ambiguity_threshold, 0.2);
    assert.equal(state.clarify_max_rounds, 15);
    assert.equal(state.clarify_current_round, 0);
    assert.equal(state.clarify_ambiguity_score, 1);
    assert.equal(state.clarify_non_goals_resolved, false);
    assert.equal(state.clarify_decision_boundaries_resolved, false);
    assert.equal(state.clarify_pressure_pass_complete, false);
    assert.match(state.spec_artifact_path, /\.loopx\/specs\/clarify-demo-init-\d{8}T\d{6}Z\.md$/);
    assert.equal(existsSync(state.spec_artifact_path), true);

    await assert.rejects(
      () => approveStage(wd, 'demo-init', { from: 'clarify', to: 'plan' }),
      /clarify_readiness_blocked:.*unresolved_ambiguity/,
    );
    const blocked = await readState(wd, 'demo-init');
    assert.equal(blocked.pending_user_decision, 'clarify->plan');
  });

  it('runs the clarify -> plan -> build -> review flow without team', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-flow-'));
    const clarified = await clarifyStage(wd, 'flow');
    await writeResolvedSpec(clarified.root, 'flow');
    const approvedClarify = await approveStage(wd, 'flow', { from: 'clarify', to: 'plan' });
    assert.equal(approvedClarify.state.clarify_current_round, 3);
    assert.equal(approvedClarify.state.clarify_ambiguity_score, 0.1);
    assert.equal(approvedClarify.state.clarify_non_goals_resolved, true);
    assert.equal(approvedClarify.state.clarify_decision_boundaries_resolved, true);
    assert.equal(approvedClarify.state.clarify_pressure_pass_complete, true);
    const planned = await planStage(wd, 'flow', {
      adapter: createScriptedPlanAdapter(),
    });
    assert.equal(existsSync(join(planned.root, 'development-plan.md')), true);
    assert.match(planned.state.spec_artifact_path, /\.loopx\/specs\/clarify-flow-\d{8}T\d{6}Z\.md$/);
    assert.equal(existsSync(planned.state.spec_artifact_path), true);
    assert.equal(planned.state.plan_artifact_path, join(resolveWorkspaceRoot(wd), 'plans', 'prd-flow.md'));
    assert.equal(planned.state.test_spec_artifact_path, join(resolveWorkspaceRoot(wd), 'plans', 'test-spec-flow.md'));
    assert.equal(existsSync(planned.state.plan_artifact_path), true);
    assert.equal(existsSync(planned.state.test_spec_artifact_path), true);
    assert.equal(planned.state.plan_current_iteration, 1);
    assert.equal(planned.state.plan_consensus_mode, true);
    assert.equal(planned.state.plan_architect_review_status, 'complete');
    assert.equal(planned.state.plan_critic_verdict, 'approve');
    assert.equal(planned.state.plan_docs_status, 'complete');
    assert.match(await readFile(join(planned.root, 'architecture.md'), 'utf8'), /架构文档/);
    assert.match(await readFile(join(planned.root, 'development-plan.md'), 'utf8'), /开发计划/);
    assert.match(await readFile(join(planned.root, 'test-plan.md'), 'utf8'), /测试计划/);

    await approveStage(wd, 'flow', { from: 'plan', to: 'build' });
    const built = await buildStage(wd, 'flow', {
      adapter: createScriptedBuildAdapter(),
    });
    assert.equal(built.state.build_current_iteration, 1);
    assert.equal(built.state.build_parallel_mode, true);
    assert.equal(built.state.build_architect_verification_status, 'approve');
    assert.equal(built.state.build_deslop_status, 'complete');
    assert.equal(built.state.build_regression_status, 'complete');
    assert.equal(built.state.execution_record_status, 'complete');
    assert.equal(built.state.pending_user_decision, 'build->review');
    await approveStage(wd, 'flow', { from: 'build', to: 'review' });

    const review = await reviewStage(wd, 'flow', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter({
        changedFiles: ['src/workflow.mjs'],
        codeReview: {
          status: 'complete',
          verdict: 'approve',
          summary: '脚本化 code review 未发现阻断问题。',
          findings: [],
        },
      }),
    });
    assert.equal(review.verdict, 'APPROVE');
    assert.match(review.reviewMessageZh, /Review 结果：flow 通过。/);
    assert.match(review.reviewMessageZh, /下一步：批准 review -> done 后完成工作流。/);
    const reportText = await readFile(join(review.root, 'review-report.md'), 'utf8');
    const report = parseFrontmatter(reportText);
    assert.equal(report.reviewed_run_id, 'flow-build-run-1');
    assert.equal(Array.isArray(report.input_manifest), true);
    assert.equal(existsSync(join(review.root, 'review-support', 'code-review.json')), true);
    assert.match(reportText, /# loopx Review 结果：flow/);
    assert.match(reportText, /## 结论/);
    assert.match(reportText, /通过（APPROVE）/);
    assert.match(reportText, /## 代码审查/);
    assert.match(reportText, /脚本化 code review 未发现阻断问题。/);
    assert.match(reportText, /结构化证据与来源独立性检查均已通过。/);

    await approveStage(wd, 'flow', { from: 'review', to: 'done' });
    const done = await reviewStage(wd, 'flow', { reviewer: 'qa-1' });
    assert.equal(done.state.current_stage, 'done');
  });

  it('review fails when code review finds blocking issues', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-review-code-'));
    const clarified = await clarifyStage(wd, 'review-code');
    await writeResolvedSpec(clarified.root, 'review-code');
    await approveStage(wd, 'review-code', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'review-code', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'review-code', { from: 'plan', to: 'build' });
    await buildStage(wd, 'review-code', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'review-code', { from: 'build', to: 'review' });

    const review = await reviewStage(wd, 'review-code', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter({
        changedFiles: ['src/workflow.mjs'],
        codeReview: {
          status: 'complete',
          verdict: 'request-changes',
          summary: '发现状态流转回归风险。',
          findings: [{
            severity: 'high',
            file: 'src/workflow.mjs',
            line: 1430,
            message: 'review 通过前可能错误进入 done。',
          }],
        },
      }),
    });

    assert.equal(review.verdict, 'REQUEST CHANGES');
    assert.equal(review.rollbackTarget, 'plan');
    assert.match(review.reviewMessageZh, /要求修改/);
    assert.match(review.reviewMessageZh, /代码审查发现阻断问题/);
    const reportText = await readFile(join(review.root, 'review-report.md'), 'utf8');
    const report = parseFrontmatter(reportText);
    assert.equal(report.verdict, 'request-changes');
    assert.equal(report.code_review.verdict, 'request-changes');
    assert.equal(existsSync(join(review.root, 'review-support', 'code-review.json')), true);
    assert.match(reportText, /## 代码审查/);
    assert.match(reportText, /src\/workflow\.mjs:1430/);
    assert.match(reportText, /review 通过前可能错误进入 done。/);
  });

  it('supports deep clarify mode with stricter threshold and larger max rounds', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-clarify-deep-'));
    const result = await clarifyStage(wd, 'deep-flow', { profile: 'deep' });
    const state = await readState(wd, 'deep-flow');
    const spec = await readFile(join(result.root, 'spec.md'), 'utf8');

    assert.equal(state.clarify_profile, 'deep');
    assert.equal(state.clarify_target_ambiguity_threshold, 0.1);
    assert.equal(state.clarify_max_rounds, 25);
    assert.match(spec, /profile: deep/);
    assert.match(spec, /target_ambiguity_threshold: 0.1/);
    assert.match(spec, /max_rounds: 25/);
  });

  it('blocks clarify promotion until runtime readiness gates are resolved', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-clarify-gates-'));
    const clarified = await clarifyStage(wd, 'gated-flow');
    await writeResolvedSpec(clarified.root, 'gated-flow', {
      ambiguity_score: 0.4,
      non_goals_resolved: false,
      decision_boundaries_resolved: false,
      pressure_pass_complete: false,
    });

    await assert.rejects(
      () => approveStage(wd, 'gated-flow', { from: 'clarify', to: 'plan' }),
      /clarify_readiness_blocked:.*clarify_ambiguity_score_above_threshold.*clarify_non_goals_unresolved.*clarify_decision_boundaries_unresolved.*clarify_pressure_pass_incomplete/,
    );

    const state = await readState(wd, 'gated-flow');
    assert.equal(state.clarify_ambiguity_score, 0.4);
    assert.equal(state.clarify_non_goals_resolved, false);
    assert.equal(state.clarify_decision_boundaries_resolved, false);
    assert.equal(state.clarify_pressure_pass_complete, false);
    assert.equal(state.stage_status, 'blocked');
  });

  it('supports direct spec planning and writes Chinese workflow planning artifacts', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-plan-direct-'));
    const specPath = join(wd, 'direct-spec.md');
    await writeFile(
      specPath,
      [
        '# Direct Plan Spec',
        '',
        '## Intent',
        '',
        '- Align plan runtime with the consensus planning contract.',
        '',
        '## Desired Outcome',
        '',
        '- Produce approved planning artifacts and stop before execution.',
        '',
        '## In Scope',
        '',
        '- Add planner, architect, and critic runtime sequencing.',
        '',
        '## Out of Scope / Non-goals',
        '',
        '- Do not launch build.',
        '',
        '## Decision Boundaries',
        '',
        '- Plan stops after approved artifacts exist.',
        '',
        '## Execution Inputs',
        '',
        '- direct spec path: provided via --direct or planStage directSpecPath option',
        '- workflow slug: derived from the direct spec filename when not explicitly provided',
        '',
        '## Constraints',
        '',
        '- Docs outputs are required.',
        '',
        '## Testable Acceptance Criteria',
        '',
        '- Plan state exposes architect and critic progression.',
      ].join('\n'),
    );

    const planned = await planStage(wd, undefined, { directSpecPath: specPath, deliberate: true, adapter: createScriptedPlanAdapter() });
    assert.equal(planned.state.plan_deliberate_mode, true);
    assert.equal(planned.state.plan_critic_verdict, 'approve');
    assert.equal(planned.state.plan_docs_status, 'complete');
    assert.match(await readFile(join(planned.root, 'architecture.md'), 'utf8'), /架构文档/);
    assert.match(await readFile(join(planned.root, 'development-plan.md'), 'utf8'), /开发计划/);
    assert.match(await readFile(join(planned.root, 'test-plan.md'), 'utf8'), /测试计划/);
    assert.equal(existsSync(join(resolveWorkspaceRoot(wd), 'plans', 'prd-direct-spec.md')), true);
  });

  it('keeps plan blocked when workflow planning artifacts are not Chinese', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-plan-artifact-block-'));
    const clarified = await clarifyStage(wd, 'artifact-block');
    await writeResolvedSpec(clarified.root, 'artifact-block');
    await approveStage(wd, 'artifact-block', { from: 'clarify', to: 'plan' });
    const planned = await planStage(wd, 'artifact-block', { adapter: createScriptedPlanAdapter() });
    await writeFile(join(planned.root, 'development-plan.md'), 'development plan only in English\n');

    await assert.rejects(
      () => approveStage(wd, 'artifact-block', { from: 'plan', to: 'build' }),
      /plan_review_gate_blocked:.*plan_artifact_not_chinese_developmentPlan/,
    );

    const state = await readState(wd, 'artifact-block');
    assert.equal(state.plan_docs_status, 'partial');
    assert.equal(state.plan_blockers.includes('plan_artifact_not_chinese_developmentPlan'), true);
    assert.equal(state.plan_critic_verdict, 'approve');
  });

  it('keeps plan blocked when execution inputs are not resolved', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-plan-inputs-block-'));
    const clarified = await clarifyStage(wd, 'inputs-block');
    await writeResolvedSpec(clarified.root, 'inputs-block');
    await approveStage(wd, 'inputs-block', { from: 'clarify', to: 'plan' });
    const specPath = join(clarified.root, 'spec.md');
    const specText = await readFile(specPath, 'utf8');
    const unresolvedSpec = specText.replace(
      '## Execution Inputs\n\n- workflow slug: CLI argument provided by the operator\n- source spec path: resolved from the approved clarify artifact\n\n',
      '',
    );
    await writeFile(specPath, unresolvedSpec);

    const planned = await planStage(wd, 'inputs-block', { adapter: createScriptedPlanAdapter() });

    assert.equal(planned.state.plan_critic_verdict, 'iterate');
    assert.equal(planned.state.plan_execution_inputs_resolved, false);
    assert.equal(planned.state.plan_blockers.includes('execution_inputs_unresolved'), true);
    await assert.rejects(
      () => approveStage(wd, 'inputs-block', { from: 'plan', to: 'build' }),
      /plan_review_gate_blocked:.*execution_inputs_unresolved/,
    );
  });

  it('revises plan when critic requests iterate before approval', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-plan-iterate-'));
    const clarified = await clarifyStage(wd, 'iterate-flow');
    await writeResolvedSpec(clarified.root, 'iterate-flow');
    await approveStage(wd, 'iterate-flow', { from: 'clarify', to: 'plan' });

    const planned = await planStage(wd, 'iterate-flow', {
      adapter: createScriptedPlanAdapter({ critic: ['iterate', 'approve'] }),
    });

    assert.equal(planned.state.plan_current_iteration, 2);
    assert.equal(planned.state.plan_critic_verdict, 'approve');
    assert.equal(Array.isArray(planned.state.plan_review_artifact_paths), true);
    assert.equal(planned.state.plan_review_artifact_paths.length, 2);
  });

  it('CLI status exposes plan consensus progression', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-plan-status-'));
    const clarified = await clarifyStage(wd, 'status-flow');
    await writeResolvedSpec(clarified.root, 'status-flow');
    await approveStage(wd, 'status-flow', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'status-flow', {
      adapter: createScriptedPlanAdapter({ critic: ['iterate', 'approve'] }),
    });

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'status', 'status-flow'], { cwd: wd });
    assert.match(stdout, /plan_iteration: 2\/5/);
    assert.match(stdout, /plan_architect_review_status: complete/);
    assert.match(stdout, /plan_critic_verdict: approve/);
    assert.match(stdout, /plan_artifact_status: complete/);
  });

  it('blocks review entry when build architect gate rejects', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-build-architect-reject-'));
    const clarified = await clarifyStage(wd, 'build-reject');
    await writeResolvedSpec(clarified.root, 'build-reject');
    await approveStage(wd, 'build-reject', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'build-reject', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'build-reject', { from: 'plan', to: 'build' });

    const built = await buildStage(wd, 'build-reject', {
      adapter: createScriptedBuildAdapter({
        maxIterations: 1,
        iterations: [{ architectVerdict: 'reject' }],
      }),
    });

    assert.equal(built.state.build_architect_verification_status, 'reject');
    assert.equal(built.state.execution_record_status, 'partial');
    assert.equal(built.state.build_blockers.includes('architect_reject'), true);
    await assert.rejects(
      () => approveStage(wd, 'build-reject', { from: 'build', to: 'review' }),
      /review_gate_blocked:execution-record\.md/,
    );
  });

  it('supports no-deslop build runs while preserving review gating', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-build-no-deslop-'));
    const clarified = await clarifyStage(wd, 'build-no-deslop');
    await writeResolvedSpec(clarified.root, 'build-no-deslop');
    await approveStage(wd, 'build-no-deslop', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'build-no-deslop', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'build-no-deslop', { from: 'plan', to: 'build' });

    const built = await buildStage(wd, 'build-no-deslop', {
      noDeslop: true,
      adapter: createScriptedBuildAdapter(),
    });
    assert.equal(built.state.build_no_deslop, true);
    assert.equal(built.state.build_deslop_status, 'skipped');
    assert.equal(built.state.build_regression_status, 'skipped');
    assert.equal(built.state.execution_record_status, 'complete');
  });

  it('CLI status exposes build progression and blockers', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-build-status-'));
    const clarified = await clarifyStage(wd, 'build-status');
    await writeResolvedSpec(clarified.root, 'build-status');
    await approveStage(wd, 'build-status', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'build-status', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'build-status', { from: 'plan', to: 'build' });
    await buildStage(wd, 'build-status', {
      adapter: createScriptedBuildAdapter({
        maxIterations: 2,
        iterations: [{ regressionStatus: 'failed' }, { regressionStatus: 'complete' }],
      }),
    });

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'status', 'build-status'], { cwd: wd });
    assert.match(stdout, /build_iteration: 2\/2/);
    assert.match(stdout, /build_parallel_mode: true/);
    assert.match(stdout, /build_architect_verification_status: approve/);
    assert.match(stdout, /build_regression_status: complete/);
    assert.match(stdout, /pending_user_decision: build->review/);
    assert.match(stdout, /next: Approve build -> review when execution-record\.md is complete\./);
  });

  it('CLI clarify defaults to standard and accepts --deep', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-clarify-cli-'));
    const env = loopxEnv(home);

    const { stdout: standardOut } = await execFileAsync(process.execPath, [cliPath, 'clarify', 'cli-standard'], { cwd: repoRoot, env });
    const standard = JSON.parse(standardOut);
    assert.equal(standard.state.clarify_profile, 'standard');
    assert.equal(standard.state.clarify_max_rounds, 15);
    assert.equal(standard.next_skill_command, null);

    const { stdout: deepOut } = await execFileAsync(process.execPath, [cliPath, 'clarify', 'cli-deep', '--deep'], { cwd: repoRoot, env });
    const deep = JSON.parse(deepOut);
    assert.equal(deep.state.clarify_profile, 'deep');
    assert.equal(deep.state.clarify_target_ambiguity_threshold, 0.1);
    assert.equal(deep.state.clarify_max_rounds, 25);
    assert.equal(deep.next_skill_command, null);
  });

  it('CLI clarify payload adds the next skill command after the spec is handoff-ready', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-clarify-cli-next-'));
    const clarified = await clarifyStage(wd, 'clarify-cli-next');
    await writeResolvedSpec(clarified.root, 'clarify-cli-next');
    const summary = await statusSummary(wd, 'clarify-cli-next');
    const state = summary.state;

    const payload = withNextSkill({ ok: true, command: 'clarify', root: clarified.root, state }, state);
    assert.equal(payload.command, 'clarify');
    assert.equal(payload.next_skill_command, '$plan clarify-cli-next');
    assert.equal(payload.next_skill_hint, 'Next: $plan clarify-cli-next');
  });

  it('CLI payload adds the artifact-first next skill command for a completed plan', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-plan-cli-next-'));
    const clarified = await clarifyStage(wd, 'plan-cli-next');
    await writeResolvedSpec(clarified.root, 'plan-cli-next');
    await approveStage(wd, 'plan-cli-next', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'plan-cli-next', { adapter: createScriptedPlanAdapter() });
    const approved = await approveStage(wd, 'plan-cli-next', { from: 'plan', to: 'build' });

    const payload = withNextSkill({ ok: true, command: 'approve', root: approved.root, state: approved.state }, approved.state);
    assert.equal(payload.command, 'approve');
    assert.equal(payload.state.current_stage, 'plan');
    assert.equal(payload.state.requested_transition, 'plan->build');
    assert.equal(payload.next_skill_command, '$build .loopx/plans/prd-plan-cli-next.md');
    assert.equal(payload.next_skill_hint, 'Next: $build .loopx/plans/prd-plan-cli-next.md');
  });

  it('CLI payload adds the next skill command for a completed build', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-build-cli-next-'));
    const clarified = await clarifyStage(wd, 'build-cli-next');
    await writeResolvedSpec(clarified.root, 'build-cli-next');
    await approveStage(wd, 'build-cli-next', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'build-cli-next', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'build-cli-next', { from: 'plan', to: 'build' });
    const built = await buildStage(wd, 'build-cli-next', {
      adapter: createScriptedBuildAdapter(),
    });

    const payload = withNextSkill({ ok: true, command: 'build', root: built.root, state: built.state }, built.state);
    assert.equal(payload.command, 'build');
    assert.equal(payload.state.current_stage, 'build');
    assert.equal(payload.state.pending_user_decision, 'build->review');
    assert.equal(payload.next_skill_command, '$review .loopx/workflows/build-cli-next/execution-record.md');
    assert.equal(payload.next_skill_hint, 'Next: $review .loopx/workflows/build-cli-next/execution-record.md');
  });

  it('CLI status shows the next skill command for a handoff-ready clarify workflow', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-clarify-status-next-'));
    const clarified = await clarifyStage(wd, 'clarify-status-next');
    await writeResolvedSpec(clarified.root, 'clarify-status-next');

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'status', 'clarify-status-next'], { cwd: wd });
    assert.match(stdout, /next skill: \$plan clarify-status-next/);
  });

  it('autopilot composes clarify, plan, build, and review with internal control events', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'autopilot-'));
    const clarified = await clarifyStage(wd, 'auto-flow');
    await writeResolvedSpec(clarified.root, 'auto-flow');

    const result = await autopilotStage(wd, 'auto-flow', {
      reviewer: 'autopilot-reviewer',
      phaseAdapter: createScriptedAutopilotAdapter(),
      planOptions: { adapter: createScriptedPlanAdapter() },
      buildOptions: { adapter: createScriptedBuildAdapter() },
    });
    const run = JSON.parse(await readFile(result.runPath, 'utf8'));

    assert.equal(result.state.current_stage, 'done');
    assert.equal(Array.isArray(run.controlEvents), true);
    assert.equal(run.controlEvents.length, 4);
    assert.equal(Array.isArray(run.phases), true);
    assert.deepEqual(run.phases.map((phase) => phase.phase), ['expansion', 'planning', 'execution', 'qa', 'validation']);
    assert.equal(run.currentPhase, 'complete');
    assert.equal(run.completed, true);
    assert.equal(run.reviewedRunId, 'auto-flow-build-run-1');
    assert.equal(run.artifacts.planPath, join(resolveWorkspaceRoot(wd), 'plans', 'prd-auto-flow.md'));
    assert.equal(run.artifacts.testSpecPath, join(resolveWorkspaceRoot(wd), 'plans', 'test-spec-auto-flow.md'));
    assert.equal(result.runPath, join(resolveWorkspaceRoot(wd), 'autopilot', 'auto-flow', 'run.json'));
  });

  it('autopilot records validation blockers when review does not approve', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'autopilot-review-fail-'));
    const clarified = await clarifyStage(wd, 'auto-fail');
    await writeResolvedSpec(clarified.root, 'auto-fail');

    await assert.rejects(
      () => autopilotStage(wd, 'auto-fail', {
        reviewer: 'auto-fail-builder-1',
        phaseAdapter: createScriptedAutopilotAdapter(),
        planOptions: { adapter: createScriptedPlanAdapter() },
        buildOptions: { adapter: createScriptedBuildAdapter() },
      }),
      /autopilot_review_failed/,
    );

    const run = JSON.parse(await readFile(join(resolveWorkspaceRoot(wd), 'autopilot', 'auto-fail', 'run.json'), 'utf8'));
    assert.equal(run.completed, false);
    assert.equal(run.currentPhase, 'validation');
    assert.equal(run.blockers.includes('validation_blocked'), true);
    assert.equal(run.blockers.includes('review_request-changes'), true);

    const state = await readState(wd, 'auto-fail');
    assert.equal(state.autopilot_current_phase, 'validation');
    assert.equal(state.autopilot_completed, false);
  });

  it('migrates legacy .codex-helper runtime to .loopx', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-migrate-'));
    await mkdir(resolveLegacyRoot(wd), { recursive: true });
    await writeFile(join(resolveLegacyRoot(wd), 'README.md'), 'legacy\n');

    const result = await migrateLegacyRuntime(wd);
    assert.equal(result.migrated, true);
    assert.equal(existsSync(resolveLegacyRoot(wd)), false);
    assert.equal(existsSync(resolveLoopxRoot(wd)), true);
  });

  it('doctor does not report uppercase runtime root when only .loopx exists', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-doctor-case-'));
    const home = await mkdtemp(join(tmpdir(), 'loopx-doctor-case-home-'));
    const env = loopxEnv(home);

    await initWorkspace(wd);
    const result = await doctorRuntime(wd, env);

    assert.equal(result.loopxExists, true);
    assert.equal(result.uppercaseExists, false);
    assert.equal(result.mixedRuntimeRoots, false);
  });

  it('status marks legacy codex-helper workflows explicitly', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-status-'));
    await initWorkspace(wd, { slug: 'fresh-flow' });

    const legacyRoot = join(resolveWorkspaceRoot(wd), 'workflows', 'legacy-flow');
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(join(legacyRoot, 'state.json'), JSON.stringify({ slug: 'legacy-flow', current_stage: 'clarify' }, null, 2));
    await writeFile(join(legacyRoot, 'brief.md'), '# Legacy brief\n');

    const detail = await statusSummary(wd, 'legacy-flow');
    assert.equal(detail.legacy, true);
    assert.equal(detail.contract, 'legacy-codex-helper');
  });

  it('CLI exposes loopx runtime/debug commands and no public team command', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-cli-home-'));
    const env = loopxEnv(home);

    const { stdout: help } = await execFileAsync(process.execPath, [cliPath, '--help'], { cwd: repoRoot, env });
    assert.match(help, /loopx repair-install/);
    assert.match(help, /loopx plan \[slug\] \[--direct <spec-path>\] \[--interactive\] \[--deliberate\]/);
    assert.match(help, /loopx build <slug> \[--no-deslop\]/);
    assert.doesNotMatch(help, /loopx team/);

    const { stdout: doctor } = await execFileAsync(process.execPath, [cliPath, 'doctor'], { cwd: repoRoot, env });
    const parsedDoctor = JSON.parse(doctor);
    assert.equal(parsedDoctor.command, 'doctor');

    await execFileAsync(process.execPath, [cliPath, 'repair-install'], { cwd: repoRoot, env });
    const { stdout: afterDoctor } = await execFileAsync(process.execPath, [cliPath, 'doctor'], { cwd: repoRoot, env });
    const parsedAfterDoctor = JSON.parse(afterDoctor);
    assert.equal(parsedAfterDoctor.installCheck.ok, true);
  });
});
