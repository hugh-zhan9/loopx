import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runAdaptiveExecution,
  selectAdaptiveExecution,
} from '../skills/exec/scripts/adaptive-exec.mjs';

function task(id, { dependsOn = [], path = `src/${id}.mjs` } = {}) {
  return {
    id,
    outcome: `Deliver ${id}`,
    depends_on: dependsOn,
    write_scope: [path],
    relevant_paths: [],
    exclusive_resources: [],
    parallel_safe: true,
    parallel_rationale: 'Independent task-local change.',
    interfaces: { consumes: [], produces: [`result:${id}`] },
    source_anchors: [`AC-${id}`],
    acceptance: [`${id} is observable.`],
    verification: [`verify ${id}`],
    expected_evidence: [`${id} verification passes.`],
    review_focus: [`Review ${id}.`],
    coupling: {
      decisions: [],
      verification: [],
      baseline_inputs: [],
      integration_outcomes: [],
    },
  };
}

const capableRuntime = {
  worker_capacity: 4,
  task_worktree_binding: true,
  reviewer_binding: true,
};

test('keeps a small prompt-first outcome inline', () => {
  const selected = selectAdaptiveExecution({
    outcomes: [task('small')],
    planned: false,
    runtimeCapability: capableRuntime,
  });

  assert.equal(selected.profile, 'inline-owned-v1');
  assert.equal(selected.kind, 'serial');
  assert.equal(selected.review_required, false);
});

test('routes planned linear work to reviewed delegated serial execution', () => {
  const selected = selectAdaptiveExecution({
    outcomes: [task('schema'), task('client', { dependsOn: ['schema'] })],
    planned: true,
    runtimeCapability: capableRuntime,
  });

  assert.equal(selected.profile, 'delegated-serial-v1');
  assert.equal(selected.kind, 'serial');
  assert.equal(selected.execution_owner, 'leaf-worker');
  assert.equal(selected.review_required, true);
});

test('selects parallel strict for a graph with a safe ready frontier', () => {
  const outcomes = [
    task('api'),
    task('docs'),
    task('integration', { dependsOn: ['api', 'docs'] }),
  ];
  const selected = selectAdaptiveExecution({
    outcomes,
    planned: true,
    runtimeCapability: capableRuntime,
  });

  assert.equal(selected.profile, 'parallel-strict-v1');
  assert.equal(selected.kind, 'concurrent');
  assert.equal(selected.worker_limit, 3);
  assert.equal(selected.review_required, true);
});

test('treats temporary capacity as backpressure without changing the structural profile', () => {
  const selected = selectAdaptiveExecution({
    outcomes: [task('api'), task('docs')],
    planned: true,
    runtimeCapability: { ...capableRuntime, worker_capacity: 1 },
  });

  assert.equal(selected.profile, 'parallel-strict-v1');
  assert.equal(selected.kind, 'concurrent');
  assert.equal(selected.worker_limit, 1);
  assert.match(selected.reason, /backpressure|capacity/i);
});

test('narrows parallel work to delegated serial when isolation is structurally unavailable', () => {
  const selected = selectAdaptiveExecution({
    outcomes: [task('api'), task('docs')],
    planned: true,
    runtimeCapability: { ...capableRuntime, task_worktree_binding: false },
  });

  assert.equal(selected.profile, 'delegated-serial-v1');
  assert.equal(selected.review_required, true);
  assert.match(selected.reason, /isolation|worktree/i);
});

test('compiles legacy plans without graph evidence conservatively to delegated serial', () => {
  const legacy = task('legacy');
  delete legacy.depends_on;
  const selected = selectAdaptiveExecution({
    outcomes: [legacy],
    planned: true,
    runtimeCapability: capableRuntime,
  });

  assert.equal(selected.profile, 'delegated-serial-v1');
  assert.equal(selected.review_required, true);
  assert.match(selected.reason, /legacy|dependency declaration|evidence/i);
});

test('uses a current plan graph profile as the structural authority', () => {
  const outcomes = [task('api'), task('docs')];
  const selected = selectAdaptiveExecution({
    outcomes,
    executionGraph: {
      schema: 'loopx.execution-graph.v1',
      selected_profile: 'delegated-serial-v1',
      selection_rationale: 'The approved plan keeps these tasks serial.',
      max_parallel: 4,
      tasks: outcomes,
    },
    planned: true,
    runtimeCapability: capableRuntime,
  });

  assert.equal(selected.profile, 'delegated-serial-v1');
  assert.match(selected.reason, /authoritative plan graph/i);

  const cannotBroaden = selectAdaptiveExecution({
    outcomes,
    executionGraph: {
      schema: 'loopx.execution-graph.v1',
      selected_profile: 'delegated-serial-v1',
      selection_rationale: 'The approved plan keeps these tasks serial.',
      max_parallel: 4,
      tasks: outcomes,
    },
    planned: true,
    requestedProfile: 'parallel-strict-v1',
    runtimeCapability: capableRuntime,
  });
  assert.equal(cannotBroaden.profile, 'delegated-serial-v1');
});

