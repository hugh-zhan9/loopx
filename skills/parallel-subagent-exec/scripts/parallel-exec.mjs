#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inspectParallelInput,
  validateParallelManifest,
} from '../../shared/scripts/parallel-plan-contract.mjs';
import {
  applyBoundaryCommit,
  applyEphemeralCommit,
  cleanupOwnedResources,
  collectConflictEvidence,
  createEphemeralTaskCommit,
  createOwnedWorktree,
  removeOwnedWorktree,
  restoreIntegrationTree,
  snapshotIntegrationTree,
  verifyOwnedWorktree,
} from './git-lib.mjs';
import {
  createInitialState,
  readRunState,
  transitionRunState,
  verifyRunIdentity,
  writeCompletionState,
} from './state-lib.mjs';
import { reserveNextStages } from './scheduler-lib.mjs';

class ParallelCliError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ParallelCliError';
    this.code = code;
  }
}

function fail(message) {
  throw new ParallelCliError('parallel_cli_usage', message);
}

function parseFlags(argv, allowed, required) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
      fail(`invalid flag or missing value: ${flag || '<missing>'}`);
    }
    if (!allowed.has(flag)) fail(`unknown flag: ${flag}`);
    if (Object.hasOwn(values, flag)) fail(`duplicate flag: ${flag}`);
    values[flag] = value;
  }
  for (const flag of required) {
    if (!Object.hasOwn(values, flag)) fail(`missing required flag: ${flag}`);
  }
  return values;
}

function integerFlag(value, label, { positive = false } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (positive ? 1 : 0)) {
    fail(`${label} must be a ${positive ? 'positive' : 'non-negative'} integer`);
  }
  return parsed;
}

async function readJson(path, { ownerOnly = false } = {}) {
  if (ownerOnly) {
    const metadata = await stat(path);
    if ((metadata.mode & 0o077) !== 0) fail(`JSON input must be owner-only (0600): ${path}`);
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`malformed JSON: ${path}`);
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  const absolute = resolve(path);
  const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(dirname(absolute), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, absolute);
  } finally {
    if (existsSync(temporary)) await unlink(temporary);
  }
}

function errorExitCode(error) {
  const code = String(error?.code || '');
  if (code === 'parallel_cli_usage' || code.startsWith('parallel_schema_')
    || code.startsWith('parallel_unknown_') || code.startsWith('parallel_fence_')
    || code.startsWith('parallel_dependency_') || code.startsWith('parallel_write_scope_')
    || code.startsWith('parallel_task_anchor_') || code.startsWith('parallel_path_')
    || code.startsWith('parallel_input_') || code.startsWith('parallel_manifest_')
    || code === 'parallel_state_invalid' || code === 'parallel_state_schema_unsupported'
    || code === 'parallel_state_operation_invalid' || code === 'parallel_run_id_invalid') return 2;
  if (code === 'state_revision_conflict' || code === 'parallel_state_identity_mismatch'
    || code === 'parallel_state_missing' || code === 'parallel_state_node_missing') return 3;
  if (code === 'parallel_runtime_capability_unavailable' || code === 'parallel_runtime_capacity_unavailable') return 5;
  if (code.startsWith('parallel_git_') || code.startsWith('parallel_worktree_')
    || code.startsWith('parallel_invoking_') || code.startsWith('parallel_integration_')
    || code.startsWith('parallel_task_commit_') || code.startsWith('parallel_task_scope_')
    || code.startsWith('parallel_boundary_') || code.startsWith('parallel_conflict_')
    || code.startsWith('parallel_cleanup_') || code.startsWith('parallel_owned_')) return 4;
  return 2;
}

async function runManifest(argv, cwd) {
  const flags = parseFlags(argv, new Set(['--input', '--max-parallel', '--output']), ['--input', '--output']);
  const manifest = await inspectParallelInput({
    inputPath: resolve(cwd, flags['--input']),
    repoRoot: cwd,
    maxParallelOverride: flags['--max-parallel'] === undefined
      ? null
      : integerFlag(flags['--max-parallel'], '--max-parallel', { positive: true }),
  });
  const outputPath = resolve(cwd, flags['--output']);
  await writeJsonAtomic(outputPath, manifest);
  return { command: 'manifest inspect', output: outputPath, manifest };
}

