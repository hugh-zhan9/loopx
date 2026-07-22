import { tasksCanRunTogether } from './execution-graph.mjs';

const TERMINAL_DEPENDENCY_STATUS = 'integrated';

export const STAGE_PRIORITIES = Object.freeze({
  fix: 0,
  review: 1,
  implementation: 2,
});

export class ExecutionSchedulerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExecutionSchedulerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ExecutionSchedulerError(code, message);
}

function taskRole(status) {
  if (['pending', 'ready', 'capacity_wait', 'failed', 'interrupted'].includes(status)) return 'implementation';
  if (status === 'awaiting_review') return 'review';
  if (status === 'needs_fix') return 'fix';
  return null;
}

function activeWorkerFor(state, taskId, role = null) {
  return Object.values(state.active_workers || {}).some((worker) => (
    (worker.task_id === taskId || worker.node === taskId)
    && (role === null || worker.role === role)
  ));
}

function indexTaskState(state) {
  if (Array.isArray(state.tasks)) {
    const records = new Map();
    for (const record of state.tasks) {
      if (!record || typeof record.id !== 'string' || records.has(record.id)) {
        fail('execution_scheduler_state_mismatch', 'array task state requires unique task ids');
      }
      records.set(record.id, record);
    }
    return records;
  }
  if (state.tasks && typeof state.tasks === 'object') return new Map(Object.entries(state.tasks));
  fail('execution_scheduler_state_mismatch', 'state.tasks must be an array or keyed object');
}

function attemptCount(record, role) {
  if (Number.isInteger(record.attempts)) return record.attempts;
  const count = record.attempts?.[role];
  return Number.isInteger(count) ? count : 0;
}

function topologicalLevels(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const memo = new Map();
  function level(id) {
    if (memo.has(id)) return memo.get(id);
    const task = byId.get(id);
    const value = task.depends_on.length === 0
      ? 0
      : Math.max(...task.depends_on.map(level)) + 1;
    memo.set(id, value);
    return value;
  }
  for (const task of tasks) level(task.id);
  return memo;
}

function compareStages(left, right) {
  return left.priority - right.priority
    || left.topological_level - right.topological_level
    || left.task_id.localeCompare(right.task_id);
}

export function computeReadyStages({ manifest, state }) {
  const levels = topologicalLevels(manifest.tasks);
  const taskState = indexTaskState(state);
  const ready = [];
  const stateOperations = [];
  const blocked = new Set(manifest.tasks
    .filter((task) => taskState.get(task.id)?.status === 'blocked')
    .map((task) => task.id));
  let discoveredBlocked = true;
  while (discoveredBlocked) {
    discoveredBlocked = false;
    for (const task of manifest.tasks) {
      if (blocked.has(task.id) || !task.depends_on.some((id) => blocked.has(id))) continue;
      blocked.add(task.id);
      discoveredBlocked = true;
    }
  }
  for (const task of manifest.tasks) {
    if (blocked.has(task.id) && taskState.get(task.id)?.status !== 'blocked') {
      stateOperations.push({ type: 'set_task_status', task_id: task.id, status: 'blocked' });
    }
  }

  for (const task of manifest.tasks) {
    const record = taskState.get(task.id);
    if (!record) fail('execution_scheduler_state_mismatch', `state is missing task ${task.id}`);
    if (blocked.has(task.id)) continue;
    const role = taskRole(record.status);
    if (!role || activeWorkerFor(state, task.id)) continue;
    const dependenciesSatisfied = task.depends_on.every((id) => (
      taskState.get(id)?.status === TERMINAL_DEPENDENCY_STATUS
    ));
    if (!dependenciesSatisfied) continue;
    if (record.status === 'pending') {
      stateOperations.push({ type: 'set_task_status', task_id: task.id, status: 'ready' });
    }
    ready.push({
      role,
      task_id: task.id,
      priority: STAGE_PRIORITIES[role],
      topological_level: levels.get(task.id),
    });
  }

  ready.sort(compareStages);
  const activeTaskIds = [...new Set(Object.values(state.active_workers || {})
    .map((worker) => worker.task_id || worker.node)
    .filter(Boolean))];
  const frontier = [];
  for (const priority of [...new Set(ready.map((stage) => stage.priority))]) {
    let candidates = ready.filter((stage) => (
      stage.priority === priority
      && activeTaskIds.every((taskId) => tasksCanRunTogether(manifest, stage.task_id, taskId))
      && frontier.every((selected) => tasksCanRunTogether(manifest, stage.task_id, selected.task_id))
    ));
    while (candidates.length > 0) {
      candidates.sort((left, right) => {
        const leftConflicts = candidates.filter((candidate) => (
          candidate !== left && !tasksCanRunTogether(manifest, left.task_id, candidate.task_id)
        )).length;
        const rightConflicts = candidates.filter((candidate) => (
          candidate !== right && !tasksCanRunTogether(manifest, right.task_id, candidate.task_id)
        )).length;
        return leftConflicts - rightConflicts || compareStages(left, right);
      });
      const selected = candidates[0];
      frontier.push(selected);
      candidates = candidates.filter((candidate) => (
        candidate !== selected
        && tasksCanRunTogether(manifest, selected.task_id, candidate.task_id)
      ));
    }
  }
  frontier.sort(compareStages);
  return { ready: frontier, state_operations: stateOperations };
}

