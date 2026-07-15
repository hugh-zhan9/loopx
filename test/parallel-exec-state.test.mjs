import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CHILD_STATUSES,
  PARALLEL_STATE_SCHEMA,
  RUN_STATUSES,
  TASK_STATUSES,
  createInitialState,
  createRunId,
  readRunState,
  transitionRunState,
  verifyRunIdentity,
  writeCompletionState,
} from '../skills/parallel-subagent-exec/scripts/state-lib.mjs';

const NOW = '2026-07-14T00:00:00.000Z';

function manifest() {
  return {
    schema: 'loopx.parallel-exec-manifest.v1',
    scope: 'package',
    input: {
      path: 'docs/loopx/plans/example/00-overview.md',
      sha256: 'a'.repeat(64),
    },
    max_parallel: 4,
    plans: [
      {
        path: 'docs/loopx/plans/example/01-core.md',
        sha256: 'b'.repeat(64),
        depends_on: [],
        can_run_in_parallel: true,
        tasks: [
          {
            schema: 'loopx.parallel-task.v1',
            task_anchor: 'T-001',
            depends_on: [],
            write_scope: ['src/core.mjs'],
            parallel_safe: true,
          },
          {
            schema: 'loopx.parallel-task.v1',
            task_anchor: 'T-002',
            depends_on: ['T-001'],
            write_scope: ['test/core.test.mjs'],
            parallel_safe: true,
          },
        ],
      },
    ],
  };
}

function repoIdentity() {
  return {
    control_root: '/repo',
    git_common_dir: '/repo/.git',
    baseline_head: 'c'.repeat(40),
    manifest_sha256: 'd'.repeat(64),
  };
}

function config() {
  return {
    declared_max_parallel: 4,
    override_max_parallel: null,
    effective_max_parallel: 4,
    platform: 'test',
    models: { implementation: 'test-model' },
  };
}

function rootIntegration() {
  return {
    worktree: '/repo/.worktrees/parallel-subagent-exec/run/root',
    branch: 'loopx/parallel/run/root',
    head: 'c'.repeat(40),
    index_tree: 'e'.repeat(40),
    execution_start: {
      artifact_path: '/repo/.loopx/execution-ranges/example.json',
      requirement_start_commit: 'c'.repeat(40),
    },
    finish_start: {
      artifact_path: '/repo/.loopx/finish/baselines/example.json',
      finish_baseline_commit: 'c'.repeat(40),
    },
    canonical_final_review_report: '/repo/.loopx/final-review/example.md',
  };
}

function initialState() {
  return createInitialState({
    runId: createRunId({
      sourceSlug: 'example',
      baselineCommit: 'c'.repeat(40),
      sourceSha256: 'a'.repeat(64),
    }),
    manifest: manifest(),
    repo: repoIdentity(),
    config: config(),
    now: NOW,
  });
}

async function workspace() {
  const runRoot = await mkdtemp(join(tmpdir(), 'loopx-parallel-state-'));
  return { runRoot, statePath: join(runRoot, 'state.json') };
}

async function initialize(statePath, state = initialState()) {
  return transitionRunState({
    statePath,
    expectedRevision: 0,
    operation: { type: 'initialize', state },
    now: NOW,
  });
}

test('creates deterministic initial state from the immutable manifest', () => {
  assert.equal(createRunId({
    sourceSlug: 'example',
    baselineCommit: '1234567890abcdef',
    sourceSha256: 'fedcba9876543210',
  }), 'example-1234567890ab-fedcba98');
  assert.deepEqual(RUN_STATUSES, [
    'initializing', 'running', 'blocked', 'reviewing', 'ready_for_finish', 'complete', 'interrupted',
  ]);
  assert.equal(TASK_STATUSES.includes('capacity_wait'), true);
  assert.equal(TASK_STATUSES.includes('reconciling'), true);
  assert.equal(CHILD_STATUSES.includes('rebuilding'), true);

  const state = initialState();
  const taskIds = Object.keys(state.tasks);
  assert.equal(state.schema, PARALLEL_STATE_SCHEMA);
  assert.equal(state.revision, 1);
  assert.equal(state.run_id, `example-${'c'.repeat(12)}-${'a'.repeat(8)}`);
  assert.deepEqual(taskIds, [
    'docs/loopx/plans/example/01-core.md#T-001',
    'docs/loopx/plans/example/01-core.md#T-002',
  ]);
  assert.deepEqual(state.tasks[taskIds[1]].depends_on, [taskIds[0]]);
  assert.deepEqual(Object.keys(state.children), ['docs/loopx/plans/example/01-core.md']);
  assert.equal(state.root_integration, null);
});