test('reports capacity-zero backpressure without admitting a worker', () => {
  const selected = selectAdaptiveExecution({
    outcomes: [task('api'), task('docs')],
    planned: true,
    runtimeCapability: { ...capableRuntime, worker_capacity: 0 },
  });
  assert.equal(selected.profile, 'parallel-strict-v1');
  assert.equal(selected.worker_limit, 0);
  assert.match(selected.reason, /backpressure/i);
});

test('reports capacity-zero backpressure for every delegated route', () => {
  const coupled = [task('trace'), task('fix')];
  coupled[1].coupling.decisions = ['continues the same debugging hypothesis'];
  const fixtures = [
    {
      label: 'linear',
      outcomes: [task('schema'), task('client', { dependsOn: ['schema'] })],
    },
    {
      label: 'coupled',
      outcomes: coupled,
    },
    {
      label: 'explicit delegated',
      outcomes: [task('api'), task('docs')],
      requestedProfile: 'delegated-serial-v1',
    },
  ];

  for (const fixture of fixtures) {
    const selected = selectAdaptiveExecution({
      outcomes: fixture.outcomes,
      planned: true,
      requestedProfile: fixture.requestedProfile,
      runtimeCapability: { ...capableRuntime, worker_capacity: 0 },
    });
    assert.equal(selected.profile, 'delegated-serial-v1', fixture.label);
    assert.equal(selected.worker_limit, 0, fixture.label);
    assert.equal(selected.backpressure, true, fixture.label);
    assert.match(selected.reason, /backpressure/i, fixture.label);
  }
});

test('does not dispatch a capacity-zero delegated execution', async () => {
  let dispatches = 0;
  const result = await runAdaptiveExecution({
    cwd: process.cwd(),
    runId: 'capacity-zero-delegated',
    outcomes: [task('schema'), task('client', { dependsOn: ['schema'] })],
    planned: true,
    runtimeCapability: { ...capableRuntime, worker_capacity: 0 },
    dispatchWorker: async () => {
      dispatches += 1;
      throw new Error('capacity-zero delegated work must not dispatch');
    },
  });

  assert.equal(result.profile, 'delegated-serial-v1');
  assert.equal(result.worker_limit, 0);
  assert.equal(result.backpressure, true);
  assert.equal(result.dispatched, 0);
  assert.equal(dispatches, 0);
});

test('fails closed on an invalid supplied graph and honors a valid graph concurrency cap', () => {
  const outcomes = [task('api'), task('docs')];
  const invalid = {
    schema: 'loopx.execution-graph.v1',
    selected_profile: 'parallel-strict-v1',
    selection_rationale: 'Invalid duplicate graph.',
    max_parallel: 4,
    tasks: [outcomes[0], outcomes[0]],
  };
  const blocked = selectAdaptiveExecution({
    outcomes,
    executionGraph: invalid,
    planned: true,
    runtimeCapability: capableRuntime,
  });
  assert.equal(blocked.profile, 'delegated-serial-v1');
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.graph, undefined);
  assert.match(blocked.reason, /invalid supplied execution graph.*blocked/i);

  const mismatched = selectAdaptiveExecution({
    outcomes,
    executionGraph: {
      schema: 'loopx.execution-graph.v1',
      selected_profile: 'delegated-serial-v1',
      selection_rationale: 'Graph references the wrong task.',
      max_parallel: 1,
      tasks: [task('other')],
    },
    planned: true,
    runtimeCapability: capableRuntime,
  });
  assert.equal(mismatched.blocked, true);
  assert.match(mismatched.reason, /one-to-one.*blocked/i);

  const capped = selectAdaptiveExecution({
    outcomes,
    executionGraph: {
      schema: 'loopx.execution-graph.v1',
      selected_profile: 'parallel-strict-v1',
      selection_rationale: 'Parallel-safe, capped by the approved plan.',
      max_parallel: 1,
      tasks: outcomes,
    },
    planned: true,
    runtimeCapability: capableRuntime,
  });
  assert.equal(capped.profile, 'parallel-strict-v1');
  assert.equal(capped.worker_limit, 1);
});
