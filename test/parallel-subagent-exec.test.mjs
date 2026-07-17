import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  simulateParallelExecution,
  validateChildReviewMutation,
} from '../skills/parallel-subagent-exec/scripts/parallel-exec.mjs';
import { createInitialState } from '../skills/parallel-subagent-exec/scripts/state-lib.mjs';

function manifest({ packageMode = false, plans = null } = {}) {
  const normalizedPlans = plans || [{
    path: 'docs/loopx/plans/example.md',
    depends_on: [],
    can_run_in_parallel: true,
    tasks: [
      { task_anchor: 'T-001', depends_on: [], write_scope: ['src/a.mjs'], parallel_safe: true },
      { task_anchor: 'T-002', depends_on: [], write_scope: ['src/b.mjs'], parallel_safe: true },
      { task_anchor: 'T-003', depends_on: ['T-001'], write_scope: ['src/c.mjs'], parallel_safe: true },
    ],
  }];
  return {
    schema: 'loopx.parallel-exec-manifest.v1',
    scope: packageMode ? 'package' : 'single-plan',
    max_parallel: 4,
    input: { path: packageMode ? 'docs/loopx/plans/example/00-overview.md' : normalizedPlans[0].path, sha256: 'source-hash' },
    plans: normalizedPlans,
  };
}

function initialState(value, maxParallel = 4) {
  return createInitialState({
    runId: 'simulation-run',
    manifest: value,
    repo: {
      control_root: '/repo',
      git_common_dir: '/repo/.git',
      baseline_head: 'base',
      manifest_sha256: 'manifest-hash',
    },
    config: { effective_max_parallel: maxParallel, models: {} },
    now: '2026-07-14T00:00:00.000Z',
  });
}

function startupRoot(events) {
  return async ({ inputPath }) => {
    events.push(`startup:input:${inputPath}`);
    events.push('startup:execution-start');
    events.push('startup:finish-start');
    return {
      worktree: '/repo/.worktrees/parallel/root',
      branch: 'loopx/parallel/run/root',
      head: 'base',
      index_tree: 'tree',
      execution_start: { artifact_path: '/repo/.loopx/execution-range/run.json', requirement_start_commit: 'base' },
      finish_start: { artifact_path: '/repo/.loopx/finish/run.json', finish_baseline_commit: 'base' },
      canonical_final_review_report: '/repo/.loopx/final-review/run.md',
    };
  };
}

async function simulationOptions(value, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'parallel-controller-'));
  const events = [];
  return {
    manifest: value,
    initialState: initialState(value, overrides.maxParallel || 4),
    statePath: join(root, 'state.json'),
    runtimeCapacity: overrides.runtimeCapacity ?? 4,
    capabilities: overrides.capabilities || {
      create: true,
      observe: true,
      explicitCwd: true,
      explicitModel: true,
    },
    inputPath: value.input.path,
    inputKind: overrides.inputKind || 'strict',
    startup: overrides.startup || startupRoot(events),
    dispatch: overrides.dispatch || (async (stage) => {
      events.push(`dispatch:${stage.role}:${stage.node_id}`);
      await new Promise((resolve) => setImmediate(resolve));
      return { status: 'DONE' };
    }),
    review: overrides.review || (async (stage) => {
      events.push(`review:${stage.node_id}`);
      return { approved: true };
    }),
    integrate: overrides.integrate || (async (item) => {
      events.push(`integrate:${item.kind}:${item.node_id}`);
      return { ok: true, commit: `commit:${item.node_id}` };
    }),
    reconcile: overrides.reconcile || (async (stage) => {
      events.push(`reconcile:${stage.node_id}`);
      return { status: 'DONE' };
    }),
    childReview: overrides.childReview || (async (stage) => {
      events.push(`child-review:${stage.node_id}`);
      return { approved: true };
    }),
    finalReview: overrides.finalReview || (async () => {
      events.push('final-review');
      return { approved: true, report: '/repo/.loopx/final-review/run.md' };
    }),
    events,
  };
}

