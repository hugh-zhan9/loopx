import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  applyBoundaryCommit,
  applyEphemeralCommit,
  assertWorktreeRootIgnored,
  cleanupOwnedResources,
  collectConflictEvidence,
  createBoundaryCommit,
  createEphemeralTaskCommit,
  createOwnedWorktree,
  inspectGitTopology,
  inspectInvokingWorktree,
  ownedRefNames,
  removeOwnedWorktree,
  restoreIntegrationTree,
  snapshotIntegrationTree,
  verifyOwnedWorktree,
} from '../skills/parallel-subagent-exec/scripts/git-lib.mjs';

const execFileAsync = promisify(execFile);

async function git(cwd, args, options = {}) {
  const result = await execFileAsync('git', args, { cwd, ...options });
  return result.stdout.trim();
}

async function createRepo({ ignoredRoot = true } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'loopx-parallel-git-')));
  const root = join(parent, 'repo');
  await mkdir(root);
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'test@example.com']);
  await git(root, ['config', 'user.name', 'Test User']);
  await writeFile(join(root, '.gitignore'), ignoredRoot ? '.worktrees/\n' : 'node_modules/\n');
  await writeFile(join(root, 'app.txt'), 'baseline\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', 'baseline']);
  return {
    parent,
    root,
    head: await git(root, ['rev-parse', 'HEAD']),
  };
}

function descriptor(topology, names, kind = 'task') {
  return {
    kind,
    run_id: 'run-1',
    qualified_id: '01-core#T-001',
    attempt: 1,
    path: join(topology.primary_root, names.relative_path),
    branch: names.branch,
    common_dir: topology.common_dir,
    head: topology.head,
  };
}

function ownedDescriptor(topology, { kind, qualifiedId, attempt = 1, head = topology.head }) {
  const names = ownedRefNames({ runId: 'run-1', kind, qualifiedId, attempt });
  return {
    kind,
    run_id: 'run-1',
    qualified_id: qualifiedId,
    attempt,
    path: join(topology.primary_root, names.relative_path),
    branch: names.branch,
    common_dir: topology.common_dir,
    head,
  };
}

async function status(cwd) {
  return git(cwd, ['status', '--short', '--untracked-files=all']);
}

test('topology discovers primary and linked invoking worktrees', async () => {
  const repo = await createRepo();
  const primary = await inspectGitTopology({ cwd: repo.root });
  assert.equal(primary.invoking_root, repo.root);
  assert.equal(primary.primary_root, repo.root);
  assert.equal(primary.is_linked_worktree, false);
  assert.equal(primary.branch, 'main');
  assert.equal(primary.head, repo.head);

  const linkedPath = join(repo.parent, 'linked worktree');
  await git(repo.root, ['worktree', 'add', '-b', 'linked-test', linkedPath, repo.head]);
  const linked = await inspectGitTopology({ cwd: linkedPath });
  assert.equal(linked.invoking_root, linkedPath);
  assert.equal(linked.primary_root, repo.root);
  assert.equal(linked.is_linked_worktree, true);
  assert.equal(linked.branch, 'linked-test');
  assert.equal(linked.common_dir, primary.common_dir);
});

test('topology requires an ignored primary worktree root', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const worktreeRoot = join(repo.root, '.worktrees', 'parallel-subagent-exec', 'run-1');
  assert.equal(await assertWorktreeRootIgnored({ primaryRoot: repo.root, worktreeRoot }), worktreeRoot);

  const missingIgnore = await createRepo({ ignoredRoot: false });
  await assert.rejects(
    assertWorktreeRootIgnored({
      primaryRoot: missingIgnore.root,
      worktreeRoot: join(missingIgnore.root, '.worktrees', 'parallel-subagent-exec', 'run-1'),
    }),
    (error) => error.code === 'parallel_worktree_root_not_ignored',
  );
  assert.equal(topology.primary_root, repo.root);
});