async function runState(action, argv, cwd) {
  if (action === 'init') {
    const flags = parseFlags(argv, new Set(['--state', '--manifest', '--operation']), ['--state', '--manifest', '--operation']);
    const manifest = validateParallelManifest(await readJson(resolve(cwd, flags['--manifest'])));
    const operation = await readJson(resolve(cwd, flags['--operation']), { ownerOnly: true });
    const statePath = resolve(cwd, flags['--state']);
    const state = createInitialState({
      runId: operation.run_id,
      manifest,
      repo: operation.repo,
      config: operation.config,
      now: operation.now,
    });
    const initialized = await transitionRunState({
      statePath,
      expectedRevision: 0,
      operation: { type: 'initialize', state },
      now: operation.now,
    });
    return { command: 'state init', state_path: statePath, state: initialized };
  }
  if (action === 'verify') {
    const flags = parseFlags(argv, new Set(['--state', '--observed']), ['--state', '--observed']);
    const state = await readRunState(resolve(cwd, flags['--state']));
    const observed = await readJson(resolve(cwd, flags['--observed']), { ownerOnly: true });
    const verification = verifyRunIdentity({ state, observed });
    if (!verification.ok) {
      const error = new Error('persisted and observed run identities differ');
      error.code = 'parallel_state_identity_mismatch';
      error.details = verification.mismatches;
      throw error;
    }
    return { command: 'state verify', ok: true, revision: state.revision };
  }
  if (action === 'transition') {
    const flags = parseFlags(argv, new Set(['--state', '--expected-revision', '--operation']), ['--state', '--expected-revision', '--operation']);
    const operation = await readJson(resolve(cwd, flags['--operation']), { ownerOnly: true });
    const statePath = resolve(cwd, flags['--state']);
    const state = await transitionRunState({
      statePath,
      expectedRevision: integerFlag(flags['--expected-revision'], '--expected-revision'),
      operation,
      now: operation.now || new Date().toISOString(),
    });
    return { command: 'state transition', state_path: statePath, state };
  }
  if (action === 'complete') {
    const flags = parseFlags(argv, new Set(['--state', '--expected-revision', '--operation']), ['--state', '--expected-revision', '--operation']);
    const operation = await readJson(resolve(cwd, flags['--operation']), { ownerOnly: true });
    const statePath = resolve(cwd, flags['--state']);
    const state = await readRunState(statePath);
    const expected = integerFlag(flags['--expected-revision'], '--expected-revision');
    if (state.revision !== expected) {
      const error = new Error(`expected revision ${expected}, observed ${state.revision}`);
      error.code = 'state_revision_conflict';
      throw error;
    }
    const completion = await writeCompletionState({
      runRoot: dirname(statePath),
      state,
      summary: operation.summary,
      now: operation.now || new Date().toISOString(),
    });
    return { command: 'state complete', state_path: statePath, completion };
  }
  fail(`unknown state action: ${action || '<missing>'}`);
}

