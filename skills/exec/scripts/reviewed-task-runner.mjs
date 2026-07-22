import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  captureTaskReviewArtifact,
  decideReviewerReplacement,
  evaluateTaskReviewGate,
} from './review-gate.mjs';
import { reserveNextStages } from './scheduler.mjs';
import {
  commitTaskWorkspace,
  prepareTaskWorkspace,
} from './worktree-integration.mjs';
import { changedPathsFromStatus, resetOwnedWorktree } from './git-isolation.mjs';

const execFileAsync = promisify(execFile);
const LEAF_INSTRUCTION = 'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function candidateHashes(inputs) {
  return {
    brief_sha256: sha256(inputs.brief),
    report_sha256: sha256(inputs.report),
    diff_package_sha256: sha256(inputs.diffPackage),
    verification_sha256: sha256(inputs.verification),
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assertVerification(result, phase) {
  if (result?.status !== 'passed' || !Array.isArray(result.commands) || result.commands.length === 0) {
    fail('adaptive_verification_failed', `${phase} verification is missing or failed`);
  }
  return structuredClone(result);
}

function assertWorkerIdentity(worker, role, taskId) {
  if (!worker || typeof worker !== 'object') {
    fail('adaptive_worker_identity_invalid', `${role} identity is missing for ${taskId}`);
  }
  for (const field of ['id', 'model', 'platform']) {
    if (typeof worker[field] !== 'string' || worker[field].trim() === '') {
      fail('adaptive_worker_identity_invalid', `${role} identity is invalid for ${taskId}`);
    }
  }
  return structuredClone(worker);
}

async function mapWithLimit(items, limit, operation) {
  const results = new Array(items.length);
  const failures = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await operation(items[index], index);
      } catch (error) {
        failures.push({ index, error });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, () => worker()));
  return { results, failures };
}

async function dispatchTracked({ runState, persist, key, record, operation }) {
  if (runState.active_workers[key]) fail('adaptive_worker_already_active', `worker reservation already exists: ${key}`);
  runState.active_workers[key] = structuredClone(record);
  await persist();
  try {
    const result = await operation();
    delete runState.active_workers[key];
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

function taskRecord(runState, taskId) {
  const record = runState.tasks.find((task) => task.id === taskId);
  if (!record) fail('adaptive_task_state_missing', `run state is missing task ${taskId}`);
  return record;
}

function ancestorIds(graph, taskId) {
  const byId = new Map(graph.tasks.map((task) => [task.id, task]));
  const ordered = [];
  const visited = new Set();
  function visit(id) {
    for (const dependency of byId.get(id).depends_on) {
      if (visited.has(dependency)) continue;
      visit(dependency);
      visited.add(dependency);
      ordered.push(dependency);
    }
  }
  visit(taskId);
  return ordered;
}

async function taskDiff(workspace) {
  await execFileAsync('git', ['add', '--intent-to-add', '--all'], { cwd: workspace });
  return (await execFileAsync('git', ['diff', '--binary', 'HEAD', '--'], {
    cwd: workspace,
    maxBuffer: 16 * 1024 * 1024,
  })).stdout;
}

async function taskChangedPaths(workspace) {
  const status = (await execFileAsync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    cwd: workspace,
    maxBuffer: 16 * 1024 * 1024,
  })).stdout;
  return changedPathsFromStatus(status);
}

async function writeEvidenceFile(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { mode: 0o600 });
  return path;
}

async function readCandidateInputs(paths) {
  return {
    brief: await readFile(paths.brief, 'utf8'),
    report: await readFile(paths.report, 'utf8'),
    diffPackage: await readFile(paths.diffPackage, 'utf8'),
    verification: await readFile(paths.verification, 'utf8'),
  };
}

async function assertCandidateEvidenceCurrent(candidate, taskId) {
  const currentInputs = await readCandidateInputs(candidate.paths);
  if (JSON.stringify(candidateHashes(currentInputs)) !== JSON.stringify(candidateHashes(candidate.inputs))) {
    fail('adaptive_review_evidence_changed', `task review evidence changed after capture: ${taskId}`);
  }
  return currentInputs;
}