test('ownership names are deterministic sanitized and bounded', () => {
  const first = ownedRefNames({
    runId: 'Run With Spaces/And Symbols',
    kind: 'task',
    qualifiedId: 'docs/very/long/'.repeat(20),
    attempt: 3,
  });
  const second = ownedRefNames({
    runId: 'Run With Spaces/And Symbols',
    kind: 'task',
    qualifiedId: 'docs/very/long/'.repeat(20),
    attempt: 3,
  });
  assert.deepEqual(second, first);
  assert.match(first.branch, /^loopx\/parallel\/[a-z0-9-]+\/task\/[a-z0-9-]+-[a-f0-9]{8}\/a3$/);
  assert.equal(first.branch.length < 180, true);
  assert.match(first.relative_path, /^\.worktrees\/parallel-subagent-exec\//);
  assert.equal(first.relative_path.includes('..'), false);
});

test('dirty inspection allows source artifacts and unrelated untracked files only', async () => {
  const repo = await createRepo();
  const sourcePath = join(repo.root, 'docs', 'loopx', 'plans', 'example.md');
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, '# plan\n');
  await writeFile(join(repo.root, 'notes.txt'), 'unrelated\n');

  const clean = await inspectInvokingWorktree({
    cwd: repo.root,
    sourcePaths: ['docs/loopx/plans/example.md'],
    writeScope: ['src/app.mjs'],
  });
  assert.deepEqual(clean.source_paths, ['docs/loopx/plans/example.md']);
  assert.deepEqual(clean.untracked_paths.sort(), ['docs/loopx/plans/example.md', 'notes.txt']);

  await mkdir(join(repo.root, 'src'));
  await writeFile(join(repo.root, 'src', 'app.mjs'), 'untracked overlap\n');
  await assert.rejects(
    inspectInvokingWorktree({
      cwd: repo.root,
      sourcePaths: ['docs/loopx/plans/example.md'],
      writeScope: ['src/app.mjs'],
    }),
    (error) => error.code === 'parallel_invoking_untracked_overlap',
  );

  await writeFile(join(repo.root, 'app.txt'), 'dirty tracked\n');
  await assert.rejects(
    inspectInvokingWorktree({
      cwd: repo.root,
      sourcePaths: ['docs/loopx/plans/example.md'],
      writeScope: ['src/other.mjs'],
    }),
    (error) => error.code === 'parallel_invoking_tracked_dirty',
  );
});

test('create verify and cleanup operate only on the exact owned descriptor', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const beforeStatus = await status(repo.root);
  const beforeContent = await readFile(join(repo.root, 'app.txt'), 'utf8');
  const names = ownedRefNames({ runId: 'run-1', kind: 'task', qualifiedId: '01-core#T-001', attempt: 1 });
  const owned = descriptor(topology, names);

  const created = await createOwnedWorktree({ topology, descriptor: owned, baseCommit: repo.head });
  assert.equal(created.path, owned.path);
  assert.equal((await verifyOwnedWorktree({ topology, descriptor: created })).head, repo.head);

  await assert.rejects(
    verifyOwnedWorktree({ topology, descriptor: { ...created, branch: 'loopx/parallel/wrong' } }),
    (error) => error.code === 'parallel_worktree_ownership_mismatch',
  );

  const removed = await removeOwnedWorktree({ topology, descriptor: created, removeBranch: true });
  assert.equal(removed.removed, true);
  assert.equal(await status(repo.root), beforeStatus);
  assert.equal(await readFile(join(repo.root, 'app.txt'), 'utf8'), beforeContent);
  await assert.rejects(git(repo.root, ['show-ref', '--verify', `refs/heads/${owned.branch}`]));
});

test('create handles paths with spaces and reports Git path failures', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const names = ownedRefNames({ runId: 'run with spaces', kind: 'child', qualifiedId: '01 core', attempt: 1 });
  const owned = descriptor(topology, names, 'child');
  const created = await createOwnedWorktree({ topology, descriptor: owned, baseCommit: repo.head });
  assert.equal((await verifyOwnedWorktree({ topology, descriptor: created })).branch, created.branch);
  await removeOwnedWorktree({ topology, descriptor: created, removeBranch: true });

  const blockingFile = join(repo.root, '.worktrees', 'parallel-subagent-exec', 'blocked-parent');
  await mkdir(dirname(blockingFile), { recursive: true });
  await writeFile(blockingFile, 'not a directory\n');
  const invalid = {
    ...owned,
    path: join(blockingFile, 'child'),
    branch: `${owned.branch}-invalid`,
  };
  await assert.rejects(
    createOwnedWorktree({ topology, descriptor: invalid, baseCommit: repo.head }),
    (error) => error.code === 'parallel_git_operation_failed',
  );
});

