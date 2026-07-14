export const STAGE_PRIORITIES = Object.freeze({
  reconciliation: 0,
  fix: 0,
  task_review: 1,
  plan_review: 1,
  implementation: 2,
});

class ParallelSchedulerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ParallelSchedulerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ParallelSchedulerError(code, message);
}

function assertNonNegativeInteger(value, label, { positive = false } = {}) {
  if (!Number.isInteger(value) || value < (positive ? 1 : 0)) {
    fail('parallel_scheduler_limit_invalid', `${label} must be ${positive ? 'positive' : 'non-negative'} integer`);
  }
}

export function effectiveWorkerLimit({ configuredLimit, runtimeCapacity, readyCount }) {
  assertNonNegativeInteger(configuredLimit, 'configuredLimit', { positive: true });
  assertNonNegativeInteger(readyCount, 'readyCount');
  if (runtimeCapacity !== null && runtimeCapacity !== undefined) {
    assertNonNegativeInteger(runtimeCapacity, 'runtimeCapacity');
  }
  const capacity = runtimeCapacity == null ? configuredLimit : runtimeCapacity;
  return Math.min(configuredLimit, capacity, readyCount);
}

function taskId(planPath, anchor) {
  return `${planPath}#${anchor}`;
}

function topologicalLevels(nodes, id, dependencies) {
  const byId = new Map(nodes.map((node) => [id(node), node]));
  const memo = new Map();
  function level(nodeId, active = new Set()) {
    if (memo.has(nodeId)) return memo.get(nodeId);
    if (active.has(nodeId)) fail('parallel_scheduler_cycle', `cycle includes ${nodeId}`);
    const node = byId.get(nodeId);
    if (!node) fail('parallel_scheduler_dependency_missing', `missing node ${nodeId}`);
    const nextActive = new Set(active).add(nodeId);
    const deps = dependencies(node);
    const value = deps.length === 0 ? 0 : Math.max(...deps.map((dependency) => level(dependency, nextActive))) + 1;
    memo.set(nodeId, value);
    return value;
  }
  for (const node of nodes) level(id(node));
  return memo;
}

function activeWorkerFor(state, nodeId, role = null) {
  return Object.values(state.active_workers).some((worker) => (
    worker.node === nodeId && (role === null || worker.role === role)
  ));
}

function activeWorkersForPlan(state, planPath) {
  return Object.values(state.active_workers).filter((worker) => (
    worker.node === planPath || worker.node?.startsWith(`${planPath}#`)
  ));
}

function taskRole(status) {
  if (status === 'pending' || status === 'ready' || status === 'capacity_wait') return 'implementation';
  if (status === 'awaiting_review') return 'task_review';
  if (status === 'needs_fix') return 'fix';
  if (status === 'reconciling') return 'reconciliation';
  return null;
}

function pushOperation(operations, operation) {
  if (!operations.some((candidate) => JSON.stringify(candidate) === JSON.stringify(operation))) {
    operations.push(operation);
  }
}

function blockTaskAndDescendants(plan, state, initialTaskId, operations) {
  const blocked = new Set([initialTaskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of plan.tasks) {
      const id = taskId(plan.path, task.task_anchor);
      const dependencies = task.depends_on.map((anchor) => taskId(plan.path, anchor));
      if (!blocked.has(id) && dependencies.some((dependency) => blocked.has(dependency))) {
        blocked.add(id);
        changed = true;
      }
    }
  }
  for (const id of blocked) {
    if (state.tasks[id]?.status !== 'blocked' && state.tasks[id]?.status !== 'integrated') {
      pushOperation(operations, { type: 'set_task_status', task_id: id, status: 'blocked' });
    }
  }
  return blocked;
}

function compareStages(left, right) {
  return left.priority - right.priority
    || left.topological_level - right.topological_level
    || left.plan_path.localeCompare(right.plan_path)
    || left.task_anchor.localeCompare(right.task_anchor)
    || left.role.localeCompare(right.role);
}

