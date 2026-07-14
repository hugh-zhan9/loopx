import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const PARALLEL_STATE_SCHEMA = 'loopx.parallel-exec-state.v1';

export const RUN_STATUSES = Object.freeze([
  'initializing', 'running', 'blocked', 'reviewing', 'ready_for_finish', 'complete', 'interrupted',
]);

export const TASK_STATUSES = Object.freeze([
  'pending', 'ready', 'dispatch_reserved', 'capacity_wait', 'implementing',
  'awaiting_review', 'reviewing', 'needs_fix', 'fixing', 'review_passed',
  'integration_queued', 'integrating', 'reconciling', 'integrated', 'blocked',
]);

export const CHILD_STATUSES = Object.freeze([
  'pending', 'ready', 'running', 'plan_reviewing', 'reviewed',
  'commit_ready', 'integrating', 'integrated', 'rebuilding', 'blocked',
]);

const RUN_TRANSITIONS = new Map([
  ['initializing', new Set(['running', 'blocked', 'interrupted'])],
  ['running', new Set(['blocked', 'reviewing', 'ready_for_finish', 'interrupted'])],
  ['blocked', new Set(['running', 'interrupted'])],
  ['reviewing', new Set(['running', 'blocked', 'ready_for_finish', 'interrupted'])],
  ['ready_for_finish', new Set(['complete', 'blocked', 'interrupted'])],
  ['complete', new Set(['complete'])],
  ['interrupted', new Set(['running', 'blocked'])],
]);

const TASK_TRANSITIONS = new Map([
  ['pending', new Set(['ready', 'blocked'])],
  ['ready', new Set(['dispatch_reserved', 'capacity_wait', 'blocked'])],
  ['dispatch_reserved', new Set(['implementing', 'capacity_wait', 'blocked'])],
  ['capacity_wait', new Set(['ready', 'dispatch_reserved', 'blocked'])],
  ['implementing', new Set(['awaiting_review', 'blocked'])],
  ['awaiting_review', new Set(['reviewing', 'blocked'])],
  ['reviewing', new Set(['needs_fix', 'review_passed', 'blocked'])],
  ['needs_fix', new Set(['fixing', 'blocked'])],
  ['fixing', new Set(['awaiting_review', 'blocked'])],
  ['review_passed', new Set(['integration_queued', 'blocked'])],
  ['integration_queued', new Set(['integrating', 'blocked'])],
  ['integrating', new Set(['integrated', 'reconciling', 'blocked'])],
  ['reconciling', new Set(['integration_queued', 'blocked'])],
  ['integrated', new Set(['integrated'])],
  ['blocked', new Set(['blocked'])],
]);

const CHILD_TRANSITIONS = new Map([
  ['pending', new Set(['ready', 'blocked'])],
  ['ready', new Set(['running', 'blocked'])],
  ['running', new Set(['plan_reviewing', 'blocked'])],
  ['plan_reviewing', new Set(['reviewed', 'blocked'])],
  ['reviewed', new Set(['commit_ready', 'blocked'])],
  ['commit_ready', new Set(['integrating', 'blocked'])],
  ['integrating', new Set(['integrated', 'rebuilding', 'blocked'])],
  ['rebuilding', new Set(['running', 'blocked'])],
  ['integrated', new Set(['integrated'])],
  ['blocked', new Set(['blocked'])],
]);

class ParallelStateError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ParallelStateError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ParallelStateError(code, message, details);
}

function clone(value) {
  return structuredClone(value);
}

