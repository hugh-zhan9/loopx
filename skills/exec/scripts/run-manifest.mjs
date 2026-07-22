import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const EXECUTION_PROFILES = new Set([
  'inline-owned-v1',
  'delegated-serial-v1',
  'parallel-strict-v1',
]);

function completeReviewContext(reviewContext, outcomes) {
  const provided = reviewContext && typeof reviewContext === 'object' && !Array.isArray(reviewContext)
    ? reviewContext
    : {};
  return {
    ...structuredClone(provided),
    source: provided.source ?? null,
    plan: provided.plan ?? null,
    acceptance: provided.acceptance ?? outcomes.map(({ id, acceptance = [] }) => ({ id, acceptance })),
    scope: provided.scope ?? outcomes.map(({ id, write_scope: writeScope = [], relevant_paths: relevantPaths = [] }) => ({
      id,
      write_scope: writeScope,
      relevant_paths: relevantPaths,
    })),
  };
}

function manifestPath(cwd, runId) {
  if (!RUN_ID_PATTERN.test(runId)) throw new TypeError('runId must be lowercase kebab-case');
  return join(resolve(cwd), '.loopx', 'exec', runId, 'manifest.json');
}

export async function createRunManifest({
  cwd,
  runId,
  baselineHead,
  targetSnapshot,
  outcomes,
  workerLimit,
  ownership,
  profile = 'parallel-strict-v1',
  configuredWorkerLimit = workerLimit,
  reviewPolicy = { task: 'mandatory', final: ['spec', 'standards'] },
  reviewContext = {},
}) {
  if (!EXECUTION_PROFILES.has(profile) || profile === 'inline-owned-v1') {
    throw new TypeError('a delegated execution profile is required for a run manifest');
  }
  const path = manifestPath(cwd, runId);
  const runState = {
    schema: 'loopx.exec-run.v3',
    run_id: runId,
    status: 'active',
    profile,
    baseline_head: baselineHead,
    target_snapshot: targetSnapshot,
    configured_worker_limit: configuredWorkerLimit,
    worker_limit: workerLimit,
    review_policy: structuredClone(reviewPolicy),
    review_context: completeReviewContext(reviewContext, outcomes),
    resume_instruction: `$exec --resume ${runId}`,
    ownership,
    active_workers: {},
    tasks: outcomes.map((outcome) => ({
      id: outcome.id,
      outcome: structuredClone(outcome),
      depends_on: [...(outcome.depends_on || [])],
      write_scope: [...outcome.write_scope],
      changed_paths: [],
      status: 'pending',
      attempts: { implementation: 0, review: 0, fix: 0 },
      workers: { implementers: [], reviewers: [], fixers: [] },
      prepared_dependencies: [],
      implementation: null,
      verification: null,
      review: null,
      commit: null,
      workspace: ownership.tasks.find((task) => task.id === outcome.id).workspace,
    })),
    integration: {
      status: 'pending',
      verification: null,
      commit: null,
      changed_paths: [],
      integration_order: [],
      workspace: ownership.integration,
    },
    final_review: {
      status: 'pending',
      attempt: 1,
      fix_attempt: 0,
      spec: null,
      standards: null,
      workers: { reviewers: [], fixers: [] },
    },
    application: { status: 'pending', verification: null, post_apply_snapshot: null },
  };
  await writeRunManifest({ path, runState });
  return { path, runState };
}