async function persistCandidate({ cwd, runId, task, implementation, verification, workspace, candidateAttempt }) {
  const root = join(resolve(cwd), '.loopx', 'exec', runId, 'tasks', task.id, `candidate-${candidateAttempt}`);
  const brief = `${JSON.stringify(task.outcome, null, 2)}\n`;
  const report = typeof implementation?.report === 'string'
    ? implementation.report
    : `${JSON.stringify(implementation || {}, null, 2)}\n`;
  const diffPackage = await taskDiff(workspace);
  const verificationText = `${JSON.stringify(verification, null, 2)}\n`;
  const paths = {
    brief: await writeEvidenceFile(join(root, 'task-brief.json'), brief),
    report: await writeEvidenceFile(join(root, 'implementer-report.md'), report),
    diffPackage: await writeEvidenceFile(join(root, 'review.diff'), diffPackage),
    verification: await writeEvidenceFile(join(root, 'verification.json'), verificationText),
  };
  return {
    paths,
    inputs: { brief, report, diffPackage, verification: verificationText },
  };
}

async function dispatchAndCaptureReview({
  cwd,
  runId,
  task,
  workspace,
  candidate,
  reviewAttempt,
  dispatchReviewer,
  implementerWorker,
  runState,
  persist,
}) {
  const response = await dispatchTracked({
    runState,
    persist,
    key: `${task.id}:review:${reviewAttempt}`,
    record: { task_id: task.id, role: 'review', attempt: reviewAttempt, status: 'active' },
    operation: () => dispatchReviewer({
      taskId: task.id,
      outcome: task.outcome,
      workspace,
      attempt: reviewAttempt,
      inputs: candidate.inputs,
      paths: candidate.paths,
      readOnly: true,
      leafInstruction: LEAF_INSTRUCTION,
    }),
  });
  if (!response?.reviewer || typeof response.rawMessage !== 'string') {
    fail('adaptive_review_response_invalid', `reviewer response is invalid for ${task.id}`);
  }
  if (response.reviewer.id === implementerWorker.id) {
    fail('adaptive_reviewer_not_independent', `reviewer must differ from implementer for ${task.id}`);
  }
  const captured = await captureTaskReviewArtifact({
    cwd,
    runId,
    taskId: task.id,
    reviewer: response.reviewer,
    attempt: reviewAttempt,
    inputs: candidate.inputs,
    rawMessage: response.rawMessage,
  });
  return {
    ...captured,
    expected: {
      taskId: task.id,
      reviewer: response.reviewer,
      attempt: reviewAttempt,
      inputs: candidate.inputs,
    },
  };
}