export function computeReadyStages({ manifest, state }) {
  const operations = [];
  const stages = [];
  const planLevels = topologicalLevels(manifest.plans, (plan) => plan.path, (plan) => plan.depends_on);
  const globallyActive = Object.keys(state.active_workers).length;

  for (const plan of manifest.plans) {
    const child = state.children[plan.path];
    if (!child) fail('parallel_scheduler_state_mismatch', `state is missing child ${plan.path}`);
    const dependencyChildren = plan.depends_on.map((dependency) => state.children[dependency]);
    if (dependencyChildren.some((dependency) => dependency?.status === 'blocked')) {
      if (child.status !== 'blocked') pushOperation(operations, { type: 'set_child_status', child_id: plan.path, status: 'blocked' });
      for (const task of plan.tasks) blockTaskAndDescendants(plan, state, taskId(plan.path, task.task_anchor), operations);
      continue;
    }
    if (!dependencyChildren.every((dependency) => dependency?.status === 'integrated')) continue;
    if (child.status === 'blocked' || child.status === 'integrated') continue;
    if (!plan.can_run_in_parallel && globallyActive > 0 && activeWorkersForPlan(state, plan.path).length === 0) continue;
    if (child.status === 'pending') pushOperation(operations, { type: 'set_child_status', child_id: plan.path, status: 'ready' });

    const taskLevels = topologicalLevels(plan.tasks, (task) => task.task_anchor, (task) => task.depends_on);
    for (const task of plan.tasks) {
      const id = taskId(plan.path, task.task_anchor);
      const record = state.tasks[id];
      if (!record) fail('parallel_scheduler_state_mismatch', `state is missing task ${id}`);
      if (record.status === 'blocked' || record.status === 'integrated') continue;
      if (record.status === 'reconciling' && record.reconciliation_attempts >= 2) {
        blockTaskAndDescendants(plan, state, id, operations);
        continue;
      }
      const dependencyIds = task.depends_on.map((anchor) => taskId(plan.path, anchor));
      const dependencyRecords = dependencyIds.map((dependency) => state.tasks[dependency]);
      if (dependencyRecords.some((dependency) => dependency?.status === 'blocked')) {
        blockTaskAndDescendants(plan, state, id, operations);
        continue;
      }
      if (!dependencyRecords.every((dependency) => dependency?.status === 'integrated')) continue;
      const role = taskRole(record.status);
      if (!role || activeWorkerFor(state, id, role)) continue;
      if (!task.parallel_safe && activeWorkersForPlan(state, plan.path).length > 0) continue;
      if (record.status === 'pending') pushOperation(operations, { type: 'set_task_status', task_id: id, status: 'ready' });
      stages.push({
        role,
        node_id: id,
        plan_path: plan.path,
        task_anchor: task.task_anchor,
        priority: STAGE_PRIORITIES[role],
        topological_level: planLevels.get(plan.path) + taskLevels.get(task.task_anchor),
        package_exclusive: !plan.can_run_in_parallel,
        plan_exclusive: !task.parallel_safe,
        exclusive_scope: !plan.can_run_in_parallel ? 'package' : (!task.parallel_safe ? 'plan' : null),
      });
    }

    const allTasksIntegrated = plan.tasks.every((task) => state.tasks[taskId(plan.path, task.task_anchor)].status === 'integrated');
    if (allTasksIntegrated && (child.status === 'running' || child.status === 'plan_reviewing') && !activeWorkerFor(state, plan.path, 'plan_review')) {
      if (child.status === 'running') pushOperation(operations, { type: 'set_child_status', child_id: plan.path, status: 'plan_reviewing' });
      stages.push({
        role: 'plan_review',
        node_id: plan.path,
        plan_path: plan.path,
        task_anchor: '',
        priority: STAGE_PRIORITIES.plan_review,
        topological_level: planLevels.get(plan.path),
        package_exclusive: !plan.can_run_in_parallel,
        plan_exclusive: false,
        exclusive_scope: !plan.can_run_in_parallel ? 'package' : null,
      });
    }
  }

  stages.sort(compareStages);
  return { stages, state_operations: operations };
}

