import { posix } from 'node:path';

import {
  applyIntegratedResult,
  cleanupConcurrentWorkspaces,
  commitIntegratedResult,
  commitTaskWorkspace,
  createConcurrentWorkspaces,
  integratedResultIsApplied,
  integrateTaskCommits,
} from './worktree-integration.mjs';
import {
  inspectGitTopology,
  inspectInvokingWorktree,
  resetOwnedWorktree,
  verifyOwnedWorktree,
} from './git-isolation.mjs';
import {
  createRunManifest,
  loadRunManifest,
  removeRunManifest,
  writeRunManifest,
} from './run-manifest.mjs';

const DEFAULT_WORKER_BUDGET = 4;

const INDEPENDENCE_DIMENSIONS = [
  'dependencies',
  'write surfaces',
  'decisions',
  'verification',
  'baseline inputs',
  'integration outcomes',
];

function serial(reason) {
  return {
    kind: 'serial',
    reason,
    worker_limit: 1,
    default_worker_budget: DEFAULT_WORKER_BUDGET,
    independence_dimensions: INDEPENDENCE_DIMENSIONS,
  };
}

function firstWriteOverlap(outcomes) {
  const ownedPaths = [];
  for (const outcome of outcomes) {
    for (const path of outcome.write_scope || []) {
      const normalized = posix.normalize(path);
      const overlap = ownedPaths.find(({ path: ownedPath }) => (
        normalized === ownedPath
        || normalized.startsWith(`${ownedPath}/`)
        || ownedPath.startsWith(`${normalized}/`)
      ));
      if (overlap) return { path: normalized, first: overlap.owner, second: outcome.id };
      ownedPaths.push({ path: normalized, owner: outcome.id });
    }
  }
  return null;
}

function firstSemanticCoupling(outcomes) {
  const dimensions = ['decisions', 'verification', 'baseline_inputs', 'integration_outcomes'];
  for (const outcome of outcomes) {
    for (const dimension of dimensions) {
      const evidence = outcome.coupling?.[dimension];
      if (!Array.isArray(evidence)) {
        return { outcome: outcome.id, dimension, reason: 'independence is not established' };
      }
      if (evidence.length > 0) {
        return { outcome: outcome.id, dimension, reason: evidence[0] };
      }
    }
  }
  return null;
}

export function selectAdaptiveExecution({
  outcomes,
  runtimeCapability = {},
  workerBudget = DEFAULT_WORKER_BUDGET,
}) {
  if (!Array.isArray(outcomes) || outcomes.length < 2) {
    return serial('Fewer than two independent outcomes; keep execution in the current context.');
  }
  if (!Number.isInteger(workerBudget) || workerBudget < 1) {
    throw new TypeError('workerBudget must be a positive integer');
  }

  const missingDependencies = outcomes.find((outcome) => !Array.isArray(outcome.depends_on));
  if (missingDependencies) {
    return serial(`${missingDependencies.id} has no explicit dependency declaration; independence is not established.`);
  }
  const dependent = outcomes.find((outcome) => Array.isArray(outcome.depends_on) && outcome.depends_on.length > 0);
  if (dependent) {
    return serial(`${dependent.id} depends on ${dependent.depends_on[0]}; producer-consumer work stays serial.`);
  }

  const readOnly = outcomes.every((outcome) => outcome.mutates === false);
  const mixedMutation = outcomes.some((outcome) => outcome.mutates === false) && !readOnly;
  if (mixedMutation) {
    return serial('Read-only and mutating outcomes share one execution graph; keep execution in the current context.');
  }
  if (!readOnly) {
    const missingWriteScope = outcomes.find((outcome) => !Array.isArray(outcome.write_scope) || outcome.write_scope.length === 0);
    if (missingWriteScope) {
      return serial(`${missingWriteScope.id} has no explicit write surface; independence is not established.`);
    }
    const overlap = firstWriteOverlap(outcomes);
    if (overlap) {
      return serial(`${overlap.first} and ${overlap.second} both write ${overlap.path}; same-file work stays serial.`);
    }
  }

  const coupling = firstSemanticCoupling(outcomes);
  if (coupling) {
    return serial(`${coupling.outcome} has coupled ${coupling.dimension.replaceAll('_', ' ')}: ${coupling.reason}.`);
  }

  if (readOnly && runtimeCapability.read_only_binding !== true) {
    return serial('Reliable read-only binding is unavailable; use current-context serial execution.');
  }
  if (!readOnly && runtimeCapability.task_worktree_binding !== true) {
    return serial('Reliable task-worktree binding is unavailable; use current-context serial execution.');
  }
  const capacity = runtimeCapability.worker_capacity;
  if (!Number.isInteger(capacity) || capacity < 2) {
    return serial('Observed worker capacity is below two; use current-context serial execution.');
  }

  const workerLimit = Math.min(outcomes.length, capacity, workerBudget);
  if (workerLimit < 2) {
    return serial('The shared worker budget is below two; use current-context serial execution.');
  }
  return {
    kind: 'concurrent',
    reason: readOnly
      ? `${outcomes.length} independent read-only outcomes admitted with shared worker limit ${workerLimit}.`
      : `${outcomes.length} independent outcomes admitted with shared worker limit ${workerLimit}.`,
    worker_limit: workerLimit,
    execution_boundary: readOnly ? 'read-only' : 'worktree',
    default_worker_budget: DEFAULT_WORKER_BUDGET,
    independence_dimensions: INDEPENDENCE_DIMENSIONS,
  };
}

