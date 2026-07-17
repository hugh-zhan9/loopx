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
import { reserveNextStages } from '../skills/parallel-subagent-exec/scripts/scheduler-lib.mjs';

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

function codexCliConfig() {
  return {
    ...config(),
    runtime_adapter: 'codex-agent-cli',
    isolation_mode: 'strict-worktree',
    capability_path: '/repo/.loopx/parallel-subagent-exec/codex-capabilities.json',
    capability_sha256: '2'.repeat(64),
    skill_source_sha256: '3'.repeat(64),
    expected_agent_path: '/opt/codex/bin/codex.js',
    expected_cli_version: '0.144.5',
    codex_home_config_fingerprint: '4'.repeat(64),
    workspace_root: '/repo',
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

function completedCodexReview(taskId, workerId, {
  terminalStatus = 'failed',
  reportSize = 0,
} = {}) {
  return {
    role: 'task_review',
    node: taskId,
    dispatch_attempt: 1,
    status: 'terminal',
    runtime: 'codex',
    process_id: 1234,
    agent_id: 'codex-review-thread-1',
    model: 'test-model',
    requested_model: 'test-model',
    cwd: '/repo/.worktrees/parallel-subagent-exec/run/T-001',
    report_path: `/repo/.loopx/workers/${workerId}/review-report.md`,
    started_at: NOW,
    operation_path: `/repo/.loopx/workers/${workerId}/operation.json`,
    operation_digest: '5'.repeat(64),
    operation_role: 'task_review',
    capability_path: codexCliConfig().capability_path,
    capability_sha256: codexCliConfig().capability_sha256,
    expected_agent_path: codexCliConfig().expected_agent_path,
    expected_cli_version: codexCliConfig().expected_cli_version,
    skill_source_sha256: codexCliConfig().skill_source_sha256,
    codex_home_config_fingerprint: codexCliConfig().codex_home_config_fingerprint,
    prompt_sha256: '6'.repeat(64),
    protected_worktrees: ['/repo'],
    concurrent_worktrees: [],
    events_path: `/repo/.loopx/workers/${workerId}/events.ndjson`,
    completion_path: `/repo/.loopx/workers/${workerId}/completion.json`,
    terminal_status: terminalStatus,
    report_sha256: reportSize === 0
      ? 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      : '7'.repeat(64),
    report_size: reportSize,
    ended_at: '2026-07-14T00:01:00.000Z',
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

test('retries a terminal failed task reviewer from a blocked run with bounded evidence', async () => {
  const { statePath } = await workspace();
  const taskId = 'docs/loopx/plans/example/01-core.md#T-001';
  const workerId = `7:task_review:${taskId}`;
  const initial = createInitialState({
    runId: 'codex-review-retry',
    manifest: manifest(),
    repo: repoIdentity(),
    config: codexCliConfig(),
    now: NOW,
  });
  initial.status = 'blocked';
  initial.root_integration = rootIntegration();
  initial.tasks[taskId].status = 'blocked';
  initial.tasks[taskId].last_error = {
    code: 'parallel_codex_protocol_invalid',
    completion_path: `/repo/.loopx/workers/${workerId}/completion.json`,
  };
  initial.completed_workers[workerId] = completedCodexReview(taskId, workerId);
  const state = await initialize(statePath, initial);

  const retried = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'retry_failed_review', task_id: taskId, worker_id: workerId },
    now: '2026-07-14T00:02:00.000Z',
  });

  assert.equal(retried.status, 'running');
  assert.equal(retried.tasks[taskId].status, 'awaiting_review');
  assert.equal(retried.tasks[taskId].review_attempts, 1);
  assert.equal(retried.tasks[taskId].last_error.code, 'parallel_review_infrastructure_retry');
  assert.equal(retried.tasks[taskId].last_error.previous_worker_id, workerId);
  assert.deepEqual(retried.completed_workers[workerId], state.completed_workers[workerId]);
});

test('rejects reviewer retry without failed terminal evidence or after the retry limit', async () => {
  for (const scenario of ['successful-review', 'limit-exhausted']) {
    const { statePath } = await workspace();
    const taskId = 'docs/loopx/plans/example/01-core.md#T-001';
    const workerId = `7:task_review:${taskId}`;
    const initial = createInitialState({
      runId: `codex-review-retry-${scenario}`,
      manifest: manifest(),
      repo: repoIdentity(),
      config: codexCliConfig(),
      now: NOW,
    });
    initial.status = 'blocked';
    initial.root_integration = rootIntegration();
    initial.tasks[taskId].status = 'blocked';
    initial.tasks[taskId].last_error = {
      code: 'parallel_codex_worker_failed',
      completion_path: `/repo/.loopx/workers/${workerId}/completion.json`,
    };
    if (scenario === 'limit-exhausted') initial.tasks[taskId].review_attempts = 1;
    initial.completed_workers[workerId] = completedCodexReview(taskId, workerId, {
      terminalStatus: scenario === 'successful-review' ? 'success' : 'failed',
      reportSize: scenario === 'successful-review' ? 123 : 0,
    });
    const state = await initialize(statePath, initial);

    await assert.rejects(
      transitionRunState({
        statePath,
        expectedRevision: state.revision,
        operation: { type: 'retry_failed_review', task_id: taskId, worker_id: workerId },
        now: '2026-07-14T00:02:00.000Z',
      }),
      (error) => error.code === 'parallel_review_retry_invalid',
    );
  }
});

test('retries an invalid task review artifact without discarding sibling needs-fix work', async () => {
  const { statePath } = await workspace();
  const taskId = 'docs/loopx/plans/example/01-core.md#T-001';
  const siblingId = 'docs/loopx/plans/example/01-core.md#T-002';
  const childId = 'docs/loopx/plans/example/01-core.md';
  const workerId = `10:task_review:${taskId}`;
  const inputManifest = manifest();
  inputManifest.plans[0].tasks[1].depends_on = [];
  const initial = createInitialState({
    runId: 'invalid-review-retry',
    manifest: inputManifest,
    repo: repoIdentity(),
    config: codexCliConfig(),
    now: NOW,
  });
  initial.status = 'blocked';
  initial.root_integration = rootIntegration();
  initial.children[childId].status = 'blocked';
  initial.children[childId].last_error = { code: 'parallel_review_artifact_invalid', task_id: taskId };
  initial.tasks[taskId].status = 'blocked';
  initial.tasks[taskId].last_error = {
    code: 'parallel_review_artifact_invalid',
    completion_path: `/repo/.loopx/workers/${workerId}/completion.json`,
  };
  initial.tasks[siblingId].status = 'needs_fix';
  initial.tasks[siblingId].last_error = { code: 'parallel_review_important_findings', finding_ids: ['F-001'] };
  initial.completed_workers[workerId] = completedCodexReview(taskId, workerId, {
    terminalStatus: 'success',
    reportSize: 3249,
  });
  const state = await initialize(statePath, initial);

  const retried = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'retry_invalid_review', task_id: taskId, worker_id: workerId },
    now: '2026-07-17T07:00:00.000Z',
  });

  assert.equal(retried.status, 'running');
  assert.equal(retried.children[childId].status, 'running');
  assert.equal(retried.children[childId].last_error.code, 'parallel_review_artifact_retry');
  assert.equal(retried.tasks[taskId].status, 'awaiting_review');
  assert.equal(retried.tasks[taskId].review_attempts, 1);
  assert.equal(retried.tasks[siblingId].status, 'needs_fix');
  assert.equal(retried.tasks[siblingId].last_error.code, 'parallel_review_important_findings');
  assert.deepEqual(retried.completed_workers[workerId], state.completed_workers[workerId]);

  const selection = reserveNextStages({ manifest: inputManifest, state: retried, runtimeCapacity: 2 });
  assert.deepEqual(selection.reservations.map(({ role, node_id: nodeId }) => [role, nodeId]), [
    ['fix', siblingId],
    ['task_review', taskId],
  ]);
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
    operation_path: '/repo/.loopx/workers/worker1/operation.json',
    operation_digest: '5'.repeat(64),
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

