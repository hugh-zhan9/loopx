import { posix } from 'node:path';

const GRAPH_SCHEMA = 'loopx.execution-graph.v1';
const EXECUTION_PROFILES = new Set([
  'delegated-serial-v1',
  'parallel-strict-v1',
]);

export class ExecutionGraphError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExecutionGraphError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ExecutionGraphError(code, message);
}

function normalizeRepoPath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) {
    fail('execution_graph_path_invalid', `${label} must be a non-empty POSIX repository-relative path`);
  }
  if (posix.isAbsolute(value)) {
    fail('execution_graph_path_invalid', `${label} must be repository-relative`);
  }
  const normalized = posix.normalize(value);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    fail('execution_graph_path_outside_repository', `${label} escapes the repository`);
  }
  return normalized.replace(/^\.\//, '').replace(/\/$/, '');
}

function normalizePathList(value, label) {
  if (!Array.isArray(value)) fail('execution_graph_field_invalid', `${label} must be an array`);
  return value.map((path, index) => normalizeRepoPath(path, `${label}[${index}]`));
}

function normalizeString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('execution_graph_field_invalid', `${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeStringList(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    fail('execution_graph_field_invalid', `${label} must be ${nonEmpty ? 'a non-empty' : 'an'} array`);
  }
  return value.map((entry, index) => normalizeString(entry, `${label}[${index}]`));
}

function normalizeInterfaces(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('execution_graph_field_invalid', `${label} must be an object`);
  }
  return {
    consumes: normalizeStringList(value.consumes, `${label}.consumes`),
    produces: normalizeStringList(value.produces, `${label}.produces`),
  };
}

function normalizeResources(value, label) {
  if (!Array.isArray(value)) fail('execution_graph_field_invalid', `${label} must be an array`);
  return value.map((resource, index) => {
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
      fail('execution_graph_resource_invalid', `${label}[${index}] must be an object`);
    }
    for (const field of ['kind', 'key', 'reason']) {
      if (typeof resource[field] !== 'string' || resource[field].trim().length === 0) {
        fail('execution_graph_resource_invalid', `${label}[${index}].${field} must be a non-empty string`);
      }
    }
    return {
      kind: resource.kind.trim(),
      key: resource.key.trim(),
      reason: resource.reason.trim(),
    };
  });
}

function normalizeTask(task, index) {
  const label = `tasks[${index}]`;
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    fail('execution_graph_task_invalid', `${label} must be an object`);
  }
  if (typeof task.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(task.id)) {
    fail('execution_graph_task_id_invalid', `${label}.id must be a stable task identifier`);
  }
  if (!Array.isArray(task.depends_on) || task.depends_on.some((id) => typeof id !== 'string')) {
    fail('execution_graph_dependencies_invalid', `${label}.depends_on must be an array of task identifiers`);
  }
  if (typeof task.parallel_safe !== 'boolean') {
    fail('execution_graph_parallel_safety_invalid', `${label}.parallel_safe must be a boolean`);
  }
  if (typeof task.parallel_rationale !== 'string' || task.parallel_rationale.trim().length === 0) {
    fail('execution_graph_parallel_safety_invalid', `${label}.parallel_rationale must be a non-empty string`);
  }
  return {
    id: task.id,
    outcome: normalizeString(task.outcome, `${label}.outcome`),
    depends_on: [...task.depends_on],
    write_scope: normalizePathList(task.write_scope, `${label}.write_scope`),
    relevant_paths: normalizePathList(task.relevant_paths, `${label}.relevant_paths`),
    exclusive_resources: normalizeResources(task.exclusive_resources, `${label}.exclusive_resources`),
    parallel_safe: task.parallel_safe,
    parallel_rationale: task.parallel_rationale.trim(),
    interfaces: normalizeInterfaces(task.interfaces, `${label}.interfaces`),
    source_anchors: normalizeStringList(task.source_anchors, `${label}.source_anchors`, { nonEmpty: true }),
    acceptance: normalizeStringList(task.acceptance, `${label}.acceptance`, { nonEmpty: true }),
    verification: normalizeStringList(task.verification, `${label}.verification`, { nonEmpty: true }),
    expected_evidence: normalizeStringList(task.expected_evidence, `${label}.expected_evidence`, { nonEmpty: true }),
    review_focus: normalizeStringList(task.review_focus, `${label}.review_focus`, { nonEmpty: true }),
  };
}

export function validateExecutionGraph(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    fail('execution_graph_invalid', 'execution graph must be an object');
  }
  if (graph.schema !== GRAPH_SCHEMA) {
    fail('execution_graph_schema_unsupported', `execution graph schema must be ${GRAPH_SCHEMA}`);
  }
  if (!EXECUTION_PROFILES.has(graph.selected_profile)) {
    fail('execution_graph_profile_invalid', 'execution graph selected_profile is unsupported');
  }
  if (!Number.isInteger(graph.max_parallel) || graph.max_parallel < 1) {
    fail('execution_graph_limit_invalid', 'execution graph max_parallel must be a positive integer');
  }
  normalizeString(graph.selection_rationale, 'execution graph selection_rationale');
  if (!Array.isArray(graph.tasks) || graph.tasks.length === 0) {
    fail('execution_graph_tasks_invalid', 'execution graph tasks must be a non-empty array');
  }
  const tasks = graph.tasks.map(normalizeTask);
  const byId = new Map();
  for (const task of tasks) {
    if (byId.has(task.id)) {
      fail('execution_graph_task_id_duplicate', `execution graph contains duplicate task id ${task.id}`);
    }
    byId.set(task.id, task);
  }
  for (const task of tasks) {
    const seen = new Set();
    for (const dependency of task.depends_on) {
      if (dependency === task.id) {
        fail('execution_graph_dependency_self', `${task.id} cannot depend on itself`);
      }
      if (!byId.has(dependency)) {
        fail('execution_graph_dependency_missing', `${task.id} depends on missing task ${dependency}`);
      }
      if (seen.has(dependency)) {
        fail('execution_graph_dependency_duplicate', `${task.id} repeats dependency ${dependency}`);
      }
      seen.add(dependency);
    }
  }

  const completed = new Set();
  const active = new Set();
  function visit(task) {
    if (completed.has(task.id)) return;
    if (active.has(task.id)) fail('execution_graph_cycle', `execution graph contains a cycle at ${task.id}`);
    active.add(task.id);
    for (const dependency of task.depends_on) visit(byId.get(dependency));
    active.delete(task.id);
    completed.add(task.id);
  }
  for (const task of tasks) visit(task);

  return {
    ...graph,
    tasks,
  };
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function boundariesConflict(left, right) {
  const leftWrites = left.write_scope;
  const rightWrites = right.write_scope;
  const leftObserved = [...left.write_scope, ...left.relevant_paths];
  const rightObserved = [...right.write_scope, ...right.relevant_paths];
  const pathConflict = leftWrites.some((path) => rightObserved.some((other) => pathsOverlap(path, other)))
    || rightWrites.some((path) => leftObserved.some((other) => pathsOverlap(path, other)));
  if (pathConflict) return true;
  const leftProduces = new Set(left.interfaces.produces);
  const rightProduces = new Set(right.interfaces.produces);
  if (right.interfaces.consumes.some((value) => leftProduces.has(value))
      || left.interfaces.consumes.some((value) => rightProduces.has(value))
      || [...leftProduces].some((value) => rightProduces.has(value))) {
    return true;
  }
  const rightResources = new Set(right.exclusive_resources.map(({ kind, key }) => `${kind}\u0000${key}`));
  return left.exclusive_resources.some(({ kind, key }) => rightResources.has(`${kind}\u0000${key}`));
}

function isAncestor(byId, possibleAncestor, taskId) {
  const pending = [...byId.get(taskId).depends_on];
  const visited = new Set();
  while (pending.length > 0) {
    const dependency = pending.pop();
    if (dependency === possibleAncestor) return true;
    if (visited.has(dependency)) continue;
    visited.add(dependency);
    pending.push(...byId.get(dependency).depends_on);
  }
  return false;
}

export function tasksCanRunTogether(graph, leftId, rightId) {
  const byId = new Map(graph.tasks.map((task) => [task.id, task]));
  const left = byId.get(leftId);
  const right = byId.get(rightId);
  if (!left || !right) {
    fail('execution_graph_task_missing', `cannot compare unknown tasks ${leftId} and ${rightId}`);
  }
  if (leftId === rightId) return false;
  if (isAncestor(byId, leftId, rightId) || isAncestor(byId, rightId, leftId)) return false;
  if (!left.parallel_safe || !right.parallel_safe) return false;
  return !boundariesConflict(left, right);
}

export function findConcurrentTaskPair(graph) {
  for (let left = 0; left < graph.tasks.length; left += 1) {
    for (let right = left + 1; right < graph.tasks.length; right += 1) {
      const leftId = graph.tasks[left].id;
      const rightId = graph.tasks[right].id;
      if (tasksCanRunTogether(graph, leftId, rightId)) return [leftId, rightId];
    }
  }
  return null;
}