function assertObject(value, code, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`);
  }
}

function assertState(state) {
  assertObject(state, 'parallel_state_invalid', 'state');
  if (state.schema !== PARALLEL_STATE_SCHEMA) {
    fail('parallel_state_schema_unsupported', `state schema must be ${PARALLEL_STATE_SCHEMA}`);
  }
  if (!Number.isInteger(state.revision) || state.revision < 1 || !RUN_STATUSES.includes(state.status)) {
    fail('parallel_state_invalid', 'state revision or status is invalid');
  }
  for (const field of ['run_id', 'input', 'repo', 'config', 'tasks', 'children', 'active_workers', 'updated_at']) {
    if (!Object.hasOwn(state, field)) {
      fail('parallel_state_invalid', `state is missing ${field}`);
    }
  }
  assertObject(state.tasks, 'parallel_state_invalid', 'state tasks');
  assertObject(state.children, 'parallel_state_invalid', 'state children');
  assertObject(state.active_workers, 'parallel_state_invalid', 'state active_workers');
  for (const [taskId, task] of Object.entries(state.tasks)) {
    if (!TASK_STATUSES.includes(task.status)) {
      fail('parallel_state_invalid', `${taskId} has invalid status ${task.status}`);
    }
  }
  for (const [childId, child] of Object.entries(state.children)) {
    if (!CHILD_STATUSES.includes(child.status)) {
      fail('parallel_state_invalid', `${childId} has invalid status ${child.status}`);
    }
  }
  return state;
}

export function createRunId({ sourceSlug, baselineCommit, sourceSha256 }) {
  if (!sourceSlug || typeof sourceSlug !== 'string' || typeof baselineCommit !== 'string' || typeof sourceSha256 !== 'string') {
    fail('parallel_run_id_invalid', 'sourceSlug, baselineCommit, and sourceSha256 are required');
  }
  return `${sourceSlug}-${baselineCommit.slice(0, 12)}-${sourceSha256.slice(0, 8)}`;
}

export function createInitialState({ runId, manifest, repo, config, now }) {
  assertObject(manifest, 'parallel_state_invalid', 'manifest');
  const tasks = {};
  const children = {};
  for (const plan of manifest.plans) {
    const taskIds = [];
    for (const task of plan.tasks) {
      const taskId = `${plan.path}#${task.task_anchor}`;
      taskIds.push(taskId);
      tasks[taskId] = {
        plan_path: plan.path,
        task_anchor: task.task_anchor,
        depends_on: task.depends_on.map((anchor) => `${plan.path}#${anchor}`),
        write_scope: [...task.write_scope],
        parallel_safe: task.parallel_safe,
        status: 'pending',
        attempts: 0,
        reconciliation_attempts: 0,
        active_role: null,
        evidence: null,
        last_error: null,
      };
    }
    children[plan.path] = {
      depends_on: [...plan.depends_on],
      can_run_in_parallel: plan.can_run_in_parallel,
      task_ids: taskIds,
      status: 'pending',
      plan_review: null,
      boundary_commit: null,
      last_error: null,
    };
  }
  return assertState({
    schema: PARALLEL_STATE_SCHEMA,
    revision: 1,
    run_id: runId,
    status: 'initializing',
    input: clone(manifest.input),
    repo: clone(repo),
    config: clone(config),
    root_integration: null,
    tasks,
    children,
    active_workers: {},
    updated_at: now,
    last_error: null,
  });
}

export async function readRunState(statePath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      fail('parallel_state_missing', `state file does not exist: ${statePath}`);
    }
    if (error instanceof SyntaxError) {
      fail('parallel_state_invalid', `state file contains invalid JSON: ${statePath}`);
    }
    throw error;
  }
  return assertState(parsed);
}

function assertTransition(map, current, next, label) {
  if (!map.get(current)?.has(next)) {
    fail('parallel_state_transition_invalid', `${label} cannot transition from ${current} to ${next}`);
  }
}

function startupComplete(state) {
  const root = state.root_integration;
  return Boolean(
    root?.worktree
    && root?.branch
    && root?.head
    && root?.index_tree
    && root?.execution_start?.artifact_path
    && root?.execution_start?.requirement_start_commit
    && root?.finish_start?.artifact_path
    && root?.finish_start?.finish_baseline_commit
    && root?.canonical_final_review_report
  );
}

