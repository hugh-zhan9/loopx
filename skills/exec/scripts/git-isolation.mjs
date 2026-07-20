import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

class ParallelGitError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ParallelGitError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ParallelGitError(code, message, details);
}

async function runGit(cwd, args, { allowFailure = false } = {}) {
  try {
    const result = await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (allowFailure) {
      return { ok: false, stdout: error.stdout || '', stderr: error.stderr || '', exitCode: error.code };
    }
    fail('parallel_git_operation_failed', `git ${args[0]} failed`, {
      cwd,
      args,
      stderr: String(error.stderr || error.message).trim(),
    });
  }
}

function normalizeRepoPath(value, root, label) {
  if (typeof value !== 'string' || value.length === 0) fail('parallel_git_path_invalid', `${label} is required`);
  const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value);
  const repoPath = relative(root, absolute).split(sep).join('/');
  if (repoPath === '..' || repoPath.startsWith('../') || isAbsolute(repoPath)) {
    fail('parallel_git_path_invalid', `${label} is outside repository: ${value}`);
  }
  return repoPath;
}

function isInside(root, target) {
  const value = relative(root, target);
  return value === '' || (value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

async function fingerprintWorkspacePath(path) {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'missing' };
    throw error;
  }
  const mode = stats.mode & 0o777;
  if (stats.isSymbolicLink()) {
    return {
      kind: 'symlink',
      mode,
      sha256: createHash('sha256').update(await readlink(path)).digest('hex'),
    };
  }
  if (stats.isFile()) {
    return {
      kind: 'file',
      mode,
      sha256: createHash('sha256').update(await readFile(path)).digest('hex'),
    };
  }
  if (stats.isDirectory()) {
    const entries = [];
    for (const name of (await readdir(path)).sort()) {
      entries.push([name, await fingerprintWorkspacePath(join(path, name))]);
    }
    return {
      kind: 'directory',
      mode,
      sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    };
  }
  return { kind: 'other', mode };
}

export async function snapshotWorkspacePaths({ cwd, paths }) {
  const root = resolve(cwd);
  const normalized = [...new Set(paths.map((path) => normalizeRepoPath(path, root, 'snapshot path')))].sort();
  const snapshot = [];
  for (const path of normalized) {
    snapshot.push({ path, ...(await fingerprintWorkspacePath(join(root, path))) });
  }
  return snapshot;
}

function parseWorktreeList(text) {
  return text.trim().split(/\n\n+/).filter(Boolean).map((block) => {
    const result = { path: null, head: null, branch: null, detached: false };
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) result.path = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) result.head = line.slice('HEAD '.length);
      else if (line.startsWith('branch refs/heads/')) result.branch = line.slice('branch refs/heads/'.length);
      else if (line === 'detached') result.detached = true;
    }
    return result;
  });
}

