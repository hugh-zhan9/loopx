import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import {
  applyEphemeralCommit,
  changedPathsFromStatus,
  createBoundaryCommit,
  createEphemeralTaskCommit,
  createOwnedWorktree,
  inspectGitTopology,
  inspectInvokingWorktree,
  ownedRefNames,
  reconcileOwnedWorktree,
  removeOwnedWorktree,
  snapshotWorkspacePaths,
  snapshotIntegrationTree,
  verifyOwnedWorktree,
} from './git-isolation.mjs';

const execFileAsync = promisify(execFile);

async function git(cwd, args, { allowFailure = false } = {}) {
  try {
    return await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    if (allowFailure) return { stdout: error.stdout || '', stderr: error.stderr || '', failed: true };
    throw error;
  }
}

async function gitWithInput(cwd, args, input, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
        failed: code !== 0,
      };
      if (code === 0 || allowFailure) resolve(result);
      else reject(new Error(`git ${args[0]} failed: ${result.stderr.trim()}`));
    });
    child.stdin.end(input);
  });
}

async function integrationPatch({ cwd, baselineHead, boundaryCommit, expectedPaths }) {
  const expected = [...new Set(expectedPaths)].sort();
  const integratedPathsRaw = (await git(cwd, [
    'diff', '--no-renames', '--name-only', '-z', baselineHead, boundaryCommit, '--', ...expected,
  ])).stdout;
  const integratedPaths = integratedPathsRaw.split('\0').filter(Boolean).sort();
  if (JSON.stringify(integratedPaths) !== JSON.stringify(expected)) {
    throw new Error(`verified integration paths differ from expected paths: ${integratedPaths.join(', ')}`);
  }
  const patch = (await git(cwd, [
    'diff', '--no-renames', '--binary', baselineHead, boundaryCommit, '--', ...expected,
  ])).stdout;
  return { expected, patch };
}

function descriptor(topology, runId, kind, qualifiedId) {
  const names = ownedRefNames({ runId, kind, qualifiedId, attempt: 1 });
  return {
    kind,
    run_id: runId,
    qualified_id: qualifiedId,
    attempt: 1,
    path: join(topology.primary_root, names.relative_path),
    branch: names.branch,
    common_dir: topology.common_dir,
    head: topology.head,
  };
}

export async function createConcurrentWorkspaces({ cwd, runId, outcomes, inspectedWorkspace = null }) {
  const writeScope = outcomes.flatMap((outcome) => outcome.write_scope);
  const relevantPaths = outcomes.flatMap((outcome) => outcome.relevant_paths || []);
  const inspected = inspectedWorkspace || await inspectInvokingWorktree({ cwd, writeScope, relevantPaths });
  if (inspected.execution_overlap.length > 0) {
    const error = new Error(`user changes overlap concurrent execution paths: ${inspected.execution_overlap.join(', ')}`);
    error.code = 'parallel_invoking_overlap';
    error.details = { paths: inspected.execution_overlap };
    throw error;
  }
  const { topology } = inspected;
  const integration = await createOwnedWorktree({
    topology,
    descriptor: descriptor(topology, runId, 'root', 'integration'),
    baseCommit: topology.head,
  });
  const tasks = [];
  try {
    for (const outcome of outcomes) {
      tasks.push(await createOwnedWorktree({
        topology,
        descriptor: descriptor(topology, runId, 'task', outcome.id),
        baseCommit: topology.head,
      }));
    }
  } catch (error) {
    for (const task of tasks.reverse()) {
      await removeOwnedWorktree({ topology, descriptor: task, removeBranch: true });
    }
    await removeOwnedWorktree({ topology, descriptor: integration, removeBranch: true });
    throw error;
  }
  return {
    topology,
    baseline_head: topology.head,
    target_snapshot: inspected.target_snapshot,
    invoking_workspace: inspected,
    integration,
    tasks,
  };
}

export async function commitTaskWorkspace({
  topology,
  task,
  outcome,
  verification,
  reviewedDiffPackage = null,
}) {
  if (verification?.status !== 'passed' || !Array.isArray(verification.commands) || verification.commands.length === 0) {
    throw new Error(`worker verification is missing or failed for ${outcome.id}`);
  }
  if (reviewedDiffPackage !== null) {
    const verified = await verifyOwnedWorktree({ topology, descriptor: task });
    await git(verified.path, ['add', '--intent-to-add', '--all']);
    const currentDiff = (await git(verified.path, ['diff', '--binary', 'HEAD', '--'])).stdout;
    if (currentDiff !== reviewedDiffPackage) {
      const error = new Error(`task candidate changed after independent review: ${outcome.id}`);
      error.code = 'adaptive_reviewed_candidate_changed';
      throw error;
    }
  }
  return createEphemeralTaskCommit({
    topology,
    descriptor: task,
    writeScope: outcome.write_scope,
    message: `loopx task: ${outcome.id}`,
  });
}