test('initialization writes mode 0600 state and a local star gitignore', async () => {
  const { runRoot, statePath } = await workspace();
  const state = await initialize(statePath);

  assert.equal(state.revision, 1);
  if (process.platform !== 'win32') assert.equal((await stat(statePath)).mode & 0o777, 0o600);
  assert.equal(await readFile(join(runRoot, '.gitignore'), 'utf8'), '*\n');
  assert.deepEqual(await readRunState(statePath), state);
});

test('enforces legal run task and child transitions plus startup reservation gate', async () => {
  const { statePath } = await workspace();
  await initialize(statePath);
  const taskId = 'docs/loopx/plans/example/01-core.md#T-001';
  const childId = 'docs/loopx/plans/example/01-core.md';

  let state = await transitionRunState({
    statePath,
    expectedRevision: 1,
    operation: { type: 'set_task_status', task_id: taskId, status: 'ready' },
    now: NOW,
  });
  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: state.revision,
      operation: { type: 'set_task_status', task_id: taskId, status: 'dispatch_reserved' },
      now: NOW,
    }),
    (error) => error.code === 'parallel_startup_incomplete',
  );

  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'set_root_integration', value: rootIntegration() },
    now: NOW,
  });
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'set_task_status', task_id: taskId, status: 'dispatch_reserved' },
    now: NOW,
  });
  assert.equal(state.tasks[taskId].status, 'dispatch_reserved');

  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'set_child_status', child_id: childId, status: 'ready' },
    now: NOW,
  });
  assert.equal(state.children[childId].status, 'ready');

  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: state.revision,
      operation: { type: 'set_run_status', status: 'complete' },
      now: NOW,
    }),
    (error) => error.code === 'parallel_state_transition_invalid',
  );
});

test('rejects stale revisions and serializes concurrent CAS writers', async () => {
  const { statePath } = await workspace();
  await initialize(statePath);

  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: 0,
      operation: { type: 'set_run_status', status: 'running' },
      now: NOW,
    }),
    (error) => error.code === 'state_revision_conflict',
  );

  const attempts = await Promise.allSettled([
    transitionRunState({
      statePath,
      expectedRevision: 1,
      operation: { type: 'set_run_status', status: 'running' },
      now: NOW,
    }),
    transitionRunState({
      statePath,
      expectedRevision: 1,
      operation: { type: 'set_run_status', status: 'blocked' },
      now: NOW,
    }),
  ]);
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal((await readRunState(statePath)).revision, 2);
});

test('reports every resume identity mismatch without mutating state', () => {
  const state = initialState();
  Object.assign(state.config, {
    runtime_adapter: 'cursor-app-task',
    isolation_mode: 'relaxed-worktree',
    capability_artifact: '/repo/.loopx/parallel-subagent-exec/capabilities.json',
    capability_sha256: '2'.repeat(64),
    skill_source_sha256: '3'.repeat(64),
    workspace_root: '/repo',
  });
  state.root_integration = rootIntegration();
  state.active_workers.worker1 = {
    role: 'implementation',
    agent_id: 'agent-1',
    model: 'test-model',
    node: 'docs/loopx/plans/example/01-core.md#T-001',
    dispatch_attempt: 1,
    status: 'running',
    runtime: 'codex',
    process_id: null,
    supervisor_pid: null,
    cwd: '/repo/.worktrees/worker1',
    requested_model: 'test-model',
    report_path: '/repo/.loopx/reports/worker1.md',
    started_at: NOW,
  };
  const before = structuredClone(state);
  const observed = structuredClone(state);
  observed.input.sha256 = 'f'.repeat(64);
  observed.repo.baseline_head = '0'.repeat(40);
  observed.config.runtime_adapter = 'cursor';
  observed.config.capability_sha256 = '4'.repeat(64);
  observed.root_integration.head = '1'.repeat(40);
  observed.active_workers.worker1.agent_id = 'agent-2';

  const result = verifyRunIdentity({ state, observed });

  assert.equal(result.ok, false);
  assert.deepEqual(result.mismatches.map(({ field }) => field), [
    'input.sha256',
    'repo.baseline_head',
    'config.runtime_adapter',
    'config.capability_sha256',
    'root_integration.head',
    'active_workers.worker1.agent_id',
  ]);
  assert.deepEqual(state, before);
});

