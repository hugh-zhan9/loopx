import { createHash } from 'node:crypto';

import {
  applyIntegratedResult,
  cleanupConcurrentWorkspaces,
  commitIntegratedResult,
  commitFinalFixWorkspace,
  createConcurrentWorkspaces,
  integratedResultIsApplied,
  integrateTaskCommits,
  reconcileCommittedTaskWorkspace,
} from './worktree-integration.mjs';
import {
  inspectGitTopology,
  inspectInvokingWorktree,
  resetOwnedWorktree,
  resetOwnedWorktreeToCommit,
  snapshotIntegrationTree,
  snapshotWorkspacePaths,
  verifyOwnedWorktree,
} from './git-isolation.mjs';
import {
  createRunManifest,
  loadRunManifest,
  removeRunManifest,
  writeRunManifest,
} from './run-manifest.mjs';
import { selectExecutionProfile } from './execution-profiles.mjs';
import { validateExecutionGraph } from './execution-graph.mjs';
import { parseTaskReviewResult } from './review-gate.mjs';
import { runReviewedTaskGraph } from './reviewed-task-runner.mjs';
import { reserveNextStages } from './scheduler.mjs';

const DEFAULT_WORKER_BUDGET = 4;

export function selectAdaptiveExecution({
  outcomes,
  executionGraph = null,
  runtimeCapability = {},
  workerBudget = DEFAULT_WORKER_BUDGET,
  planned = true,
  requestedProfile = null,
}) {
  return selectExecutionProfile({
    outcomes,
    executionGraph,
    runtimeCapability,
    workerBudget,
    planned,
    requestedProfile,
  });
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

async function buildVerifiedIntegration({ topology, runId, runState, taskResults, verifyCombined, persist }) {
  const reservationKey = 'controller:integration-commit';
  runState.active_workers[reservationKey] = {
    task_id: 'final-integration',
    role: 'integration-commit',
    status: 'committing',
    expected_head: runState.integration.workspace.head,
  };
  runState.integration.status = 'verifying';
  await persist();
  const integrated = await integrateTaskCommits({
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
    changed_paths: [...new Set(taskResults.flatMap(({ changed_paths: changedPaths }) => changedPaths))].sort(),
    integration_order: integrated.integration_order,
  });
  delete runState.integration.error;
  runState.ownership.integration = boundary.descriptor;
  delete runState.active_workers[reservationKey];
  await persist();
  return { boundary, integrationVerification };
}

async function applyAndVerifyIntegration({ cwd, runState, expectedPaths, verifyCombined, persist }) {
  let alreadyApplied = ['applied', 'verification-interrupted', 'verified'].includes(runState.application.status);
  const snapshotPaths = [...new Set([
    ...expectedPaths,
    ...runState.tasks.flatMap((task) => task.outcome.write_scope || task.write_scope || []),
    ...runState.tasks.flatMap((task) => task.outcome.relevant_paths || []),
  ])].sort();
  const expectedPostApplySnapshot = snapshotPaths.length > 0
    ? await snapshotWorkspacePaths({ cwd: runState.integration.workspace.path, paths: snapshotPaths })
    : [];
  if (!alreadyApplied && runState.application.status === 'pending' && runState.integration.commit) {
    const discoveredApplied = await integratedResultIsApplied({
      cwd,
      baselineHead: runState.baseline_head,
      boundaryCommit: runState.integration.commit,
      expectedPaths,
    });
    if (discoveredApplied) {
      const observedPostApplySnapshot = snapshotPaths.length > 0
        ? await snapshotWorkspacePaths({ cwd, paths: snapshotPaths })
        : [];
      if (JSON.stringify(observedPostApplySnapshot) !== JSON.stringify(expectedPostApplySnapshot)) {
        throw recoveryError(
          'adaptive_target_snapshot_mismatch',
          'target paths differ from the verified integration after an interrupted application',
          { expected: expectedPostApplySnapshot, observed: observedPostApplySnapshot },
        );
      }
      runState.application = {
        ...runState.application,
        status: 'applied',
        post_apply_snapshot: expectedPostApplySnapshot,
      };
      await persist();
      alreadyApplied = true;
    }
  }
  let applied = { changed_paths: expectedPaths };
  if (alreadyApplied) {
    const postApplySnapshot = runState.application.post_apply_snapshot;
    if (snapshotPaths.length > 0 && !Array.isArray(postApplySnapshot)) {
      throw recoveryError(
        'adaptive_target_snapshot_mismatch',
        'resumed application lacks a complete post-apply target snapshot',
      );
    }
    if (snapshotPaths.length > 0) {
      const currentPostApplySnapshot = await snapshotWorkspacePaths({
        cwd,
        paths: snapshotPaths,
      });
      if (JSON.stringify(currentPostApplySnapshot) !== JSON.stringify(postApplySnapshot)) {
        throw recoveryError('adaptive_target_snapshot_mismatch', 'target paths changed before resumed application verification', {
          expected: postApplySnapshot,
          observed: currentPostApplySnapshot,
        });
      }
    }
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
    const observedPostApplySnapshot = snapshotPaths.length > 0
      ? await snapshotWorkspacePaths({ cwd, paths: snapshotPaths })
      : [];
    if (JSON.stringify(observedPostApplySnapshot) !== JSON.stringify(expectedPostApplySnapshot)) {
      throw recoveryError(
        'adaptive_target_snapshot_mismatch',
        'target paths differ from the verified integration after application',
        { expected: expectedPostApplySnapshot, observed: observedPostApplySnapshot },
      );
    }
    runState.application = {
      ...runState.application,
      status: 'applied',
      post_apply_snapshot: expectedPostApplySnapshot,
    };
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
  runState.application = {
    ...runState.application,
    status: 'verified',
    verification: appliedVerification,
  };
  runState.status = 'active';
  delete runState.blocked_reason;
  await persist();
  return { applied, appliedVerification };
}

function finalCandidateBinding(runState) {
  return {
    commit: runState.integration.commit || 'read-only',
    verification_sha256: createHash('sha256')
      .update(JSON.stringify(runState.integration.verification))
      .digest('hex'),
  };
}

function validateFinalReviewResult(result, expectedAxis, expectedCandidate) {
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || result.schema !== 'loopx.final-review-result.v1' || result.axis !== expectedAxis) {
    throw recoveryError('adaptive_final_review_invalid', `final ${expectedAxis} review returned an invalid result`);
  }
  if (!['APPROVED', 'ISSUES_FOUND', 'NEEDS_CONTEXT'].includes(result.verdict)
      || !Array.isArray(result.findings)
      || !result.reviewer
      || JSON.stringify(result.candidate) !== JSON.stringify(expectedCandidate)) {
    throw recoveryError('adaptive_final_review_invalid', `final ${expectedAxis} review returned an invalid verdict`);
  }
  for (const field of ['id', 'model', 'platform']) {
    if (typeof result.reviewer[field] !== 'string' || result.reviewer[field].trim() === '') {
      throw recoveryError('adaptive_final_review_invalid', `final ${expectedAxis} reviewer identity is invalid`);
    }
  }
  for (const finding of result.findings) {
    if (!finding || typeof finding.id !== 'string'
        || !['Critical', 'Important', 'Minor'].includes(finding.severity)
        || typeof finding.summary !== 'string' || finding.summary.trim() === '') {
      throw recoveryError('adaptive_final_review_invalid', `final ${expectedAxis} review contains an invalid finding`);
    }
  }
  if (result.verdict === 'APPROVED' && result.findings.length > 0) {
    throw recoveryError('adaptive_final_review_invalid', `final ${expectedAxis} approval contains findings`);
  }
  if (result.verdict === 'ISSUES_FOUND' && result.findings.length === 0) {
    throw recoveryError('adaptive_final_review_invalid', `final ${expectedAxis} issues verdict has no findings`);
  }
  return structuredClone(result);
}

function validateReadOnlyTaskReview(response, taskId) {
  if (!response?.reviewer || typeof response.rawMessage !== 'string') {
    throw recoveryError('adaptive_review_response_invalid', `read-only reviewer response is invalid for ${taskId}`);
  }
  for (const field of ['id', 'model', 'platform']) {
    if (typeof response.reviewer[field] !== 'string' || response.reviewer[field].trim() === '') {
      throw recoveryError('adaptive_review_response_invalid', `read-only reviewer identity is invalid for ${taskId}`);
    }
  }
  const result = parseTaskReviewResult(response.rawMessage);
  if (result.task_id !== taskId) {
    throw recoveryError('adaptive_review_response_invalid', `read-only reviewer returned the wrong task id for ${taskId}`);
  }
  const blocking = result.findings.some(({ severity }) => ['Critical', 'Important'].includes(severity));
  if (blocking || result.spec_compliance === 'NEEDS_CONTEXT' || result.code_quality === 'NEEDS_CONTEXT') {
    throw recoveryError('adaptive_task_review_blocked', `read-only task review is not clean for ${taskId}`);
  }
  return { reviewer: structuredClone(response.reviewer), result };
}

function validateReadOnlyWorkerResult(result, taskId) {
  assertVerification(result?.verification, `worker ${taskId}`);
  if (!result?.worker || typeof result.worker !== 'object') {
    throw recoveryError('adaptive_worker_identity_invalid', `read-only implementer identity is missing for ${taskId}`);
  }
  for (const field of ['id', 'model', 'platform']) {
    if (typeof result.worker[field] !== 'string' || result.worker[field].trim() === '') {
      throw recoveryError('adaptive_worker_identity_invalid', `read-only implementer identity is invalid for ${taskId}`);
    }
  }
  return structuredClone(result);
}

async function dispatchManifestWorker({ runState, persist, key, record, operation }) {
  if (runState.active_workers[key]) {
    throw recoveryError('adaptive_worker_already_active', `worker reservation already exists: ${key}`);
  }
  runState.active_workers[key] = structuredClone(record);
  await persist();
  try {
    const result = await operation();
    if (record.retain_until) {
      runState.active_workers[key] = { ...structuredClone(record), status: 'completed' };
    } else {
      delete runState.active_workers[key];
    }
    await persist();
    return result;
  } catch (error) {
    const terminal = error?.workerTerminal === true
      || error?.reviewFailure?.originalReviewTerminal === true;
    if (terminal) {
      delete runState.active_workers[key];
    } else {
      runState.active_workers[key] = {
        ...structuredClone(record),
        status: 'uncertain',
        error: error instanceof Error ? error.message : String(error),
        native_identity: error?.workerIdentity && typeof error.workerIdentity === 'object'
          ? structuredClone(error.workerIdentity)
          : null,
      };
    }
    await persist();
    throw error;
  }
}

function completeReviewContext(reviewContext, outcomes) {
  if (!reviewContext || typeof reviewContext !== 'object' || Array.isArray(reviewContext)) {
    throw recoveryError('adaptive_review_context_incomplete', 'reviewContext must contain the complete source and plan');
  }
  const hasContent = (value) => (
    (typeof value === 'string' && value.trim() !== '')
    || (Array.isArray(value) && value.length > 0)
    || (value && typeof value === 'object' && Object.keys(value).length > 0)
  );
  if (!hasContent(reviewContext.source) || !hasContent(reviewContext.plan)) {
    throw recoveryError(
      'adaptive_review_context_incomplete',
      'final Spec review requires complete source and plan context before delegated mutation',
    );
  }
  return {
    ...structuredClone(reviewContext),
    acceptance: reviewContext.acceptance ?? outcomes.map(({ id, acceptance = [] }) => ({ id, acceptance })),
    scope: reviewContext.scope ?? outcomes.map(({ id, write_scope: writeScope = [], relevant_paths: relevantPaths = [] }) => ({
      id,
      write_scope: writeScope,
      relevant_paths: relevantPaths,
    })),
  };
}

async function recoverControllerReservations({ topology, runState }) {
  for (const [key, record] of Object.entries(runState.active_workers || {})) {
    if (record.role === 'task-commit') {
      const task = runState.tasks.find(({ id }) => id === record.task_id);
      if (!task || typeof record.expected_parent !== 'string'
          || typeof record.reviewed_diff_sha256 !== 'string'
          || !Array.isArray(record.changed_paths)) {
        throw recoveryError('adaptive_task_commit_recovery_mismatch', `invalid task commit reservation: ${key}`);
      }
      const recovered = await reconcileCommittedTaskWorkspace({
        topology,
        task: task.workspace,
        expectedParent: record.expected_parent,
        reviewedDiffSha256: record.reviewed_diff_sha256,
        changedPaths: record.changed_paths,
      });
      if (recovered.committed) {
        Object.assign(task, {
          status: 'integrated',
          commit: recovered.commit,
          changed_paths: recovered.changed_paths,
          workspace: recovered.descriptor,
        });
      } else {
        task.workspace = await resetOwnedWorktreeToCommit({
          topology,
          descriptor: task.workspace,
          commit: record.expected_parent,
          allowHeadMismatch: true,
        });
        task.status = 'failed';
        task.commit = null;
        task.changed_paths = [];
      }
      runState.ownership.tasks.find(({ id }) => id === task.id).workspace = task.workspace;
      delete runState.active_workers[key];
      continue;
    }
    if (record.role === 'integration-commit') {
      if (typeof record.expected_head !== 'string') {
        throw recoveryError('adaptive_integration_commit_recovery_mismatch', `invalid integration commit reservation: ${key}`);
      }
      runState.integration.workspace = await resetOwnedWorktreeToCommit({
        topology,
        descriptor: runState.integration.workspace,
        commit: record.expected_head,
        allowHeadMismatch: true,
      });
      runState.ownership.integration = runState.integration.workspace;
      Object.assign(runState.integration, {
        status: 'pending',
        verification: null,
        commit: null,
        changed_paths: [],
        integration_order: [],
      });
      runState.status = 'active';
      delete runState.integration.error;
      delete runState.active_workers[key];
    }
  }
}

async function runFinalReviews({
  runState,
  topology,
  workspace,
  dispatchFinalReviewer,
  persist,
  disallowedReviewerIds = new Set(),
}) {
  if (typeof dispatchFinalReviewer !== 'function') {
    throw recoveryError('adaptive_final_reviewer_unavailable', 'delegated execution requires independent final Spec and Standards reviewers');
  }
  const axes = ['spec', 'standards'];
  const candidate = finalCandidateBinding(runState);
  const candidateSnapshot = await snapshotIntegrationTree({
    topology,
    descriptor: runState.integration.workspace,
  });
  runState.final_review.status = 'reviewing';
  await persist();
  try {
    const execution = await mapWithLimit(axes, Math.min(runState.worker_limit, axes.length), async (axis) => {
      const result = await dispatchManifestWorker({
        runState,
        persist,
        key: `final:${axis}:${runState.final_review.attempt || 1}`,
        record: {
          task_id: 'final-integration',
          role: `final-${axis}`,
          status: 'active',
          retain_until: 'post-review-snapshot',
        },
        operation: () => dispatchFinalReviewer({
          axis,
          attempt: runState.final_review.attempt || 1,
          workspace,
          verification: runState.integration.verification,
          candidate,
          reviewContext: runState.review_context,
          tasks: runState.tasks.map(({ outcome, changed_paths: changedPaths }) => ({ outcome, changed_paths: changedPaths })),
          baselineHead: runState.baseline_head,
          boundaryCommit: runState.integration.commit,
          readOnly: true,
          leafInstruction: LEAF_INSTRUCTION,
        }),
      });
      return validateFinalReviewResult(result, axis, candidate);
    });
    if (execution.failures.length > 0) throw execution.failures[0].error;
    let reviewedSnapshot;
    try {
      reviewedSnapshot = await snapshotIntegrationTree({
        topology,
        descriptor: runState.integration.workspace,
      });
    } catch (error) {
      throw recoveryError(
        'adaptive_final_reviewer_mutated_candidate',
        'final reviewers must leave the integration candidate byte-identical',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    if (JSON.stringify(reviewedSnapshot) !== JSON.stringify(candidateSnapshot)) {
      throw recoveryError('adaptive_final_reviewer_mutated_candidate', 'final reviewers must leave the integration candidate byte-identical');
    }
    for (const axis of axes) {
      delete runState.active_workers[`final:${axis}:${runState.final_review.attempt || 1}`];
    }
    await persist();
    if (execution.results[0].reviewer.id === execution.results[1].reviewer.id) {
      throw recoveryError('adaptive_final_review_not_independent', 'Spec and Standards reviews require distinct reviewer identities');
    }
    for (const { reviewer } of execution.results) {
      if (!runState.final_review.workers.reviewers.some(({ id }) => id === reviewer.id)) {
        runState.final_review.workers.reviewers.push(structuredClone(reviewer));
      }
    }
    await persist();
    if (execution.results.some(({ reviewer }) => disallowedReviewerIds.has(reviewer.id))) {
      throw recoveryError('adaptive_final_review_not_fresh', 'post-fix final review requires fresh reviewer identities');
    }
    const blocking = execution.results.flatMap(({ findings }) => findings)
      .filter(({ severity }) => ['Critical', 'Important'].includes(severity));
    const needsContext = execution.results.some(({ verdict }) => verdict === 'NEEDS_CONTEXT');
    const priorAttempt = runState.final_review.attempt || 1;
    const priorFixAttempt = runState.final_review.fix_attempt || 0;
    runState.final_review = {
      status: blocking.length > 0 || needsContext ? 'blocked' : 'approved',
      attempt: priorAttempt,
      fix_attempt: priorFixAttempt,
      spec: execution.results[0],
      standards: execution.results[1],
      workers: runState.final_review.workers,
    };
    await persist();
    if (runState.final_review.status !== 'approved') {
      throw recoveryError('adaptive_final_review_blocked', 'final review contains unresolved blocking findings', {
        blocking,
        needs_context: needsContext,
      });
    }
    return runState.final_review;
  } catch (error) {
    const finalWorkers = Object.entries(runState.active_workers || {})
      .filter(([, { task_id: taskId }]) => taskId === 'final-integration');
    const finalWorkerUncertain = finalWorkers.some(([, { status }]) => status !== 'completed');
    if (!finalWorkerUncertain) {
      for (const [key] of finalWorkers) delete runState.active_workers[key];
      runState.integration.workspace = await resetOwnedWorktree({
        topology,
        descriptor: runState.integration.workspace,
      });
      runState.ownership.integration = runState.integration.workspace;
    }
    runState.status = 'blocked';
    runState.final_review.status = 'blocked';
    runState.final_review.error = error instanceof Error ? error.message : String(error);
    await persist();
    throw error;
  }
}

async function executeFinalFixAttempt({
  runState,
  topology,
  runId,
  attempt,
  findings,
  priorReviewerIds,
  dispatchFixer,
  verifyCombined,
  persist,
}) {
  const key = `final:fix:${attempt}`;
  const record = { task_id: 'final-integration', role: 'fix', attempt, status: 'active' };
  if (runState.active_workers[key]) {
    throw recoveryError('adaptive_worker_already_active', `worker reservation already exists: ${key}`);
  }
  runState.active_workers[key] = structuredClone(record);
  await persist();

  let fixed;
  try {
    fixed = await dispatchFixer({
      taskId: 'final-integration',
      outcomes: runState.tasks.map(({ outcome }) => outcome),
      workspace: runState.integration.workspace.path,
      findings,
      attempt,
      leafInstruction: LEAF_INSTRUCTION,
    });
  } catch (error) {
    const terminal = error?.workerTerminal === true
      || error?.reviewFailure?.originalReviewTerminal === true;
    if (terminal) {
      delete runState.active_workers[key];
      runState.integration.workspace = await resetOwnedWorktree({
        topology,
        descriptor: runState.integration.workspace,
      });
      runState.ownership.integration = runState.integration.workspace;
    } else {
      runState.active_workers[key] = {
        ...record,
        status: 'uncertain',
        error: error instanceof Error ? error.message : String(error),
        native_identity: error?.workerIdentity && typeof error.workerIdentity === 'object'
          ? structuredClone(error.workerIdentity)
          : null,
      };
    }
    await persist();
    throw error;
  }

  try {
    if (!fixed?.worker || priorReviewerIds.has(fixed.worker.id)
        || ['id', 'model', 'platform'].some((field) => (
          typeof fixed.worker[field] !== 'string' || fixed.worker[field].trim() === ''
        ))) {
      throw recoveryError('adaptive_final_fixer_not_independent', 'final fixer must have a fresh worker identity');
    }
    priorReviewerIds.add(fixed.worker.id);
    if (!runState.final_review.workers.fixers.some(({ id }) => id === fixed.worker.id)) {
      runState.final_review.workers.fixers.push(structuredClone(fixed.worker));
    }
    runState.active_workers[key] = {
      ...record,
      status: 'validating',
      native_identity: structuredClone(fixed.worker),
    };
    await persist();
    assertVerification(fixed.verification, 'final fix');
    const combined = assertVerification(await verifyCombined({
      phase: 'final-fix',
      workspace: runState.integration.workspace.path,
    }), 'final fix integration');
    runState.active_workers[key].status = 'committing';
    await persist();
    const committed = await commitFinalFixWorkspace({
      topology,
      integration: runState.integration.workspace,
      writeScope: runState.tasks.flatMap(({ write_scope: writeScope }) => writeScope),
      verification: combined,
      message: `loopx final fix: ${runId} attempt ${attempt}`,
    });
    runState.integration = {
      ...runState.integration,
      status: 'verified',
      verification: combined,
      commit: committed.commit,
      workspace: committed.descriptor,
      changed_paths: [...new Set([
        ...(runState.integration.changed_paths || []),
        ...committed.changed_paths,
      ])].sort(),
    };
    runState.ownership.integration = committed.descriptor;
    runState.final_review = {
      status: 'pending',
      attempt: (runState.final_review.attempt || 1) + 1,
      fix_attempt: attempt,
      spec: null,
      standards: null,
      workers: runState.final_review.workers,
    };
    runState.status = 'active';
    delete runState.active_workers[key];
    await persist();
  } catch (error) {
    delete runState.active_workers[key];
    runState.integration.workspace = await resetOwnedWorktree({
      topology,
      descriptor: runState.integration.workspace,
    });
    runState.ownership.integration = runState.integration.workspace;
    await persist();
    throw error;
  }
}

async function closeFinalReview({
  runState,
  topology,
  runId,
  dispatchFinalReviewer,
  dispatchFixer,
  verifyCombined,
  persist,
  maxFixAttempts = 2,
}) {
  const priorReviewerIds = new Set(runState.tasks.flatMap(({ workers = {} }) => [
    ...(workers.implementers || []),
    ...(workers.reviewers || []),
    ...(workers.fixers || []),
  ]).concat([
    ...(runState.final_review.workers?.reviewers || []),
    ...(runState.final_review.workers?.fixers || []),
  ]).map(({ id }) => id));
  while (true) {
    let reviewError = null;
    const persistedResults = [runState.final_review.spec, runState.final_review.standards].filter(Boolean);
    const persistedBlocking = persistedResults.flatMap(({ findings = [] }) => findings)
      .filter(({ severity }) => ['Critical', 'Important'].includes(severity));
    const persistedNeedsContext = persistedResults.some(({ verdict }) => verdict === 'NEEDS_CONTEXT');
    const persistedCandidateCurrent = persistedResults.length === 2
      && persistedResults.every(({ candidate }) => (
        JSON.stringify(candidate) === JSON.stringify(finalCandidateBinding(runState))
      ));
    if (runState.final_review.status === 'blocked' && persistedCandidateCurrent
        && (persistedBlocking.length > 0 || persistedNeedsContext)) {
      reviewError = recoveryError('adaptive_final_review_blocked', 'persisted final review remains unresolved', {
        blocking: persistedBlocking,
        needs_context: persistedNeedsContext,
      });
    }
    try {
      if (!reviewError) {
        return await runFinalReviews({
          runState,
          topology,
          workspace: runState.integration.workspace.path,
          dispatchFinalReviewer,
          persist,
          disallowedReviewerIds: priorReviewerIds,
        });
      }
    } catch (error) {
      reviewError = error;
    }
    {
      const error = reviewError;
      if (error.code !== 'adaptive_final_review_blocked' || error.details?.needs_context) throw error;
      if (typeof dispatchFixer !== 'function') throw error;
      const attempt = (runState.final_review.fix_attempt || 0) + 1;
      if (attempt > maxFixAttempts) {
        throw recoveryError('adaptive_final_fix_attempts_exhausted', 'final fix attempts are exhausted');
      }
      for (const axis of ['spec', 'standards']) {
        const id = runState.final_review[axis]?.reviewer?.id;
        if (id) priorReviewerIds.add(id);
      }
      const findings = ['spec', 'standards'].flatMap((axis) => runState.final_review[axis]?.findings || [])
        .filter(({ severity }) => ['Critical', 'Important'].includes(severity));
      await executeFinalFixAttempt({
        runState,
        topology,
        runId,
        attempt,
        findings,
        priorReviewerIds,
        dispatchFixer,
        verifyCombined,
        persist,
      });
    }
  }
}

function executionGraphForSelection(selection, outcomes, workerBudget) {
  if (selection.graph) return selection.graph;
  try {
    return validateExecutionGraph({
      schema: 'loopx.execution-graph.v1',
      selected_profile: selection.profile,
      selection_rationale: selection.reason,
      max_parallel: workerBudget,
      tasks: outcomes.map((outcome) => ({
        id: outcome.id,
        outcome: outcome.outcome,
        depends_on: outcome.depends_on || [],
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
  } catch {
    return null;
  }
}

export async function runAdaptiveExecution({
  cwd,
  runId,
  outcomes,
  executionGraph = null,
  runtimeCapability,
  workerBudget = DEFAULT_WORKER_BUDGET,
  planned = true,
  requestedProfile = null,
  dispatchWorker,
  dispatchReviewer = null,
  dispatchFixer = null,
  dispatchFinalReviewer = null,
  reviewContext = {},
  verifyCombined,
}) {
  const effectiveRuntimeCapability = {
    ...runtimeCapability,
    reviewer_binding: runtimeCapability?.reviewer_binding ?? typeof dispatchReviewer === 'function',
  };
  const selection = selectAdaptiveExecution({
    outcomes,
    executionGraph,
    runtimeCapability: effectiveRuntimeCapability,
    workerBudget,
    planned,
    requestedProfile,
  });
  if (selection.profile === 'inline-owned-v1') return selection;
  if (selection.worker_limit === 0) {
    return { ...selection, backpressure: true, dispatched: 0 };
  }
  const graph = executionGraphForSelection(selection, outcomes, workerBudget);
  if (!graph || selection.blocked) {
    throw recoveryError('adaptive_execution_graph_unavailable', selection.reason);
  }
  const effectiveReviewContext = completeReviewContext(reviewContext, outcomes);
  if (selection.execution_boundary === 'read-only') {
    if (typeof dispatchWorker !== 'function' || typeof dispatchReviewer !== 'function'
        || typeof dispatchFinalReviewer !== 'function' || typeof verifyCombined !== 'function') {
      throw new TypeError('reviewed read-only execution requires implementer, task reviewer, final reviewer, and verification dispatch');
    }
    const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
    const readOnlyState = {
      worker_limit: selection.worker_limit,
      active_workers: {},
      tasks: graph.tasks.map(({ id }) => ({ id, status: 'pending', attempts: { implementation: 0 } })),
    };
    const executionResults = [];
    const taskReviewResults = [];
    while (readOnlyState.tasks.some(({ status }) => status !== 'integrated')) {
      const decision = reserveNextStages({
        manifest: graph,
        state: readOnlyState,
        runtimeCapacity: selection.worker_limit,
      });
      const reservations = decision.reservations.filter(({ role }) => role === 'implementation');
      if (reservations.length === 0) {
        throw recoveryError('adaptive_execution_deadlock', 'no read-only task can advance');
      }
      const batch = await mapWithLimit(reservations, selection.worker_limit, async ({ task_id: taskId }) => {
        const outcome = outcomeById.get(taskId);
        const implementation = validateReadOnlyWorkerResult(await dispatchWorker({
          outcome,
          workspace: cwd,
          readOnly: true,
          leafInstruction: LEAF_INSTRUCTION,
        }), taskId);
        const review = validateReadOnlyTaskReview(await dispatchReviewer({
          taskId,
          outcome,
          implementation,
          verification: implementation.verification,
          workspace: cwd,
          readOnly: true,
          leafInstruction: LEAF_INSTRUCTION,
        }), taskId);
        if (review.reviewer.id === implementation.worker.id) {
          throw recoveryError('adaptive_reviewer_not_independent', `reviewer must differ from implementer for ${taskId}`);
        }
        return { taskId, implementation, review };
      });
      if (batch.failures.length > 0) throw batch.failures[0].error;
      for (const result of batch.results) {
        readOnlyState.tasks.find(({ id }) => id === result.taskId).status = 'integrated';
        executionResults.push(result.implementation);
        taskReviewResults.push(result.review);
      }
    }
    const combinedVerification = assertVerification(await verifyCombined({
      phase: 'read-only',
      workspace: cwd,
    }), 'read-only');
    const readOnlyCandidate = {
      commit: 'read-only',
      verification_sha256: createHash('sha256').update(JSON.stringify(combinedVerification)).digest('hex'),
    };
    const finalResults = await mapWithLimit(['spec', 'standards'], Math.min(selection.worker_limit, 2), async (axis) => (
      validateFinalReviewResult(await dispatchFinalReviewer({
        axis,
        workspace: cwd,
        verification: combinedVerification,
        candidate: readOnlyCandidate,
        reviewContext: effectiveReviewContext,
        tasks: outcomes.map((outcome) => ({ outcome, changed_paths: [] })),
        readOnly: true,
        leafInstruction: LEAF_INSTRUCTION,
      }), axis, readOnlyCandidate)
    ));
    if (finalResults.failures.length > 0) throw finalResults.failures[0].error;
    if (finalResults.results[0].reviewer.id === finalResults.results[1].reviewer.id) {
      throw recoveryError('adaptive_final_review_not_independent', 'Spec and Standards reviews require distinct reviewer identities');
    }
    const earlierWorkerIds = new Set([
      ...executionResults.map(({ worker }) => worker.id),
      ...taskReviewResults.map(({ reviewer }) => reviewer.id),
    ]);
    if (finalResults.results.some(({ reviewer }) => earlierWorkerIds.has(reviewer.id))) {
      throw recoveryError('adaptive_final_review_not_independent', 'final reviewers must differ from task workers');
    }
    const finalBlocking = finalResults.results.flatMap(({ findings }) => findings)
      .some(({ severity }) => ['Critical', 'Important'].includes(severity));
    const finalNeedsContext = finalResults.results.some(({ verdict }) => verdict === 'NEEDS_CONTEXT');
    if (finalBlocking || finalNeedsContext) {
      throw recoveryError('adaptive_final_review_blocked', 'read-only final review is not clean');
    }
    return {
      ...selection,
      changed_paths: [],
      verification: { workers: executionResults.map(({ verification }) => verification), combined: combinedVerification },
      review: { tasks: taskReviewResults, spec: finalResults.results[0], standards: finalResults.results[1] },
    };
  }
  const writeScope = outcomes.flatMap((outcome) => outcome.write_scope);
  const relevantPaths = outcomes.flatMap((outcome) => outcome.relevant_paths || []);
  const inspectedWorkspace = await inspectInvokingWorktree({ cwd, writeScope, relevantPaths });
  if (inspectedWorkspace.execution_overlap.length > 0) {
    return {
      ...selection,
      blocked: true,
      reason: `User changes overlap ${inspectedWorkspace.execution_overlap.join(', ')}; reviewed work cannot safely apply to the target.`,
    };
  }
  if (typeof dispatchWorker !== 'function' || typeof dispatchReviewer !== 'function'
      || typeof dispatchFinalReviewer !== 'function' || typeof verifyCombined !== 'function') {
    throw new TypeError('delegated execution requires implementer, task reviewer, final reviewers, and combined verification');
  }

  const normalizedOutcomes = outcomes.map((outcome) => ({
    ...outcome,
    ...graph.tasks.find((task) => task.id === outcome.id),
  }));
  const workspaces = await createConcurrentWorkspaces({
    cwd,
    runId,
    outcomes: normalizedOutcomes,
    inspectedWorkspace,
  });
  const manifest = await createRunManifest({
    cwd: workspaces.topology.invoking_root,
    runId,
    baselineHead: workspaces.baseline_head,
    targetSnapshot: workspaces.target_snapshot,
    outcomes: normalizedOutcomes,
    workerLimit: selection.worker_limit,
    configuredWorkerLimit: Math.min(workerBudget, graph.max_parallel),
    profile: selection.profile,
    ownership: {
      invoking_root: workspaces.topology.invoking_root,
      common_dir: workspaces.topology.common_dir,
      branch: workspaces.topology.branch,
      integration: workspaces.integration,
      tasks: normalizedOutcomes.map((outcome, index) => ({ id: outcome.id, workspace: workspaces.tasks[index] })),
    },
    reviewContext: effectiveReviewContext,
  });
  const { runState } = manifest;
  const persistManifest = createManifestWriter(manifest);
  const taskResults = await runReviewedTaskGraph({
    cwd: workspaces.topology.invoking_root,
    runId,
    graph,
    runState,
    topology: workspaces.topology,
    runtimeCapacity: Math.max(1, effectiveRuntimeCapability.worker_capacity || 1),
    dispatchWorker,
    dispatchReviewer,
    dispatchFixer,
    persist: persistManifest,
  });
  const { boundary, integrationVerification } = await buildVerifiedIntegration({
    topology: workspaces.topology,
    runId,
    runState,
    taskResults,
    verifyCombined,
    persist: persistManifest,
  });
  const finalReview = await closeFinalReview({
    runState,
    topology: workspaces.topology,
    runId,
    dispatchFinalReviewer,
    dispatchFixer,
    verifyCombined,
    persist: persistManifest,
  });
  const expectedPaths = runState.integration.changed_paths;
  const { applied, appliedVerification } = await applyAndVerifyIntegration({
    cwd: workspaces.topology.invoking_root,
    runState,
    expectedPaths,
    verifyCombined,
    persist: persistManifest,
  });

  await cleanupConcurrentWorkspaces({
    topology: workspaces.topology,
    integration: runState.integration.workspace,
    taskResults,
  });
  await removeRunManifest(manifest);

  return {
    ...selection,
    changed_paths: applied.changed_paths,
    integration_order: runState.integration.integration_order,
    verification: { integration: runState.integration.verification, applied: appliedVerification },
    review: {
      tasks: taskResults.map(({ outcome, review }) => ({ task_id: outcome.id, ...review })),
      final: finalReview,
    },
  };
}

function recoveryError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export async function resumeAdaptiveExecution({
  cwd,
  runId,
  dispatchWorker = null,
  dispatchReviewer = null,
  dispatchFixer = null,
  dispatchFinalReviewer = null,
  runtimeCapability = {},
  confirmWorkerTerminal = null,
  reviewContext = null,
  verifyCombined,
}) {
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
  const controllerReservationCount = Object.values(runState.active_workers || {})
    .filter(({ role }) => ['task-commit', 'integration-commit'].includes(role)).length;
  if (controllerReservationCount > 0) {
    await recoverControllerReservations({ topology, runState });
    await writeRunManifest(manifest);
  }
  if (Object.keys(runState.active_workers || {}).length > 0) {
    if (typeof confirmWorkerTerminal !== 'function') {
      throw recoveryError(
        'adaptive_worker_terminal_unproven',
        'cannot resume while a persisted worker lacks terminal proof',
        runState.active_workers,
      );
    }
    for (const [key, record] of Object.entries(runState.active_workers)) {
      const proof = await confirmWorkerTerminal({ runId, key, worker: structuredClone(record) });
      if (proof?.terminal !== true) {
        throw recoveryError('adaptive_worker_terminal_unproven', `worker ${key} is not proven terminal`, record);
      }
      if (record.task_id === 'final-integration') {
        runState.integration.workspace = await resetOwnedWorktreeToCommit({
          topology,
          descriptor: runState.integration.workspace,
          commit: runState.integration.workspace.head,
          allowHeadMismatch: true,
        });
        runState.ownership.integration = runState.integration.workspace;
      } else {
        const task = runState.tasks.find(({ id }) => id === record.task_id);
        if (!task) {
          throw recoveryError('adaptive_task_state_missing', `active worker references unknown task ${record.task_id}`);
        }
        task.workspace = await resetOwnedWorktreeToCommit({
          topology,
          descriptor: task.workspace,
          commit: task.workspace.head,
          allowHeadMismatch: true,
        });
        runState.ownership.tasks.find(({ id }) => id === task.id).workspace = task.workspace;
      }
      delete runState.active_workers[key];
    }
    await writeRunManifest(manifest);
  }
  await verifyOwnedWorktree({ topology, descriptor: runState.ownership.integration });
  for (const task of runState.tasks) {
    await verifyOwnedWorktree({ topology, descriptor: task.workspace });
  }
  if (runtimeCapability.worker_capacity === 0) {
    return {
      kind: runState.profile === 'parallel-strict-v1' ? 'concurrent' : 'serial',
      profile: runState.profile,
      resumed: false,
      backpressure: true,
      dispatched: 0,
    };
  }

  const persistManifest = createManifestWriter(manifest);
  runState.review_context = completeReviewContext(
    { ...runState.review_context, ...(reviewContext || {}) },
    runState.tasks.map(({ outcome }) => outcome),
  );
  await persistManifest();
  let resetLegacyIntegration = false;
  for (const task of runState.tasks) {
    if (!task.legacy_unreviewed) continue;
    task.workspace = await resetOwnedWorktreeToCommit({
      topology,
      descriptor: task.workspace,
      commit: runState.baseline_head,
    });
    task.status = 'failed';
    task.commit = null;
    task.changed_paths = [];
    task.verification = null;
    task.review = null;
    delete task.legacy_unreviewed;
    runState.ownership.tasks.find(({ id }) => id === task.id).workspace = task.workspace;
    resetLegacyIntegration = true;
  }
  if (resetLegacyIntegration) {
    runState.integration.workspace = await resetOwnedWorktreeToCommit({
      topology,
      descriptor: runState.integration.workspace,
      commit: runState.baseline_head,
    });
    runState.ownership.integration = runState.integration.workspace;
    runState.integration = {
      ...runState.integration,
      status: 'pending',
      verification: null,
      commit: null,
      changed_paths: [],
      integration_order: [],
    };
    runState.final_review = {
      status: 'pending',
      attempt: 1,
      fix_attempt: 0,
      spec: null,
      standards: null,
      workers: { reviewers: [], fixers: [] },
    };
    runState.application = { status: 'pending', verification: null, post_apply_snapshot: null };
  }
  await persistManifest();
  const graph = validateExecutionGraph({
    schema: 'loopx.execution-graph.v1',
    selected_profile: runState.profile,
    selection_rationale: 'Resuming the persisted execution profile.',
    max_parallel: runState.configured_worker_limit,
    tasks: runState.tasks.map((task) => ({
      id: task.id,
      outcome: task.outcome.outcome,
      depends_on: task.depends_on,
      write_scope: task.write_scope,
      relevant_paths: task.outcome.relevant_paths || [],
      exclusive_resources: task.outcome.exclusive_resources || [],
      parallel_safe: task.outcome.parallel_safe,
      parallel_rationale: task.outcome.parallel_rationale,
      interfaces: task.outcome.interfaces,
      source_anchors: task.outcome.source_anchors,
      acceptance: task.outcome.acceptance,
      verification: task.outcome.verification,
      expected_evidence: task.outcome.expected_evidence,
      review_focus: task.outcome.review_focus,
    })),
  });
  for (const task of runState.tasks) {
    if (!['pending', 'integrated'].includes(task.status)) task.status = 'failed';
  }
  let taskResults = runState.tasks.map((task) => ({
    outcome: task.outcome,
    verification: task.verification,
    review: task.review,
    commit: task.commit,
    changed_paths: task.changed_paths,
    descriptor: task.workspace,
  }));
  if (runState.tasks.some((task) => task.status !== 'integrated')) {
    taskResults = await runReviewedTaskGraph({
      cwd: topology.invoking_root,
      runId,
      graph,
      runState,
      topology,
      runtimeCapacity: Math.max(1, runtimeCapability.worker_capacity || runState.worker_limit),
      dispatchWorker,
      dispatchReviewer,
      dispatchFixer,
      persist: persistManifest,
    });
  }
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

  if (runState.final_review?.status !== 'approved') {
    await closeFinalReview({
      runState,
      topology,
      runId,
      dispatchFinalReviewer,
      dispatchFixer,
      verifyCombined,
      persist: persistManifest,
    });
  }

  const expectedPaths = runState.integration.changed_paths
    || [...new Set(runState.tasks.flatMap((task) => task.changed_paths))].sort();
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
    kind: runState.profile === 'parallel-strict-v1' ? 'concurrent' : 'serial',
    profile: runState.profile,
    resumed: true,
    changed_paths: applied.changed_paths,
    verification: { integration: runState.integration.verification, applied: appliedVerification },
  };
}