test('ephemeral commits enforce declared scope before staging', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const taskWorktree = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'task', qualifiedId: '01-core#T-001' }),
    baseCommit: repo.head,
  });
  await writeFile(join(taskWorktree.path, 'allowed.txt'), 'allowed\n');
  await writeFile(join(taskWorktree.path, 'outside.txt'), 'outside\n');

  await assert.rejects(
    createEphemeralTaskCommit({
      topology,
      descriptor: taskWorktree,
      writeScope: ['allowed.txt'],
      message: 'loopx ephemeral T-001',
    }),
    (error) => error.code === 'parallel_task_scope_violation',
  );
  assert.equal(await git(taskWorktree.path, ['diff', '--cached', '--name-only']), '');
});

async function createTaskCommit(topology, repo, qualifiedId, file, content) {
  const worktree = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'task', qualifiedId }),
    baseCommit: repo.head,
  });
  await writeFile(join(worktree.path, file), content);
  return createEphemeralTaskCommit({
    topology,
    descriptor: worktree,
    writeScope: [file],
    message: `loopx ephemeral ${qualifiedId}`,
  });
}

test('fan-in applies ephemeral commits without task history and creates one formal boundary', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const first = await createTaskCommit(topology, repo, '01-core#T-001', 'first.txt', 'first\n');
  const second = await createTaskCommit(topology, repo, '01-core#T-002', 'second.txt', 'second\n');
  const integration = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'child', qualifiedId: '01-core' }),
    baseCommit: repo.head,
  });

  let snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });
  await applyEphemeralCommit({ topology, integration, taskCommit: first.commit, snapshot });
  snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });
  await applyEphemeralCommit({ topology, integration, taskCommit: second.commit, snapshot });
  const boundary = await createBoundaryCommit({ topology, integration, message: 'Implement child 01' });

  assert.equal(await readFile(join(integration.path, 'first.txt'), 'utf8'), 'first\n');
  assert.equal(await readFile(join(integration.path, 'second.txt'), 'utf8'), 'second\n');
  const subjects = (await git(integration.path, ['log', '--format=%s'])).split('\n');
  assert.deepEqual(subjects, ['Implement child 01', 'baseline']);
  assert.equal(subjects.some((subject) => subject.startsWith('loopx ephemeral')), false);
  assert.equal(boundary.parent, repo.head);
});

test('order permutations converge when the deterministic queue order is unchanged', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const second = await createTaskCommit(topology, repo, '01-core#T-002', 'second.txt', 'second\n');
  const first = await createTaskCommit(topology, repo, '01-core#T-001', 'first.txt', 'first\n');

  const trees = [];
  for (const suffix of ['a', 'b']) {
    const integration = await createOwnedWorktree({
      topology,
      descriptor: ownedDescriptor(topology, { kind: 'child', qualifiedId: `01-core-${suffix}` }),
      baseCommit: repo.head,
    });
    for (const commit of [first.commit, second.commit]) {
      const snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });
      await applyEphemeralCommit({ topology, integration, taskCommit: commit, snapshot });
    }
    trees.push((await snapshotIntegrationTree({ topology, descriptor: integration })).index_tree);
  }

  assert.equal(trees[0], trees[1]);
});

test('snapshot rejects unstaged or untracked integration state', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const integration = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'child', qualifiedId: '01-core' }),
    baseCommit: repo.head,
  });
  await writeFile(join(integration.path, 'untracked.txt'), 'unsafe\n');
  await assert.rejects(
    snapshotIntegrationTree({ topology, descriptor: integration }),
    (error) => error.code === 'parallel_integration_snapshot_invalid',
  );
});

