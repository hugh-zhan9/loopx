import assert from 'node:assert/strict';
import test from 'node:test';

import { validateExecutionGraph } from '../skills/exec/scripts/execution-graph.mjs';
import { computeReadyStages, reserveNextStages } from '../skills/exec/scripts/scheduler.mjs';

function task(id, dependsOn = [], overrides = {}) {
  return {
    id,
    outcome: `Deliver ${id}`,
    depends_on: dependsOn,
    write_scope: [`src/${id}.mjs`],
    relevant_paths: [`test/${id}.test.mjs`],
    exclusive_resources: [],
    parallel_safe: true,
    parallel_rationale: 'Independent task-local change.',
    interfaces: { consumes: [], produces: [`result:${id}`] },
    source_anchors: [`AC-${id}`],
    acceptance: [`${id} is observable.`],
    verification: [`verify ${id}`],
    expected_evidence: [`${id} verification passes.`],
    review_focus: [`Review ${id}.`],
    ...overrides,
  };
}

function manifest(tasks, maxParallel = 4) {
  return validateExecutionGraph({
    schema: 'loopx.execution-graph.v1',
    selected_profile: 'parallel-strict-v1',
    selection_rationale: 'Scheduler test graph.',
    max_parallel: maxParallel,
    tasks,
  });
}

function stateFor(graph, overrides = {}) {
  return {
    revision: 0,
    active_workers: {},
    tasks: Object.fromEntries(graph.tasks.map((item) => [item.id, { status: 'pending', attempts: 0 }])),
    ...overrides,
  };
}

test('diamond dependencies block only descendants and unlock after both parents integrate', () => {
  const graph = manifest([
    task('A'),
    task('B'),
    task('C', ['A', 'B']),
  ]);
  const initial = computeReadyStages({ manifest: graph, state: stateFor(graph) });

  assert.deepEqual(initial.ready.map((stage) => stage.task_id), ['A', 'B']);

  const completedParents = stateFor(graph, {
    tasks: {
      A: { status: 'integrated', attempts: 1 },
      B: { status: 'integrated', attempts: 1 },
      C: { status: 'pending', attempts: 0 },
    },
  });
  const next = computeReadyStages({ manifest: graph, state: completedParents });

  assert.deepEqual(next.ready.map((stage) => stage.task_id), ['C']);
});

test('keeps unordered path and exclusive-resource conflicts out of the same ready frontier', () => {
  const graph = manifest([
    task('A', [], { write_scope: ['src/shared'] }),
    task('B', [], { relevant_paths: ['src/shared/input.mjs'] }),
    task('C', [], {
      exclusive_resources: [{ kind: 'generator', key: 'client', reason: 'shared generator' }],
    }),
    task('D', [], {
      exclusive_resources: [{ kind: 'generator', key: 'client', reason: 'shared generator' }],
    }),
  ]);

  const first = computeReadyStages({ manifest: graph, state: stateFor(graph) });
  assert.deepEqual(first.ready.map((stage) => stage.task_id), ['A', 'C']);

  const withOwners = stateFor(graph, {
    active_workers: {
      workerA: { task_id: 'A', role: 'implementation' },
      workerC: { task_id: 'C', role: 'implementation' },
    },
    tasks: {
      A: { status: 'implementing', attempts: 1 },
      B: { status: 'pending', attempts: 0 },
      C: { status: 'implementing', attempts: 1 },
      D: { status: 'pending', attempts: 0 },
    },
  });
  assert.deepEqual(computeReadyStages({ manifest: graph, state: withOwners }).ready, []);

  const completedOwners = stateFor(graph, {
    tasks: {
      A: { status: 'integrated', attempts: 1 },
      B: { status: 'pending', attempts: 0 },
      C: { status: 'integrated', attempts: 1 },
      D: { status: 'pending', attempts: 0 },
    },
  });
  assert.deepEqual(
    computeReadyStages({ manifest: graph, state: completedOwners }).ready.map((stage) => stage.task_id),
    ['B', 'D'],
  );
});

