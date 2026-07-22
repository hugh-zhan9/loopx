import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  resumeAdaptiveExecution as resumeAdaptiveExecutionBase,
  runAdaptiveExecution as runAdaptiveExecutionBase,
} from '../skills/exec/scripts/adaptive-exec.mjs';
import {
  cleanupConcurrentWorkspaces,
  commitTaskWorkspace,
  createConcurrentWorkspaces,
} from '../skills/exec/scripts/worktree-integration.mjs';
import { createFakeNativeAgent } from './fixtures/fake-native-agent.mjs';

const execFileAsync = promisify(execFile);

function approvedTaskReview(taskId) {
  return [
    '```loopx-review-result',
    JSON.stringify({
      schema: 'loopx.task-review-result.v1',
      task_id: taskId,
      spec_compliance: 'APPROVED',
      code_quality: 'APPROVED',
      cannot_verify: [],
      findings: [],
    }),
    '```',
  ].join('\n');
}

async function dispatchReviewer({ taskId, attempt }) {
  return {
    reviewer: { id: `${taskId}-reviewer-${attempt}`, model: 'test', platform: 'test' },
    rawMessage: approvedTaskReview(taskId),
  };
}

async function dispatchFinalReviewer({ axis, candidate }) {
  return {
    schema: 'loopx.final-review-result.v1',
    axis,
    verdict: 'APPROVED',
    findings: [],
    candidate,
    reviewer: { id: `final-${axis}`, model: 'test', platform: 'test' },
  };
}

function runAdaptiveExecution(options) {
  return runAdaptiveExecutionBase({
    dispatchReviewer,
    dispatchFinalReviewer,
    reviewContext: { source: 'test requirements', plan: 'test execution plan' },
    ...options,
  });
}

function resumeAdaptiveExecution(options) {
  return resumeAdaptiveExecutionBase({
    dispatchReviewer,
    dispatchFinalReviewer,
    reviewContext: { source: 'test requirements', plan: 'test execution plan' },
    ...options,
  });
}

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
    outcome: `Deliver ${id}`,
    depends_on: [],
    write_scope: [path],
    parallel_safe: true,
    parallel_rationale: 'Independent task-local change.',
    interfaces: { consumes: [], produces: [`result:${id}`] },
    source_anchors: [`AC-${id}`],
    acceptance: [`${id} is observable.`],
    verification: [`verify ${id}`],
    expected_evidence: [`${id} verification passes.`],
    review_focus: [`Review ${id}.`],
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

test('preserves unrelated staged, unstaged, and untracked user changes byte-for-byte', async () => {
  const repo = await createRepo();
  await mkdir(join(repo.root, 'notes'));
  await writeFile(join(repo.root, 'notes', 'tracked.txt'), 'tracked baseline\n');
  await git(repo.root, ['add', 'notes/tracked.txt']);
  await git(repo.root, ['commit', '-m', 'add user fixture']);
  await writeFile(join(repo.root, 'notes', 'tracked.txt'), 'user tracked bytes\n');
  await git(repo.root, ['add', 'notes/tracked.txt']);
  await writeFile(join(repo.root, 'notes', 'tracked.txt'), 'user tracked bytes\nuser unstaged bytes\n');
  await writeFile(join(repo.root, 'notes', 'untracked.txt'), 'user untracked bytes\n');
  const beforeStatus = await git(repo.root, ['status', '--porcelain=v1']);
  const beforeTracked = await readFile(join(repo.root, 'notes', 'tracked.txt'));
  const beforeUntracked = await readFile(join(repo.root, 'notes', 'untracked.txt'));

  const outcomes = [
    outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"),
    outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
  ];
  const result = await runAdaptiveExecution({
    cwd: repo.root,
    runId: 'dirty-unrelated-run',
    outcomes,
    runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
    dispatchWorker: createFakeNativeAgent().dispatch,
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });

  assert.equal(result.kind, 'concurrent');
  assert.deepEqual(await readFile(join(repo.root, 'notes', 'tracked.txt')), beforeTracked);
  assert.deepEqual(await readFile(join(repo.root, 'notes', 'untracked.txt')), beforeUntracked);
  const userStatus = (await git(repo.root, ['status', '--porcelain=v1']))
    .split('\n')
    .filter((line) => line.includes('notes/'))
    .join('\n');
  assert.equal(userStatus, beforeStatus);
  assert.equal(await git(repo.root, ['diff', '--cached', '--name-only']), 'notes/tracked.txt');
});

test('applies actual worker changes when the declared write scope is wider', async () => {
  const repo = await createRepo();
  const alpha = outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n");
  alpha.write_scope.push('src/allowed-but-unchanged.mjs');
  const beta = outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n");

  const result = await runAdaptiveExecution({
    cwd: repo.root,
    runId: 'wide-write-scope-run',
    outcomes: [alpha, beta],
    runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
    dispatchWorker: createFakeNativeAgent().dispatch,
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });

  assert.deepEqual(result.changed_paths, ['src/alpha.mjs', 'src/beta.mjs']);
  assert.equal(existsSync(join(repo.root, 'src', 'allowed-but-unchanged.mjs')), false);
});