test('fan-in preserves one visible commit per reviewed child boundary', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const childCommits = [];
  for (const [qualifiedId, file] of [['01-core', 'core.txt'], ['02-extra', 'extra.txt']]) {
    const taskCommit = await createTaskCommit(topology, repo, `${qualifiedId}#T-001`, file, `${qualifiedId}\n`);
    const child = await createOwnedWorktree({
      topology,
      descriptor: ownedDescriptor(topology, { kind: 'child', qualifiedId }),
      baseCommit: repo.head,
    });
    const snapshot = await snapshotIntegrationTree({ topology, descriptor: child });
    await applyEphemeralCommit({ topology, integration: child, taskCommit: taskCommit.commit, snapshot });
    childCommits.push(await createBoundaryCommit({ topology, integration: child, message: `Implement ${qualifiedId}` }));
  }

  let rootIntegration = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'root', qualifiedId: 'root' }),
    baseCommit: repo.head,
  });
  for (const child of childCommits) {
    const snapshot = await snapshotIntegrationTree({ topology, descriptor: rootIntegration });
    const applied = await applyBoundaryCommit({
      topology,
      integration: rootIntegration,
      boundaryCommit: child.commit,
      snapshot,
    });
    rootIntegration = applied.descriptor;
  }

  assert.deepEqual((await git(rootIntegration.path, ['log', '--format=%s'])).split('\n'), [
    'Implement 02-extra',
    'Implement 01-core',
    'baseline',
  ]);
});

async function createConflictingTaskCommit(topology, repo, qualifiedId, content) {
  const worktree = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'task', qualifiedId }),
    baseCommit: repo.head,
  });
  await writeFile(join(worktree.path, 'app.txt'), content);
  return createEphemeralTaskCommit({
    topology,
    descriptor: worktree,
    writeScope: ['app.txt'],
    message: `loopx ephemeral ${qualifiedId}`,
  });
}

test('conflict evidence and restore preserve the exact accumulated index tree', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const first = await createConflictingTaskCommit(topology, repo, '01-core#T-001', 'first\n');
  const second = await createConflictingTaskCommit(topology, repo, '01-core#T-002', 'second\n');
  const integration = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'child', qualifiedId: '01-core' }),
    baseCommit: repo.head,
  });
  let snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });
  await applyEphemeralCommit({ topology, integration, taskCommit: first.commit, snapshot });
  snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });

  await assert.rejects(
    applyEphemeralCommit({ topology, integration, taskCommit: second.commit, snapshot }),
    (error) => error.code === 'parallel_git_apply_conflict',
  );
  const evidencePath = join(repo.parent, 'conflicts', 'task.json');
  const evidence = await collectConflictEvidence({
    topology,
    integration,
    sourceCommit: second.commit,
    sourceKind: 'task',
    outputPath: evidencePath,
  });
  assert.equal(evidence.source_kind, 'task');
  assert.deepEqual(evidence.unmerged_paths, ['app.txt']);
  assert.equal(JSON.parse(await readFile(evidencePath, 'utf8')).source_commit, second.commit);

  const restored = await restoreIntegrationTree({ topology, integration, snapshot });
  assert.equal(restored.index_tree, snapshot.index_tree);
  assert.equal((await snapshotIntegrationTree({ topology, descriptor: integration })).status, snapshot.status);
  assert.equal(await readFile(join(integration.path, 'app.txt'), 'utf8'), 'first\n');
});