test('requires complete Codex CLI capability and worker lifecycle identity', async () => {
  assert.throws(
    () => createInitialState({
      runId: 'codex-cli-incomplete',
      manifest: manifest(),
      repo: repoIdentity(),
      config: { ...config(), runtime_adapter: 'codex-agent-cli' },
      now: NOW,
    }),
    (error) => error.code === 'parallel_state_invalid',
  );

  const { statePath } = await workspace();
  let state = await initialize(statePath, createInitialState({
    runId: 'codex-cli-worker',
    manifest: manifest(),
    repo: repoIdentity(),
    config: codexCliConfig(),
    now: NOW,
  }));
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
      worker_id: 'codex-cli-worker',
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
    worker_id: 'codex-cli-worker',
    agent_id: 'codex-thread-1',
    model: 'test-model',
    status: 'running',
    runtime: 'codex',
    process_id: 1234,
    cwd: '/repo/.worktrees/parallel-subagent-exec/run/T-001',
    requested_model: 'test-model',
    report_path: '/repo/.loopx/reports/T-001.md',
    started_at: NOW,
    operation_path: '/repo/.loopx/workers/codex-cli-worker/operation.json',
    operation_digest: '6'.repeat(64),
    role: 'implementation',
    capability_path: codexCliConfig().capability_path,
    capability_sha256: codexCliConfig().capability_sha256,
    expected_agent_path: codexCliConfig().expected_agent_path,
    expected_cli_version: codexCliConfig().expected_cli_version,
    skill_source_sha256: codexCliConfig().skill_source_sha256,
    codex_home_config_fingerprint: codexCliConfig().codex_home_config_fingerprint,
    prompt_sha256: '7'.repeat(64),
    protected_worktrees: ['/repo', '/repo/.worktrees/parallel-subagent-exec/run/root'],
    concurrent_worktrees: [],
    events_path: '/repo/.loopx/workers/codex-cli-worker/events.ndjson',
    completion_path: '/repo/.loopx/workers/codex-cli-worker/completion.json',
  };

  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: state.revision,
      operation: { ...runtime, process_id: null },
      now: NOW,
    }),
    (error) => error.code === 'parallel_worker_reservation_invalid',
  );
  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: state.revision,
      operation: { ...runtime, requested_model: 'different-model' },
      now: NOW,
    }),
    (error) => error.code === 'parallel_worker_reservation_invalid',
  );
  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: state.revision,
      operation: { ...runtime, role: 'task_review' },
      now: NOW,
    }),
    (error) => error.code === 'parallel_worker_reservation_invalid',
  );

  const accepted = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: runtime,
    now: NOW,
  });
  assert.equal(accepted.active_workers['codex-cli-worker'].agent_id, 'codex-thread-1');
  assert.equal(accepted.active_workers['codex-cli-worker'].process_id, 1234);
  assert.deepEqual(accepted.active_workers['codex-cli-worker'].protected_worktrees, [
    '/repo',
    '/repo/.worktrees/parallel-subagent-exec/run/root',
  ]);
  const reattached = await transitionRunState({
    statePath,
    expectedRevision: accepted.revision,
    operation: runtime,
    now: NOW,
  });
  assert.deepEqual(
    reattached.active_workers['codex-cli-worker'].protected_worktrees,
    accepted.active_workers['codex-cli-worker'].protected_worktrees,
  );

  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: reattached.revision,
      operation: { type: 'release_worker', worker_id: 'codex-cli-worker' },
      now: NOW,
    }),
    (error) => error.code === 'parallel_worker_reservation_invalid',
  );
  await assert.rejects(
    transitionRunState({
      statePath,
      expectedRevision: reattached.revision,
      operation: {
        type: 'release_worker',
        worker_id: 'codex-cli-worker',
        terminal_evidence: {
          role: 'final_review',
          terminal_status: 'success',
          report_sha256: '8'.repeat(64),
          report_size: 123,
          ended_at: '2026-07-14T00:01:00.000Z',
        },
      },
      now: NOW,
    }),
    (error) => error.code === 'parallel_worker_reservation_invalid',
  );

  const released = await transitionRunState({
    statePath,
    expectedRevision: reattached.revision,
    operation: {
      type: 'release_worker',
      worker_id: 'codex-cli-worker',
      terminal_evidence: {
        terminal_status: 'success',
        report_sha256: '8'.repeat(64),
        report_size: 123,
        ended_at: '2026-07-14T00:01:00.000Z',
      },
    },
    now: NOW,
  });
  assert.equal(released.active_workers['codex-cli-worker'], undefined);
  assert.equal(released.completed_workers['codex-cli-worker'].report_sha256, '8'.repeat(64));
  assert.equal(released.completed_workers['codex-cli-worker'].report_size, 123);

  const observed = structuredClone(released);
  observed.config.expected_cli_version = '0.145.0';
  observed.completed_workers['codex-cli-worker'].report_sha256 = '9'.repeat(64);
  assert.deepEqual(
    verifyRunIdentity({ state: released, observed }).mismatches.map(({ field }) => field),
    ['config.expected_cli_version', 'completed_workers.codex-cli-worker'],
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

test('rejects legacy and unknown state schemas without normalization', async () => {
  const { statePath } = await workspace();
  await writeFile(statePath, `${JSON.stringify({ ...initialState(), schema: 'loopx.parallel-exec-state.v1' })}\n`);
  await assert.rejects(readRunState(statePath), (error) => error.code === 'parallel_state_schema_unsupported');
  await writeFile(statePath, `${JSON.stringify({ ...initialState(), schema: 'loopx.parallel-exec-state.v999' })}\n`);
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