async function runWorktree(action, argv, cwd) {
  const flags = parseFlags(argv, new Set(['--operation']), ['--operation']);
  const operation = await readJson(resolve(cwd, flags['--operation']), { ownerOnly: true });
  let result;
  if (action === 'create') result = await createOwnedWorktree(operation);
  else if (action === 'verify') result = await verifyOwnedWorktree(operation);
  else if (action === 'snapshot') result = await snapshotIntegrationTree(operation);
  else if (action === 'commit-task') result = await createEphemeralTaskCommit(operation);
  else if (action === 'apply') {
    try {
      result = operation.boundaryCommit
        ? await applyBoundaryCommit(operation)
        : await applyEphemeralCommit(operation);
    } catch (error) {
      if (error?.code !== 'parallel_git_apply_conflict' || !operation.conflict_evidence_path) throw error;
      const sourceCommit = operation.boundaryCommit || operation.taskCommit;
      const sourceKind = operation.boundaryCommit ? 'child' : 'task';
      const evidencePath = resolve(cwd, operation.conflict_evidence_path);
      await collectConflictEvidence({
        topology: operation.topology,
        integration: operation.integration,
        sourceCommit,
        sourceKind,
        outputPath: evidencePath,
      });
      const restored = await restoreIntegrationTree({
        topology: operation.topology,
        integration: operation.integration,
        snapshot: operation.snapshot,
      });
      error.details = { ...error.details, evidence_path: evidencePath, restored };
      throw error;
    }
  } else if (action === 'cleanup') {
    result = operation.descriptor
      ? await removeOwnedWorktree(operation)
      : await cleanupOwnedResources(operation);
  } else fail(`unknown worktree action: ${action || '<missing>'}`);
  return {
    command: `worktree ${action}`,
    state_path: operation.state_path ? resolve(cwd, operation.state_path) : null,
    result,
  };
}

async function persistInterrupted(result) {
  const statePath = result?.state_path;
  if (!statePath) return result;
  const state = await readRunState(statePath);
  if (state.status === 'complete' || state.status === 'interrupted') return { ...result, state };
  const interrupted = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: { type: 'set_run_status', status: 'interrupted' },
    now: new Date().toISOString(),
  });
  return { ...result, interrupted: true, state: interrupted };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validateChildReviewMutation({
  before,
  after,
  childPath,
  writtenPaths = [],
  canonicalReportPath = null,
}) {
  if (before?.schema_version !== 2 || after?.schema_version !== 2) {
    throw new ParallelCliError('parallel_child_review_invalid', 'child review requires multi-plan schema v2');
  }
  if (!Array.isArray(before.plans) || !Array.isArray(after.plans)) {
    throw new ParallelCliError('parallel_child_review_invalid', 'child review plans must be arrays');
  }
  const beforeTopLevel = { ...before };
  const afterTopLevel = { ...after };
  delete beforeTopLevel.plans;
  delete afterTopLevel.plans;
  if (canonicalJson(beforeTopLevel) !== canonicalJson(afterTopLevel)) {
    throw new ParallelCliError('parallel_child_review_scope_violation', 'child reviewer mutated package-level state');
  }
  if (canonicalJson(before.plans.map((row) => row.path)) !== canonicalJson(after.plans.map((row) => row.path))) {
    throw new ParallelCliError('parallel_child_review_scope_violation', 'child reviewer changed plan row order');
  }
  if (canonicalReportPath && writtenPaths.includes(canonicalReportPath)) {
    throw new ParallelCliError('parallel_child_review_report_ownership', 'child reviewer wrote the canonical package report');
  }
  const beforeByPath = new Map(before.plans.map((row) => [row.path, row]));
  const afterByPath = new Map(after.plans.map((row) => [row.path, row]));
  if (beforeByPath.size !== before.plans.length || afterByPath.size !== after.plans.length
    || beforeByPath.size !== afterByPath.size) {
    throw new ParallelCliError('parallel_child_review_invalid', 'child review plan rows differ');
  }
  for (const [path, row] of beforeByPath) {
    if (!afterByPath.has(path)) throw new ParallelCliError('parallel_child_review_invalid', `missing plan row: ${path}`);
    if (path !== childPath && canonicalJson(row) !== canonicalJson(afterByPath.get(path))) {
      throw new ParallelCliError('parallel_child_review_sibling_mutation', `child reviewer mutated sibling row: ${path}`);
    }
  }
  const row = afterByPath.get(childPath);
  const beforeRow = beforeByPath.get(childPath);
  const immutableBefore = { ...beforeRow };
  const immutableAfter = { ...row };
  for (const field of ['status', 'ready_for_spec_review', 'plan_review']) {
    delete immutableBefore[field];
    delete immutableAfter[field];
  }
  if (canonicalJson(immutableBefore) !== canonicalJson(immutableAfter)) {
    throw new ParallelCliError('parallel_child_review_transition_invalid', `child review changed immutable fields for ${childPath}`);
  }
  if (!beforeByPath.has(childPath) || row?.status !== 'complete'
    || row.ready_for_spec_review !== true || row.plan_review?.status !== 'passed'
    || typeof row.plan_review.reviewed_at !== 'string' || row.plan_review.reviewed_at.length === 0
    || typeof row.plan_review.summary !== 'string') {
    throw new ParallelCliError('parallel_child_review_transition_invalid', `child review did not cleanly complete ${childPath}`);
  }
  return { ok: true, row: structuredClone(row) };
}

