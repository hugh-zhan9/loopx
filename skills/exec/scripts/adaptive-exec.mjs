import { posix } from 'node:path';

import {
  applyIntegratedResult,
  cleanupConcurrentWorkspaces,
  commitIntegratedResult,
  commitTaskWorkspace,
  createConcurrentWorkspaces,
  integrateTaskCommits,
} from './worktree-integration.mjs';
import { createRunManifest, removeRunManifest, writeRunManifest } from './run-manifest.mjs';

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
  const owners = new Map();
  for (const outcome of outcomes) {
    for (const path of outcome.write_scope || []) {
      const normalized = posix.normalize(path);
      if (owners.has(normalized)) return { path: normalized, first: owners.get(normalized), second: outcome.id };
      owners.set(normalized, outcome.id);
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

  const missingWriteScope = outcomes.find((outcome) => !Array.isArray(outcome.write_scope) || outcome.write_scope.length === 0);
  if (missingWriteScope) {
    return serial(`${missingWriteScope.id} has no explicit write surface; independence is not established.`);
  }
  const overlap = firstWriteOverlap(outcomes);
  if (overlap) {
    return serial(`${overlap.first} and ${overlap.second} both write ${overlap.path}; same-file work stays serial.`);
  }

  const coupling = firstSemanticCoupling(outcomes);
  if (coupling) {
    return serial(`${coupling.outcome} has coupled ${coupling.dimension.replaceAll('_', ' ')}: ${coupling.reason}.`);
  }

  if (runtimeCapability.task_worktree_binding !== true) {
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
    reason: `${outcomes.length} independent outcomes admitted with shared worker limit ${workerLimit}.`,
    worker_limit: workerLimit,
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
  if (typeof dispatchWorker !== 'function' || typeof verifyCombined !== 'function') {
    throw new TypeError('dispatchWorker and verifyCombined are required for concurrent execution');
  }

  const workspaces = await createConcurrentWorkspaces({ cwd, runId, outcomes });
  const manifest = await createRunManifest({
    cwd,
    runId,
    baselineHead: workspaces.baseline_head,
    outcomes,
    workerLimit: selection.worker_limit,
  });

  const execution = await mapWithLimit(outcomes, selection.worker_limit, async (outcome, index) => {
    const dispatched = await dispatchWorker({
      outcome,
      workspace: workspaces.tasks[index].path,
      leafInstruction: LEAF_INSTRUCTION,
    });
    const committed = await commitTaskWorkspace({
      topology: workspaces.topology,
      task: workspaces.tasks[index],
      outcome,
      verification: dispatched?.verification,
    });
    Object.assign(manifest.value.tasks[index], {
      status: 'verified',
      verification: dispatched.verification,
      commit: committed.commit,
    });
    return { outcome, verification: dispatched.verification, ...committed };
  });
  for (const { index, error } of execution.failures) {
    Object.assign(manifest.value.tasks[index], {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await writeRunManifest(manifest);
  if (execution.failures.length > 0) throw execution.failures[0].error;
  const taskResults = execution.results;

  await integrateTaskCommits({
    topology: workspaces.topology,
    integration: workspaces.integration,
    taskResults,
  });
  const integrationVerification = assertVerification(await verifyCombined({
    phase: 'integration',
    workspace: workspaces.integration.path,
  }), 'integration');
  const boundary = await commitIntegratedResult({
    topology: workspaces.topology,
    integration: workspaces.integration,
    message: `loopx integrated result: ${runId}`,
  });
  Object.assign(manifest.value.integration, {
    status: 'verified',
    verification: integrationVerification,
    commit: boundary.commit,
  });
  await writeRunManifest(manifest);

  const expectedPaths = taskResults.flatMap((result) => result.changed_paths);
  const applied = await applyIntegratedResult({
    cwd,
    baselineHead: workspaces.baseline_head,
    boundaryCommit: boundary.commit,
    expectedPaths,
  });
  const appliedVerification = assertVerification(await verifyCombined({ phase: 'applied', workspace: cwd }), 'applied');

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