test('rejects Cursor App state without complete capability identity', () => {
  assert.throws(
    () => createInitialState({
      runId: 'cursor-app-incomplete',
      manifest: manifest(),
      repo: repoIdentity(),
      config: { ...config(), runtime_adapter: 'cursor-app-task' },
      now: NOW,
    }),
    (error) => error.code === 'parallel_state_invalid',
  );
});

test('persists native worker identity after a reserved Cursor worker starts', async () => {
  const { statePath } = await workspace();
  let state = await initialize(statePath);
  const taskId = 'docs/loopx/plans/example/01-core.md#T-001';
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'set_root_integration', value: rootIntegration() },
    now: NOW,
  });
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: {
      type: 'reserve_worker',
      worker_id: 'cursor-worker-1',
      worker: {
        role: 'implementation',
        agent_id: null,
        model: 'test-model',
        node: taskId,
        dispatch_attempt: 1,
        status: 'reserved',
      },
    },
    now: NOW,
  });

  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: {
      type: 'set_worker_runtime',
      worker_id: 'cursor-worker-1',
      agent_id: 'cursor-chat-1',
      model: 'Cursor Test Model',
      status: 'running',
      runtime: 'cursor',
      process_id: 1234,
      supervisor_pid: 4321,
      cwd: '/repo/.worktrees/parallel-subagent-exec/run/T-001',
      requested_model: 'test-model',
      report_path: '/repo/.loopx/reports/T-001.md',
      started_at: NOW,
      operation_path: '/repo/.loopx/workers/cursor-worker-1/operation.json',
      operation_digest: 'a'.repeat(64),
      supervisor_token: '12345678-1234-4234-8234-123456789abc',
      heartbeat_path: '/repo/.loopx/workers/cursor-worker-1/heartbeat.json',
    },
    now: NOW,
  });

  assert.deepEqual(state.active_workers['cursor-worker-1'], {
    role: 'implementation',
    agent_id: 'cursor-chat-1',
    model: 'Cursor Test Model',
    node: taskId,
    dispatch_attempt: 1,
    status: 'running',
    runtime: 'cursor',
    process_id: 1234,
    supervisor_pid: 4321,
    cwd: '/repo/.worktrees/parallel-subagent-exec/run/T-001',
    requested_model: 'test-model',
    report_path: '/repo/.loopx/reports/T-001.md',
    started_at: NOW,
    operation_path: '/repo/.loopx/workers/cursor-worker-1/operation.json',
    operation_digest: 'a'.repeat(64),
    supervisor_token: '12345678-1234-4234-8234-123456789abc',
    heartbeat_path: '/repo/.loopx/workers/cursor-worker-1/heartbeat.json',
  });
});

test('does not replace an attached Cursor runtime identity', async () => {
  const { statePath } = await workspace();
  let state = await initialize(statePath);
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'set_root_integration', value: rootIntegration() },
    now: NOW,
  });
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: {
      type: 'reserve_worker',
      worker_id: 'cursor-worker-identity',
      worker: {
        role: 'implementation',
        agent_id: null,
        model: 'test-model',
        node: 'docs/loopx/plans/example/01-core.md#T-001',
        dispatch_attempt: 1,
        status: 'reserved',
      },
    },
    now: NOW,
  });
  const runtime = {
    type: 'set_worker_runtime',
    worker_id: 'cursor-worker-identity',
    agent_id: 'cursor-chat-identity',
    model: 'Cursor Test Model',
    status: 'running',
    runtime: 'cursor',
    process_id: 1234,
    supervisor_pid: 4321,
    cwd: '/repo/.worktrees/cursor-worker-identity',
    requested_model: 'test-model',
    report_path: '/repo/.loopx/reports/cursor-worker-identity.md',
    started_at: NOW,
    operation_path: '/repo/.loopx/workers/cursor-worker-identity/operation.json',
    operation_digest: 'b'.repeat(64),
    supervisor_token: '87654321-4321-4321-8321-cba987654321',
    heartbeat_path: '/repo/.loopx/workers/cursor-worker-identity/heartbeat.json',
  };
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: runtime,
    now: NOW,
  });
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: runtime,
    now: NOW,
  });
  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: state.revision,
      operation: { ...runtime, supervisor_pid: 9999 },
      now: NOW,
    }),
    (error) => error.code === 'parallel_worker_reservation_invalid',
  );
});