test('child-boundary conflict uses the same evidence and restore contract', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const childCommits = [];
  for (const [qualifiedId, content] of [['01-core', 'first\n'], ['02-extra', 'second\n']]) {
    const taskCommit = await createConflictingTaskCommit(topology, repo, `${qualifiedId}#T-001`, content);
    const child = await createOwnedWorktree({
      topology,
      descriptor: ownedDescriptor(topology, { kind: 'child', qualifiedId }),
      baseCommit: repo.head,
    });
    let snapshot = await snapshotIntegrationTree({ topology, descriptor: child });
    await applyEphemeralCommit({ topology, integration: child, taskCommit: taskCommit.commit, snapshot });
    childCommits.push(await createBoundaryCommit({ topology, integration: child, message: `Implement ${qualifiedId}` }));
  }
  let rootIntegration = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'root', qualifiedId: 'root' }),
    baseCommit: repo.head,
  });
  let snapshot = await snapshotIntegrationTree({ topology, descriptor: rootIntegration });
  rootIntegration = (await applyBoundaryCommit({
    topology,
    integration: rootIntegration,
    boundaryCommit: childCommits[0].commit,
    snapshot,
  })).descriptor;
  snapshot = await snapshotIntegrationTree({ topology, descriptor: rootIntegration });

  await assert.rejects(
    applyBoundaryCommit({
      topology,
      integration: rootIntegration,
      boundaryCommit: childCommits[1].commit,
      snapshot,
    }),
    (error) => error.code === 'parallel_git_apply_conflict',
  );
  const evidence = await collectConflictEvidence({
    topology,
    integration: rootIntegration,
    sourceCommit: childCommits[1].commit,
    sourceKind: 'child',
    outputPath: join(repo.parent, 'conflicts', 'child.json'),
  });
  assert.equal(evidence.source_kind, 'child');
  await restoreIntegrationTree({ topology, integration: rootIntegration, snapshot });
  assert.equal(await readFile(join(rootIntegration.path, 'app.txt'), 'utf8'), 'first\n');
});

test('restore rejects an invalid snapshot without changing a clean integration tree', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const integration = await createOwnedWorktree({
    topology,
    descriptor: ownedDescriptor(topology, { kind: 'child', qualifiedId: '01-core' }),
    baseCommit: repo.head,
  });
  const before = await snapshotIntegrationTree({ topology, descriptor: integration });
  await assert.rejects(
    restoreIntegrationTree({ topology, integration, snapshot: { ...before, index_tree: '0'.repeat(40) } }),
    (error) => error.code === 'parallel_integration_restore_failed',
  );
  assert.deepEqual(await snapshotIntegrationTree({ topology, descriptor: integration }), before);
});

test('cleanup removes only task retry and child resources on complete', async () => {
  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  const resources = [];
  for (const [kind, qualifiedId] of [['root', 'root'], ['child', '01-core'], ['task', '01-core#T-001'], ['retry', '01-core#T-001']]) {
    resources.push(await createOwnedWorktree({
      topology,
      descriptor: ownedDescriptor(topology, { kind, qualifiedId }),
      baseCommit: repo.head,
    }));
  }

  const result = await cleanupOwnedResources({ topology, resources, disposition: 'complete' });

  assert.deepEqual(result.preserved.map(({ kind }) => kind), ['root']);
  assert.deepEqual(result.removed.map(({ kind }) => kind).sort(), ['child', 'retry', 'task']);
  assert.equal(existsSync(resources.find(({ kind }) => kind === 'root').path), true);
  for (const resource of resources.filter(({ kind }) => kind !== 'root')) assert.equal(existsSync(resource.path), false);
});

test('cleanup preserves every resource for blocked and interrupted dispositions', async () => {
  for (const disposition of ['blocked', 'interrupted']) {
    const repo = await createRepo();
    const topology = await inspectGitTopology({ cwd: repo.root });
    const resource = await createOwnedWorktree({
      topology,
      descriptor: ownedDescriptor(topology, { kind: 'task', qualifiedId: `01-core#${disposition}` }),
      baseCommit: repo.head,
    });
    const result = await cleanupOwnedResources({ topology, resources: [resource], disposition });
    assert.deepEqual(result.removed, []);
    assert.equal(result.preserved.length, 1);
    assert.equal(existsSync(resource.path), true);
  }

  const repo = await createRepo();
  const topology = await inspectGitTopology({ cwd: repo.root });
  await assert.rejects(
    cleanupOwnedResources({ topology, resources: [], disposition: 'unknown' }),
    (error) => error.code === 'parallel_cleanup_disposition_invalid',
  );
});
