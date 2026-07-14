import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { runParallelExecCommand } from '../skills/parallel-subagent-exec/scripts/parallel-exec.mjs';
import {
  applyEphemeralCommit,
  createEphemeralTaskCommit,
  createOwnedWorktree,
  inspectGitTopology,
  ownedRefNames,
  snapshotIntegrationTree,
} from '../skills/parallel-subagent-exec/scripts/git-lib.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');
const packagePlan = join(repoRoot, 'docs/loopx/plans/2026-07-14-parallel-subagent-exec/00-overview.md');

async function ownerJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } },
    output() { return { stdout, stderr }; },
  };
}

async function run(argv, options = {}) {
  const streams = capture();
  const result = await runParallelExecCommand({
    argv,
    cwd: repoRoot,
    env: {},
    stdout: streams.stdout,
    stderr: streams.stderr,
    ...options,
  });
  return { result, ...streams.output() };
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

function descriptor(topology, runId, kind, qualifiedId) {
  const names = ownedRefNames({ runId, kind, qualifiedId });
  return {
    run_id: runId,
    kind,
    path: join(topology.primary_root, names.relative_path),
    branch: names.branch,
    head: topology.head,
    common_dir: topology.common_dir,
  };
}

test('manifest inspect writes one owner-only normalized JSON result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-exec-cli-'));
  const output = join(root, 'manifest.json');
  const execution = await run([
    'manifest', 'inspect', '--input', packagePlan, '--max-parallel', '2', '--output', output,
  ]);

  assert.equal(execution.result.exitCode, 0);
  assert.equal(execution.stderr, '');
  assert.equal(execution.stdout.trim().split('\n').length, 1);
  const manifest = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(manifest.schema, 'loopx.parallel-exec-manifest.v1');
  assert.equal(manifest.max_parallel, 2);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
});

test('resolves relative output against the injected command cwd', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-exec-cli-'));
  const input = join(root, 'docs', 'plan.md');
  await mkdir(dirname(input), { recursive: true });
  await writeFile(input, [
    '# Plan',
    '```loopx-parallel-plan',
    '{"schema":"loopx.parallel-plan.v1","max_parallel":4}',
    '```',
    '### T-001 / Task 1: Example',
    '**Files:**',
    '- Create: `src/a.mjs`',
    '**Parallel execution:**',
    '```loopx-parallel-task',
    '{"schema":"loopx.parallel-task.v1","task_anchor":"T-001","depends_on":[],"write_scope":["src/a.mjs"],"parallel_safe":true}',
    '```',
  ].join('\n'));
  const execution = await run([
    'manifest', 'inspect', '--input', input, '--output', 'nested/manifest.json',
  ], { cwd: root });
  assert.equal(execution.result.exitCode, 0);
  assert.equal(JSON.parse(await readFile(join(root, 'nested', 'manifest.json'), 'utf8')).scope, 'single-plan');
});

test('rejects unknown and duplicate flags before creating output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-exec-cli-'));
  const output = join(root, 'manifest.json');
  const unknown = await run(['manifest', 'inspect', '--input', packagePlan, '--wat', '1', '--output', output]);
  const duplicate = await run([
    'manifest', 'inspect', '--input', packagePlan, '--input', packagePlan, '--output', output,
  ]);

  assert.equal(unknown.result.exitCode, 2);
  assert.equal(duplicate.result.exitCode, 2);
  await assert.rejects(readFile(output), { code: 'ENOENT' });
  assert.equal(unknown.stdout, '');
  assert.match(unknown.stderr, /parallel_cli_usage/);
});

test('state init, verify, transition, and stale CAS use stable exits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-exec-cli-'));
  const manifestPath = join(root, 'manifest.json');
  const statePath = join(root, 'run', 'state.json');
  const initPath = join(root, 'init.json');
  const observedPath = join(root, 'observed.json');
  const transitionPath = join(root, 'transition.json');
  const inspected = await run(['manifest', 'inspect', '--input', packagePlan, '--output', manifestPath]);
  assert.equal(inspected.result.exitCode, 0);
  await ownerJson(initPath, {
    run_id: 'fixture-run',
    repo: {
      control_root: repoRoot,
      git_common_dir: join(repoRoot, '.git'),
      baseline_head: 'deadbeef',
      manifest_sha256: 'abc',
    },
    config: { max_parallel: 4 },
    now: '2026-07-14T00:00:00.000Z',
  });
  const initialized = await run([
    'state', 'init', '--state', statePath, '--manifest', manifestPath, '--operation', initPath,
  ]);
  assert.equal(initialized.result.exitCode, 0);
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  await ownerJson(observedPath, state);
  assert.equal((await run(['state', 'verify', '--state', statePath, '--observed', observedPath])).result.exitCode, 0);

  const mismatch = structuredClone(state);
  mismatch.repo.baseline_head = 'different';
  await ownerJson(observedPath, mismatch);
  assert.equal((await run(['state', 'verify', '--state', statePath, '--observed', observedPath])).result.exitCode, 3);

  await ownerJson(transitionPath, { type: 'set_run_status', status: 'running' });
  assert.equal((await run([
    'state', 'transition', '--state', statePath, '--expected-revision', '1', '--operation', transitionPath,
  ])).result.exitCode, 0);
  assert.equal((await run([
    'state', 'transition', '--state', statePath, '--expected-revision', '1', '--operation', transitionPath,
  ])).result.exitCode, 3);
});