test('starts before reservation, overlaps independent tasks, waits for dependencies, and integrates deterministically', async () => {
  const value = manifest();
  const options = await simulationOptions(value);
  const result = await simulateParallelExecution(options);

  assert.equal(result.exitCode, 0);
  assert.ok(result.max_active_workers >= 2);
  const firstDispatch = result.events.findIndex((event) => event.startsWith('dispatch:'));
  assert.ok(result.events.indexOf('startup:finish-start') < firstDispatch);
  assert.ok(result.events.includes(`startup:input:${resolve(value.input.path)}`));
  assert.ok(result.events.indexOf('integrate:task:docs/loopx/plans/example.md#T-001')
    < result.events.indexOf('dispatch:implementation:docs/loopx/plans/example.md#T-003'));
  assert.deepEqual(result.integration_order.slice(0, 3), [
    'docs/loopx/plans/example.md#T-001',
    'docs/loopx/plans/example.md#T-002',
    'docs/loopx/plans/example.md#T-003',
  ]);
  assert.equal(result.review_count, 3);
});

test('hard-stops missing capability, backpressures capacity zero, and hands legacy/direct child input to subagent-exec', async () => {
  const value = manifest();
  const missing = await simulationOptions(value, {
    capabilities: { create: true, observe: false, explicitCwd: true, explicitModel: true },
  });
  const missingResult = await simulateParallelExecution(missing);
  assert.equal(missingResult.exitCode, 5);
  assert.equal(missingResult.dispatch_count, 0);
  assert.equal(missingResult.handoff, null);

  const missingCwd = await simulationOptions(value, {
    capabilities: { create: true, observe: true, explicitCwd: false, explicitModel: true },
  });
  const missingCwdResult = await simulateParallelExecution(missingCwd);
  assert.equal(missingCwdResult.exitCode, 5);
  assert.deepEqual(missingCwdResult.missing_capabilities, ['create-with-controlled-workspace']);
  assert.equal(missingCwdResult.dispatch_count, 0);
  assert.equal(missingCwdResult.handoff, null);

  const zero = await simulationOptions(value, { runtimeCapacity: 0 });
  const zeroResult = await simulateParallelExecution(zero);
  assert.equal(zeroResult.exitCode, 0);
  assert.equal(zeroResult.backpressure, true);
  assert.equal(zeroResult.dispatch_count, 0);

  for (const inputKind of ['legacy', 'direct-child']) {
    const unsupported = await simulationOptions(value, { inputKind });
    const unsupportedResult = await simulateParallelExecution(unsupported);
    assert.equal(unsupportedResult.dispatch_count, 0);
    assert.equal(unsupportedResult.handoff, `$subagent-exec ${value.input.path}`);
  }
});

test('accepts Cursor App Task with a verified workspace binding and no create cwd parameter', async () => {
  const value = manifest();
  const options = await simulationOptions(value, {
    capabilities: {
      create: true,
      observe: true,
      explicitCwd: false,
      explicitModel: true,
      verifiedWorkspace: true,
      adapter: 'cursor-app-task',
      isolationMode: 'relaxed-worktree',
    },
  });

  const result = await simulateParallelExecution(options);

  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'ready_for_finish');
  assert.ok(result.dispatch_count > 0);
  assert.ok(result.max_active_workers >= 2);
  assert.equal(result.runtime_adapter, 'cursor-app-task');
  assert.equal(result.isolation_mode, 'relaxed-worktree');
});

test('startup failure dispatches nothing and conflicts stop after two reconciliation workers', async () => {
  const value = manifest({ plans: [{
    path: 'docs/loopx/plans/conflict.md',
    depends_on: [],
    can_run_in_parallel: true,
    tasks: [{ task_anchor: 'T-001', depends_on: [], write_scope: ['src/a.mjs'], parallel_safe: true }],
  }] });
  const failedStartup = await simulationOptions(value, { startup: async () => { throw new Error('startup failed'); } });
  assert.equal((await simulateParallelExecution(failedStartup)).dispatch_count, 0);

  let taskApplyAttempts = 0;
  const conflicting = await simulationOptions(value, {
    integrate: async ({ kind }) => {
      if (kind === 'task') {
        taskApplyAttempts += 1;
        return { ok: false, conflict: true };
      }
      return { ok: true };
    },
  });
  const result = await simulateParallelExecution(conflicting);
  assert.equal(result.exitCode, 4);
  assert.equal(result.reconciliation_count, 2);
  assert.equal(taskApplyAttempts, 3);
  assert.equal(result.status, 'blocked');
});