export async function reconcileCommittedTaskWorkspace({
  topology,
  task,
  expectedParent,
  reviewedDiffSha256,
  changedPaths,
}) {
  const observed = await reconcileOwnedWorktree({ topology, descriptor: task });
  if (observed.head === expectedParent) {
    return { committed: false, descriptor: observed };
  }
  const parent = (await git(observed.path, ['rev-parse', 'HEAD^'])).stdout.trim();
  if (parent !== expectedParent) {
    const error = new Error('task worktree advanced by an unexpected commit while recovering');
    error.code = 'adaptive_task_commit_recovery_mismatch';
    throw error;
  }
  const status = (await git(observed.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  if (status !== '') {
    const error = new Error('task worktree is dirty after the recovered commit');
    error.code = 'adaptive_task_commit_recovery_mismatch';
    throw error;
  }
  const committedDiff = (await git(observed.path, ['diff', '--binary', expectedParent, observed.head, '--'])).stdout;
  const committedDiffSha256 = createHash('sha256').update(committedDiff).digest('hex');
  if (committedDiffSha256 !== reviewedDiffSha256) {
    const error = new Error('recovered task commit differs from the independently reviewed candidate');
    error.code = 'adaptive_task_commit_recovery_mismatch';
    throw error;
  }
  return {
    committed: true,
    commit: observed.head,
    changed_paths: [...changedPaths],
    descriptor: observed,
  };
}

export async function prepareTaskWorkspace({ topology, task, dependencyCommits = [] }) {
  let prepared = task;
  for (const dependencyCommit of dependencyCommits) {
    const verified = await verifyOwnedWorktree({ topology, descriptor: prepared });
    const applied = await git(verified.path, ['cherry-pick', dependencyCommit], { allowFailure: true });
    if (applied.failed) {
      const error = new Error(`dependency commit conflicts while preparing ${task.qualified_id}: ${dependencyCommit}`);
      error.code = 'adaptive_dependency_prepare_conflict';
      error.details = {
        dependency_commit: dependencyCommit,
        task: task.qualified_id,
        stderr: applied.stderr.trim(),
      };
      throw error;
    }
    const head = (await git(verified.path, ['rev-parse', 'HEAD'])).stdout.trim();
    prepared = { ...verified, head };
  }
  return prepared;
}

function integrationOrderError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function stableTopologicalTaskResults(taskResults) {
  if (!Array.isArray(taskResults)) {
    throw integrationOrderError('adaptive_integration_results_invalid', 'task results must be an array');
  }

  const entries = taskResults.map((result, index) => {
    const id = result?.outcome?.id;
    const dependencies = result?.outcome?.depends_on;
    if (typeof id !== 'string' || id.trim() === '' || !Array.isArray(dependencies)
        || dependencies.some((dependency) => typeof dependency !== 'string' || dependency.trim() === '')) {
      throw integrationOrderError(
        'adaptive_integration_result_invalid',
        `task result at index ${index} lacks a valid outcome id or dependency list`,
      );
    }
    if (new Set(dependencies).size !== dependencies.length) {
      throw integrationOrderError(
        'adaptive_integration_dependencies_invalid',
        `task result ${id} contains duplicate dependencies`,
        { task_id: id, dependencies },
      );
    }
    return { id, dependencies: [...dependencies], index, result };
  });

  const byId = new Map();
  for (const entry of entries) {
    if (byId.has(entry.id)) {
      throw integrationOrderError(
        'adaptive_integration_result_duplicate',
        `task integration result is duplicated: ${entry.id}`,
        { task_id: entry.id },
      );
    }
    byId.set(entry.id, entry);
  }

  const dependents = new Map(entries.map(({ id }) => [id, []]));
  const indegree = new Map();
  for (const entry of entries) {
    indegree.set(entry.id, entry.dependencies.length);
    for (const dependency of entry.dependencies) {
      if (!byId.has(dependency)) {
        throw integrationOrderError(
          'adaptive_integration_dependency_result_missing',
          `${entry.id} depends on missing integration result ${dependency}`,
          { task_id: entry.id, dependency_id: dependency },
        );
      }
      dependents.get(dependency).push(entry);
    }
  }

  const ready = entries.filter(({ id }) => indegree.get(id) === 0);
  const ordered = [];
  while (ready.length > 0) {
    const entry = ready.shift();
    ordered.push(entry.result);
    for (const dependent of dependents.get(entry.id)) {
      const remaining = indegree.get(dependent.id) - 1;
      indegree.set(dependent.id, remaining);
      if (remaining !== 0) continue;
      const insertion = ready.findIndex(({ index }) => index > dependent.index);
      if (insertion === -1) ready.push(dependent);
      else ready.splice(insertion, 0, dependent);
    }
  }

  if (ordered.length !== entries.length) {
    const blocked = entries.filter(({ id }) => indegree.get(id) > 0).map(({ id }) => id);
    throw integrationOrderError(
      'adaptive_integration_dependency_cycle',
      `task integration dependencies contain a cycle: ${blocked.join(', ')}`,
      { task_ids: blocked },
    );
  }
  return ordered;
}

export async function integrateTaskCommits({ topology, integration, taskResults }) {
  const orderedResults = stableTopologicalTaskResults(taskResults);
  let snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });
  for (const result of orderedResults) {
    snapshot = await applyEphemeralCommit({
      topology,
      integration,
      taskCommit: result.commit,
      snapshot,
    });
  }
  return {
    ...snapshot,
    integration_order: orderedResults.map(({ outcome }) => outcome.id),
  };
}