test('shares the worker budget and reserves fix then review before implementation', () => {
  const graph = manifest([task('A'), task('B'), task('C')], 2);
  const state = stateFor(graph, {
    revision: 8,
    tasks: {
      A: { status: 'pending', attempts: 0 },
      B: { status: 'awaiting_review', attempts: 1 },
      C: { status: 'needs_fix', attempts: 1 },
    },
  });

  const decision = reserveNextStages({ manifest: graph, state, runtimeCapacity: 3 });

  assert.equal(decision.effective_limit, 2);
  assert.deepEqual(
    decision.reservations.map(({ task_id, role }) => ({ task_id, role })),
    [
      { task_id: 'C', role: 'fix' },
      { task_id: 'B', role: 'review' },
    ],
  );
  assert.equal(decision.state_operations.filter((operation) => operation.type === 'reserve_worker').length, 2);
  assert.equal(state.tasks.C.status, 'needs_fix', 'scheduler remains pure');
  assert.equal(state.tasks.C.attempts, 1, 'reservation does not mutate attempts');
});

test('reports capacity-zero backpressure without reserving workers or incrementing attempts', () => {
  const graph = manifest([task('A')]);
  const state = stateFor(graph);

  const decision = reserveNextStages({ manifest: graph, state, runtimeCapacity: 0 });

  assert.equal(decision.effective_limit, 0);
  assert.deepEqual(decision.reservations, []);
  assert.deepEqual(decision.capacity_wait, [{
    task_id: 'A',
    role: 'implementation',
    attempts_incremented: false,
  }]);
  assert.equal(decision.state_operations.some((operation) => operation.type === 'reserve_worker'), false);
  assert.equal(state.tasks.A.attempts, 0);
});

test('propagates a blocked dependency only to its descendants', () => {
  const graph = manifest([
    task('A'),
    task('B', ['A']),
    task('C'),
    task('D', ['B']),
  ]);
  const state = stateFor(graph, {
    tasks: {
      A: { status: 'blocked', attempts: 1 },
      B: { status: 'pending', attempts: 0 },
      C: { status: 'pending', attempts: 0 },
      D: { status: 'pending', attempts: 0 },
    },
  });

  const decision = computeReadyStages({ manifest: graph, state });

  assert.deepEqual(decision.ready.map((stage) => stage.task_id), ['C']);
  assert.deepEqual(
    decision.state_operations.filter((operation) => operation.status === 'blocked'),
    [
      { type: 'set_task_status', task_id: 'B', status: 'blocked' },
      { type: 'set_task_status', task_id: 'D', status: 'blocked' },
    ],
  );
});

test('normalizes persisted array task state and role-specific attempt counters', () => {
  const graph = manifest([task('A')]);
  const state = {
    revision: 3,
    active_workers: {},
    tasks: [{
      id: 'A',
      status: 'needs_fix',
      attempts: { implementation: 1, review: 1, fix: 2 },
    }],
  };

  const decision = reserveNextStages({ manifest: graph, state, runtimeCapacity: 1 });
  const workerOperation = decision.state_operations.find((operation) => operation.type === 'reserve_worker');

  assert.equal(decision.reservations[0].role, 'fix');
  assert.equal(workerOperation.worker.dispatch_attempt, 3);
  assert.equal(state.tasks[0].status, 'needs_fix', 'array-shaped persisted state is not mutated');
});

test('does not let one highly conflicting task hide a wider compatible frontier', () => {
  const graph = manifest([
    task('A', [], { write_scope: ['src/shared'] }),
    task('B', [], { relevant_paths: ['src/shared/b.mjs'], write_scope: ['src/b.mjs'] }),
    task('C', [], { relevant_paths: ['src/shared/c.mjs'], write_scope: ['src/c.mjs'] }),
  ]);

  const decision = computeReadyStages({ manifest: graph, state: stateFor(graph) });

  assert.deepEqual(decision.ready.map((stage) => stage.task_id), ['B', 'C']);
});
