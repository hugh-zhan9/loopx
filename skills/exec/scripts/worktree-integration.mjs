import { execFile } from 'node:child_process';
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

export async function createConcurrentWorkspaces({ cwd, runId, outcomes }) {
  const writeScope = outcomes.flatMap((outcome) => outcome.write_scope);
  const inspected = await inspectInvokingWorktree({ cwd, writeScope });
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
  return { topology, baseline_head: topology.head, integration, tasks };
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

export async function applyIntegratedResult({ cwd, baselineHead, boundaryCommit, expectedPaths }) {
  const observed = await inspectInvokingWorktree({ cwd, writeScope: expectedPaths });
  if (observed.topology.head !== baselineHead) {
    throw new Error('invoking workspace HEAD changed after the execution baseline');
  }
  const applied = await git(cwd, ['cherry-pick', '--no-commit', boundaryCommit], { allowFailure: true });
  if (applied.failed) {
    await git(cwd, ['cherry-pick', '--abort'], { allowFailure: true });
    throw new Error(`verified integration result could not be applied: ${applied.stderr.trim()}`);
  }
  await git(cwd, ['reset', '--mixed', 'HEAD']);
  const status = (await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  const changed = changedPathsFromStatus(status);
  const expected = [...new Set(expectedPaths)].sort();
  if (JSON.stringify(changed) !== JSON.stringify(expected)) {
    throw new Error(`applied paths differ from verified integration: ${changed.join(', ')}`);
  }
  return { changed_paths: changed };
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