function statusOperationsForReservation(stage, state) {
  const operations = [];
  if (stage.role === 'implementation') {
    const status = state.tasks[stage.node_id].status;
    if (status === 'pending') operations.push({ type: 'set_task_status', task_id: stage.node_id, status: 'ready' });
    operations.push({ type: 'set_task_status', task_id: stage.node_id, status: 'dispatch_reserved' });
  } else if (stage.role === 'task_review') {
    operations.push({ type: 'set_task_status', task_id: stage.node_id, status: 'reviewing' });
  } else if (stage.role === 'fix') {
    operations.push({ type: 'set_task_status', task_id: stage.node_id, status: 'fixing' });
  } else if (stage.role === 'plan_review' && state.children[stage.node_id].status === 'running') {
    operations.push({ type: 'set_child_status', child_id: stage.node_id, status: 'plan_reviewing' });
  }
  return operations;
}

function canSelect(stage, selected, state) {
  const selectedPackagePlan = selected.find((candidate) => candidate.package_exclusive)?.plan_path ?? null;
  if (selectedPackagePlan !== null) {
    if (stage.plan_path !== selectedPackagePlan || !stage.package_exclusive) return false;
  } else if (stage.package_exclusive) {
    if (selected.some((candidate) => candidate.plan_path !== stage.plan_path)) return false;
    const activeOutsidePlan = Object.values(state.active_workers).some((worker) => (
      worker.node !== stage.plan_path && !worker.node?.startsWith(`${stage.plan_path}#`)
    ));
    if (activeOutsidePlan) return false;
  }
  if (selected.some((candidate) => candidate.plan_exclusive && candidate.plan_path === stage.plan_path)) return false;
  if (stage.plan_exclusive) {
    return activeWorkersForPlan(state, stage.plan_path).length === 0
      && selected.every((candidate) => candidate.plan_path !== stage.plan_path);
  }
  return true;
}

export function reserveNextStages({ manifest, state, runtimeCapacity }) {
  const computed = computeReadyStages({ manifest, state });
  const activeCount = Object.keys(state.active_workers).length;
  const configuredLimit = state.config.effective_max_parallel ?? manifest.max_parallel;
  const effectiveLimit = effectiveWorkerLimit({
    configuredLimit,
    runtimeCapacity,
    readyCount: activeCount + computed.stages.length,
  });
  const availableSlots = Math.max(0, effectiveLimit - activeCount);
  const selected = [];
  for (const stage of computed.stages) {
    if (selected.length >= availableSlots) break;
    if (canSelect(stage, selected, state)) selected.push(stage);
  }

  const reservations = selected.map((stage, index) => ({
    ...stage,
    reservation_id: `${state.revision + index + 1}:${stage.role}:${stage.node_id}`,
  }));
  const stateOperations = reservations.map((reservation) => ({
    type: 'batch',
    operations: [
      ...statusOperationsForReservation(reservation, state),
      {
        type: 'reserve_worker',
        worker_id: reservation.reservation_id,
        worker: {
          role: reservation.role,
          agent_id: null,
          model: state.config.models?.[reservation.role] ?? null,
          node: reservation.node_id,
          dispatch_attempt: state.tasks[reservation.node_id]?.attempts + 1 || 1,
          status: 'reserved',
        },
      },
    ],
  }));
  const capacityWait = availableSlots === 0
    ? computed.stages.map((stage) => ({
      type: 'capacity_wait',
      node_id: stage.node_id,
      role: stage.role,
      attempts_incremented: false,
    }))
    : [];

  return {
    effective_limit: effectiveLimit,
    active_workers: activeCount,
    available_slots: availableSlots,
    reservations,
    state_operations: stateOperations,
    preparation_operations: computed.state_operations,
    capacity_wait: capacityWait,
  };
}