export async function commitIntegratedResult({ topology, integration, message }) {
  return createBoundaryCommit({ topology, integration, message });
}

export async function commitFinalFixWorkspace({ topology, integration, writeScope, verification, message }) {
  if (verification?.status !== 'passed' || !Array.isArray(verification.commands) || verification.commands.length === 0) {
    throw new Error('final fix verification is missing or failed');
  }
  return createEphemeralTaskCommit({
    topology,
    descriptor: integration,
    writeScope,
    message,
  });
}

export async function applyIntegratedResult({
  cwd,
  baselineHead,
  baselineBranch = null,
  boundaryCommit,
  expectedPaths,
  targetSnapshot = null,
}) {
  const observed = await inspectInvokingWorktree({ cwd, writeScope: expectedPaths });
  const invokingRoot = observed.topology.invoking_root;
  if (
    observed.topology.head !== baselineHead
    || (baselineBranch !== null && observed.topology.branch !== baselineBranch)
  ) {
    const error = new Error('invoking workspace identity changed after the execution baseline');
    error.code = 'adaptive_workspace_identity_mismatch';
    throw error;
  }
  if (observed.write_overlap.length > 0) {
    const error = new Error('target paths contain user changes after the execution baseline');
    error.code = 'adaptive_target_snapshot_mismatch';
    error.details = { paths: observed.write_overlap };
    throw error;
  }
  if (targetSnapshot) {
    const snapshotPaths = targetSnapshot.map(({ path }) => path);
    const currentSnapshot = await snapshotWorkspacePaths({ cwd: invokingRoot, paths: snapshotPaths });
    if (JSON.stringify(currentSnapshot) !== JSON.stringify(targetSnapshot)) {
      const error = new Error('target paths changed after the execution baseline');
      error.code = 'adaptive_target_snapshot_mismatch';
      error.details = { expected: targetSnapshot, observed: currentSnapshot };
      throw error;
    }
  }
  const { expected, patch } = await integrationPatch({
    cwd: invokingRoot,
    baselineHead,
    boundaryCommit,
    expectedPaths,
  });
  const checked = await gitWithInput(invokingRoot, ['apply', '--check', '--binary', '-'], patch, { allowFailure: true });
  if (checked.failed) {
    throw new Error(`verified integration result could not be applied: ${checked.stderr.trim()}`);
  }
  await gitWithInput(invokingRoot, ['apply', '--binary', '-'], patch);
  const status = (await git(invokingRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  const expectedSet = new Set(expected);
  const changed = changedPathsFromStatus(status).filter((path) => expectedSet.has(path));
  if (JSON.stringify(changed) !== JSON.stringify(expected)) {
    throw new Error(`applied paths differ from verified integration: ${changed.join(', ')}`);
  }
  return { changed_paths: changed };
}

export async function integratedResultIsApplied({ cwd, baselineHead, boundaryCommit, expectedPaths }) {
  const topology = await inspectGitTopology({ cwd });
  if (topology.head !== baselineHead) return false;
  const { patch } = await integrationPatch({
    cwd: topology.invoking_root,
    baselineHead,
    boundaryCommit,
    expectedPaths,
  });
  const checked = await gitWithInput(
    topology.invoking_root,
    ['apply', '--reverse', '--check', '--binary', '-'],
    patch,
    { allowFailure: true },
  );
  return !checked.failed;
}

export async function cleanupConcurrentWorkspaces({ topology, integration, taskResults }) {
  for (const result of [...taskResults].reverse()) {
    await removeOwnedWorktree({ topology, descriptor: result.descriptor, removeBranch: true });
  }
  await removeOwnedWorktree({ topology, descriptor: integration, removeBranch: true });
  const names = ownedRefNames({ runId: integration.run_id, kind: 'root', qualifiedId: 'integration' });
  const runRoot = dirname(join(topology.primary_root, names.relative_path));
  await rm(runRoot, { recursive: true, force: true });
  return { removed: true };
}
