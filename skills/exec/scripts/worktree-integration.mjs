import { execFile, spawn } from 'node:child_process';
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
  removeOwnedWorktree,
  snapshotWorkspacePaths,
  snapshotIntegrationTree,
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

export async function commitTaskWorkspace({ topology, task, outcome, verification }) {
  if (verification?.status !== 'passed' || !Array.isArray(verification.commands) || verification.commands.length === 0) {
    throw new Error(`worker verification is missing or failed for ${outcome.id}`);
  }
  return createEphemeralTaskCommit({
    topology,
    descriptor: task,
    writeScope: outcome.write_scope,
    message: `loopx task: ${outcome.id}`,
  });
}

export async function integrateTaskCommits({ topology, integration, taskResults }) {
  let snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });
  for (const result of taskResults) {
    snapshot = await applyEphemeralCommit({
      topology,
      integration,
      taskCommit: result.commit,
      snapshot,
    });
  }
  return snapshot;
}

export async function commitIntegratedResult({ topology, integration, message }) {
  return createBoundaryCommit({ topology, integration, message });
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