function applyOperation(state, operation) {
  assertObject(operation, 'parallel_state_operation_invalid', 'operation');
  if (operation.type === 'batch') {
    if (!Array.isArray(operation.operations)) {
      fail('parallel_state_operation_invalid', 'batch operations must be an array');
    }
    for (const child of operation.operations) {
      applyOperation(state, child);
    }
    return;
  }
  if (operation.type === 'set_run_status') {
    assertTransition(RUN_TRANSITIONS, state.status, operation.status, 'run');
    state.status = operation.status;
    return;
  }
  if (operation.type === 'set_root_integration') {
    assertObject(operation.value, 'parallel_state_operation_invalid', 'root integration');
    state.root_integration = clone(operation.value);
    return;
  }
  if (operation.type === 'set_task_status') {
    const task = state.tasks[operation.task_id];
    if (!task) {
      fail('parallel_state_node_missing', `unknown task: ${operation.task_id}`);
    }
    if (operation.status === 'dispatch_reserved' && !startupComplete(state)) {
      fail('parallel_startup_incomplete', 'dispatch reservation requires complete root startup artifacts');
    }
    assertTransition(TASK_TRANSITIONS, task.status, operation.status, operation.task_id);
    task.status = operation.status;
    if (operation.attempt_delta !== undefined) {
      if (!Number.isInteger(operation.attempt_delta) || operation.attempt_delta < 0) {
        fail('parallel_state_operation_invalid', 'attempt_delta must be a non-negative integer');
      }
      task.attempts += operation.attempt_delta;
    }
    if (operation.reconciliation_attempt_delta !== undefined) {
      if (!Number.isInteger(operation.reconciliation_attempt_delta) || operation.reconciliation_attempt_delta < 0) {
        fail('parallel_state_operation_invalid', 'reconciliation_attempt_delta must be a non-negative integer');
      }
      task.reconciliation_attempts += operation.reconciliation_attempt_delta;
    }
    if (Object.hasOwn(operation, 'evidence')) task.evidence = clone(operation.evidence);
    if (Object.hasOwn(operation, 'last_error')) task.last_error = clone(operation.last_error);
    return;
  }
  if (operation.type === 'set_child_status') {
    const child = state.children[operation.child_id];
    if (!child) {
      fail('parallel_state_node_missing', `unknown child: ${operation.child_id}`);
    }
    assertTransition(CHILD_TRANSITIONS, child.status, operation.status, operation.child_id);
    child.status = operation.status;
    if (Object.hasOwn(operation, 'plan_review')) child.plan_review = clone(operation.plan_review);
    if (Object.hasOwn(operation, 'boundary_commit')) child.boundary_commit = operation.boundary_commit;
    if (Object.hasOwn(operation, 'last_error')) child.last_error = clone(operation.last_error);
    return;
  }
  if (operation.type === 'reserve_worker') {
    if (!startupComplete(state)) {
      fail('parallel_startup_incomplete', 'worker reservation requires complete root startup artifacts');
    }
    if (!operation.worker_id || state.active_workers[operation.worker_id]) {
      fail('parallel_worker_reservation_invalid', `worker id is missing or already active: ${operation.worker_id}`);
    }
    state.active_workers[operation.worker_id] = clone(operation.worker);
    return;
  }
  if (operation.type === 'release_worker') {
    if (!state.active_workers[operation.worker_id]) {
      fail('parallel_worker_reservation_invalid', `unknown active worker: ${operation.worker_id}`);
    }
    delete state.active_workers[operation.worker_id];
    return;
  }
  if (operation.type === 'set_last_error') {
    state.last_error = clone(operation.value);
    return;
  }
  fail('parallel_state_operation_invalid', `unknown operation type: ${operation.type}`);
}

async function acquireLock(statePath) {
  const lockPath = `${statePath}.lock`;
  await mkdir(dirname(statePath), { recursive: true });
  try {
    const handle = await open(lockPath, 'wx', 0o600);
    return { handle, lockPath };
  } catch (error) {
    if (error.code === 'EEXIST') {
      fail('state_revision_conflict', `state is locked by another writer: ${statePath}`);
    }
    throw error;
  }
}

