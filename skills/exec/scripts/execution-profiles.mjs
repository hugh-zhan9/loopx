import {
  findConcurrentTaskPair,
  validateExecutionGraph,
} from './execution-graph.mjs';

export const EXECUTION_PROFILES = Object.freeze({
  inline: 'inline-owned-v1',
  delegated: 'delegated-serial-v1',
  parallel: 'parallel-strict-v1',
});

const DEFAULT_WORKER_BUDGET = 4;

function inline(reason) {
  return {
    kind: 'serial',
    profile: EXECUTION_PROFILES.inline,
    reason,
    worker_limit: 1,
    execution_owner: 'main-agent',
    review_required: false,
    default_worker_budget: DEFAULT_WORKER_BUDGET,
  };
}

function delegated(reason, graph = null, executionBoundary = 'worktree', workerLimit = 1) {
  const capacityBlocked = workerLimit === 0;
  const selection = {
    kind: 'serial',
    profile: EXECUTION_PROFILES.delegated,
    reason: capacityBlocked
      ? `${reason} Runtime worker capacity is zero; dispatch remains under backpressure.`
      : reason,
    worker_limit: workerLimit,
    execution_owner: 'leaf-worker',
    review_required: true,
    execution_boundary: executionBoundary,
    default_worker_budget: DEFAULT_WORKER_BUDGET,
  };
  if (capacityBlocked) selection.backpressure = true;
  if (graph) selection.graph = { ...graph, selected_profile: EXECUTION_PROFILES.delegated };
  return selection;
}

function graphFromOutcomes(outcomes, workerBudget) {
  return validateExecutionGraph({
    schema: 'loopx.execution-graph.v1',
    selected_profile: EXECUTION_PROFILES.parallel,
    selection_rationale: 'Runtime profile selection evaluates the declared task graph.',
    max_parallel: workerBudget,
    tasks: outcomes.map((outcome) => ({
      id: outcome.id,
      outcome: outcome.outcome,
      depends_on: outcome.depends_on,
      write_scope: outcome.write_scope,
      relevant_paths: outcome.relevant_paths || [],
      exclusive_resources: outcome.exclusive_resources || [],
      parallel_safe: outcome.parallel_safe,
      parallel_rationale: outcome.parallel_rationale,
      interfaces: outcome.interfaces,
      source_anchors: outcome.source_anchors,
      acceptance: outcome.acceptance,
      verification: outcome.verification,
      expected_evidence: outcome.expected_evidence,
      review_focus: outcome.review_focus,
    })),
  });
}

function legacySerialGraph(outcomes, workerBudget) {
  return validateExecutionGraph({
    schema: 'loopx.execution-graph.v1',
    selected_profile: EXECUTION_PROFILES.delegated,
    selection_rationale: 'Legacy planned input is conservatively compiled into stable serial order.',
    max_parallel: 1,
    tasks: outcomes.map((outcome, index) => ({
      id: outcome.id,
      outcome: outcome.outcome || `Deliver legacy outcome ${outcome.id}`,
      depends_on: index === 0 ? [] : [outcomes[index - 1].id],
      write_scope: outcome.write_scope,
      relevant_paths: outcome.relevant_paths || [],
      exclusive_resources: outcome.exclusive_resources || [],
      parallel_safe: false,
      parallel_rationale: 'Legacy input has no authoritative parallel-safety proof.',
      interfaces: outcome.interfaces || { consumes: [], produces: [] },
      source_anchors: outcome.source_anchors || [`legacy:${outcome.id}`],
      acceptance: outcome.acceptance || [`Complete legacy outcome ${outcome.id}.`],
      verification: outcome.verification || [`Verify legacy outcome ${outcome.id}.`],
      expected_evidence: outcome.expected_evidence || [`Verification evidence for ${outcome.id}.`],
      review_focus: outcome.review_focus || [`Review legacy outcome ${outcome.id}.`],
    })),
  });
}

function semanticCoupling(outcomes) {
  const dimensions = ['decisions', 'verification', 'baseline_inputs', 'integration_outcomes'];
  for (const outcome of outcomes) {
    if (!outcome.coupling) continue;
    for (const dimension of dimensions) {
      const evidence = outcome.coupling[dimension];
      if (Array.isArray(evidence) && evidence.length > 0) {
        return `${outcome.id} has coupled ${dimension.replaceAll('_', ' ')}: ${evidence[0]}`;
      }
    }
  }
  return null;
}