export async function writeRunManifest({ path, runState }) {
  validateRunManifest(runState);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(runState, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
  return { path, runState };
}

export async function loadRunManifest({ cwd, runId }) {
  const path = manifestPath(cwd, runId);
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  const runState = parsed.schema === 'loopx.exec-run.v2' ? upgradeV2Manifest(parsed) : parsed;
  runState.final_review = runState.final_review || {
    status: 'pending', attempt: 1, fix_attempt: 0, spec: null, standards: null,
  };
  runState.final_review.workers = runState.final_review.workers || { reviewers: [], fixers: [] };
  runState.application = {
    ...runState.application,
    post_apply_snapshot: runState.application?.post_apply_snapshot
      ?? runState.application?.relevant_snapshot
      ?? null,
  };
  delete runState.application.relevant_snapshot;
  runState.review_context = completeReviewContext(
    runState.review_context,
    runState.tasks.map(({ outcome }) => outcome),
  );
  if (runState.run_id !== runId) {
    throw new Error(`unsupported or mismatched exec run manifest: ${path}`);
  }
  validateRunManifest(runState);
  return { path, runState };
}

function upgradeV2Manifest(runState) {
  return {
    ...runState,
    schema: 'loopx.exec-run.v3',
    profile: 'parallel-strict-v1',
    configured_worker_limit: runState.worker_limit,
    review_policy: { task: 'mandatory', final: ['spec', 'standards'] },
    review_context: completeReviewContext(
      runState.review_context,
      runState.tasks.map(({ outcome }) => outcome),
    ),
    tasks: runState.tasks.map((task) => ({
      ...task,
      outcome: {
        ...task.outcome,
        outcome: task.outcome.outcome || `Deliver legacy outcome ${task.id}`,
        relevant_paths: task.outcome.relevant_paths || [],
        exclusive_resources: task.outcome.exclusive_resources || [],
        parallel_safe: false,
        parallel_rationale: 'Legacy run resumes conservatively without parallel-safety proof.',
        interfaces: task.outcome.interfaces || { consumes: [], produces: [] },
        source_anchors: task.outcome.source_anchors || [`legacy:${task.id}`],
        acceptance: task.outcome.acceptance || [`Complete legacy outcome ${task.id}.`],
        verification: task.outcome.verification || [`Verify legacy outcome ${task.id}.`],
        expected_evidence: task.outcome.expected_evidence || [`Verification evidence for ${task.id}.`],
        review_focus: task.outcome.review_focus || [`Review legacy outcome ${task.id}.`],
      },
      depends_on: [...(task.outcome.depends_on || [])],
      attempts: task.attempts || { implementation: task.status === 'verified' ? 1 : 0, review: 0, fix: 0 },
      workers: task.workers || { implementers: [], reviewers: [], fixers: [] },
      prepared_dependencies: task.prepared_dependencies || [],
      implementation: task.implementation || null,
      review: task.review || null,
      status: task.status === 'verified' ? 'failed' : task.status,
      legacy_unreviewed: task.status === 'verified',
    })),
    integration: {
      ...runState.integration,
      changed_paths: runState.integration.changed_paths
        || [...new Set(runState.tasks.flatMap((task) => task.changed_paths || []))].sort(),
      integration_order: runState.integration.integration_order || [],
    },
    final_review: {
      status: 'pending', attempt: 1, fix_attempt: 0, spec: null, standards: null,
      ...(runState.final_review || {}),
      workers: runState.final_review?.workers || { reviewers: [], fixers: [] },
    },
    application: {
      ...(runState.application || { status: 'pending', verification: null }),
      post_apply_snapshot: runState.application?.post_apply_snapshot
        || runState.application?.relevant_snapshot
        || null,
    },
    active_workers: runState.active_workers || {},
  };
}

function validateRunManifest(runState) {
  if (!runState || runState.schema !== 'loopx.exec-run.v3' || !RUN_ID_PATTERN.test(runState.run_id || '')) {
    throw new Error('exec_run_manifest_schema_invalid');
  }
  if (!EXECUTION_PROFILES.has(runState.profile) || runState.profile === 'inline-owned-v1') {
    throw new Error('exec_run_manifest_profile_invalid');
  }
  if (!Array.isArray(runState.tasks) || !runState.tasks.every((task) => (
    typeof task.id === 'string'
    && Array.isArray(task.depends_on)
    && Array.isArray(task.write_scope)
    && task.attempts
  ))) {
    throw new Error('exec_run_manifest_tasks_invalid');
  }
  if (!runState.active_workers || typeof runState.active_workers !== 'object'
      || Array.isArray(runState.active_workers)) {
    throw new Error('exec_run_manifest_active_workers_invalid');
  }
  if (!runState.review_context || typeof runState.review_context !== 'object'
      || Array.isArray(runState.review_context)
      || !('source' in runState.review_context)
      || !('plan' in runState.review_context)
      || !Array.isArray(runState.review_context.acceptance)
      || !Array.isArray(runState.review_context.scope)) {
    throw new Error('exec_run_manifest_review_context_invalid');
  }
  if (!runState.final_review?.workers
      || !Array.isArray(runState.final_review.workers.reviewers)
      || !Array.isArray(runState.final_review.workers.fixers)) {
    throw new Error('exec_run_manifest_final_workers_invalid');
  }
  return runState;
}

export function deriveRunPhase(runState) {
  validateRunManifest(runState);
  if (runState.status === 'blocked' || runState.status === 'interrupted') return runState.status;
  if (runState.application?.status === 'verified') return 'complete';
  if (runState.application?.status !== 'pending') return 'applying';
  if (runState.final_review?.status !== 'pending') return 'final-review';
  if (runState.integration?.status !== 'pending') return 'integration';
  if (runState.tasks.every((task) => ['reviewed', 'integrated'].includes(task.status))) return 'integration';
  return 'tasks';
}

export async function removeRunManifest({ path }) {
  await rm(dirname(path), { recursive: true, force: true });
  try {
    await rmdir(dirname(dirname(path)));
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
  }
  return { removed: true, path };
}