async function advanceSimulation(context, operation) {
  context.state = await transitionRunState({
    statePath: context.statePath,
    expectedRevision: context.state.revision,
    operation,
    now: new Date().toISOString(),
  });
  return context.state;
}

async function blockSimulation(context, message, taskId = null) {
  if (taskId && context.state.tasks[taskId]?.status !== 'blocked') {
    await advanceSimulation(context, { type: 'set_task_status', task_id: taskId, status: 'blocked', last_error: { message } });
  }
  if (context.state.status !== 'blocked') {
    await advanceSimulation(context, { type: 'set_run_status', status: 'blocked' });
  }
  context.status = 'blocked';
}

async function applyTaskIntegration(context, taskId, { reconciliation = false } = {}) {
  if (!reconciliation) {
    await advanceSimulation(context, { type: 'set_task_status', task_id: taskId, status: 'integration_queued' });
    await advanceSimulation(context, { type: 'set_task_status', task_id: taskId, status: 'integrating' });
  }
  let result;
  try {
    result = await context.integrate({ kind: 'task', node_id: taskId, state: context.state });
  } catch (error) {
    await blockSimulation(context, `task integration failed: ${error.message}`, taskId);
    return false;
  }
  if (result?.ok) {
    await advanceSimulation(context, {
      type: 'set_task_status',
      task_id: taskId,
      status: 'integrated',
      evidence: result,
    });
    context.integrationOrder.push(taskId);
    return true;
  }
  if (!result?.conflict) {
    await blockSimulation(context, `task integration failed: ${taskId}`, taskId);
    return false;
  }
  const completedAttempts = context.reconciliationAttempts.get(taskId) || 0;
  const nextCount = completedAttempts === 0 ? 0 : 1;
  await advanceSimulation(context, {
    type: 'set_task_status',
    task_id: taskId,
    status: 'reconciling',
    reconciliation_attempt_delta: nextCount,
    last_error: { code: 'parallel_git_apply_conflict' },
  });
  if (completedAttempts >= 2) {
    await blockSimulation(context, `reconciliation exhausted: ${taskId}`, taskId);
  }
  return false;
}

async function drainTaskIntegrations(context) {
  let changed = false;
  for (const plan of context.manifest.plans) {
    for (const task of plan.tasks) {
      const id = `${plan.path}#${task.task_anchor}`;
      const status = context.state.tasks[id].status;
      if (status === 'integrated') continue;
      if (status !== 'review_passed') break;
      await applyTaskIntegration(context, id);
      changed = true;
      if (context.status === 'blocked' || context.state.tasks[id].status !== 'integrated') break;
    }
  }
  return changed;
}

async function drainChildIntegrations(context) {
  let changed = false;
  for (const plan of context.manifest.plans) {
    const child = context.state.children[plan.path];
    if (child.status === 'integrated') continue;
    if (child.status !== 'reviewed') break;
    await advanceSimulation(context, { type: 'set_child_status', child_id: plan.path, status: 'commit_ready' });
    await advanceSimulation(context, { type: 'set_child_status', child_id: plan.path, status: 'integrating' });
    let result;
    try {
      result = await context.integrate({ kind: 'child', node_id: plan.path, state: context.state });
    } catch (error) {
      result = { ok: false, message: error.message };
    }
    if (!result?.ok) {
      await advanceSimulation(context, {
        type: 'set_child_status',
        child_id: plan.path,
        status: 'blocked',
        last_error: result || { message: 'child integration failed' },
      });
      await blockSimulation(context, `child integration failed: ${plan.path}`);
      return true;
    }
    await advanceSimulation(context, {
      type: 'set_child_status',
      child_id: plan.path,
      status: 'integrated',
      boundary_commit: result.commit || null,
    });
    context.childIntegrationOrder.push(plan.path);
    changed = true;
  }
  return changed;
}