async function reviewCandidate({
  cwd,
  runId,
  task,
  workspace,
  implementation,
  verification,
  dispatchReviewer,
  dispatchFixer,
  persist,
  maxFixAttempts,
  runState,
}) {
  let currentImplementation = implementation;
  let currentVerification = verification;
  let previousReview = null;
  let candidateAttempt = task.attempts.fix + 1;
  let replacementUsed = false;

  while (true) {
    const candidate = await persistCandidate({
      cwd,
      runId,
      task,
      implementation: currentImplementation,
      verification: currentVerification,
      workspace,
      candidateAttempt,
    });
    task.status = 'reviewing';
    task.attempts.review += 1;
    await persist();

    let captured;
    try {
      captured = await dispatchAndCaptureReview({
        cwd,
        runId,
        task,
        workspace,
        candidate,
        reviewAttempt: task.attempts.review,
        dispatchReviewer,
        implementerWorker: assertWorkerIdentity(currentImplementation.worker, 'implementer', task.id),
        runState,
        persist,
      });
    } catch (error) {
      const invalidArtifact = error?.code?.startsWith('review_');
      const failureProof = invalidArtifact ? {
        failure: 'invalid_artifact',
        reviewerActive: false,
        originalReviewTerminal: true,
      } : error?.reviewFailure;
      if (!failureProof
          || !['invalid_artifact', 'transport_failure'].includes(failureProof.failure)
          || typeof failureProof.reviewerActive !== 'boolean'
          || typeof failureProof.originalReviewTerminal !== 'boolean') {
        throw error;
      }
      const currentInputs = await assertCandidateEvidenceCurrent(candidate, task.id);
      const currentDiff = await taskDiff(workspace);
      if (currentDiff !== currentInputs.diffPackage) {
        fail('adaptive_reviewed_candidate_changed', `task candidate changed before reviewer replacement: ${task.id}`);
      }
      const decision = decideReviewerReplacement({
        failure: failureProof.failure,
        attemptsUsed: replacementUsed ? 2 : 1,
        reviewerActive: failureProof.reviewerActive,
        originalReviewTerminal: failureProof.originalReviewTerminal,
        candidateHashes: candidateHashes(currentInputs),
        originalCandidateHashes: candidateHashes(candidate.inputs),
      });
      if (decision.action !== 'replace_reviewer') throw error;
      replacementUsed = true;
      task.attempts.review += 1;
      await persist();
      captured = await dispatchAndCaptureReview({
        cwd,
        runId,
        task,
        workspace,
        candidate,
        reviewAttempt: task.attempts.review,
        dispatchReviewer,
        implementerWorker: assertWorkerIdentity(currentImplementation.worker, 'implementer', task.id),
        runState,
        persist,
      });
    }

    const gate = evaluateTaskReviewGate({
      artifact: captured.artifact,
      expected: captured.expected,
      previousReview,
    });
    task.review = {
      status: gate.status,
      artifact_path: captured.path,
      reviewer: captured.expected.reviewer,
      attempt: gate.attempt,
      blocking_finding_ids: gate.blocking_finding_ids,
      minor_finding_ids: gate.minor_finding_ids,
    };
    task.workers.reviewers.push(structuredClone(captured.expected.reviewer));
    await persist();
    if (gate.status === 'reviewed') {
      const currentInputs = await assertCandidateEvidenceCurrent(candidate, task.id);
      const currentDiff = await taskDiff(workspace);
      if (currentDiff !== currentInputs.diffPackage) {
        fail('adaptive_reviewed_candidate_changed', `task candidate changed during independent review: ${task.id}`);
      }
      return {
        implementation: currentImplementation,
        verification: currentVerification,
        review: task.review,
        reviewedDiffPackage: candidate.inputs.diffPackage,
      };
    }
    if (gate.status === 'needs_context') {
      fail('adaptive_review_context_blocked', `review context remains incomplete for ${task.id}`);
    }
    if (task.attempts.fix >= maxFixAttempts) {
      fail('adaptive_fix_attempts_exhausted', `fix attempts exhausted for ${task.id}`);
    }
    if (typeof dispatchFixer !== 'function') {
      fail('adaptive_fixer_unavailable', `a separate fixer is required for ${task.id}`);
    }
    task.status = 'needs_fix';
    task.attempts.fix += 1;
    await persist();
    const fixed = await dispatchTracked({
      runState,
      persist,
      key: `${task.id}:fix:${task.attempts.fix}`,
      record: { task_id: task.id, role: 'fix', attempt: task.attempts.fix, status: 'active' },
      operation: () => dispatchFixer({
        taskId: task.id,
        outcome: task.outcome,
        workspace,
        findings: captured.artifact.review_result.findings,
        attempt: task.attempts.fix,
        leafInstruction: LEAF_INSTRUCTION,
      }),
    });
    const fixerWorker = assertWorkerIdentity(fixed?.worker, 'fixer', task.id);
    const implementerWorker = assertWorkerIdentity(currentImplementation.worker, 'implementer', task.id);
    if (fixerWorker.id === implementerWorker.id || fixerWorker.id === captured.expected.reviewer.id) {
      fail('adaptive_fixer_not_independent', `fixer must differ from implementer and reviewer for ${task.id}`);
    }
    task.workers.fixers.push(fixerWorker);
    currentVerification = assertVerification(fixed?.verification, `fix ${task.id}`);
    currentImplementation = fixed;
    previousReview = { artifact: captured.artifact, expected: captured.expected };
    candidateAttempt += 1;
    replacementUsed = false;
  }
}

