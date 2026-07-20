import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { runAdaptiveExecution } from '../skills/exec/scripts/adaptive-exec.mjs';
import {
  cleanupConcurrentWorkspaces,
  commitTaskWorkspace,
  createConcurrentWorkspaces,
} from '../skills/exec/scripts/worktree-integration.mjs';
import { createFakeNativeAgent } from './fixtures/fake-native-agent.mjs';

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  return (await execFileAsync('git', args, { cwd })).stdout.trim();
}

async function createRepo() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'loopx-adaptive-git-')));
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'test@example.com']);
  await git(root, ['config', 'user.name', 'Test User']);
  await writeFile(join(root, '.gitignore'), '.worktrees/\n.loopx/\n');
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'alpha.mjs'), "export const alpha = 'base';\n");
  await writeFile(join(root, 'src', 'beta.mjs'), "export const beta = 'base';\n");
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', 'baseline']);
  return { root, head: await git(root, ['rev-parse', 'HEAD']) };
}

function outcome(id, path, content) {
  return {
    id,
    depends_on: [],
    write_scope: [path],
    coupling: {
      decisions: [],
      verification: [],
      baseline_inputs: [],
      integration_outcomes: [],
    },
    content,
  };
}

test('integrates isolated leaf results and leaves one verified unstaged change in a clean workspace', async () => {
  const repo = await createRepo();
  const outcomes = [
    outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"),
    outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
    outcome('gamma', 'src/gamma.mjs', "export const gamma = 'implemented';\n"),
  ];
  const agent = createFakeNativeAgent();
  const verificationPhases = [];

  const result = await runAdaptiveExecution({
    cwd: repo.root,
    runId: 'clean-concurrent-run',
    outcomes,
    runtimeCapability: { worker_capacity: 4, task_worktree_binding: true },
    dispatchWorker: agent.dispatch,
    verifyCombined: async ({ phase, workspace }) => {
      verificationPhases.push(phase);
      assert.equal(await readFile(join(workspace, 'src', 'alpha.mjs'), 'utf8'), outcomes[0].content);
      assert.equal(await readFile(join(workspace, 'src', 'beta.mjs'), 'utf8'), outcomes[1].content);
      assert.equal(await readFile(join(workspace, 'src', 'gamma.mjs'), 'utf8'), outcomes[2].content);
      return { status: 'passed', commands: [`verify ${phase}`] };
    },
  });

  assert.equal(result.kind, 'concurrent');
  assert.deepEqual(result.changed_paths, ['src/alpha.mjs', 'src/beta.mjs', 'src/gamma.mjs']);
  assert.deepEqual(result.integration_order, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(verificationPhases, ['integration', 'applied']);
  const agentStats = agent.stats();
  assert.equal(agentStats.peak_active, 3);
  assert.equal(agentStats.active, 0);
  for (const call of agentStats.calls) {
    assert.equal(call.leaf_instruction, 'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.');
    assert.notEqual(call.workspace, repo.root);
    assert.equal(existsSync(call.workspace), false);
  }
  assert.equal(await git(repo.root, ['rev-parse', 'HEAD']), repo.head);
  assert.equal(await git(repo.root, ['status', '--short']), 'M src/alpha.mjs\n M src/beta.mjs\n?? src/gamma.mjs');
  assert.equal((await git(repo.root, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)?.length, 1);
  assert.doesNotMatch(await git(repo.root, ['branch', '--list', 'loopx/parallel/*']), /loopx/);
  assert.equal(existsSync(join(repo.root, '.loopx', 'exec', 'clean-concurrent-run')), false);
});

test('rejects actual worker paths outside declared scope before integration', async () => {
  const repo = await createRepo();
  const declared = outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n");
  const workspaces = await createConcurrentWorkspaces({
    cwd: repo.root,
    runId: 'scope-check-run',
    outcomes: [declared],
  });
  await writeFile(join(workspaces.tasks[0].path, 'src', 'beta.mjs'), "export const beta = 'outside';\n");

  await assert.rejects(
    commitTaskWorkspace({
      topology: workspaces.topology,
      task: workspaces.tasks[0],
      outcome: declared,
      verification: { status: 'passed', commands: ['verify alpha'] },
    }),
    (error) => error.code === 'parallel_task_scope_violation'
      && error.details.outside_scope.includes('src/beta.mjs'),
  );

  await cleanupConcurrentWorkspaces({
    topology: workspaces.topology,
    integration: workspaces.integration,
    taskResults: [{ descriptor: workspaces.tasks[0] }],
  });
  assert.equal(await git(repo.root, ['status', '--short']), '');
});

test('rejects the out-of-scope source of a staged rename', async () => {
  const repo = await createRepo();
  const declared = outcome('rename', 'src/renamed.mjs', "export const beta = 'base';\n");
  const workspaces = await createConcurrentWorkspaces({
    cwd: repo.root,
    runId: 'rename-scope-run',
    outcomes: [declared],
  });
  await git(workspaces.tasks[0].path, ['mv', 'src/beta.mjs', 'src/renamed.mjs']);

  await assert.rejects(
    commitTaskWorkspace({
      topology: workspaces.topology,
      task: workspaces.tasks[0],
      outcome: declared,
      verification: { status: 'passed', commands: ['verify rename'] },
    }),
    (error) => error.code === 'parallel_task_scope_violation'
      && error.details.outside_scope.includes('src/beta.mjs'),
  );

  await cleanupConcurrentWorkspaces({
    topology: workspaces.topology,
    integration: workspaces.integration,
    taskResults: [{ descriptor: workspaces.tasks[0] }],
  });
});

test('waits for active siblings and persists partial task state before surfacing worker failure', async () => {
  const repo = await createRepo();
  const outcomes = [
    outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"),
    outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
  ];
  let betaFinished = false;

  await assert.rejects(
    runAdaptiveExecution({
      cwd: repo.root,
      runId: 'worker-failure-run',
      outcomes,
      runtimeCapability: { worker_capacity: 4, task_worktree_binding: true },
      dispatchWorker: async ({ outcome: current, workspace }) => {
        if (current.id === 'alpha') {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('alpha failed');
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
        await writeFile(join(workspace, current.write_scope[0]), current.content);
        betaFinished = true;
        return { verification: { status: 'passed', commands: ['verify beta'] } };
      },
      verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
    }),
    /alpha failed/,
  );

  assert.equal(betaFinished, true);
  const manifest = JSON.parse(await readFile(
    join(repo.root, '.loopx', 'exec', 'worker-failure-run', 'manifest.json'),
    'utf8',
  ));
  assert.equal(manifest.tasks[0].status, 'failed');
  assert.equal(manifest.tasks[1].status, 'verified');
  assert.equal(manifest.tasks[1].commit.length, 40);
});