async function completeReservation(context, reservation, result) {
  const release = { type: 'release_worker', worker_id: reservation.reservation_id };
  if (result?.worker_failed) {
    if (reservation.role === 'plan_review') {
      await advanceSimulation(context, {
        type: 'batch',
        operations: [release, {
          type: 'set_child_status',
          child_id: reservation.node_id,
          status: 'blocked',
          last_error: { message: result.error },
        }],
      });
      await blockSimulation(context, `worker failed: ${result.error}`);
      return;
    }
    await advanceSimulation(context, {
      type: 'batch',
      operations: [release, {
        type: 'set_task_status',
        task_id: reservation.node_id,
        status: 'blocked',
        last_error: { message: result.error },
      }],
    });
    await blockSimulation(context, `worker failed: ${result.error}`);
    return;
  }
  if (reservation.role === 'implementation') {
    await advanceSimulation(context, {
      type: 'batch',
      operations: [
        release,
        { type: 'set_task_status', task_id: reservation.node_id, status: 'awaiting_review', evidence: result },
      ],
    });
    return;
  }
  if (reservation.role === 'fix') {
    context.fixCount += 1;
    await advanceSimulation(context, {
      type: 'batch',
      operations: [release, { type: 'set_task_status', task_id: reservation.node_id, status: 'awaiting_review', evidence: result }],
    });
    return;
  }
  if (reservation.role === 'task_review') {
    context.reviewCount += 1;
    const next = result?.approved ? 'review_passed' : (result?.needs_fix ? 'needs_fix' : 'blocked');
    await advanceSimulation(context, {
      type: 'batch',
      operations: [release, { type: 'set_task_status', task_id: reservation.node_id, status: next, evidence: result }],
    });
    if (next === 'blocked') await blockSimulation(context, `task review blocked: ${reservation.node_id}`);
    return;
  }
  if (reservation.role === 'reconciliation') {
    context.reconciliationCount += 1;
    const attempts = (context.reconciliationAttempts.get(reservation.node_id) || 0) + 1;
    context.reconciliationAttempts.set(reservation.node_id, attempts);
    await advanceSimulation(context, {
      type: 'batch',
      operations: [
        release,
        { type: 'set_task_status', task_id: reservation.node_id, status: 'integration_queued', evidence: result },
        { type: 'set_task_status', task_id: reservation.node_id, status: 'integrating' },
      ],
    });
    await applyTaskIntegration(context, reservation.node_id, { reconciliation: true });
    return;
  }
  if (reservation.role === 'plan_review') {
    if (result?.before && result?.after) {
      try {
        const validated = validateChildReviewMutation({
          before: result.before,
          after: result.after,
          childPath: reservation.node_id,
          writtenPaths: result.written_paths || [],
          canonicalReportPath: context.canonicalReportPath,
        });
        if (context.mergeChildRow) await context.mergeChildRow(validated.row);
      } catch (error) {
        await advanceSimulation(context, {
          type: 'batch',
          operations: [release, {
            type: 'set_child_status',
            child_id: reservation.node_id,
            status: 'blocked',
            last_error: { code: error.code, message: error.message },
          }],
        });
        await blockSimulation(context, error.message);
        return;
      }
    }
    if (!result?.approved) {
      await advanceSimulation(context, {
        type: 'batch',
        operations: [release, { type: 'set_child_status', child_id: reservation.node_id, status: 'blocked', plan_review: result }],
      });
      await blockSimulation(context, `plan review blocked: ${reservation.node_id}`);
      return;
    }
    await advanceSimulation(context, {
      type: 'batch',
      operations: [
        release,
        { type: 'set_child_status', child_id: reservation.node_id, status: 'reviewed', plan_review: result },
      ],
    });
  }
}