async function writeStateAtomic(statePath, state) {
  const temporaryPath = `${statePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, statePath);
  } finally {
    if (existsSync(temporaryPath)) await unlink(temporaryPath);
  }
}

export async function transitionRunState({ statePath, expectedRevision, operation, now }) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    fail('state_revision_conflict', 'expectedRevision must be a non-negative integer');
  }
  const { handle, lockPath } = await acquireLock(statePath);
  try {
    if (operation?.type === 'initialize') {
      if (expectedRevision !== 0 || existsSync(statePath)) {
        fail('state_revision_conflict', 'initialization requires missing state and expected revision 0');
      }
      const initial = assertState(clone(operation.state));
      if (initial.revision !== 1) {
        fail('parallel_state_invalid', 'initial state revision must be 1');
      }
      await writeFile(join(dirname(statePath), '.gitignore'), '*\n', { mode: 0o600 });
      await writeStateAtomic(statePath, initial);
      return initial;
    }

    const current = await readRunState(statePath);
    if (current.revision !== expectedRevision) {
      fail('state_revision_conflict', `expected revision ${expectedRevision}, observed ${current.revision}`);
    }
    const next = clone(current);
    applyOperation(next, operation);
    next.revision += 1;
    next.updated_at = now;
    assertState(next);
    await writeStateAtomic(statePath, next);
    return next;
  } finally {
    await handle.close();
    if (existsSync(lockPath)) await unlink(lockPath);
  }
}

function getPath(value, path) {
  return path.split('.').reduce((current, segment) => current?.[segment], value);
}

export function verifyRunIdentity({ state, observed }) {
  assertState(state);
  const fields = [
    'run_id',
    'input.path',
    'input.sha256',
    'repo.control_root',
    'repo.git_common_dir',
    'repo.baseline_head',
    'repo.manifest_sha256',
    'root_integration.worktree',
    'root_integration.branch',
    'root_integration.head',
    'root_integration.index_tree',
    'root_integration.execution_start.artifact_path',
    'root_integration.execution_start.requirement_start_commit',
    'root_integration.finish_start.artifact_path',
    'root_integration.finish_start.finish_baseline_commit',
    'root_integration.canonical_final_review_report',
  ];
  const mismatches = [];
  for (const field of fields) {
    const expected = getPath(state, field);
    const actual = getPath(observed, field);
    if (!Object.is(expected, actual)) {
      mismatches.push({ field, expected, observed: actual });
    }
  }
  const workerIds = new Set([
    ...Object.keys(state.active_workers),
    ...Object.keys(observed?.active_workers || {}),
  ]);
  for (const workerId of [...workerIds].sort()) {
    for (const field of ['role', 'agent_id', 'model', 'node', 'dispatch_attempt', 'status']) {
      const expected = state.active_workers[workerId]?.[field];
      const actual = observed?.active_workers?.[workerId]?.[field];
      if (!Object.is(expected, actual)) {
        mismatches.push({ field: `active_workers.${workerId}.${field}`, expected, observed: actual });
      }
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) await unlink(temporaryPath);
  }
}

export async function writeCompletionState({ runRoot, state, summary, now }) {
  const completionPath = join(runRoot, 'completion.json');
  if (existsSync(completionPath)) {
    return JSON.parse(await readFile(completionPath, 'utf8'));
  }
  assertState(state);
  if (state.status !== 'ready_for_finish' && state.status !== 'complete') {
    fail('parallel_completion_invalid', `cannot complete run from ${state.status}`);
  }
  if (Object.keys(state.active_workers).length > 0) {
    fail('parallel_completion_invalid', 'cannot complete with active workers');
  }
  const incompleteTasks = Object.entries(state.tasks).filter(([, task]) => task.status !== 'integrated');
  const incompleteChildren = Object.entries(state.children).filter(([, child]) => child.status !== 'integrated');
  if (incompleteTasks.length > 0 || incompleteChildren.length > 0) {
    fail('parallel_completion_invalid', 'cannot complete with non-integrated tasks or children');
  }

  let completedState = state;
  if (state.status !== 'complete') {
    completedState = await transitionRunState({
      statePath: join(runRoot, 'state.json'),
      expectedRevision: state.revision,
      operation: { type: 'set_run_status', status: 'complete' },
      now,
    });
  }
  const completion = {
    schema: 'loopx.parallel-exec-completion.v1',
    run_id: completedState.run_id,
    completed_at: now,
    summary: clone(summary),
    retained: {
      state: 'state.json',
      reports: 'reports/',
      reviews: 'reviews/',
      conflicts: 'conflicts/',
      root_integration: completedState.root_integration,
    },
  };
  await writeJsonAtomic(completionPath, completion);
  return completion;
}