test('blocks reviewed execution when user changes overlap write or relevant read paths', async () => {
  for (const fixture of [
    { runId: 'dirty-write-run', path: 'src/alpha.mjs', field: 'write_scope' },
    { runId: 'dirty-read-run', path: 'src/context.mjs', field: 'relevant_paths' },
  ]) {
    const repo = await createRepo();
    await writeFile(join(repo.root, fixture.path), 'user context\n');
    const outcomes = [
      outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"),
      outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
    ];
    if (fixture.field === 'relevant_paths') outcomes[0].relevant_paths = [fixture.path];

    const result = await runAdaptiveExecution({
      cwd: repo.root,
      runId: fixture.runId,
      outcomes,
      runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
      dispatchWorker: async () => assert.fail('dirty overlap must not dispatch a worker'),
      verifyCombined: async () => assert.fail('dirty overlap must not verify concurrent work'),
    });

    assert.equal(result.profile, 'parallel-strict-v1');
    assert.equal(result.blocked, true);
    assert.match(result.reason, /user changes overlap.*cannot safely apply/i);
    assert.equal(existsSync(join(repo.root, '.loopx', 'exec', fixture.runId)), false);
    assert.equal((await git(repo.root, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)?.length, 1);
    assert.equal(await readFile(join(repo.root, fixture.path), 'utf8'), 'user context\n');
  }
});

test('retains a verified integration result when a target becomes stale and resumes after it is restored', async () => {
  const repo = await createRepo();
  const outcomes = [
    outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"),
    outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
  ];
  const userBytes = "export const alpha = 'user changed during run';\n";

  await assert.rejects(
    runAdaptiveExecution({
      cwd: repo.root,
      runId: 'stale-target-run',
      outcomes,
      runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
      dispatchWorker: async ({ outcome: current, workspace }) => {
        await writeFile(join(workspace, current.write_scope[0]), current.content);
        if (current.id === 'alpha') await writeFile(join(repo.root, 'src', 'alpha.mjs'), userBytes);
        return {
          worker: { id: `${current.id}-implementer`, model: 'test', platform: 'test' },
          verification: { status: 'passed', commands: [`verify ${current.id}`] },
        };
      },
      verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
    }),
    (error) => error.code === 'adaptive_target_snapshot_mismatch',
  );

  assert.equal(await readFile(join(repo.root, 'src', 'alpha.mjs'), 'utf8'), userBytes);
  assert.equal(await readFile(join(repo.root, 'src', 'beta.mjs'), 'utf8'), "export const beta = 'base';\n");
  const manifestPath = join(repo.root, '.loopx', 'exec', 'stale-target-run', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.status, 'blocked');
  assert.equal(manifest.resume_instruction, '$exec --resume stale-target-run');
  assert.equal(manifest.integration.status, 'verified');
  assert.equal(manifest.integration.commit.length, 40);
  assert.equal(existsSync(manifest.ownership.integration.path), true);
  assert.equal(manifest.tasks.every((task) => task.status === 'integrated' && task.workspace && task.review), true);

  await assert.rejects(
    resumeAdaptiveExecution({
      cwd: repo.root,
      runId: 'stale-target-run',
      verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
    }),
    (error) => error.code === 'adaptive_target_snapshot_mismatch',
  );
  assert.equal(existsSync(manifest.ownership.integration.path), true);

  await writeFile(join(repo.root, 'src', 'alpha.mjs'), "export const alpha = 'base';\n");
  await git(repo.root, ['checkout', '-b', 'same-head-other-branch']);
  await assert.rejects(
    resumeAdaptiveExecution({
      cwd: repo.root,
      runId: 'stale-target-run',
      verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
    }),
    (error) => error.code === 'adaptive_workspace_identity_mismatch',
  );
  assert.equal(existsSync(manifest.ownership.integration.path), true);
  await git(repo.root, ['checkout', 'main']);
  const resumed = await resumeAdaptiveExecution({
    cwd: repo.root,
    runId: 'stale-target-run',
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });

  assert.deepEqual(resumed.changed_paths, ['src/alpha.mjs', 'src/beta.mjs']);
  assert.equal(await readFile(join(repo.root, 'src', 'alpha.mjs'), 'utf8'), outcomes[0].content);
  assert.equal(await readFile(join(repo.root, 'src', 'beta.mjs'), 'utf8'), outcomes[1].content);
  assert.equal(existsSync(manifestPath), false);
  assert.equal((await git(repo.root, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)?.length, 1);
});

test('blocks application when a relevant baseline path changes during execution', async () => {
  const repo = await createRepo();
  await writeFile(join(repo.root, 'src', 'context.mjs'), "export const context = 'base';\n");
  await git(repo.root, ['add', 'src/context.mjs']);
  await git(repo.root, ['commit', '-m', 'add context baseline']);
  const outcomes = [
    { ...outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"), relevant_paths: ['src/context.mjs'] },
    outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
  ];

  await assert.rejects(runAdaptiveExecution({
    cwd: repo.root,
    runId: 'stale-relevant-run',
    outcomes,
    runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
    dispatchWorker: async ({ outcome: current, workspace }) => {
      await writeFile(join(workspace, current.write_scope[0]), current.content);
      if (current.id === 'alpha') {
        await writeFile(join(repo.root, 'src', 'context.mjs'), "export const context = 'user changed';\n");
      }
      return {
        worker: { id: `${current.id}-implementer`, model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: [`verify ${current.id}`] },
      };
    },
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  }), (error) => error.code === 'adaptive_target_snapshot_mismatch');

  assert.equal(await readFile(join(repo.root, 'src', 'context.mjs'), 'utf8'), "export const context = 'user changed';\n");
  assert.equal(await readFile(join(repo.root, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'base';\n");
});

test('stops recovery on a changed invoking baseline without deleting owned worker results', async () => {
  const repo = await createRepo();
  const outcomes = [
    outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"),
    outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
  ];
  let advancedHead = false;

  await assert.rejects(
    runAdaptiveExecution({
      cwd: repo.root,
      runId: 'changed-baseline-run',
      outcomes,
      runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
      dispatchWorker: createFakeNativeAgent().dispatch,
      verifyCombined: async ({ phase }) => {
        if (phase === 'integration' && !advancedHead) {
          await writeFile(join(repo.root, 'user-head.txt'), 'user commit\n');
          await git(repo.root, ['add', 'user-head.txt']);
          await git(repo.root, ['commit', '-m', 'user advances head']);
          advancedHead = true;
        }
        return { status: 'passed', commands: [`verify ${phase}`] };
      },
    }),
    (error) => error.code === 'adaptive_workspace_identity_mismatch',
  );

  const manifest = JSON.parse(await readFile(
    join(repo.root, '.loopx', 'exec', 'changed-baseline-run', 'manifest.json'),
    'utf8',
  ));
  await assert.rejects(
    resumeAdaptiveExecution({
      cwd: repo.root,
      runId: 'changed-baseline-run',
      verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
    }),
    (error) => error.code === 'adaptive_workspace_identity_mismatch',
  );
  assert.equal(existsSync(manifest.ownership.integration.path), true);
  assert.equal(manifest.tasks.every((task) => existsSync(task.workspace.path)), true);
  assert.equal(await readFile(join(repo.root, 'user-head.txt'), 'utf8'), 'user commit\n');
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
        return {
          worker: { id: 'beta-implementer', model: 'test', platform: 'test' },
          verification: { status: 'passed', commands: ['verify beta'] },
        };
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
  assert.equal(manifest.tasks[1].status, 'integrated');
  assert.equal(manifest.tasks[1].commit.length, 40);
  assert.equal(manifest.status, 'interrupted');
  assert.equal(manifest.resume_instruction, '$exec --resume worker-failure-run');
  assert.equal(manifest.ownership.tasks.length, 2);
  assert.equal(manifest.tasks.every((task) => existsSync(task.workspace.path)), true);
  assert.equal(Object.values(manifest.active_workers).some(({ status }) => status === 'uncertain'), true);

  await assert.rejects(
    resumeAdaptiveExecution({
      cwd: repo.root,
      runId: 'worker-failure-run',
      verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
    }),
    (error) => error.code === 'adaptive_worker_terminal_unproven',
  );

  let resumedDispatches = 0;
  const paused = await resumeAdaptiveExecution({
    cwd: repo.root,
    runId: 'worker-failure-run',
    runtimeCapability: { worker_capacity: 0 },
    confirmWorkerTerminal: async () => ({ terminal: true }),
    dispatchWorker: async () => {
      resumedDispatches += 1;
      throw new Error('capacity-zero resume must not dispatch');
    },
    verifyCombined: async () => {
      throw new Error('capacity-zero resume must not verify');
    },
  });
  assert.equal(paused.backpressure, true);
  assert.equal(paused.dispatched, 0);
  assert.equal(resumedDispatches, 0);
  assert.equal(existsSync(join(repo.root, '.loopx', 'exec', 'worker-failure-run', 'manifest.json')), true);

  const resumed = await resumeAdaptiveExecution({
    cwd: repo.root,
    runId: 'worker-failure-run',
    dispatchWorker: createFakeNativeAgent().dispatch,
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });
  assert.deepEqual(resumed.changed_paths, ['src/alpha.mjs', 'src/beta.mjs']);
  assert.equal(existsSync(join(repo.root, '.loopx', 'exec', 'worker-failure-run')), false);
  assert.equal((await git(repo.root, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)?.length, 1);
});

test('resumes cleanup after applied-result verification is interrupted', async () => {
  const repo = await createRepo();
  await writeFile(join(repo.root, 'src', 'context.mjs'), "export const context = 'base';\n");
  await git(repo.root, ['add', 'src/context.mjs']);
  await git(repo.root, ['commit', '-m', 'add applied context baseline']);
  const outcomes = [
    { ...outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"), relevant_paths: ['src'] },
    outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
  ];

  await assert.rejects(
    runAdaptiveExecution({
      cwd: repo.root,
      runId: 'applied-verification-run',
      outcomes,
      runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
      dispatchWorker: createFakeNativeAgent().dispatch,
      verifyCombined: async ({ phase }) => {
        if (phase === 'applied') throw new Error('verification interrupted');
        return { status: 'passed', commands: [`verify ${phase}`] };
      },
    }),
    /verification interrupted/,
  );
  const manifestPath = join(repo.root, '.loopx', 'exec', 'applied-verification-run', 'manifest.json');
  const retained = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(retained.application.status, 'verification-interrupted');

  await writeFile(join(repo.root, 'src', 'context.mjs'), "export const context = 'changed';\n");
  await assert.rejects(
    resumeAdaptiveExecution({
      cwd: repo.root,
      runId: 'applied-verification-run',
      verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
    }),
    (error) => error.code === 'adaptive_target_snapshot_mismatch',
  );
  await writeFile(join(repo.root, 'src', 'context.mjs'), "export const context = 'base';\n");
  const pendingApply = JSON.parse(await readFile(manifestPath, 'utf8'));
  pendingApply.application = { status: 'pending', verification: null, post_apply_snapshot: null };
  await writeFile(manifestPath, `${JSON.stringify(pendingApply, null, 2)}\n`);

  await writeFile(join(repo.root, 'src', 'context.mjs'), "export const context = 'changed during pending apply';\n");
  await assert.rejects(
    resumeAdaptiveExecution({
      cwd: repo.root,
      runId: 'applied-verification-run',
      verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
    }),
    (error) => error.code === 'adaptive_target_snapshot_mismatch',
  );
  await writeFile(join(repo.root, 'src', 'context.mjs'), "export const context = 'base';\n");

  await writeFile(
    join(repo.root, 'src', 'alpha.mjs'),
    "export const alpha = 'implemented';\nexport const unreviewed = true;\n",
  );
  await assert.rejects(
    resumeAdaptiveExecution({
      cwd: repo.root,
      runId: 'applied-verification-run',
      verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
    }),
    (error) => error.code === 'adaptive_target_snapshot_mismatch',
  );
  await writeFile(join(repo.root, 'src', 'alpha.mjs'), "export const alpha = 'implemented';\n");

  const resumed = await resumeAdaptiveExecution({
    cwd: repo.root,
    runId: 'applied-verification-run',
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });
  assert.deepEqual(resumed.changed_paths, ['src/alpha.mjs', 'src/beta.mjs']);
  assert.equal(existsSync(manifestPath), false);
});

test('rebuilds integration from retained task commits after verification is interrupted', async () => {
  const repo = await createRepo();
  const outcomes = [
    outcome('alpha', 'src/alpha.mjs', "export const alpha = 'implemented';\n"),
    outcome('beta', 'src/beta.mjs', "export const beta = 'implemented';\n"),
  ];

  await assert.rejects(
    runAdaptiveExecution({
      cwd: repo.root,
      runId: 'integration-verification-run',
      outcomes,
      runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
      dispatchWorker: createFakeNativeAgent().dispatch,
      verifyCombined: async ({ phase }) => {
        if (phase === 'integration') throw new Error('integration verification interrupted');
        return { status: 'passed', commands: [`verify ${phase}`] };
      },
    }),
    /integration verification interrupted/,
  );
  const manifestPath = join(repo.root, '.loopx', 'exec', 'integration-verification-run', 'manifest.json');
  const retained = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(retained.tasks.every((task) => task.status === 'integrated' && task.review), true);
  assert.equal(retained.integration.status, 'verification-interrupted');
  assert.equal(retained.active_workers['controller:integration-commit'].role, 'integration-commit');
  await git(retained.integration.workspace.path, ['commit', '-m', 'simulate boundary commit before manifest persist']);

  const resumed = await resumeAdaptiveExecution({
    cwd: repo.root,
    runId: 'integration-verification-run',
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });
  assert.deepEqual(resumed.changed_paths, ['src/alpha.mjs', 'src/beta.mjs']);
  assert.equal(existsSync(manifestPath), false);
});