async function executeTask({
  cwd,
  runId,
  graph,
  runState,
  topology,
  taskId,
  dispatchWorker,
  dispatchReviewer,
  dispatchFixer,
  persist,
  maxFixAttempts,
}) {
  const task = taskRecord(runState, taskId);
  if (['failed', 'interrupted'].includes(task.status)) {
    task.workspace = await resetOwnedWorktree({ topology, descriptor: task.workspace });
  }
  const ancestors = ancestorIds(graph, taskId);
  const missingAncestors = ancestors.filter((id) => !task.prepared_dependencies.includes(id));
  if (missingAncestors.length > 0) {
    const commits = missingAncestors.map((id) => {
      const dependency = taskRecord(runState, id);
      if (dependency.status !== 'integrated' || !dependency.commit) {
        fail('adaptive_dependency_not_integrated', `${taskId} dependency ${id} is not integrated`);
      }
      return dependency.commit;
    });
    task.workspace = await prepareTaskWorkspace({ topology, task: task.workspace, dependencyCommits: commits });
    task.prepared_dependencies.push(...missingAncestors);
    const owner = runState.ownership.tasks.find(({ id }) => id === taskId);
    owner.workspace = task.workspace;
    await persist();
  }

  task.status = 'implementing';
  task.attempts.implementation += 1;
  await persist();
  const implementation = await dispatchTracked({
    runState,
    persist,
    key: `${task.id}:implementation:${task.attempts.implementation}`,
    record: {
      task_id: task.id,
      role: 'implementation',
      attempt: task.attempts.implementation,
      status: 'active',
    },
    operation: () => dispatchWorker({
      outcome: task.outcome,
      workspace: task.workspace.path,
      attempt: task.attempts.implementation,
      leafInstruction: LEAF_INSTRUCTION,
    }),
  });
  const implementerWorker = assertWorkerIdentity(implementation?.worker, 'implementer', task.id);
  task.workers.implementers.push(implementerWorker);
  task.status = 'verifying';
  task.implementation = implementation?.report || null;
  task.verification = assertVerification(implementation?.verification, `worker ${task.id}`);
  await persist();

  const reviewed = await reviewCandidate({
    cwd,
    runId,
    task,
    workspace: task.workspace.path,
    implementation,
    verification: task.verification,
    dispatchReviewer,
    dispatchFixer,
    persist,
    maxFixAttempts,
    runState,
  });
  task.verification = reviewed.verification;
  const commitKey = `${task.id}:commit:${task.attempts.implementation}`;
  runState.active_workers[commitKey] = {
    task_id: task.id,
    role: 'task-commit',
    status: 'committing',
    expected_parent: task.workspace.head,
    reviewed_diff_sha256: sha256(reviewed.reviewedDiffPackage),
    changed_paths: await taskChangedPaths(task.workspace.path),
  };
  await persist();
  const committed = await commitTaskWorkspace({
    topology,
    task: task.workspace,
    outcome: task.outcome,
    verification: task.verification,
    reviewedDiffPackage: reviewed.reviewedDiffPackage,
  });
  Object.assign(task, {
    status: 'integrated',
    commit: committed.commit,
    changed_paths: committed.changed_paths,
    workspace: committed.descriptor,
  });
  runState.ownership.tasks.find(({ id }) => id === taskId).workspace = committed.descriptor;
  delete runState.active_workers[commitKey];
  await persist();
  return {
    outcome: task.outcome,
    verification: task.verification,
    review: task.review,
    commit: task.commit,
    changed_paths: task.changed_paths,
    descriptor: task.workspace,
  };
}

export async function runReviewedTaskGraph({
  cwd,
  runId,
  graph,
  runState,
  topology,
  runtimeCapacity,
  dispatchWorker,
  dispatchReviewer,
  dispatchFixer = null,
  persist,
  maxFixAttempts = 2,
}) {
  if (typeof dispatchWorker !== 'function' || typeof dispatchReviewer !== 'function') {
    fail('adaptive_delegated_capability_missing', 'delegated execution requires implementer and reviewer dispatch');
  }
  while (runState.tasks.some((task) => task.status !== 'integrated')) {
    const decision = reserveNextStages({ manifest: graph, state: runState, runtimeCapacity });
    const implementationReservations = decision.reservations
      .filter((reservation) => reservation.role === 'implementation');
    if (implementationReservations.length === 0) {
      fail('adaptive_execution_deadlock', 'no executable task remains in the current graph state');
    }
    const executed = await mapWithLimit(
      implementationReservations,
      Math.max(1, decision.effective_limit),
      ({ task_id: taskId }) => executeTask({
        cwd,
        runId,
        graph,
        runState,
        topology,
        taskId,
        dispatchWorker,
        dispatchReviewer,
        dispatchFixer,
        persist,
        maxFixAttempts,
      }),
    );
    if (executed.failures.length > 0) {
      for (const { index, error } of executed.failures) {
        const taskId = implementationReservations[index].task_id;
        const task = taskRecord(runState, taskId);
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
      }
      runState.status = 'interrupted';
      await persist();
      throw executed.failures[0].error;
    }
  }
  runState.status = 'active';
  await persist();
  return runState.tasks.map((task) => ({
    outcome: task.outcome,
    verification: task.verification,
    review: task.review,
    commit: task.commit,
    changed_paths: task.changed_paths,
    descriptor: task.workspace,
  }));
}