export async function inspectGitTopology({ cwd }) {
  const invokingRootRaw = (await runGit(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim();
  const invokingRoot = await realpath(invokingRootRaw);
  const commonRaw = (await runGit(cwd, ['rev-parse', '--git-common-dir'])).stdout.trim();
  const commonDir = await realpath(resolve(cwd, commonRaw));
  const head = (await runGit(cwd, ['rev-parse', 'HEAD'])).stdout.trim();
  const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  const worktrees = parseWorktreeList((await runGit(cwd, ['worktree', 'list', '--porcelain'])).stdout);
  if (worktrees.length === 0) fail('parallel_git_topology_invalid', 'git worktree list returned no entries');
  const normalized = [];
  for (const worktree of worktrees) {
    normalized.push({ ...worktree, path: await realpath(worktree.path) });
  }
  const primaryRoot = normalized[0].path;
  const invoking = normalized.find((worktree) => worktree.path === invokingRoot);
  if (!invoking) fail('parallel_git_topology_invalid', `invoking worktree is absent from worktree list: ${invokingRoot}`);
  return {
    invoking_root: invokingRoot,
    primary_root: primaryRoot,
    common_dir: commonDir,
    branch,
    head,
    is_linked_worktree: invokingRoot !== primaryRoot,
    worktrees: normalized,
  };
}

function parsePorcelainZ(text) {
  const entries = [];
  const tokens = text.split('\0').filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const status = token.slice(0, 2);
    const path = token.slice(3);
    const entry = { status, path };
    if (status.includes('R') || status.includes('C')) {
      index += 1;
      entry.source_path = tokens[index];
    }
    entries.push(entry);
  }
  return entries;
}

function pathsOverlap(first, second) {
  return first === second || first.startsWith(`${second}/`) || second.startsWith(`${first}/`);
}

export async function inspectInvokingWorktree({ cwd, sourcePaths = [], writeScope = [], relevantPaths = [] }) {
  const topology = await inspectGitTopology({ cwd });
  const sources = sourcePaths.map((path) => normalizeRepoPath(path, topology.invoking_root, 'source path'));
  const scope = writeScope.map((path) => normalizeRepoPath(path, topology.invoking_root, 'write scope'));
  const relevant = relevantPaths.map((path) => normalizeRepoPath(path, topology.invoking_root, 'relevant path'));
  const statusText = (await runGit(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  const entries = parsePorcelainZ(statusText);
  const dirtyPaths = [...new Set(entries.flatMap(({ path, source_path: sourcePath }) => (
    sourcePath ? [path, sourcePath] : [path]
  )))].sort();
  const writeOverlap = dirtyPaths.filter((dirtyPath) => scope.some((path) => pathsOverlap(dirtyPath, path)));
  const relevantOverlap = dirtyPaths.filter((dirtyPath) => relevant.some((path) => pathsOverlap(dirtyPath, path)));
  const executionOverlap = [...new Set([...writeOverlap, ...relevantOverlap])].sort();
  const targetSnapshot = await snapshotWorkspacePaths({ cwd: topology.invoking_root, paths: scope });
  return {
    topology,
    source_paths: sources,
    write_scope: scope,
    relevant_paths: relevant,
    dirty_entries: entries,
    dirty_paths: dirtyPaths,
    write_overlap: writeOverlap,
    relevant_overlap: relevantOverlap,
    execution_overlap: executionOverlap,
    target_snapshot: targetSnapshot,
    tracked_source_paths: entries.filter(({ status, path }) => (
      status !== '??' && sources.some((source) => pathsOverlap(path, source))
    )).map(({ path }) => path),
    untracked_paths: entries.filter(({ status }) => status === '??').map(({ path }) => path),
  };
}

function shortHash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function sanitize(value, maxLength) {
  const cleaned = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  return cleaned.slice(0, maxLength).replace(/-+$/g, '') || 'item';
}

export function ownedRefNames({ runId, kind, qualifiedId = 'root', attempt = 1 }) {
  if (!['root', 'child', 'task', 'retry'].includes(kind) || !Number.isInteger(attempt) || attempt < 1) {
    fail('parallel_owned_name_invalid', 'kind or attempt is invalid');
  }
  const run = `${sanitize(runId, 36)}-${shortHash(runId)}`;
  const item = `${sanitize(qualifiedId, 54)}-${shortHash(qualifiedId)}`;
  let suffix;
  if (kind === 'root') suffix = 'root';
  else if (kind === 'child') suffix = `child/${item}`;
  else if (kind === 'task') suffix = `task/${item}/a${attempt}`;
  else suffix = `retry/${item}/r${attempt}`;
  return {
    branch: `loopx/parallel/${run}/${suffix}`,
    relative_path: `.worktrees/loopx-exec/${run}/${suffix}`,
  };
}

export async function assertWorktreeRootIgnored({ primaryRoot, worktreeRoot }) {
  const primary = await realpath(primaryRoot);
  const target = resolve(worktreeRoot);
  const requiredRoot = join(primary, '.worktrees', 'loopx-exec');
  if (!isInside(requiredRoot, target) || target === requiredRoot) {
    fail('parallel_worktree_root_invalid', `worktree root must be a run directory under ${requiredRoot}`);
  }
  const result = await runGit(primary, ['check-ignore', '--no-index', '-q', '--', target], { allowFailure: true });
  if (!result.ok) {
    fail('parallel_worktree_root_not_ignored', `worktree root is not ignored: ${target}`);
  }
  return target;
}

function assertDescriptor(topology, descriptor) {
  if (!descriptor || typeof descriptor !== 'object') fail('parallel_worktree_ownership_mismatch', 'owned descriptor is required');
  if (descriptor.common_dir !== topology.common_dir) {
    fail('parallel_worktree_ownership_mismatch', 'descriptor common dir does not match topology');
  }
  if (!descriptor.path || !descriptor.branch || !descriptor.head || !descriptor.kind || !descriptor.run_id) {
    fail('parallel_worktree_ownership_mismatch', 'descriptor is missing identity fields');
  }
  const ownedRoot = join(topology.primary_root, '.worktrees', 'loopx-exec');
  if (!isInside(ownedRoot, resolve(descriptor.path))) {
    fail('parallel_worktree_ownership_mismatch', `descriptor path is outside owned root: ${descriptor.path}`);
  }
  if (!descriptor.branch.startsWith('loopx/parallel/')) {
    fail('parallel_worktree_ownership_mismatch', `descriptor branch is outside owned refs: ${descriptor.branch}`);
  }
}

async function branchExists(topology, branch) {
  return (await runGit(topology.primary_root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true })).ok;
}

export async function createOwnedWorktree({ topology, descriptor, baseCommit }) {
  assertDescriptor(topology, descriptor);
  await assertWorktreeRootIgnored({ primaryRoot: topology.primary_root, worktreeRoot: dirname(descriptor.path) });
  if (existsSync(descriptor.path) || await branchExists(topology, descriptor.branch)) {
    fail('parallel_worktree_ownership_mismatch', 'owned path or branch already exists');
  }
  try {
    await mkdir(dirname(descriptor.path), { recursive: true });
    await runGit(topology.primary_root, ['worktree', 'add', '-b', descriptor.branch, descriptor.path, baseCommit]);
    return verifyOwnedWorktree({ topology, descriptor: { ...descriptor, head: baseCommit } });
  } catch (error) {
    if (await branchExists(topology, descriptor.branch)) {
      await runGit(topology.primary_root, ['branch', '-D', descriptor.branch], { allowFailure: true });
    }
    if (error instanceof ParallelGitError) throw error;
    fail('parallel_git_operation_failed', `cannot create owned worktree: ${descriptor.path}`, { message: error.message });
  }
}

export async function verifyOwnedWorktree({ topology, descriptor }) {
  assertDescriptor(topology, descriptor);
  if (!existsSync(descriptor.path)) fail('parallel_worktree_ownership_mismatch', `owned path is missing: ${descriptor.path}`);
  const actualPath = await realpath(descriptor.path);
  if (actualPath !== resolve(descriptor.path)) fail('parallel_worktree_ownership_mismatch', 'owned path realpath mismatch');
  const listed = parseWorktreeList((await runGit(topology.primary_root, ['worktree', 'list', '--porcelain'])).stdout);
  const entry = listed.find((worktree) => resolve(worktree.path) === actualPath);
  if (!entry) fail('parallel_worktree_ownership_mismatch', 'owned path is absent from worktree list');
  const commonRaw = (await runGit(actualPath, ['rev-parse', '--git-common-dir'])).stdout.trim();
  const commonDir = await realpath(resolve(actualPath, commonRaw));
  const branch = (await runGit(actualPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  const head = (await runGit(actualPath, ['rev-parse', 'HEAD'])).stdout.trim();
  if (commonDir !== descriptor.common_dir || branch !== descriptor.branch || head !== descriptor.head) {
    fail('parallel_worktree_ownership_mismatch', 'owned worktree identity differs from descriptor', {
      expected: { common_dir: descriptor.common_dir, branch: descriptor.branch, head: descriptor.head },
      observed: { common_dir: commonDir, branch, head },
    });
  }
  return { ...descriptor, path: actualPath, common_dir: commonDir, branch, head };
}

export async function removeOwnedWorktree({ topology, descriptor, removeBranch = false }) {
  const verified = await verifyOwnedWorktree({ topology, descriptor });
  await runGit(topology.primary_root, ['worktree', 'remove', '--force', verified.path]);
  if (removeBranch) {
    await runGit(topology.primary_root, ['branch', '-D', verified.branch]);
  }
  return { removed: true, path: verified.path, branch: verified.branch, branch_removed: removeBranch };
}

export async function resetOwnedWorktree({ topology, descriptor }) {
  const verified = await verifyOwnedWorktree({ topology, descriptor });
  await runGit(verified.path, ['reset', '--hard', verified.head]);
  await runGit(verified.path, ['clean', '-fdx']);
  return verifyOwnedWorktree({ topology, descriptor: verified });
}

export function changedPathsFromStatus(text) {
  const paths = parsePorcelainZ(text).flatMap(({ status, path, source_path: sourcePath }) => (
    status.includes('R') ? [path, sourcePath] : [path]
  ));
  return [...new Set(paths)].sort();
}

async function assertSnapshotCurrent(topology, descriptor, snapshot) {
  const verified = await verifyOwnedWorktree({ topology, descriptor });
  const indexTree = (await runGit(verified.path, ['write-tree'])).stdout.trim();
  const status = (await runGit(verified.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  if (verified.head !== snapshot.head || indexTree !== snapshot.index_tree || status !== snapshot.status) {
    fail('parallel_integration_snapshot_mismatch', 'integration worktree no longer matches the persisted snapshot', {
      expected: snapshot,
      observed: { head: verified.head, index_tree: indexTree, status },
    });
  }
  return verified;
}

export async function createEphemeralTaskCommit({ topology, descriptor, writeScope, message }) {
  const verified = await verifyOwnedWorktree({ topology, descriptor });
  if (!Array.isArray(writeScope) || writeScope.length === 0 || !message) {
    fail('parallel_task_commit_invalid', 'writeScope and message are required');
  }
  const allowed = new Set(writeScope.map((path) => normalizeRepoPath(path, verified.path, 'task write scope')));
  const statusText = (await runGit(verified.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  const changedPaths = changedPathsFromStatus(statusText);
  if (changedPaths.length === 0) fail('parallel_task_commit_invalid', 'task worktree contains no changes');
  const outside = changedPaths.filter((path) => !allowed.has(path));
  if (outside.length > 0) {
    fail('parallel_task_scope_violation', 'task changed files outside declared write scope', {
      changed_paths: changedPaths,
      outside_scope: outside,
    });
  }
  await runGit(verified.path, ['add', '--all']);
  await runGit(verified.path, ['commit', '-m', message]);
  const commit = (await runGit(verified.path, ['rev-parse', 'HEAD'])).stdout.trim();
  const tree = (await runGit(verified.path, ['rev-parse', 'HEAD^{tree}'])).stdout.trim();
  const parent = (await runGit(verified.path, ['rev-parse', 'HEAD^'])).stdout.trim();
  return {
    commit,
    tree,
    parent,
    changed_paths: changedPaths,
    descriptor: { ...verified, head: commit },
  };
}

export async function snapshotIntegrationTree({ topology, descriptor }) {
  const verified = await verifyOwnedWorktree({ topology, descriptor });
  const indexTree = (await runGit(verified.path, ['write-tree'])).stdout.trim();
  const status = (await runGit(verified.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  const unsafe = parsePorcelainZ(status).filter(({ status: entryStatus }) => entryStatus === '??' || entryStatus[1] !== ' ');
  if (unsafe.length > 0) {
    fail('parallel_integration_snapshot_invalid', 'integration snapshot contains unstaged or untracked changes', { entries: unsafe });
  }
  return {
    head: verified.head,
    index_tree: indexTree,
    status,
    changed_paths: changedPathsFromStatus(status),
  };
}

export async function applyEphemeralCommit({ topology, integration, taskCommit, snapshot }) {
  const verified = await assertSnapshotCurrent(topology, integration, snapshot);
  const result = await runGit(verified.path, ['cherry-pick', '--no-commit', taskCommit], { allowFailure: true });
  if (!result.ok) {
    fail('parallel_git_apply_conflict', `ephemeral commit conflicts: ${taskCommit}`, {
      source_commit: taskCommit,
      source_kind: 'task',
      stderr: result.stderr.trim(),
    });
  }
  const current = await snapshotIntegrationTree({ topology, descriptor: verified });
  return { applied: true, task_commit: taskCommit, ...current };
}

export async function createBoundaryCommit({ topology, integration, message }) {
  const verified = await verifyOwnedWorktree({ topology, descriptor: integration });
  const status = (await runGit(verified.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  const unsafe = parsePorcelainZ(status).filter(({ status: entryStatus }) => entryStatus === '??' || entryStatus[1] !== ' ');
  if (unsafe.length > 0) fail('parallel_boundary_commit_invalid', 'boundary commit contains unstaged or untracked changes', { entries: unsafe });
  const staged = await runGit(verified.path, ['diff', '--cached', '--quiet'], { allowFailure: true });
  if (staged.ok) fail('parallel_boundary_commit_invalid', 'integration worktree has no staged changes');
  await runGit(verified.path, ['commit', '-m', message]);
  const commit = (await runGit(verified.path, ['rev-parse', 'HEAD'])).stdout.trim();
  const tree = (await runGit(verified.path, ['rev-parse', 'HEAD^{tree}'])).stdout.trim();
  const parent = (await runGit(verified.path, ['rev-parse', 'HEAD^'])).stdout.trim();
  return { commit, tree, parent, descriptor: { ...verified, head: commit } };
}

export async function applyBoundaryCommit({ topology, integration, boundaryCommit, snapshot }) {
  const verified = await assertSnapshotCurrent(topology, integration, snapshot);
  const result = await runGit(verified.path, ['cherry-pick', boundaryCommit], { allowFailure: true });
  if (!result.ok) {
    fail('parallel_git_apply_conflict', `boundary commit conflicts: ${boundaryCommit}`, {
      source_commit: boundaryCommit,
      source_kind: 'child',
      stderr: result.stderr.trim(),
    });
  }
  const commit = (await runGit(verified.path, ['rev-parse', 'HEAD'])).stdout.trim();
  return {
    applied: true,
    source_commit: boundaryCommit,
    commit,
    descriptor: { ...verified, head: commit },
  };
}

export async function collectConflictEvidence({ topology, integration, sourceCommit, sourceKind, outputPath }) {
  const verified = await verifyOwnedWorktree({ topology, descriptor: integration });
  if (!['task', 'child'].includes(sourceKind) || !sourceCommit || !outputPath) {
    fail('parallel_conflict_evidence_invalid', 'sourceCommit, sourceKind, and outputPath are required');
  }
  const status = (await runGit(verified.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  const unmergedRaw = (await runGit(verified.path, ['diff', '--name-only', '--diff-filter=U', '-z'])).stdout;
  const sourceStat = (await runGit(verified.path, ['show', '--stat', '--format=fuller', sourceCommit])).stdout;
  const sourceDiff = (await runGit(verified.path, ['show', '--format=', '--binary', sourceCommit])).stdout;
  const conflictDiff = (await runGit(verified.path, ['diff', '--cc'])).stdout;
  const evidence = {
    schema: 'loopx.parallel-conflict-evidence.v1',
    source_commit: sourceCommit,
    source_kind: sourceKind,
    integration: {
      path: verified.path,
      branch: verified.branch,
      head: verified.head,
      common_dir: verified.common_dir,
    },
    status,
    unmerged_paths: unmergedRaw.split('\0').filter(Boolean).sort(),
    source_stat: sourceStat,
    source_diff: sourceDiff,
    conflict_diff: conflictDiff,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  return evidence;
}

export async function restoreIntegrationTree({ topology, integration, snapshot }) {
  const verified = await verifyOwnedWorktree({ topology, descriptor: integration });
  if (!snapshot || snapshot.head !== verified.head || !snapshot.index_tree || typeof snapshot.status !== 'string') {
    fail('parallel_integration_restore_failed', 'snapshot identity does not match owned integration worktree');
  }
  if (parsePorcelainZ(snapshot.status).some(({ status }) => status === '??')) {
    fail('parallel_integration_restore_failed', 'snapshot contains untracked files and cannot be restored safely');
  }
  const treeExists = await runGit(verified.path, ['cat-file', '-e', `${snapshot.index_tree}^{tree}`], { allowFailure: true });
  if (!treeExists.ok) fail('parallel_integration_restore_failed', `snapshot tree does not exist: ${snapshot.index_tree}`);

  try {
    await runGit(verified.path, ['reset', '--hard', snapshot.head]);
    await runGit(verified.path, ['clean', '-fd']);
    await runGit(verified.path, ['read-tree', snapshot.index_tree]);
    await runGit(verified.path, ['checkout-index', '-a', '-f']);
  } catch (error) {
    if (error instanceof ParallelGitError) {
      fail('parallel_integration_restore_failed', error.message, error.details);
    }
    throw error;
  }
  const restored = await snapshotIntegrationTree({ topology, descriptor: verified });
  if (restored.index_tree !== snapshot.index_tree || restored.status !== snapshot.status) {
    fail('parallel_integration_restore_failed', 'restored integration tree differs from snapshot', {
      expected: snapshot,
      observed: restored,
    });
  }
  return restored;
}

export async function cleanupOwnedResources({ topology, resources, disposition }) {
  if (!['complete', 'blocked', 'interrupted'].includes(disposition)) {
    fail('parallel_cleanup_disposition_invalid', `unknown cleanup disposition: ${disposition}`);
  }
  if (!Array.isArray(resources)) fail('parallel_cleanup_resources_invalid', 'resources must be an array');
  const verified = [];
  for (const resource of resources) {
    if (!['root', 'child', 'task', 'retry'].includes(resource.kind)) {
      fail('parallel_cleanup_resources_invalid', `unknown owned resource kind: ${resource.kind}`);
    }
    verified.push(await verifyOwnedWorktree({ topology, descriptor: resource }));
  }
  if (disposition !== 'complete') {
    return { disposition, removed: [], preserved: verified };
  }

  const removed = [];
  const preserved = [];
  for (const resource of verified) {
    if (resource.kind === 'root') {
      preserved.push(resource);
      continue;
    }
    await removeOwnedWorktree({ topology, descriptor: resource, removeBranch: true });
    removed.push(resource);
  }
  return { disposition, removed, preserved };
}
