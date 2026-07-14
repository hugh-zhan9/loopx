import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialState } from '../skills/parallel-subagent-exec/scripts/state-lib.mjs';
import {
  STAGE_PRIORITIES,
  computeReadyStages,
  effectiveWorkerLimit,
  reserveNextStages,
} from '../skills/parallel-subagent-exec/scripts/scheduler-lib.mjs';

function task(anchor, { dependsOn = [], parallelSafe = true } = {}) {
  return {
    schema: 'loopx.parallel-task.v1',
    task_anchor: anchor,
    depends_on: dependsOn,
    write_scope: [`src/${anchor.toLowerCase()}.mjs`],
    parallel_safe: parallelSafe,
  };
}

function plan(path, { dependsOn = [], canRunInParallel = true, tasks }) {
  return {
    path,
    sha256: 'b'.repeat(64),
    depends_on: dependsOn,
    can_run_in_parallel: canRunInParallel,
    tasks,
  };
}

function manifest(plans = null) {
  return {
    schema: 'loopx.parallel-exec-manifest.v1',
    scope: 'package',
    input: { path: 'docs/loopx/plans/example/00-overview.md', sha256: 'a'.repeat(64) },
    max_parallel: 4,
    plans: plans || [
      plan('docs/loopx/plans/example/01-core.md', {
        tasks: [
          task('T-001'),
          task('T-002', { dependsOn: ['T-001'] }),
          task('T-003'),
        ],
      }),
      plan('docs/loopx/plans/example/02-extra.md', {
        tasks: [task('T-001')],
      }),
    ],
  };
}

function rootIntegration() {
  return {
    worktree: '/repo/.worktrees/run/root',
    branch: 'loopx/parallel/run/root',
    head: 'c'.repeat(40),
    index_tree: 'd'.repeat(40),
    execution_start: { artifact_path: '/repo/execution.json', requirement_start_commit: 'c'.repeat(40) },
    finish_start: { artifact_path: '/repo/finish.json', finish_baseline_commit: 'c'.repeat(40) },
    canonical_final_review_report: '/repo/final-review.md',
  };
}

function stateFor(inputManifest = manifest()) {
  const state = createInitialState({
    runId: 'example-run',
    manifest: inputManifest,
    repo: { control_root: '/repo', git_common_dir: '/repo/.git', baseline_head: 'c'.repeat(40), manifest_sha256: 'e'.repeat(64) },
    config: { effective_max_parallel: inputManifest.max_parallel },
    now: '2026-07-14T00:00:00.000Z',
  });
  state.status = 'running';
  state.root_integration = rootIntegration();
  return state;
}

function taskId(planPath, anchor) {
  return `${planPath}#${anchor}`;
}

test('computes the effective global worker limit', () => {
  assert.equal(effectiveWorkerLimit({ configuredLimit: 4, runtimeCapacity: 2, readyCount: 9 }), 2);
  assert.equal(effectiveWorkerLimit({ configuredLimit: 4, runtimeCapacity: null, readyCount: 3 }), 3);
  assert.equal(effectiveWorkerLimit({ configuredLimit: 4, runtimeCapacity: 0, readyCount: 3 }), 0);
});

test('requires integrated predecessors and sorts ready implementation stages deterministically', () => {
  const inputManifest = manifest();
  const state = stateFor(inputManifest);
  const result = computeReadyStages({ manifest: inputManifest, state });

  assert.deepEqual(result.stages.map(({ node_id }) => node_id), [
    taskId('docs/loopx/plans/example/01-core.md', 'T-001'),
    taskId('docs/loopx/plans/example/01-core.md', 'T-003'),
    taskId('docs/loopx/plans/example/02-extra.md', 'T-001'),
  ]);
  assert.equal(result.stages.every(({ role }) => role === 'implementation'), true);
  assert.equal(result.stages.some(({ task_anchor }) => task_anchor === 'T-002'), false);
  assert.equal(result.state_operations.some(({ type, status }) => type === 'set_task_status' && status === 'ready'), true);

  state.tasks[taskId('docs/loopx/plans/example/01-core.md', 'T-001')].status = 'integrated';
  const afterDependency = computeReadyStages({ manifest: inputManifest, state });
  assert.equal(afterDependency.stages.some(({ task_anchor }) => task_anchor === 'T-002'), true);
});

test('prioritizes reconciliation and fix before review and implementation', () => {
  const inputManifest = manifest([
    plan('docs/loopx/plans/example/01-core.md', {
      tasks: [task('T-001'), task('T-002'), task('T-003'), task('T-004')],
    }),
  ]);
  const state = stateFor(inputManifest);
  const path = inputManifest.plans[0].path;
  state.tasks[taskId(path, 'T-001')].status = 'ready';
  state.tasks[taskId(path, 'T-002')].status = 'awaiting_review';
  state.tasks[taskId(path, 'T-003')].status = 'needs_fix';
  state.tasks[taskId(path, 'T-004')].status = 'reconciling';

  const result = computeReadyStages({ manifest: inputManifest, state });

  assert.deepEqual(STAGE_PRIORITIES, {
    reconciliation: 0,
    fix: 0,
    task_review: 1,
    plan_review: 1,
    implementation: 2,
  });
  assert.deepEqual(result.stages.map(({ role }) => role), [
    'fix', 'reconciliation', 'task_review', 'implementation',
  ]);
});