test('attaches a Cursor App Task with workspace evidence and no CLI process identity', async () => {
  const { statePath } = await workspace();
  let state = await initialize(statePath);
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'set_root_integration', value: rootIntegration() },
    now: NOW,
  });
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: {
      type: 'reserve_worker',
      worker_id: 'cursor-app-worker-1',
      worker: {
        role: 'implementation',
        agent_id: null,
        model: 'test-model',
        node: 'docs/loopx/plans/example/01-core.md#T-001',
        dispatch_attempt: 1,
        status: 'reserved',
      },
    },
    now: NOW,
  });

  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: {
      type: 'set_worker_runtime',
      worker_id: 'cursor-app-worker-1',
      agent_id: 'cursor-task-1',
      model: 'Cursor Test Model',
      status: 'running',
      runtime: 'cursor-app',
      cwd: '/repo/.worktrees/parallel-subagent-exec/run/T-001',
      requested_model: 'test-model',
      report_path: '/repo/.loopx/reports/T-001.md',
      started_at: NOW,
      operation_path: '/repo/.loopx/workers/cursor-app-worker-1/operation.json',
      operation_digest: 'c'.repeat(64),
    },
    now: NOW,
  });

  assert.deepEqual(state.active_workers['cursor-app-worker-1'], {
    role: 'implementation',
    agent_id: 'cursor-task-1',
    model: 'Cursor Test Model',
    node: 'docs/loopx/plans/example/01-core.md#T-001',
    dispatch_attempt: 1,
    status: 'running',
    runtime: 'cursor-app',
    process_id: null,
    supervisor_pid: null,
    cwd: '/repo/.worktrees/parallel-subagent-exec/run/T-001',
    requested_model: 'test-model',
    report_path: '/repo/.loopx/reports/T-001.md',
    started_at: NOW,
    operation_path: '/repo/.loopx/workers/cursor-app-worker-1/operation.json',
    operation_digest: 'c'.repeat(64),
    supervisor_token: null,
    heartbeat_path: null,
  });
});

test('rejects unknown state schemas without normalization', async () => {
  const { statePath } = await workspace();
  await writeFile(statePath, `${JSON.stringify({ ...initialState(), schema: 'loopx.parallel-exec-state.v2' })}\n`);
  await assert.rejects(readRunState(statePath), (error) => error.code === 'parallel_state_schema_unsupported');
});

test('writes retained completion evidence and returns it idempotently', async () => {
  const { runRoot, statePath } = await workspace();
  const state = initialState();
  state.status = 'ready_for_finish';
  state.root_integration = rootIntegration();
  for (const task of Object.values(state.tasks)) task.status = 'integrated';
  for (const child of Object.values(state.children)) child.status = 'integrated';
  await initialize(statePath, state);
  await mkdir(join(runRoot, 'reports'));
  await mkdir(join(runRoot, 'reviews'));
  await mkdir(join(runRoot, 'conflicts'));
  await writeFile(join(runRoot, 'reports', 'task.md'), 'evidence\n');

  const first = await writeCompletionState({
    runRoot,
    state: await readRunState(statePath),
    summary: { result: 'success' },
    now: NOW,
  });
  const second = await writeCompletionState({
    runRoot,
    state: await readRunState(statePath),
    summary: { result: 'ignored-repeat' },
    now: '2026-07-15T00:00:00.000Z',
  });

  assert.deepEqual(second, first);
  assert.equal((await readRunState(statePath)).status, 'complete');
  assert.equal(await readFile(join(runRoot, 'reports', 'task.md'), 'utf8'), 'evidence\n');
  assert.deepEqual(JSON.parse(await readFile(join(runRoot, 'completion.json'), 'utf8')), first);
});

test('does not compact blocked or interrupted runs as success', async () => {
  for (const status of ['blocked', 'interrupted']) {
    const { runRoot, statePath } = await workspace();
    const state = initialState();
    state.status = status;
    await initialize(statePath, state);
    await assert.rejects(
      writeCompletionState({ runRoot, state: await readRunState(statePath), summary: {}, now: NOW }),
      (error) => error.code === 'parallel_completion_invalid',
    );
  }
});
