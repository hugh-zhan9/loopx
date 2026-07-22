import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  cleanupConcurrentWorkspaces,
  commitTaskWorkspace,
  createConcurrentWorkspaces,
  integrateTaskCommits,
  prepareTaskWorkspace,
} from '../skills/exec/scripts/worktree-integration.mjs';

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  return (await execFileAsync('git', args, { cwd })).stdout.trim();
}

function outcome(id, dependsOn) {
  return {
    id,
    outcome: `Deliver ${id}`,
    depends_on: dependsOn,
    write_scope: ['sequence.txt'],
    relevant_paths: [],
  };
}

async function createRepo() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'loopx-topological-integration-')));
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'test@example.com']);
  await git(root, ['config', 'user.name', 'Test User']);
  await writeFile(join(root, '.gitignore'), '.worktrees/\n.loopx/\n');
  await writeFile(join(root, 'sequence.txt'), 'base\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', 'baseline']);
  return root;
}

test('integrates child-before-parent results in stable topological order', async () => {
  const root = await createRepo();
  const parent = outcome('parent', []);
  const child = outcome('child', ['parent']);
  const workspaces = await createConcurrentWorkspaces({
    cwd: root,
    runId: 'child-before-parent',
    outcomes: [parent, child],
  });
  let parentResult;
  let childResult;

  try {
    await writeFile(join(workspaces.tasks[0].path, 'sequence.txt'), 'base\nparent\n');
    parentResult = await commitTaskWorkspace({
      topology: workspaces.topology,
      task: workspaces.tasks[0],
      outcome: parent,
      verification: { status: 'passed', commands: ['verify parent'] },
    });

    const preparedChild = await prepareTaskWorkspace({
      topology: workspaces.topology,
      task: workspaces.tasks[1],
      dependencyCommits: [parentResult.commit],
    });
    await writeFile(join(preparedChild.path, 'sequence.txt'), 'base\nparent\nchild\n');
    childResult = await commitTaskWorkspace({
      topology: workspaces.topology,
      task: preparedChild,
      outcome: child,
      verification: { status: 'passed', commands: ['verify child'] },
    });

    const integrated = await integrateTaskCommits({
      topology: workspaces.topology,
      integration: workspaces.integration,
      taskResults: [
        { outcome: child, commit: childResult.commit },
        { outcome: parent, commit: parentResult.commit },
      ],
    });

    assert.equal(
      await readFile(join(workspaces.integration.path, 'sequence.txt'), 'utf8'),
      'base\nparent\nchild\n',
    );
    assert.deepEqual(integrated.integration_order, ['parent', 'child']);
  } finally {
    if (parentResult && childResult) {
      await cleanupConcurrentWorkspaces({
        topology: workspaces.topology,
        integration: workspaces.integration,
        taskResults: [
          { descriptor: childResult.descriptor },
          { descriptor: parentResult.descriptor },
        ],
      });
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('fails closed before integration when a dependency result is missing', async () => {
  const child = outcome('child', ['parent']);
  await assert.rejects(
    integrateTaskCommits({
      topology: null,
      integration: null,
      taskResults: [{ outcome: child, commit: 'unused' }],
    }),
    (error) => error.code === 'adaptive_integration_dependency_result_missing'
      && error.details.task_id === 'child'
      && error.details.dependency_id === 'parent',
  );
});
