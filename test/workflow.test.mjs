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
import { createRealBuildAdapter, createScriptedBuildAdapter } from '../src/build-runtime.mjs';
import { buildActivePath, evaluateBuildStopGate, readBuildActiveState, writeBuildActiveState } from '../src/build-stop-gate.mjs';
import { nextSkillCommand, withNextSkill } from '../src/next-skill.mjs';
import { createScriptedPlanAdapter } from '../src/plan-runtime.mjs';
import { createScriptedReviewAdapter } from '../src/review-runtime.mjs';
import { doctorRuntime, migrateLegacyRuntime, resolveLegacyRoot, resolveLoopxRoot } from '../src/runtime-maintenance.mjs';
import {
  archiveStage,
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
const stopHookScript = resolve(repoRoot, 'scripts/codex-stop-hook.mjs');

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
    const baselinePath = join(home, '.loopx', 'template-hashes.json');

    const before = await verifyInstallState(env);
    assert.equal(before.ok, false);

    await execFileAsync(process.execPath, [installScript], { cwd: repoRoot, env });
    const after = await verifyInstallState(env);
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

    assert.equal(after.ok, true);
    assert.equal(baseline.schema_version, 1);
    assert.equal(baseline.items.length, 21);
    assert.equal(existsSync(join(home, '.codex', 'hooks', 'codex-workflow-hook.mjs')), true);
    assert.equal(after.inspection.skills.archive.installedDirExists, true);
    assert.equal(after.inspection.skills.status, undefined);
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
      assert.equal(
        baseline.items.some((item) => item.path === `.agents/skills/${skillName}/SKILL.md` && item.source_path.endsWith(`/skills/${skillName}/SKILL.md`)),
        true,
        `${skillName}-template-baseline`,
      );
    }
    assert.equal(after.inspection.managedArtifacts['codex-workflow-hook'].installed, true);
    assert.equal(after.inspection.managedArtifacts['codex-workflow-hook'].discovered, true);
    assert.equal(
      baseline.items.some((item) => item.path === '.codex/hooks/codex-workflow-hook.mjs' && item.source_path.endsWith('/scripts/codex-workflow-hook.mjs')),
      true,
      'codex-workflow-hook-template-baseline',
    );
    assert.equal(
      baseline.items.some((item) => item.kind === 'plugin' && item.source_path.endsWith('/plugins/loopx/.codex-plugin/plugin.json')),
      true,
      'plugin-manifest-template-baseline',
    );
    assert.equal(
      baseline.items.some((item) => item.kind === 'workflow-template' && item.source_path.endsWith('/templates/spec.md')),
      true,
      'workflow-template-baseline',
    );
  });

  it('repair-install upgrades pristine loopx skills and preserves user-modified skills', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-template-repair-home-'));
    const sourceRoot = join(home, 'registry', 'skills');
    const env = {
      ...loopxEnv(home),
      LOOPX_SKILL_SOURCE_ROOT: sourceRoot,
      LOOPX_PROJECT_ROOT: join(home, 'registry'),
    };

    for (const skillName of ['clarify', 'plan', 'build', 'review', 'autopilot', 'archive', 'debug', 'tdd', 'verify', 'go-style', 'kratos']) {
      await mkdir(join(sourceRoot, skillName), { recursive: true });
      await writeFile(join(sourceRoot, skillName, 'SKILL.md'), `${skillName} v1\n`);
    }
    await execFileAsync(process.execPath, [installScript], { cwd: repoRoot, env });

    await writeFile(join(sourceRoot, 'clarify', 'SKILL.md'), 'clarify v2\n');
    await writeFile(join(sourceRoot, 'plan', 'SKILL.md'), 'plan v2\n');
    await writeFile(join(home, '.agents', 'skills', 'plan', 'SKILL.md'), 'plan user edit\n');
    await writeFile(join(home, '.codex', 'hooks', 'codex-workflow-hook.mjs'), 'user hook edit\n');

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'repair-install'], { cwd: repoRoot, env });
    const payload = JSON.parse(stdout);

    assert.equal(payload.ok, true);
    assert.equal(payload.skipped.some((item) => item.skillName === 'codex-workflow-hook' && item.reason === 'user-modified'), true);
    assert.equal(payload.skipped.some((item) => item.skillName === 'plan' && item.reason === 'conflict'), true);
    assert.equal(payload.templateGovernance.summary['conflict'], 1);
    assert.equal(payload.templateGovernance.summary['user-modified'], 1);
    assert.equal(await readFile(join(home, '.agents', 'skills', 'clarify', 'SKILL.md'), 'utf8'), 'clarify v2\n');
    assert.equal(await readFile(join(home, '.agents', 'skills', 'plan', 'SKILL.md'), 'utf8'), 'plan user edit\n');
    assert.equal(await readFile(join(home, '.codex', 'hooks', 'codex-workflow-hook.mjs'), 'utf8'), 'user hook edit\n');

    const baseline = JSON.parse(await readFile(join(home, '.loopx', 'template-hashes.json'), 'utf8'));
    const clarifyItem = baseline.items.find((item) => item.path === '.agents/skills/clarify/SKILL.md');
    const planItem = baseline.items.find((item) => item.path === '.agents/skills/plan/SKILL.md');
    assert.equal(clarifyItem.registry_hash, clarifyItem.hash);
    assert.notEqual(planItem.registry_hash, planItem.hash);
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

  it('doctor reports installed workflow hook state from managed artifacts', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-hook-doctor-home-'));
    const env = loopxEnv(home);
    const otherCwd = await mkdtemp(join(tmpdir(), 'loopx-hook-doctor-cwd-'));

    await execFileAsync(process.execPath, [installScript], { cwd: repoRoot, env });
    const runtime = await doctorRuntime(otherCwd, env);

    assert.equal(runtime.hook.enabled, true);
    assert.equal(runtime.hook.installed, true);
    assert.equal(runtime.hook.installedWorkflowHookPath, join(home, '.codex', 'hooks', 'codex-workflow-hook.mjs'));
    assert.equal(existsSync(runtime.hook.installedWorkflowHookPath), true);
    assert.equal(runtime.templateGovernance.baselinePath, join(home, '.loopx', 'template-hashes.json'));
    assert.equal(runtime.templateGovernance.status, 'current');
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

    const done = await approveStage(wd, 'flow', { from: 'review', to: 'done' });
    assert.equal(done.state.current_stage, 'done');
    assert.equal(done.state.last_confirmed_transition, 'review->done');
    assert.equal(done.state.completion_confirmed, true);
  });

  it('can rerun review from an execution record path while review is awaiting completion approval', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-review-rerun-'));
    const clarified = await clarifyStage(wd, 'review-rerun');
    await writeResolvedSpec(clarified.root, 'review-rerun');
    await approveStage(wd, 'review-rerun', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'review-rerun', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'review-rerun', { from: 'plan', to: 'build' });
    await buildStage(wd, 'review-rerun', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'review-rerun', { from: 'build', to: 'review' });
    const firstReview = await reviewStage(wd, 'review-rerun', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter(),
    });
    const firstJournalPath = firstReview.state.workspace_journal_path;

    const reviewedAgain = await reviewStage(wd, '.loopx/workflows/review-rerun/execution-record.md', {
      reviewer: 'qa-2',
      adapter: createScriptedReviewAdapter({
        codeReview: {
          status: 'complete',
          verdict: 'approve',
          summary: '重新审查通过。',
          findings: [],
        },
      }),
    });

    assert.equal(reviewedAgain.verdict, 'APPROVE');
    assert.equal(reviewedAgain.state.current_stage, 'review');
    assert.equal(reviewedAgain.state.pending_user_decision, 'review->done');
    assert.equal(reviewedAgain.state.requested_transition, 'none');
    assert.equal(reviewedAgain.state.workspace_journal_path, firstJournalPath);
    assert.equal(reviewedAgain.state.workspace_journal_status, 'written');
    assert.match(reviewedAgain.reviewMessageZh, /重新审查通过。/);
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
          verdict: 'REQUEST CHANGES',
          rollbackTarget: 'BUILD',
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
    assert.equal(review.rollbackTarget, 'build');
    assert.match(review.reviewMessageZh, /要求修改/);
    assert.match(review.reviewMessageZh, /代码审查发现阻断问题/);
    assert.match(review.reviewMessageZh, /\$build \.loopx\/plans\/prd-review-code\.md/);
    assert.equal(review.state.pending_user_decision, 'review->build');
    const reportText = await readFile(join(review.root, 'review-report.md'), 'utf8');
    const report = parseFrontmatter(reportText);
    assert.equal(report.verdict, 'request-changes');
    assert.equal(report.rollback_target, 'build');
    assert.equal(report.code_review.verdict, 'request-changes');
    assert.equal(existsSync(join(review.root, 'review-support', 'code-review.json')), true);
    assert.match(reportText, /## 代码审查/);
    assert.match(reportText, /src\/workflow\.mjs:1430/);
    assert.match(reportText, /review 通过前可能错误进入 done。/);

    const approvedFix = await approveStage(wd, 'review-code', { from: 'review', to: 'build' });
    assert.equal(approvedFix.state.current_stage, 'review');
    assert.equal(approvedFix.state.requested_transition, 'review->build');
    const rebuilt = await buildStage(wd, '.loopx/plans/prd-review-code.md', {
      adapter: createScriptedBuildAdapter(),
    });
    assert.equal(rebuilt.state.current_stage, 'build');
    assert.equal(rebuilt.state.pending_user_decision, 'build->review');
    assert.equal(rebuilt.state.last_confirmed_transition, 'review->build');
    assert.equal(rebuilt.state.approval.review, 'not-requested');
    assert.equal(rebuilt.state.review_verdict, 'none');
    assert.equal(rebuilt.state.rollback_target, null);
    assert.equal(rebuilt.state.rollback_rationale, null);
    assert.equal(rebuilt.state.workspace_journal_status, 'skipped');
  });

  it('review returns structured request-changes when code review execution fails', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-review-code-failure-'));
    const clarified = await clarifyStage(wd, 'review-code-failure');
    await writeResolvedSpec(clarified.root, 'review-code-failure');
    await approveStage(wd, 'review-code-failure', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'review-code-failure', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'review-code-failure', { from: 'plan', to: 'build' });
    await buildStage(wd, 'review-code-failure', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'review-code-failure', { from: 'build', to: 'review' });

    const review = await reviewStage(wd, 'review-code-failure', {
      reviewer: 'qa-1',
      adapter: {
        async codeReview() {
          throw new Error('codex_exec_invalid_json:Unexpected end of JSON input\nbody:');
        },
      },
    });

    assert.equal(review.verdict, 'REQUEST CHANGES');
    assert.equal(review.rollbackTarget, 'build');
    assert.equal(review.state.current_stage, 'review');
    assert.equal(review.state.pending_user_decision, 'review->build');
    assert.equal(review.state.review_verdict, 'request-changes');
    assert.equal(review.state.rollback_target, 'build');
    assert.match(review.reviewMessageZh, /code-review 子流程失败/);
    assert.match(review.reviewMessageZh, /\$build \.loopx\/plans\/prd-review-code-failure\.md/);
    const reportText = await readFile(join(review.root, 'review-report.md'), 'utf8');
    assert.match(reportText, /code-review 子流程失败/);
    const codeReview = JSON.parse(await readFile(join(review.root, 'review-support', 'code-review.json'), 'utf8'));
    assert.equal(codeReview.verdict, 'request-changes');
    assert.equal(codeReview.rollbackTarget, 'build');
  });

  it('keeps plan rollback when review evidence gates and code review fail together', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-review-evidence-priority-'));
    const clarified = await clarifyStage(wd, 'review-evidence-priority');
    await writeResolvedSpec(clarified.root, 'review-evidence-priority');
    await approveStage(wd, 'review-evidence-priority', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'review-evidence-priority', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'review-evidence-priority', { from: 'plan', to: 'build' });
    await buildStage(wd, 'review-evidence-priority', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'review-evidence-priority', { from: 'build', to: 'review' });

    const recordPath = join(clarified.root, 'execution-record.md');
    const record = await readFile(recordPath, 'utf8');
    await writeFile(recordPath, record.replace(/evidence_manifest: .+\n/, 'evidence_manifest: []\n'));

    const review = await reviewStage(wd, 'review-evidence-priority', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter({
        codeReview: {
          status: 'complete',
          verdict: 'request-changes',
          rollbackTarget: 'build',
          summary: '实现也有问题。',
          findings: [{ severity: 'medium', file: 'src/workflow.mjs', line: 1, message: '需要修实现。' }],
        },
      }),
    });

    assert.equal(review.verdict, 'REQUEST CHANGES');
    assert.equal(review.rollbackTarget, 'plan');
    assert.equal(review.state.rollback_target, 'plan');
    assert.equal(review.state.pending_user_decision, 'review->plan');
    assert.match(review.reviewMessageZh, /\$plan review-evidence-priority/);
  });

  it('routes review request-changes to plan or clarify when review target requires it', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-review-targets-'));
    const clarified = await clarifyStage(wd, 'review-targets');
    await writeResolvedSpec(clarified.root, 'review-targets');
    await approveStage(wd, 'review-targets', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'review-targets', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'review-targets', { from: 'plan', to: 'build' });
    await buildStage(wd, 'review-targets', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'review-targets', { from: 'build', to: 'review' });

    const planReview = await reviewStage(wd, 'review-targets', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter({
        codeReview: {
          status: 'complete',
          verdict: 'request-changes',
          rollbackTarget: 'plan',
          summary: '计划验收标准缺失。',
          findings: [{ severity: 'high', file: 'plan.md', line: 1, message: '计划需要重写。' }],
        },
      }),
    });
    assert.equal(planReview.rollbackTarget, 'plan');
    assert.equal(planReview.state.pending_user_decision, 'review->plan');
    assert.match(planReview.reviewMessageZh, /\$plan review-targets/);
    await approveStage(wd, 'review-targets', { from: 'review', to: 'plan' });
    const approvedPlanRollback = await readState(wd, 'review-targets');
    assert.equal(approvedPlanRollback.requested_transition, 'review->plan');
    assert.equal(nextSkillCommand(approvedPlanRollback), '$plan review-targets');
    const replanned = await planStage(wd, 'review-targets', { adapter: createScriptedPlanAdapter() });
    assert.equal(replanned.state.current_stage, 'plan');
    assert.equal(replanned.state.pending_user_decision, 'plan->build');
    assert.equal(replanned.state.last_confirmed_transition, 'review->plan');

    await approveStage(wd, 'review-targets', { from: 'plan', to: 'build' });
    await buildStage(wd, 'review-targets', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'review-targets', { from: 'build', to: 'review' });
    const clarifyReview = await reviewStage(wd, 'review-targets', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter({
        codeReview: {
          status: 'complete',
          verdict: 'request-changes',
          rollbackTarget: 'clarify',
          summary: '需求边界仍不清楚。',
          findings: [{ severity: 'high', file: 'spec.md', line: 1, message: '需求需要重新澄清。' }],
        },
      }),
    });
    assert.equal(clarifyReview.rollbackTarget, 'clarify');
    assert.equal(clarifyReview.state.pending_user_decision, 'review->clarify');
    assert.match(clarifyReview.reviewMessageZh, /\$clarify review-targets/);
    await approveStage(wd, 'review-targets', { from: 'review', to: 'clarify' });
    const approvedClarifyRollback = await readState(wd, 'review-targets');
    assert.equal(approvedClarifyRollback.requested_transition, 'review->clarify');
    assert.equal(nextSkillCommand(approvedClarifyRollback), '$clarify review-targets');
    const reclarified = await clarifyStage(wd, 'review-targets');
    assert.equal(reclarified.state.current_stage, 'clarify');
    assert.equal(reclarified.state.last_confirmed_transition, 'review->clarify');
    assert.equal(reclarified.state.approval.plan, 'not-requested');
    assert.equal(nextSkillCommand(reclarified.state), null);
  });

  it('keeps target commands executable after legacy review rollback consumption', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-review-legacy-rollback-'));
    const clarified = await clarifyStage(wd, 'legacy-rollback');
    await writeResolvedSpec(clarified.root, 'legacy-rollback');
    await approveStage(wd, 'legacy-rollback', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'legacy-rollback', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'legacy-rollback', { from: 'plan', to: 'build' });
    await buildStage(wd, 'legacy-rollback', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'legacy-rollback', { from: 'build', to: 'review' });
    await reviewStage(wd, 'legacy-rollback', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter({
        codeReview: {
          status: 'complete',
          verdict: 'request-changes',
          summary: '实现需要修改。',
          findings: [{ severity: 'high', file: 'src/workflow.mjs', line: 1, message: '需要回 build。' }],
        },
      }),
    });

    await approveStage(wd, 'legacy-rollback', { from: 'review', to: 'build' });
    const consumedByReview = await reviewStage(wd, 'legacy-rollback', { reviewer: 'qa-1' });
    assert.equal(consumedByReview.state.current_stage, 'build');
    assert.equal(nextSkillCommand(consumedByReview.state), null);

    const rebuilt = await buildStage(wd, '.loopx/plans/prd-legacy-rollback.md', {
      adapter: createScriptedBuildAdapter(),
    });
    assert.equal(rebuilt.state.current_stage, 'build');
    assert.equal(rebuilt.state.pending_user_decision, 'build->review');

    await approveStage(wd, 'legacy-rollback', { from: 'build', to: 'review' });
    await reviewStage(wd, 'legacy-rollback', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter({
        codeReview: {
          status: 'complete',
          verdict: 'request-changes',
          rollbackTarget: 'plan',
          summary: '计划需要修改。',
          findings: [{ severity: 'medium', file: 'plan.md', line: 1, message: '需要回 plan。' }],
        },
      }),
    });
    await approveStage(wd, 'legacy-rollback', { from: 'review', to: 'plan' });
    const planConsumedByReview = await reviewStage(wd, 'legacy-rollback', { reviewer: 'qa-1' });
    assert.equal(planConsumedByReview.state.current_stage, 'plan');
    assert.equal(nextSkillCommand(planConsumedByReview.state), null);
    const replanned = await planStage(wd, 'legacy-rollback', { adapter: createScriptedPlanAdapter() });
    assert.equal(replanned.state.current_stage, 'plan');
    assert.equal(replanned.state.pending_user_decision, 'plan->build');

    await approveStage(wd, 'legacy-rollback', { from: 'plan', to: 'build' });
    await buildStage(wd, 'legacy-rollback', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'legacy-rollback', { from: 'build', to: 'review' });
    await reviewStage(wd, 'legacy-rollback', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter({
        codeReview: {
          status: 'complete',
          verdict: 'request-changes',
          rollbackTarget: 'clarify',
          summary: '需求需要澄清。',
          findings: [{ severity: 'medium', file: 'spec.md', line: 1, message: '需要回 clarify。' }],
        },
      }),
    });
    await approveStage(wd, 'legacy-rollback', { from: 'review', to: 'clarify' });
    const clarifyConsumedByReview = await reviewStage(wd, 'legacy-rollback', { reviewer: 'qa-1' });
    assert.equal(clarifyConsumedByReview.state.current_stage, 'clarify');
    assert.equal(nextSkillCommand(clarifyConsumedByReview.state), null);
    const specBeforeReclarify = await readFile(join(clarifyConsumedByReview.root, 'spec.md'), 'utf8');
    const reclarified = await clarifyStage(wd, 'legacy-rollback');
    assert.equal(reclarified.state.current_stage, 'clarify');
    assert.equal(reclarified.state.last_confirmed_transition, 'review->clarify');
    const specAfterReclarify = await readFile(join(reclarified.root, 'spec.md'), 'utf8');
    assert.equal(specAfterReclarify, specBeforeReclarify);
    assert.equal(reclarified.state.clarify_current_round, clarifyConsumedByReview.state.clarify_current_round);
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

  it('plan writes change delta artifacts and an artifact dependency graph', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-change-delta-plan-'));
    const clarified = await clarifyStage(wd, 'change-delta');
    await writeResolvedSpec(clarified.root, 'change-delta');
    await approveStage(wd, 'change-delta', { from: 'clarify', to: 'plan' });

    const planned = await planStage(wd, 'change-delta', { adapter: createScriptedPlanAdapter() });
    const changesRoot = join(resolveWorkspaceRoot(wd), 'changes', 'active', planned.state.change_id);
    const deltaPath = join(changesRoot, 'spec-delta.md');
    const graphPath = join(changesRoot, 'artifact-graph.json');
    const deltaText = await readFile(deltaPath, 'utf8');
    const graph = JSON.parse(await readFile(graphPath, 'utf8'));

    assert.equal(planned.state.change_id, 'chg-change-delta');
    assert.equal(planned.state.change_id === planned.state.slug, false);
    assert.equal(planned.state.change_artifacts_status, 'complete');
    assert.equal(planned.state.spec_delta_status, 'complete');
    assert.equal(planned.state.change_artifact_paths.specDelta, deltaPath);
    assert.match(deltaText, /## Target Spec Domains/);
    assert.match(deltaText, /- general/);
    assert.match(deltaText, /## Added Requirements/);
    assert.equal(graph.change, planned.state.change_id);
    assert.equal(graph.workflow, 'change-delta');
    assert.equal(graph.artifacts.specDelta.status, 'done');
    assert.deepEqual(graph.artifacts.tasks.dependsOn, ['proposal', 'specDelta', 'design']);
    assert.equal(graph.nextReady.length, 0);
    assert.equal(existsSync(join(changesRoot, 'proposal.md')), true);
    assert.equal(existsSync(join(changesRoot, 'design.md')), true);
    assert.equal(existsSync(join(changesRoot, 'tasks.md')), true);
  });

  it('blocks build approval when the change delta artifact is missing', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-change-delta-block-'));
    const clarified = await clarifyStage(wd, 'delta-block');
    await writeResolvedSpec(clarified.root, 'delta-block');
    await approveStage(wd, 'delta-block', { from: 'clarify', to: 'plan' });
    const planned = await planStage(wd, 'delta-block', { adapter: createScriptedPlanAdapter() });
    await writeFile(planned.state.change_artifact_paths.specDelta, '');

    await assert.rejects(
      () => approveStage(wd, 'delta-block', { from: 'plan', to: 'build' }),
      /plan_review_gate_blocked:.*spec_delta_empty/,
    );

    const state = await readState(wd, 'delta-block');
    assert.equal(state.spec_delta_status, 'partial');
    assert.equal(state.plan_blockers.includes('spec_delta_empty'), true);
  });

  it('archives approved change deltas into long-lived specs', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-change-delta-archive-'));
    const clarified = await clarifyStage(wd, 'archive-delta');
    await writeResolvedSpec(clarified.root, 'archive-delta');
    await approveStage(wd, 'archive-delta', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'archive-delta', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'archive-delta', { from: 'plan', to: 'build' });
    await buildStage(wd, 'archive-delta', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'archive-delta', { from: 'build', to: 'review' });
    await reviewStage(wd, 'archive-delta', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter(),
    });
    await approveStage(wd, 'archive-delta', { from: 'review', to: 'done' });

    const archived = await archiveStage(wd, 'archive-delta');
    const specPath = join(resolveWorkspaceRoot(wd), 'specs', 'general', 'spec.md');
    const archivedDeltaPath = join(resolveWorkspaceRoot(wd), 'changes', 'archive', archived.state.change_id, 'spec-delta.md');
    const specText = await readFile(specPath, 'utf8');

    assert.equal(archived.state.archive_status, 'archived');
    assert.equal(archived.state.spec_sync_status, 'synced');
    assert.equal(archived.state.change_id, 'chg-archive-delta');
    assert.equal(archived.state.archived_change_path, join(resolveWorkspaceRoot(wd), 'changes', 'archive', 'chg-archive-delta'));
    assert.equal(existsSync(archivedDeltaPath), true);
    assert.match(specText, /# loopx Spec Domain: general/);
    assert.match(specText, /## Requirements/);
    assert.match(specText, /archive-delta/);
  });

  it('keeps archive idempotent after change deltas are synced', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-change-delta-archive-idempotent-'));
    const clarified = await clarifyStage(wd, 'archive-repeat');
    await writeResolvedSpec(clarified.root, 'archive-repeat');
    await approveStage(wd, 'archive-repeat', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'archive-repeat', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'archive-repeat', { from: 'plan', to: 'build' });
    await buildStage(wd, 'archive-repeat', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'archive-repeat', { from: 'build', to: 'review' });
    await reviewStage(wd, 'archive-repeat', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter(),
    });
    await approveStage(wd, 'archive-repeat', { from: 'review', to: 'done' });

    const first = await archiveStage(wd, 'archive-repeat');
    const specPath = first.state.archived_spec_paths[0];
    const before = await readFile(specPath, 'utf8');
    const second = await archiveStage(wd, 'archive-repeat');
    const after = await readFile(specPath, 'utf8');

    assert.equal(second.state.archive_status, 'archived');
    assert.equal(second.state.archived_change_path, first.state.archived_change_path);
    assert.equal(after, before);
  });

  it('migrates old schema .loopx workflows so approved review can archive existing change deltas', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-workflow-schema-migrate-'));
    await initWorkspace(wd);

    const slug = 'mixed-schema';
    const workflowRoot = join(resolveWorkspaceRoot(wd), 'workflows', slug);
    const changeId = `${slug}-20260511172248`;
    const changeRoot = join(resolveWorkspaceRoot(wd), 'changes', 'active', changeId);
    await mkdir(workflowRoot, { recursive: true });
    await mkdir(changeRoot, { recursive: true });

    await writeFile(
      join(workflowRoot, 'state.json'),
      JSON.stringify({
        slug,
        profile: 'standard',
        clarify_current_round: 8,
        clarify_max_rounds: 15,
        clarify_target_ambiguity_threshold: 0.2,
        clarify_ambiguity_score: 0.12,
        clarify_non_goals_resolved: true,
        clarify_decision_boundaries_resolved: true,
        clarify_pressure_pass_complete: true,
        unresolved_ambiguity_count: 0,
        request: '第一次使用 loopx 生成的旧 schema workflow 状态。',
      }, null, 2),
    );
    await writeFile(join(workflowRoot, 'plan.md'), '# Plan\n');
    await writeFile(join(workflowRoot, 'architecture.md'), '# Architecture\n');
    await writeFile(join(workflowRoot, 'development-plan.md'), '# Development Plan\n');
    await writeFile(join(workflowRoot, 'test-plan.md'), '# Test Plan\n');
    await writeFile(
      join(workflowRoot, 'execution-record.md'),
      [
        '---',
        `slug: ${slug}`,
        'stage: build',
        `build_run_id: ${slug}-build-run`,
        'status: review-ready',
        'execution_approved_for_review: true',
        '---',
        '',
        '# Execution Record',
        '',
        '## Verification Evidence',
        '',
        '- PASS: npm test',
      ].join('\n'),
    );
    await writeFile(
      join(workflowRoot, 'review.md'),
      [
        '---',
        `slug: ${slug}`,
        'stage: review',
        `review_run_id: ${slug}-review-run`,
        'verdict: approve',
        '---',
        '',
        '# Review',
        '',
        '## Verdict',
        '',
        'APPROVE',
      ].join('\n'),
    );
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n');
    await writeFile(join(changeRoot, 'design.md'), '# Design\n');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n');
    await writeFile(
      join(changeRoot, 'spec-delta.md'),
      [
        '---',
        `change_id: ${changeId}`,
        `slug: ${slug}`,
        'status: planned',
        'target_domains:',
        '  - frontend-ui',
        '---',
        '',
        '# Spec Delta',
        '',
        '## frontend-ui',
        '',
        '### Added Requirements',
        '',
        '- The migrated workflow must be archivable.',
      ].join('\n'),
    );
    await writeFile(
      join(changeRoot, 'artifact-graph.json'),
      JSON.stringify({
        change_id: changeId,
        slug,
        change_artifacts: {
          proposal: `.loopx/changes/active/${changeId}/proposal.md`,
          spec_delta: `.loopx/changes/active/${changeId}/spec-delta.md`,
          design: `.loopx/changes/active/${changeId}/design.md`,
          tasks: `.loopx/changes/active/${changeId}/tasks.md`,
        },
      }, null, 2),
    );

    const migration = await migrateLegacyRuntime(wd);
    assert.equal(migration.workflowStateMigrations.length, 1);

    const migratedStatus = await statusSummary(wd, slug);
    assert.equal(migratedStatus.legacy, false);
    assert.equal(migratedStatus.state.current_stage, 'review');
    assert.equal(migratedStatus.state.review_verdict, 'approve');
    assert.equal(migratedStatus.state.change_id, changeId);
    assert.equal(migratedStatus.state.change_artifact_paths.specDelta, join(changeRoot, 'spec-delta.md'));

    await approveStage(wd, slug, { from: 'review', to: 'done' });
    const archived = await archiveStage(wd, slug);
    const specPath = join(resolveWorkspaceRoot(wd), 'specs', 'frontend-ui', 'spec.md');
    const specText = await readFile(specPath, 'utf8');

    assert.equal(archived.state.archive_status, 'archived');
    assert.equal(archived.state.archived_change_path, join(resolveWorkspaceRoot(wd), 'changes', 'archive', changeId));
    assert.match(specText, /The migrated workflow must be archivable/);
  });

  it('migrates old schema GO review verdicts as approved reviews', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-workflow-go-migrate-'));
    await initWorkspace(wd);

    const slug = 'go-review';
    const workflowRoot = join(resolveWorkspaceRoot(wd), 'workflows', slug);
    await mkdir(workflowRoot, { recursive: true });
    await writeFile(
      join(workflowRoot, 'state.json'),
      JSON.stringify({
        slug,
        stage: 'review',
        review_status: 'complete',
        review_verdict: 'go',
        requested_transition_after_review: 'done',
      }, null, 2),
    );
    await writeFile(join(workflowRoot, 'plan.md'), '# Plan\n');
    await writeFile(join(workflowRoot, 'architecture.md'), '# Architecture\n');
    await writeFile(join(workflowRoot, 'development-plan.md'), '# Development Plan\n');
    await writeFile(join(workflowRoot, 'test-plan.md'), '# Test Plan\n');
    await writeFile(join(workflowRoot, 'execution-record.md'), `---\nslug: ${slug}\nstage: build\nstatus: review-ready\nexecution_approved_for_review: true\n---\n\n## Verification Evidence\n\n- PASS\n`);
    await writeFile(
      join(workflowRoot, 'review.md'),
      [
        `# Review: ${slug}`,
        '',
        '## Verdict',
        '',
        'GO',
        '',
        '## Rationale',
        '',
        '上一轮 NO-GO 已复核，本轮可以进入 done。',
      ].join('\n'),
    );

    await migrateLegacyRuntime(wd);
    const migratedStatus = await statusSummary(wd, slug);

    assert.equal(migratedStatus.legacy, false);
    assert.equal(migratedStatus.state.current_stage, 'review');
    assert.equal(migratedStatus.state.review_verdict, 'approve');
    assert.equal(migratedStatus.state.pending_user_decision, 'review->done');

    const done = await approveStage(wd, slug, { from: 'review', to: 'done' });
    assert.equal(done.state.current_stage, 'done');
    assert.equal(done.state.completion_confirmed, true);
  });

  it('archives old domain-section spec deltas into matching long-lived specs only', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-domain-section-archive-'));
    await initWorkspace(wd);

    const slug = 'domain-sections';
    const workflowRoot = join(resolveWorkspaceRoot(wd), 'workflows', slug);
    const changeId = `${slug}-20260511172248`;
    const changeRoot = join(resolveWorkspaceRoot(wd), 'changes', 'active', changeId);
    await mkdir(workflowRoot, { recursive: true });
    await mkdir(changeRoot, { recursive: true });

    await writeFile(join(workflowRoot, 'state.json'), JSON.stringify({ slug, request: 'old domain delta' }, null, 2));
    await writeFile(join(workflowRoot, 'review.md'), `---\nslug: ${slug}\nstage: review\nverdict: approve\n---\n\nAPPROVE\n`);
    await writeFile(join(workflowRoot, 'execution-record.md'), `---\nslug: ${slug}\nstage: build\nstatus: review-ready\nexecution_approved_for_review: true\n---\n\n## Verification Evidence\n\n- PASS\n`);
    await writeFile(join(workflowRoot, 'plan.md'), '# Plan\n');
    await writeFile(join(workflowRoot, 'architecture.md'), '# Architecture\n');
    await writeFile(join(workflowRoot, 'development-plan.md'), '# Development Plan\n');
    await writeFile(join(workflowRoot, 'test-plan.md'), '# Test Plan\n');
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n');
    await writeFile(join(changeRoot, 'design.md'), '# Design\n');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n');
    await writeFile(
      join(changeRoot, 'spec-delta.md'),
      [
        '---',
        `change_id: ${changeId}`,
        `slug: ${slug}`,
        'target_domains:',
        '  - alpha-ui',
        '  - beta-api',
        '---',
        '',
        '# Spec Delta',
        '',
        '## alpha-ui',
        '',
        '### Added Requirements',
        '',
        '- Alpha UI requirement.',
        '',
        '## beta-api',
        '',
        '### Added Requirements',
        '',
        '- Beta API requirement.',
      ].join('\n'),
    );
    await writeFile(join(changeRoot, 'artifact-graph.json'), JSON.stringify({ change_id: changeId, slug }, null, 2));

    await migrateLegacyRuntime(wd);
    await approveStage(wd, slug, { from: 'review', to: 'done' });
    await archiveStage(wd, slug);

    const alphaSpec = await readFile(join(resolveWorkspaceRoot(wd), 'specs', 'alpha-ui', 'spec.md'), 'utf8');
    const betaSpec = await readFile(join(resolveWorkspaceRoot(wd), 'specs', 'beta-api', 'spec.md'), 'utf8');

    assert.match(alphaSpec, /Alpha UI requirement/);
    assert.doesNotMatch(alphaSpec, /Beta API requirement/);
    assert.match(betaSpec, /Beta API requirement/);
    assert.doesNotMatch(betaSpec, /Alpha UI requirement/);
  });

  it('re-syncs already archived changes by replacing the existing long-lived spec block', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-archive-resync-'));
    const clarified = await clarifyStage(wd, 'archive-resync');
    await writeResolvedSpec(clarified.root, 'archive-resync');
    await approveStage(wd, 'archive-resync', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'archive-resync', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'archive-resync', { from: 'plan', to: 'build' });
    await buildStage(wd, 'archive-resync', { adapter: createScriptedBuildAdapter() });
    await approveStage(wd, 'archive-resync', { from: 'build', to: 'review' });
    await reviewStage(wd, 'archive-resync', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter(),
    });
    await approveStage(wd, 'archive-resync', { from: 'review', to: 'done' });

    const first = await archiveStage(wd, 'archive-resync');
    const specPath = first.state.archived_spec_paths[0];
    await writeFile(
      join(first.state.archived_change_path, 'spec-delta.md'),
      [
        '# loopx Spec Delta: chg-archive-resync',
        '',
        '## Target Spec Domains',
        '',
        '- general',
        '',
        '## Added Requirements',
        '',
        '- Replacement requirement after archive parser repair.',
        '',
        '## Modified Requirements',
        '',
        '- none',
        '',
        '## Removed Requirements',
        '',
        '- none',
      ].join('\n'),
    );

    await archiveStage(wd, 'archive-resync');
    const specText = await readFile(specPath, 'utf8');

    assert.match(specText, /Replacement requirement after archive parser repair/);
    assert.equal((specText.match(/### Change: chg-archive-resync/g) || []).length, 1);
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

  it('keeps plan blocked when plan.md is not Chinese even if critic approves', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-plan-main-language-block-'));
    const clarified = await clarifyStage(wd, 'main-language-block');
    await writeResolvedSpec(clarified.root, 'main-language-block');
    await approveStage(wd, 'main-language-block', { from: 'clarify', to: 'plan' });

    const englishDraft = {
      principles: ['中文 docs are required, but this draft body is English.'],
      decisionDrivers: ['Keep plan gates machine checkable.'],
      options: [{ name: 'English draft', pros: ['simple'], cons: ['wrong language'] }],
      planText: '# Plan\n\n## Summary\n\nThis plan is intentionally written in English with only one 中文 token.',
      architectureText: '# 架构文档\n\n## 目标\n\n- 这个架构文档使用中文描述，并且应该通过语言检查。',
      developmentPlanText: '# 开发计划\n\n## 步骤\n\n1. 这个开发计划使用中文描述，并且应该通过语言检查。',
      testPlanText: '# 测试计划\n\n## 验证\n\n- 这个测试计划使用中文描述，并且应该通过语言检查。',
      principlesResolved: true,
      optionsReviewed: true,
      acceptanceCriteriaTestable: true,
      verificationStepsResolved: true,
      executionInputsResolved: true,
    };

    const planned = await planStage(wd, 'main-language-block', {
      adapter: {
        async planner() {
          return englishDraft;
        },
        async architect() {
          return { status: 'complete', verdict: 'approve', findings: [] };
        },
        async critic() {
          return {
            verdict: 'approve',
            findings: [],
            acceptanceCriteriaTestable: true,
            verificationStepsResolved: true,
            executionInputsResolved: true,
          };
        },
      },
    });

    assert.equal(planned.state.stage_status, 'blocked');
    assert.equal(planned.state.plan_docs_status, 'partial');
    assert.equal(planned.state.plan_blockers.includes('plan_artifact_not_chinese_plan'), true);

    await assert.rejects(
      () => approveStage(wd, 'main-language-block', { from: 'plan', to: 'build' }),
      /plan_review_gate_blocked:.*plan_artifact_not_chinese_plan/,
    );
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
    assert.match(stdout, /readiness_build: true/);
    assert.match(stdout, /authorization_build: false/);
  });

  it('status separates readiness from authorization and exposes current evidence chain', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-readiness-auth-'));
    const clarified = await clarifyStage(wd, 'readiness-auth');
    await writeResolvedSpec(clarified.root, 'readiness-auth');

    const beforeApproval = await statusSummary(wd, 'readiness-auth');
    assert.equal(beforeApproval.state.readiness.plan.ready, true);
    assert.equal(beforeApproval.state.authorization.plan.authorized, false);
    assert.equal(beforeApproval.state.current_evidence_chain.some((entry) => entry.claim === 'clarify_ready_for_plan'), true);
    assert.equal(beforeApproval.state.current_evidence_chain.some((entry) => entry.claim === 'plan_authorized'), false);

    await approveStage(wd, 'readiness-auth', { from: 'clarify', to: 'plan' });
    const afterApproval = await statusSummary(wd, 'readiness-auth');
    assert.equal(afterApproval.state.readiness.plan.ready, true);
    assert.equal(afterApproval.state.authorization.plan.authorized, true);
    assert.equal(afterApproval.state.current_evidence_chain.some((entry) => entry.claim === 'plan_authorized'), true);
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

  it('real build adapter uses independent review lanes and gates', async () => {
    const calls = [];
    const timeouts = [];
    let reviewLaneCalls = 0;
    let releaseReviewLanes;
    const reviewLaneBarrier = new Promise((resolve) => {
      releaseReviewLanes = resolve;
    });
    const adapter = createRealBuildAdapter({
      codexExecJson: async ({ outputPath, timeoutMs }) => {
        const file = outputPath.split('/').pop();
        calls.push(file);
        timeouts.push(timeoutMs);
        if (file.includes('runtime-evidence-') || file.includes('runtime-verification-')) {
          reviewLaneCalls += 1;
          if (reviewLaneCalls === 2) {
            releaseReviewLanes();
          }
          await reviewLaneBarrier;
        }
        if (file.includes('runtime-execution-')) {
          return {
            status: 'complete',
            summary: 'implementation complete',
            evidence: [{ id: 'exec-1', kind: 'diff', summary: 'code edited', ref: 'git diff' }],
            executionEvidence: ['implementation lane finished'],
            verificationEvidence: [],
            limitations: [],
          };
        }
        if (file.includes('runtime-evidence-')) {
          return {
            status: 'complete',
            summary: 'evidence complete',
            evidence: [{ id: 'evidence-1', kind: 'artifact', summary: 'artifact inspected', ref: 'execution-record.md' }],
            executionEvidence: ['evidence lane inspected artifacts'],
            verificationEvidence: [],
            limitations: [],
          };
        }
        if (file.includes('runtime-verification-')) {
          return {
            status: 'complete',
            summary: 'verification complete',
            evidence: [{ id: 'verify-1', kind: 'test', summary: 'tests passed', ref: 'npm test' }],
            executionEvidence: [],
            verificationEvidence: ['npm test passed'],
            limitations: [],
          };
        }
        if (file.includes('runtime-architect-')) {
          return {
            verdict: 'approve',
            findings: ['architect approved'],
            limitations: [],
          };
        }
        if (file.includes('runtime-deslop-')) {
          return {
            status: 'complete',
            summary: 'deslop complete',
            evidence: [{ id: 'deslop-1', kind: 'cleanup', summary: 'cleanup checked', ref: 'changed files' }],
            limitations: [],
          };
        }
        if (file.includes('runtime-regression-')) {
          return {
            status: 'complete',
            summary: 'regression complete',
            evidence: [{ id: 'regression-1', kind: 'test', summary: 'regression passed', ref: 'npm test' }],
            verificationEvidence: ['post-deslop regression passed'],
            limitations: [],
          };
        }
        throw new Error(`unexpected output path: ${outputPath}`);
      },
    });

    const result = await adapter.executeLanes({
      cwd: repoRoot,
      root: repoRoot,
      slug: 'real-build',
      iteration: 1,
      noDeslop: false,
      planArtifactPath: '.loopx/plans/prd-real-build.md',
      testSpecArtifactPath: '.loopx/plans/test-spec-real-build.md',
    });

    assert.deepEqual(result.lanes.map((lane) => lane.name), ['execution', 'evidence', 'verification']);
    assert.equal(result.verificationStatus, 'complete');
    assert.equal(result.architectVerdict, 'approve');
    assert.equal(result.deslopStatus, 'complete');
    assert.equal(result.regressionStatus, 'complete');
    assert.equal(reviewLaneCalls, 2);
    assert.equal(timeouts.every((timeoutMs) => timeoutMs === 300000), true);
    assert.deepEqual(calls, [
      'runtime-execution-iteration-1.json',
      'runtime-evidence-iteration-1.json',
      'runtime-verification-iteration-1.json',
      'runtime-architect-iteration-1.json',
      'runtime-deslop-iteration-1.json',
      'runtime-regression-iteration-1.json',
    ]);
  });

  it('real build adapter converts codex timeouts into build blockers', async () => {
    const adapter = createRealBuildAdapter({
      codexExecJson: async () => {
        throw new Error('codex_exec_failed:timeout');
      },
    });

    const result = await adapter.executeLanes({
      cwd: await mkdtemp(join(tmpdir(), 'loopx-build-timeout-')),
      root: await mkdtemp(join(tmpdir(), 'loopx-build-timeout-root-')),
      slug: 'build-timeout',
      iteration: 1,
      noDeslop: false,
      planArtifactPath: 'prd.md',
      testSpecArtifactPath: 'test.md',
      contextManifestStatus: 'hit',
      contextManifestPath: 'build-context.jsonl',
      contextManifestRows: [],
    });

    assert.equal(result.lanes.every((lane) => lane.status === 'failed'), true);
    assert.equal(result.architectVerdict, 'reject');
    assert.equal(result.deslopStatus, 'failed');
    assert.equal(result.regressionStatus, 'failed');
    assert.match(result.limitations.join('\n'), /timeout/);
  });

  it('build writes stop-gate state and allows stop only after review handoff readiness', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-build-stop-gate-'));
    const clarified = await clarifyStage(wd, 'build-stop');
    await writeResolvedSpec(clarified.root, 'build-stop');
    await approveStage(wd, 'build-stop', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'build-stop', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'build-stop', { from: 'plan', to: 'build' });

    await buildStage(wd, 'build-stop', { adapter: createScriptedBuildAdapter() });

    const state = await readBuildActiveState(wd);
    assert.equal(existsSync(buildActivePath(wd)), true);
    assert.equal(state.active, false);
    assert.equal(state.phase, 'review-ready');
    assert.equal(state.review_handoff_ready, true);
    assert.equal(state.completion_signal, 'execution-record.md is complete and build -> review handoff is ready.');
    assert.equal(evaluateBuildStopGate(state).allow, true);
  });

  it('build stops after codex infrastructure failures instead of exhausting iterations', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-build-infra-failure-'));
    const clarified = await clarifyStage(wd, 'build-infra-failure');
    await writeResolvedSpec(clarified.root, 'build-infra-failure');
    await approveStage(wd, 'build-infra-failure', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'build-infra-failure', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'build-infra-failure', { from: 'plan', to: 'build' });

    const result = await buildStage(wd, 'build-infra-failure', {
      adapter: createScriptedBuildAdapter({
        maxIterations: 10,
        iterations: [{
          lanes: [{
            name: 'execution',
            status: 'failed',
            summary: 'Codex execution failed: codex_exec_failed:timeout',
          }],
          verificationStatus: 'failed',
          architectVerdict: 'reject',
          deslopStatus: 'failed',
          regressionStatus: 'failed',
          limitations: ['codex_exec_failed:timeout'],
        }],
      }),
    });

    assert.equal(result.state.build_current_iteration, 1);
    assert.deepEqual(result.state.build_blockers, [
      'lane_incomplete_execution',
      'verification_failed',
      'architect_reject',
      'deslop_failed',
      'regression_failed',
    ]);
    const active = await readBuildActiveState(wd);
    assert.equal(active.active, false);
    assert.equal(active.phase, 'blocked');
  });

  it('stop hook blocks while build is still active', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-stop-hook-active-'));
    await mkdir(join(wd, '.loopx'), { recursive: true });
    await writeBuildActiveState(wd, {
      active: true,
      slug: 'active-build',
      phase: 'verifying',
      iteration: 2,
      max_iterations: 10,
      review_handoff_ready: false,
      blockers: ['verification_pending'],
      next_action: 'Continue $build verification and update execution-record.md.',
      completion_signal: 'Build may stop only after review handoff readiness or a real blocker is recorded.',
    });

    const decision = evaluateBuildStopGate(await readBuildActiveState(wd));
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /contract-covered next step/);
    assert.match(decision.reason, /completion signal: Build may stop only after review handoff readiness/);
    assert.match(decision.reason, /If the work is genuinely blocked, record the blocker/);
    assert.match(decision.reason, /return to plan\/clarify instead of stopping/);

    const escapedInput = JSON.stringify({ cwd: wd }).replace(/'/g, "'\\''");
    await assert.rejects(
      () => execFileAsync('/bin/sh', ['-c', `printf '%s' '${escapedInput}' | "${process.execPath}" "${stopHookScript}"`], { cwd: wd }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.allow, false);
        assert.match(parsed.reason, /loopx build is still active/);
        assert.match(parsed.reason, /verification_pending/);
        assert.match(parsed.reason, /contract-covered next step/);
        return true;
      },
    );
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

  it('CLI payload adds the archive skill command after done approval', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-archive-cli-next-'));
    const clarified = await clarifyStage(wd, 'archive-cli-next');
    await writeResolvedSpec(clarified.root, 'archive-cli-next');
    await approveStage(wd, 'archive-cli-next', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'archive-cli-next', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'archive-cli-next', { from: 'plan', to: 'build' });
    await buildStage(wd, 'archive-cli-next', {
      adapter: createScriptedBuildAdapter(),
    });
    await approveStage(wd, 'archive-cli-next', { from: 'build', to: 'review' });
    await reviewStage(wd, 'archive-cli-next', {
      reviewer: 'qa-1',
      adapter: createScriptedReviewAdapter(),
    });
    const done = await approveStage(wd, 'archive-cli-next', { from: 'review', to: 'done' });

    const payload = withNextSkill({ ok: true, command: 'approve', root: done.root, state: done.state }, done.state);
    assert.equal(payload.next_skill_command, '$archive archive-cli-next');
    assert.equal(payload.next_skill_hint, 'Next: $archive archive-cli-next');
  });

  it('does not infer review next command from empty build blockers alone', () => {
    const base = {
      slug: 'build-next-gate',
      current_stage: 'build',
      stage_status: 'awaiting-approval',
      pending_user_decision: 'none',
      review_status: 'pending-fix',
      execution_record_status: 'pending-rework',
      build_blockers: [],
    };

    assert.equal(nextSkillCommand(base), null);
    assert.equal(nextSkillCommand({
      ...base,
      pending_user_decision: 'build->review',
      review_status: 'ready-for-review',
      execution_record_status: 'complete',
    }), '$review .loopx/workflows/build-next-gate/execution-record.md');
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