const LEAF_INSTRUCTION = 'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.';

function assertVerification(result, phase) {
  if (result?.status !== 'passed' || !Array.isArray(result.commands) || result.commands.length === 0) {
    throw new Error(`${phase} verification is missing or failed`);
  }
  return result;
}

async function mapWithLimit(items, limit, operation) {
  const results = new Array(items.length);
  const failures = [];
  let nextIndex = 0;
  let stopDispatch = false;
  async function worker() {
    while (!stopDispatch && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await operation(items[index], index);
      } catch (error) {
        failures.push({ index, error });
        stopDispatch = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, () => worker()));
  return { results, failures };
}

function createManifestWriter(manifest) {
  let pendingWrite = Promise.resolve();
  return () => {
    pendingWrite = pendingWrite.then(() => writeRunManifest(manifest));
    return pendingWrite;
  };
}

async function dispatchUnverifiedTasks({
  runState,
  topology,
  dispatchWorker,
  persist,
  resetBeforeDispatch,
}) {
  const pendingIndexes = runState.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.status !== 'verified')
    .map(({ index }) => index);
  if (pendingIndexes.length > 0 && typeof dispatchWorker !== 'function') {
    throw recoveryError('adaptive_resume_not_ready', 'resuming unfinished tasks requires a worker dispatcher');
  }
  for (const index of pendingIndexes) {
    const task = runState.tasks[index];
    if (!task.outcome || task.outcome.id !== task.id) {
      throw recoveryError('adaptive_resume_outcome_mismatch', `retained outcome identity differs from task ${task.id}`);
    }
    if (resetBeforeDispatch) {
      await resetOwnedWorktree({ topology, descriptor: task.workspace });
      task.status = 'pending';
      task.verification = null;
      task.commit = null;
      task.changed_paths = [];
      delete task.error;
    }
  }

  const execution = await mapWithLimit(pendingIndexes, runState.worker_limit, async (index) => {
    const task = runState.tasks[index];
    const { outcome } = task;
    const dispatched = await dispatchWorker({
      outcome,
      workspace: task.workspace.path,
      leafInstruction: LEAF_INSTRUCTION,
    });
    const committed = await commitTaskWorkspace({
      topology,
      task: task.workspace,
      outcome,
      verification: dispatched?.verification,
    });
    Object.assign(task, {
      status: 'verified',
      verification: dispatched.verification,
      commit: committed.commit,
      changed_paths: committed.changed_paths,
      workspace: committed.descriptor,
    });
    runState.ownership.tasks[index].workspace = committed.descriptor;
    await persist();
    return committed;
  });
  for (const { index: failedIndex, error } of execution.failures) {
    const taskIndex = pendingIndexes[failedIndex];
    Object.assign(runState.tasks[taskIndex], {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (execution.failures.length > 0) {
    runState.status = 'interrupted';
    await persist();
    throw execution.failures[0].error;
  }
  runState.status = 'active';
  await persist();
  return runState.tasks.map((task) => ({
    outcome: task.outcome,
    verification: task.verification,
    commit: task.commit,
    changed_paths: task.changed_paths,
    descriptor: task.workspace,
  }));
}

async function buildVerifiedIntegration({ topology, runId, runState, taskResults, verifyCombined, persist }) {
  runState.integration.status = 'verifying';
  await persist();
  await integrateTaskCommits({
    topology,
    integration: runState.integration.workspace,
    taskResults,
  });
  let integrationVerification;
  try {
    integrationVerification = assertVerification(await verifyCombined({
      phase: 'integration',
      workspace: runState.integration.workspace.path,
    }), 'integration');
  } catch (error) {
    runState.status = 'interrupted';
    runState.integration.status = 'verification-interrupted';
    runState.integration.error = error instanceof Error ? error.message : String(error);
    await persist();
    throw error;
  }
  const boundary = await commitIntegratedResult({
    topology,
    integration: runState.integration.workspace,
    message: `loopx integrated result: ${runId}`,
  });
  Object.assign(runState.integration, {
    status: 'verified',
    verification: integrationVerification,
    commit: boundary.commit,
    workspace: boundary.descriptor,
  });
  delete runState.integration.error;
  runState.ownership.integration = boundary.descriptor;
  await persist();
  return { boundary, integrationVerification };
}

async function applyAndVerifyIntegration({ cwd, runState, expectedPaths, verifyCombined, persist }) {
  const alreadyApplied = ['applied', 'verification-interrupted', 'verified'].includes(runState.application.status);
  let applied = { changed_paths: expectedPaths };
  if (alreadyApplied) {
    const current = await integratedResultIsApplied({
      cwd,
      baselineHead: runState.baseline_head,
      boundaryCommit: runState.integration.commit,
      expectedPaths,
    });
    if (!current) {
      throw recoveryError('adaptive_target_snapshot_mismatch', 'retained integration result is not the current target state');
    }
  } else {
    try {
      applied = await applyIntegratedResult({
        cwd,
        baselineHead: runState.baseline_head,
        baselineBranch: runState.ownership.branch,
        boundaryCommit: runState.integration.commit,
        expectedPaths,
        targetSnapshot: runState.target_snapshot,
      });
    } catch (error) {
      runState.status = 'blocked';
      runState.blocked_reason = error instanceof Error ? error.message : String(error);
      await persist();
      throw error;
    }
    runState.application.status = 'applied';
    await persist();
  }

  let appliedVerification;
  try {
    appliedVerification = assertVerification(
      await verifyCombined({ phase: 'applied', workspace: cwd }),
      'applied',
    );
  } catch (error) {
    runState.status = 'interrupted';
    runState.application.status = 'verification-interrupted';
    runState.application.error = error instanceof Error ? error.message : String(error);
    await persist();
    throw error;
  }
  runState.application = { status: 'verified', verification: appliedVerification };
  runState.status = 'active';
  delete runState.blocked_reason;
  await persist();
  return { applied, appliedVerification };
}

export async function runAdaptiveExecution({
  cwd,
  runId,
  outcomes,
  runtimeCapability,
  workerBudget = DEFAULT_WORKER_BUDGET,
  dispatchWorker,
  verifyCombined,
}) {
  const selection = selectAdaptiveExecution({ outcomes, runtimeCapability, workerBudget });
  if (selection.kind === 'serial') return selection;
  if (selection.execution_boundary === 'read-only') {
    if (typeof dispatchWorker !== 'function' || typeof verifyCombined !== 'function') {
      throw new TypeError('dispatchWorker and verifyCombined are required for concurrent execution');
    }
    const execution = await mapWithLimit(outcomes, selection.worker_limit, async (outcome) => {
      const dispatched = await dispatchWorker({
        outcome,
        workspace: cwd,
        readOnly: true,
        leafInstruction: LEAF_INSTRUCTION,
      });
      return assertVerification(dispatched?.verification, `worker ${outcome.id}`);
    });
    if (execution.failures.length > 0) throw execution.failures[0].error;
    const combinedVerification = assertVerification(await verifyCombined({
      phase: 'read-only',
      workspace: cwd,
    }), 'read-only');
    return {
      ...selection,
      changed_paths: [],
      verification: { workers: execution.results, combined: combinedVerification },
    };
  }
  const writeScope = outcomes.flatMap((outcome) => outcome.write_scope);
  const relevantPaths = outcomes.flatMap((outcome) => outcome.relevant_paths || []);
  const inspectedWorkspace = await inspectInvokingWorktree({ cwd, writeScope, relevantPaths });
  if (inspectedWorkspace.execution_overlap.length > 0) {
    return serial(`User changes overlap ${inspectedWorkspace.execution_overlap.join(', ')}; use current-context serial execution.`);
  }
  if (typeof dispatchWorker !== 'function' || typeof verifyCombined !== 'function') {
    throw new TypeError('dispatchWorker and verifyCombined are required for concurrent execution');
  }

  const workspaces = await createConcurrentWorkspaces({ cwd, runId, outcomes, inspectedWorkspace });
  const manifest = await createRunManifest({
    cwd: workspaces.topology.invoking_root,
    runId,
    baselineHead: workspaces.baseline_head,
    targetSnapshot: workspaces.target_snapshot,
    outcomes,
    workerLimit: selection.worker_limit,
    ownership: {
      invoking_root: workspaces.topology.invoking_root,
      common_dir: workspaces.topology.common_dir,
      branch: workspaces.topology.branch,
      integration: workspaces.integration,
      tasks: outcomes.map((outcome, index) => ({ id: outcome.id, workspace: workspaces.tasks[index] })),
    },
  });
  const { runState } = manifest;
  const persistManifest = createManifestWriter(manifest);
  const taskResults = await dispatchUnverifiedTasks({
    runState,
    topology: workspaces.topology,
    dispatchWorker,
    persist: persistManifest,
    resetBeforeDispatch: false,
  });
  const { boundary, integrationVerification } = await buildVerifiedIntegration({
    topology: workspaces.topology,
    runId,
    runState,
    taskResults,
    verifyCombined,
    persist: persistManifest,
  });
  const expectedPaths = taskResults.flatMap((result) => result.changed_paths);
  const { applied, appliedVerification } = await applyAndVerifyIntegration({
    cwd: workspaces.topology.invoking_root,
    runState,
    expectedPaths,
    verifyCombined,
    persist: persistManifest,
  });

  await cleanupConcurrentWorkspaces({
    topology: workspaces.topology,
    integration: boundary.descriptor,
    taskResults,
  });
  await removeRunManifest(manifest);

  return {
    ...selection,
    changed_paths: applied.changed_paths,
    integration_order: taskResults.map(({ outcome }) => outcome.id),
    verification: { integration: integrationVerification, applied: appliedVerification },
  };
}

function recoveryError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export async function resumeAdaptiveExecution({ cwd, runId, dispatchWorker = null, verifyCombined }) {
  if (typeof verifyCombined !== 'function') throw new TypeError('verifyCombined is required to resume execution');
  const topology = await inspectGitTopology({ cwd });
  const manifest = await loadRunManifest({ cwd: topology.invoking_root, runId });
  const { runState } = manifest;
  const expectedIdentity = runState.ownership;
  if (
    topology.invoking_root !== expectedIdentity.invoking_root
    || topology.common_dir !== expectedIdentity.common_dir
    || topology.branch !== expectedIdentity.branch
  ) {
    throw recoveryError('adaptive_workspace_identity_mismatch', 'invoking repository identity differs from the retained run');
  }
  if (topology.head !== runState.baseline_head) {
    throw recoveryError('adaptive_workspace_identity_mismatch', 'invoking workspace HEAD differs from the execution baseline');
  }
  await verifyOwnedWorktree({ topology, descriptor: expectedIdentity.integration });
  for (const task of runState.tasks) {
    await verifyOwnedWorktree({ topology, descriptor: task.workspace });
  }

  const persistManifest = createManifestWriter(manifest);
  const taskResults = await dispatchUnverifiedTasks({
    runState,
    topology,
    dispatchWorker,
    persist: persistManifest,
    resetBeforeDispatch: true,
  });
  if (runState.integration.status !== 'verified' || !runState.integration.commit) {
    await resetOwnedWorktree({ topology, descriptor: runState.integration.workspace });
    Object.assign(runState.integration, {
      status: 'pending',
      verification: null,
      commit: null,
    });
    delete runState.integration.error;
    await persistManifest();
    await buildVerifiedIntegration({
      topology,
      runId,
      runState,
      taskResults,
      verifyCombined,
      persist: persistManifest,
    });
  }

  const expectedPaths = [...new Set(runState.tasks.flatMap((task) => task.changed_paths))].sort();
  const { applied, appliedVerification } = await applyAndVerifyIntegration({
    cwd: topology.invoking_root,
    runState,
    expectedPaths,
    verifyCombined,
    persist: persistManifest,
  });
  await cleanupConcurrentWorkspaces({
    topology,
    integration: runState.integration.workspace,
    taskResults: runState.tasks.map((task) => ({ descriptor: task.workspace })),
  });
  await removeRunManifest(manifest);
  return {
    kind: 'concurrent',
    resumed: true,
    changed_paths: applied.changed_paths,
    verification: { integration: runState.integration.verification, applied: appliedVerification },
  };
}