export function selectExecutionProfile({
  outcomes,
  executionGraph = null,
  planned = true,
  requestedProfile = null,
  runtimeCapability = {},
  workerBudget = DEFAULT_WORKER_BUDGET,
}) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    throw new TypeError('outcomes must contain at least one execution outcome');
  }
  if (!Number.isInteger(workerBudget) || workerBudget < 1) {
    throw new TypeError('workerBudget must be a positive integer');
  }
  if (requestedProfile && !Object.values(EXECUTION_PROFILES).includes(requestedProfile)) {
    throw new TypeError(`unsupported execution profile: ${requestedProfile}`);
  }
  const observedCapacity = Number.isInteger(runtimeCapability.worker_capacity)
    ? Math.max(0, runtimeCapability.worker_capacity)
    : 1;
  const delegatedWorkerLimit = Math.min(1, workerBudget, observedCapacity);
  const selectDelegated = (reason, graph = null, executionBoundary = 'worktree') => (
    delegated(reason, graph, executionBoundary, delegatedWorkerLimit)
  );
  let suppliedGraph = null;
  if (executionGraph !== null) {
    try {
      suppliedGraph = validateExecutionGraph(executionGraph);
    } catch (error) {
      return {
        ...selectDelegated(`Invalid supplied execution graph is blocked: ${error.message}`),
        blocked: true,
      };
    }
    const outcomeIds = outcomes.map(({ id }) => id).sort();
    const graphIds = suppliedGraph.tasks.map(({ id }) => id).sort();
    if (JSON.stringify(outcomeIds) !== JSON.stringify(graphIds)) {
      return {
        ...selectDelegated('Execution graph tasks must correspond one-to-one with outcomes; the supplied graph is blocked.'),
        blocked: true,
      };
    }
    if (planned && suppliedGraph.selected_profile === EXECUTION_PROFILES.delegated) {
      requestedProfile = EXECUTION_PROFILES.delegated;
    } else if (planned && requestedProfile === null) {
      requestedProfile = suppliedGraph.selected_profile;
    }
  }
  if (!planned && requestedProfile !== EXECUTION_PROFILES.delegated
      && requestedProfile !== EXECUTION_PROFILES.parallel
      && outcomes.length === 1) {
    return inline('One clear prompt-first outcome is owned by the main agent.');
  }
  if (requestedProfile === EXECUTION_PROFILES.inline && planned) {
    return selectDelegated('Persistent planned work cannot silently narrow to inline execution.');
  }
  if (planned && runtimeCapability.reviewer_binding !== true) {
    return {
      ...selectDelegated('Independent reviewer binding is unavailable for planned execution.'),
      blocked: true,
    };
  }

  let graph;
  try {
    graph = suppliedGraph || graphFromOutcomes(outcomes, workerBudget);
  } catch (error) {
    try {
      graph = legacySerialGraph(outcomes, workerBudget);
    } catch (compileError) {
      return {
        ...selectDelegated(`Legacy graph cannot be safely compiled: ${compileError.message}`),
        blocked: true,
      };
    }
    return selectDelegated(`Legacy or invalid graph evidence requires delegated serial execution: ${error.message}`, graph);
  }
  const readOnly = outcomes.every((outcome) => outcome.mutates === false);
  const executionBoundary = readOnly ? 'read-only' : 'worktree';
  if (readOnly && runtimeCapability.read_only_binding !== true) {
    return {
      ...selectDelegated('Reliable read-only worker binding is unavailable; reviewed execution is blocked.', graph, 'read-only'),
      blocked: true,
    };
  }
  if (!readOnly && runtimeCapability.task_worktree_binding !== true) {
    return {
      ...selectDelegated('Strict task-worktree binding is unavailable; planned execution is blocked.', graph, 'worktree'),
      blocked: true,
    };
  }
  const coupled = semanticCoupling(outcomes);
  if (coupled) return selectDelegated(`${coupled}; preserve one delegated reasoning context at a time.`, graph, executionBoundary);
  if (requestedProfile === EXECUTION_PROFILES.delegated) {
    return selectDelegated(
      suppliedGraph?.selected_profile === EXECUTION_PROFILES.delegated
        ? 'The authoritative plan graph selects delegated serial execution.'
        : 'Delegated serial execution was explicitly requested.',
      graph,
      executionBoundary,
    );
  }

  if (!readOnly && outcomes.some((outcome) => outcome.write_scope.length === 0)) {
    return selectDelegated('Mutating planned work without an explicit write scope lacks parallel-safety evidence.', graph);
  }
  const pair = findConcurrentTaskPair(graph);
  if (!pair) return selectDelegated('No conflict-free unordered task pair exists; the graph remains delegated serial.', graph, executionBoundary);

  const workerLimit = Math.min(
    outcomes.length,
    workerBudget,
    graph.max_parallel,
    observedCapacity,
  );
  const backpressure = observedCapacity < 2 || workerBudget < 2;
  return {
    kind: 'concurrent',
    profile: EXECUTION_PROFILES.parallel,
    reason: backpressure
      ? `The graph proves concurrent work (${pair.join(', ')}), but current capacity applies backpressure at ${workerLimit}.`
      : `The graph proves concurrent work (${pair.join(', ')}) with shared worker limit ${workerLimit}.`,
    worker_limit: workerLimit,
    execution_owner: 'leaf-worker',
    review_required: true,
    execution_boundary: readOnly ? 'read-only' : 'worktree',
    default_worker_budget: DEFAULT_WORKER_BUDGET,
    backpressure,
    concurrent_pair: pair,
    graph,
  };
}