test('rejects non-owner operation files as schema input defects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-exec-cli-'));
  const operation = join(root, 'operation.json');
  await writeFile(operation, '{}\n', { mode: 0o644 });
  const execution = await run(['worktree', 'verify', '--operation', operation]);
  assert.equal(execution.result.exitCode, 2);
  assert.match(execution.stderr, /owner-only/);
});

test('persists interruption after the current atomic state operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-exec-cli-'));
  const manifestPath = join(root, 'manifest.json');
  const statePath = join(root, 'run', 'state.json');
  const operationPath = join(root, 'init.json');
  await run(['manifest', 'inspect', '--input', packagePlan, '--output', manifestPath]);
  await ownerJson(operationPath, {
    run_id: 'interrupted-run',
    repo: {
      control_root: repoRoot,
      git_common_dir: join(repoRoot, '.git'),
      baseline_head: 'deadbeef',
      manifest_sha256: 'abc',
    },
    config: { max_parallel: 4 },
    now: '2026-07-14T00:00:00.000Z',
  });
  const execution = await run([
    'state', 'init', '--state', statePath, '--manifest', manifestPath, '--operation', operationPath,
  ], { isInterrupted: () => true });

  assert.equal(execution.result.exitCode, 130);
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).status, 'interrupted');
  assert.equal(execution.stdout.trim().split('\n').length, 1);
});

test('persists interruption after a successful atomic worktree operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-exec-cli-'));
  const manifestPath = join(root, 'manifest.json');
  const statePath = join(root, 'run', 'state.json');
  const initPath = join(root, 'init.json');
  const rootPath = join(root, 'root.json');
  const runningPath = join(root, 'running.json');
  const cleanupPath = join(root, 'cleanup.json');
  await run(['manifest', 'inspect', '--input', packagePlan, '--output', manifestPath]);
  await ownerJson(initPath, {
    run_id: 'worktree-interrupt-run',
    repo: { control_root: repoRoot, git_common_dir: join(repoRoot, '.git'), baseline_head: 'deadbeef', manifest_sha256: 'abc' },
    config: { max_parallel: 4 },
    now: '2026-07-14T00:00:00.000Z',
  });
  await run(['state', 'init', '--state', statePath, '--manifest', manifestPath, '--operation', initPath]);
  await ownerJson(rootPath, { type: 'set_root_integration', value: {
    worktree: '/repo/root', branch: 'loopx/root', head: 'deadbeef', index_tree: 'tree',
    execution_start: { artifact_path: '/repo/execution.json', requirement_start_commit: 'deadbeef' },
    finish_start: { artifact_path: '/repo/finish.json', finish_baseline_commit: 'deadbeef' },
    canonical_final_review_report: '/repo/final.md',
  } });
  await run(['state', 'transition', '--state', statePath, '--expected-revision', '1', '--operation', rootPath]);
  await ownerJson(runningPath, { type: 'set_run_status', status: 'running' });
  await run(['state', 'transition', '--state', statePath, '--expected-revision', '2', '--operation', runningPath]);
  await ownerJson(cleanupPath, { topology: {}, resources: [], disposition: 'interrupted', state_path: statePath });

  const execution = await run(['worktree', 'cleanup', '--operation', cleanupPath], { isInterrupted: () => true });
  assert.equal(execution.result.exitCode, 130);
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).status, 'interrupted');
});

test('worktree apply records conflict evidence and restores the supplied snapshot', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'parallel-exec-cli-git-'));
  await git(repo, ['init']);
  await git(repo, ['config', 'user.name', 'Loopx Test']);
  await git(repo, ['config', 'user.email', 'loopx@example.test']);
  await writeFile(join(repo, '.gitignore'), '.worktrees/\n');
  await writeFile(join(repo, 'app.txt'), 'base\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'baseline']);
  const topology = await inspectGitTopology({ cwd: repo });
  const commits = [];
  for (const [qualifiedId, content] of [['T-001', 'first\n'], ['T-002', 'second\n']]) {
    const task = await createOwnedWorktree({
      topology,
      descriptor: descriptor(topology, 'cli-conflict', 'task', qualifiedId),
      baseCommit: topology.head,
    });
    await writeFile(join(task.path, 'app.txt'), content);
    commits.push(await createEphemeralTaskCommit({
      topology,
      descriptor: task,
      writeScope: ['app.txt'],
      message: `task ${qualifiedId}`,
    }));
  }
  const integration = await createOwnedWorktree({
    topology,
    descriptor: descriptor(topology, 'cli-conflict', 'child', 'child'),
    baseCommit: topology.head,
  });
  let snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });
  await applyEphemeralCommit({ topology, integration, taskCommit: commits[0].commit, snapshot });
  snapshot = await snapshotIntegrationTree({ topology, descriptor: integration });
  const operationPath = join(repo, 'apply.json');
  const evidencePath = join(repo, 'conflicts', 'T-002.json');
  await ownerJson(operationPath, {
    topology,
    integration,
    taskCommit: commits[1].commit,
    snapshot,
    conflict_evidence_path: evidencePath,
  });

  const execution = await run(['worktree', 'apply', '--operation', operationPath], { cwd: repo });
  assert.equal(execution.result.exitCode, 4);
  assert.equal(JSON.parse(await readFile(evidencePath, 'utf8')).source_commit, commits[1].commit);
  assert.equal((await snapshotIntegrationTree({ topology, descriptor: integration })).status, snapshot.status);
  assert.equal(await readFile(join(integration.path, 'app.txt'), 'utf8'), 'first\n');
});