test('reserves within the global limit without mutating the snapshot', () => {
  const inputManifest = manifest();
  const state = stateFor(inputManifest);
  const before = structuredClone(state);

  const result = reserveNextStages({ manifest: inputManifest, state, runtimeCapacity: 2 });

  assert.equal(result.effective_limit, 2);
  assert.equal(result.available_slots, 2);
  assert.equal(result.reservations.length, 2);
  assert.equal(result.state_operations.length > 0, true);
  assert.equal(result.state_operations.every(({ type }) => type === 'batch'), true);
  assert.deepEqual(state, before);
});

test('turns zero runtime capacity into backpressure without attempts', () => {
  const inputManifest = manifest();
  const state = stateFor(inputManifest);
  const attempts = Object.fromEntries(Object.entries(state.tasks).map(([id, value]) => [id, value.attempts]));

  const result = reserveNextStages({ manifest: inputManifest, state, runtimeCapacity: 0 });

  assert.equal(result.reservations.length, 0);
  assert.equal(result.capacity_wait.length, 3);
  assert.deepEqual(Object.fromEntries(Object.entries(state.tasks).map(([id, value]) => [id, value.attempts])), attempts);
});

test('honors task and package exclusive barriers', () => {
  const firstPath = 'docs/loopx/plans/example/01-core.md';
  const secondPath = 'docs/loopx/plans/example/02-exclusive.md';
  const inputManifest = manifest([
    plan(firstPath, { tasks: [task('T-001'), task('T-002', { parallelSafe: false })] }),
    plan(secondPath, { canRunInParallel: false, tasks: [task('T-001')] }),
  ]);
  const state = stateFor(inputManifest);
  state.tasks[taskId(firstPath, 'T-001')].status = 'implementing';
  state.active_workers.active = { role: 'implementation', node: taskId(firstPath, 'T-001'), status: 'running' };

  let result = computeReadyStages({ manifest: inputManifest, state });
  assert.equal(result.stages.some(({ node_id }) => node_id === taskId(firstPath, 'T-002')), false);
  assert.equal(result.stages.some(({ plan_path }) => plan_path === secondPath), false);

  state.tasks[taskId(firstPath, 'T-001')].status = 'integrated';
  state.active_workers = {};
  result = reserveNextStages({ manifest: inputManifest, state, runtimeCapacity: 4 });
  assert.equal(result.reservations.some(({ node_id }) => node_id === taskId(firstPath, 'T-002')), true);
  assert.equal(result.reservations.some(({ plan_path }) => plan_path === secondPath), false);
});

test('allows parallel tasks inside an otherwise package-exclusive child', () => {
  const exclusivePath = 'docs/loopx/plans/example/01-exclusive.md';
  const inputManifest = manifest([
    plan(exclusivePath, {
      canRunInParallel: false,
      tasks: [task('T-001'), task('T-002')],
    }),
    plan('docs/loopx/plans/example/02-other.md', { tasks: [task('T-001')] }),
  ]);
  const state = stateFor(inputManifest);

  const result = reserveNextStages({ manifest: inputManifest, state, runtimeCapacity: 4 });

  assert.deepEqual(result.reservations.map(({ node_id }) => node_id), [
    taskId(exclusivePath, 'T-001'),
    taskId(exclusivePath, 'T-002'),
  ]);
});

test('requires predecessor child integration before scheduling a dependent child', () => {
  const firstPath = 'docs/loopx/plans/example/01-core.md';
  const secondPath = 'docs/loopx/plans/example/02-extra.md';
  const inputManifest = manifest([
    plan(firstPath, { tasks: [task('T-001')] }),
    plan(secondPath, { dependsOn: [firstPath], tasks: [task('T-001')] }),
  ]);
  const state = stateFor(inputManifest);

  let result = computeReadyStages({ manifest: inputManifest, state });
  assert.equal(result.stages.some(({ plan_path }) => plan_path === secondPath), false);

  state.children[firstPath].status = 'integrated';
  state.tasks[taskId(firstPath, 'T-001')].status = 'integrated';
  result = computeReadyStages({ manifest: inputManifest, state });
  assert.equal(result.stages.some(({ plan_path }) => plan_path === secondPath), true);
});

test('blocks a twice-failed reconciliation path but keeps independent work ready', () => {
  const inputManifest = manifest();
  const state = stateFor(inputManifest);
  const firstPath = inputManifest.plans[0].path;
  const failedId = taskId(firstPath, 'T-001');
  const dependentId = taskId(firstPath, 'T-002');
  const independentId = taskId(firstPath, 'T-003');
  state.tasks[failedId].status = 'reconciling';
  state.tasks[failedId].reconciliation_attempts = 2;

  const result = computeReadyStages({ manifest: inputManifest, state });

  assert.equal(result.stages.some(({ node_id }) => node_id === failedId), false);
  assert.equal(result.stages.some(({ node_id }) => node_id === dependentId), false);
  assert.equal(result.stages.some(({ node_id }) => node_id === independentId), true);
  assert.equal(result.state_operations.some(({ type, task_id, status }) => type === 'set_task_status' && task_id === failedId && status === 'blocked'), true);
  assert.equal(result.state_operations.some(({ type, task_id, status }) => type === 'set_task_status' && task_id === dependentId && status === 'blocked'), true);
});