function assertNonNegativeInteger(value, label, { positive = false } = {}) {
  const minimum = positive ? 1 : 0;
  if (!Number.isInteger(value) || value < minimum) {
    fail(
      'execution_scheduler_limit_invalid',
      `${label} must be a ${positive ? 'positive' : 'non-negative'} integer`,
    );
  }
}

export function effectiveWorkerLimit({ configuredLimit, runtimeCapacity, readyCount }) {
  assertNonNegativeInteger(configuredLimit, 'configuredLimit', { positive: true });
  assertNonNegativeInteger(runtimeCapacity, 'runtimeCapacity');
  assertNonNegativeInteger(readyCount, 'readyCount');
  return Math.min(configuredLimit, runtimeCapacity, readyCount);
}

function reservationStatus(role) {
  if (role === 'implementation') return 'dispatch_reserved';
  if (role === 'review') return 'reviewing';
  if (role === 'fix') return 'fixing';
  fail('execution_scheduler_role_invalid', `unsupported worker role ${role}`);
}

export function reserveNextStages({ manifest, state, runtimeCapacity }) {
  const computed = computeReadyStages({ manifest, state });
  const taskState = indexTaskState(state);
  const activeCount = Object.keys(state.active_workers || {}).length;
  const configuredLimit = state.worker_limit
    ?? state.configured_worker_limit
    ?? state.config?.effective_max_parallel
    ?? manifest.max_parallel;
  const effectiveLimit = effectiveWorkerLimit({
    configuredLimit,
    runtimeCapacity,
    readyCount: activeCount + computed.ready.length,
  });
  const availableSlots = Math.max(0, effectiveLimit - activeCount);
  const selected = computed.ready.slice(0, availableSlots);
  const reservations = selected.map((stage, index) => ({
    ...stage,
    reservation_id: `${(state.revision || 0) + index + 1}:${stage.role}:${stage.task_id}`,
  }));
  const stateOperations = [...computed.state_operations];
  for (const reservation of reservations) {
    stateOperations.push({
      type: 'set_task_status',
      task_id: reservation.task_id,
      status: reservationStatus(reservation.role),
    });
    stateOperations.push({
      type: 'reserve_worker',
      worker_id: reservation.reservation_id,
      worker: {
        task_id: reservation.task_id,
        role: reservation.role,
        status: 'reserved',
        dispatch_attempt: attemptCount(taskState.get(reservation.task_id), reservation.role) + 1,
      },
    });
  }
  const reservedIds = new Set(reservations.map(({ task_id: taskId }) => taskId));
  const capacityWait = computed.ready
    .filter(({ task_id: taskId }) => !reservedIds.has(taskId))
    .map(({ task_id: taskId, role }) => ({
      task_id: taskId,
      role,
      attempts_incremented: false,
    }));

  return {
    effective_limit: effectiveLimit,
    active_workers: activeCount,
    available_slots: availableSlots,
    ready: computed.ready,
    reservations,
    state_operations: stateOperations,
    capacity_wait: capacityWait,
  };
}