export async function simulateParallelExecution({
  manifest,
  initialState,
  statePath,
  runtimeCapacity,
  capabilities,
  inputPath,
  repoRoot = process.cwd(),
  designPath = null,
  inputKind = 'strict',
  startup,
  dispatch,
  review,
  integrate,
  reconcile,
  childReview,
  finalReview,
  mergeChildRow = null,
  canonicalReportPath = null,
  events = [],
}) {
  const baseResult = {
    events,
    dispatch_count: 0,
    review_count: 0,
    fix_count: 0,
    reconciliation_count: 0,
    final_review_count: 0,
    max_active_workers: 0,
    integration_order: [],
    child_integration_order: [],
    package_commit_created: false,
    handoff: null,
  };
  if (inputKind === 'legacy' || inputKind === 'direct-child' || inputKind === 'invalid') {
    return { ...baseResult, exitCode: 2, status: 'handoff', handoff: `$subagent-exec ${inputPath}` };
  }
  const missing = [];
  if (!capabilities?.create) missing.push('create');
  if (!capabilities?.observe && !capabilities?.wait) missing.push('observe-or-wait');
  if (missing.length > 0) {
    return { ...baseResult, exitCode: 5, status: 'capability_unavailable', missing_capabilities: missing };
  }

  const context = {
    manifest,
    statePath,
    state: initialState,
    integrate,
    status: 'running',
    integrationOrder: [],
    childIntegrationOrder: [],
    reviewCount: 0,
    fixCount: 0,
    reconciliationCount: 0,
    reconciliationAttempts: new Map(),
    mergeChildRow,
    canonicalReportPath,
  };
  await transitionRunState({
    statePath,
    expectedRevision: 0,
    operation: { type: 'initialize', state: initialState },
    now: initialState.updated_at,
  });
  try {
    const rootIntegration = await startup({
      cwd: resolve(repoRoot),
      inputPath: resolve(repoRoot, inputPath),
      designPath: designPath ? resolve(repoRoot, designPath) : null,
    });
    await advanceSimulation(context, { type: 'set_root_integration', value: rootIntegration });
    await advanceSimulation(context, { type: 'set_run_status', status: 'running' });
  } catch (error) {
    return { ...baseResult, exitCode: 2, status: 'startup_failed', error: error.message };
  }

  if (runtimeCapacity === 0) {
    return { ...baseResult, exitCode: 0, status: 'capacity_wait', backpressure: true };
  }

  let dispatchCount = 0;
  let maxActiveWorkers = 0;
  for (let cycle = 0; cycle < 100 && context.status !== 'blocked'; cycle += 1) {
    await drainTaskIntegrations(context);
    await drainChildIntegrations(context);
    if (context.status === 'blocked') break;
    if (Object.values(context.state.children).every((child) => child.status === 'integrated')) break;

    const selection = reserveNextStages({ manifest, state: context.state, runtimeCapacity });
    const reservedNodes = new Set(selection.reservations.map((item) => item.node_id));
    for (const operation of selection.preparation_operations) {
      const duplicatesReservationTransition = (
        operation.type === 'set_task_status'
        && operation.status === 'ready'
        && reservedNodes.has(operation.task_id)
      ) || (
        operation.type === 'set_child_status'
        && operation.status === 'plan_reviewing'
        && reservedNodes.has(operation.child_id)
      );
      if (!duplicatesReservationTransition) await advanceSimulation(context, operation);
    }
    for (const planPath of new Set(selection.reservations
      .filter((item) => item.role === 'implementation')
      .map((item) => item.plan_path))) {
      if (context.state.children[planPath].status === 'ready') {
        await advanceSimulation(context, { type: 'set_child_status', child_id: planPath, status: 'running' });
      }
    }
    for (const operation of selection.state_operations) await advanceSimulation(context, operation);
    maxActiveWorkers = Math.max(maxActiveWorkers, Object.keys(context.state.active_workers).length);
    if (selection.reservations.length === 0) {
      if (selection.capacity_wait.length > 0) {
        return { ...baseResult, exitCode: 0, status: 'capacity_wait', backpressure: true };
      }
      await blockSimulation(context, 'scheduler made no progress');
      break;
    }

    for (const reservation of selection.reservations) {
      if (reservation.role === 'implementation') {
        await advanceSimulation(context, { type: 'set_task_status', task_id: reservation.node_id, status: 'implementing' });
      }
    }
    dispatchCount += selection.reservations.length;
    const completed = await Promise.all(selection.reservations.map(async (reservation) => {
      try {
        if (reservation.role === 'task_review') return [reservation, await review(reservation)];
        if (reservation.role === 'plan_review') return [reservation, await childReview(reservation)];
        if (reservation.role === 'reconciliation') return [reservation, await reconcile(reservation)];
        return [reservation, await dispatch(reservation)];
      } catch (error) {
        return [reservation, { worker_failed: true, error: error.message }];
      }
    }));
    for (const [reservation, result] of completed) {
      await completeReservation(context, reservation, result);
      if (context.status === 'blocked') break;
    }
  }

  if (context.status === 'blocked') {
    return {
      ...baseResult,
      exitCode: 4,
      status: 'blocked',
      dispatch_count: dispatchCount,
      review_count: context.reviewCount,
      fix_count: context.fixCount,
      reconciliation_count: context.reconciliationCount,
      max_active_workers: maxActiveWorkers,
      integration_order: context.integrationOrder,
      child_integration_order: context.childIntegrationOrder,
    };
  }
  await advanceSimulation(context, { type: 'set_run_status', status: 'reviewing' });
  let final;
  try {
    final = await finalReview({ manifest, state: context.state });
  } catch (error) {
    final = { approved: false, error: error.message };
  }
  if (!final?.approved) {
    await blockSimulation(context, 'spec-level final review blocked');
    return { ...baseResult, exitCode: 4, status: 'blocked', dispatch_count: dispatchCount, final_review_count: 1 };
  }
  await advanceSimulation(context, { type: 'set_run_status', status: 'ready_for_finish' });
  return {
    ...baseResult,
    exitCode: 0,
    status: 'ready_for_finish',
    dispatch_count: dispatchCount,
    review_count: context.reviewCount,
    fix_count: context.fixCount,
    reconciliation_count: context.reconciliationCount,
    final_review_count: 1,
    max_active_workers: maxActiveWorkers,
    integration_order: context.integrationOrder,
    child_integration_order: context.childIntegrationOrder,
    state: context.state,
  };
}