test('replaces one failed review worker and completes the task pipeline', async () => {
  const value = manifest({ plans: [{
    path: 'docs/loopx/plans/review-retry.md',
    depends_on: [],
    can_run_in_parallel: true,
    tasks: [{ task_anchor: 'T-001', depends_on: [], write_scope: ['src/a.mjs'], parallel_safe: true }],
  }] });
  let reviewCalls = 0;
  const options = await simulationOptions(value, {
    review: async () => {
      reviewCalls += 1;
      if (reviewCalls === 1) {
        const error = new Error('review transport failed');
        error.code = 'parallel_codex_worker_failed';
        error.details = { completion_path: '/repo/.loopx/workers/review-1/completion.json' };
        throw error;
      }
      return { approved: true };
    },
  });

  const result = await simulateParallelExecution(options);

  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'ready_for_finish');
  assert.equal(reviewCalls, 2);
  assert.equal(result.integration_order.length, 1);
});

test('blocks after the replacement review worker also fails', async () => {
  const value = manifest({ plans: [{
    path: 'docs/loopx/plans/review-retry-limit.md',
    depends_on: [],
    can_run_in_parallel: true,
    tasks: [{ task_anchor: 'T-001', depends_on: [], write_scope: ['src/a.mjs'], parallel_safe: true }],
  }] });
  let reviewCalls = 0;
  const options = await simulationOptions(value, {
    review: async () => {
      reviewCalls += 1;
      const error = new Error('review transport failed');
      error.code = 'parallel_codex_worker_failed';
      throw error;
    },
  });

  const result = await simulateParallelExecution(options);

  assert.equal(result.exitCode, 4);
  assert.equal(result.status, 'blocked');
  assert.equal(reviewCalls, 2);
  assert.equal(result.integration_order.length, 0);
});

test('package child execution follows the DAG but fan-in remains overview ordered', async () => {
  const plans = ['01-a.md', '02-b.md'].map((name) => ({
    path: `docs/loopx/plans/pkg/${name}`,
    depends_on: [],
    can_run_in_parallel: true,
    tasks: [{ task_anchor: 'T-001', depends_on: [], write_scope: [`src/${name}.mjs`], parallel_safe: true }],
  }));
  const value = manifest({ packageMode: true, plans });
  const options = await simulationOptions(value);
  const result = await simulateParallelExecution(options);
  assert.equal(result.exitCode, 0);
  assert.ok(result.max_active_workers >= 2);
  assert.deepEqual(result.child_integration_order, plans.map(({ path }) => path));
  assert.equal(result.package_commit_created, false);
  assert.equal(result.final_review_count, 1);
});

test('child review mutation accepts one matching schema-v2 row and rejects sibling or canonical report writes', () => {
  const before = {
    schema_version: 2,
    plans: [
      { path: '01-a.md', status: 'in_progress', ready_for_spec_review: false, plan_review: null },
      { path: '02-b.md', status: 'pending', ready_for_spec_review: false, plan_review: null },
    ],
  };
  const after = structuredClone(before);
  after.plans[0] = {
    path: '01-a.md',
    status: 'complete',
    ready_for_spec_review: true,
    plan_review: { status: 'passed', reviewed_at: '2026-07-14T00:00:00.000Z', summary: 'clean' },
  };
  assert.equal(validateChildReviewMutation({ before, after, childPath: '01-a.md', writtenPaths: [] }).ok, true);

  const sibling = structuredClone(after);
  sibling.plans[1].status = 'complete';
  assert.throws(() => validateChildReviewMutation({ before, after: sibling, childPath: '01-a.md', writtenPaths: [] }), /sibling/);
  const packageMutation = structuredClone(after);
  packageMutation.feature_slug = 'changed';
  assert.throws(() => validateChildReviewMutation({ before, after: packageMutation, childPath: '01-a.md', writtenPaths: [] }), /package-level/);
  const reordered = structuredClone(after);
  reordered.plans.reverse();
  assert.throws(() => validateChildReviewMutation({ before, after: reordered, childPath: '01-a.md', writtenPaths: [] }), /row order/);
  const immutableMutation = structuredClone(after);
  immutableMutation.plans[0].start_commit = 'forbidden';
  assert.throws(() => validateChildReviewMutation({ before, after: immutableMutation, childPath: '01-a.md', writtenPaths: [] }), /immutable fields/);
  assert.throws(() => validateChildReviewMutation({
    before,
    after,
    childPath: '01-a.md',
    writtenPaths: ['.loopx/final-review/pkg.md'],
    canonicalReportPath: '.loopx/final-review/pkg.md',
  }), /canonical package report/);
});