export async function runParallelExecCommand({
  argv,
  cwd,
  env,
  stdout,
  stderr,
  isInterrupted = () => false,
}) {
  void env;
  try {
    const [group, action, ...rest] = argv;
    let result;
    if (group === 'manifest' && action === 'inspect') result = await runManifest(rest, cwd);
    else if (group === 'state') result = await runState(action, rest, cwd);
    else if (group === 'worktree') result = await runWorktree(action, rest, cwd);
    else fail(`unknown command: ${[group, action].filter(Boolean).join(' ') || '<missing>'}`);

    if (isInterrupted()) {
      const interrupted = await persistInterrupted(result);
      stdout.write(`${JSON.stringify({ ok: false, interrupted: true, ...interrupted })}\n`);
      return { exitCode: 130, result: interrupted };
    }
    stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    return { exitCode: 0, result };
  } catch (error) {
    if (error?.code === 'parallel_runtime_capacity_unavailable' && error.recoverable) {
      const result = { ok: true, backpressure: true, code: error.code };
      stdout.write(`${JSON.stringify(result)}\n`);
      return { exitCode: 0, result };
    }
    const exitCode = errorExitCode(error);
    stderr.write(`${JSON.stringify({
      ok: false,
      code: error?.code || 'parallel_cli_internal',
      message: error?.message || String(error),
      details: error?.details || null,
    })}\n`);
    return { exitCode, error };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let interrupted = false;
  const latch = () => { interrupted = true; };
  process.once('SIGINT', latch);
  process.once('SIGTERM', latch);
  const execution = await runParallelExecCommand({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    isInterrupted: () => interrupted,
  });
  process.exitCode = execution.exitCode;
}
