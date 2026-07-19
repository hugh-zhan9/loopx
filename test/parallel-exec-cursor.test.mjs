import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { runParallelExecCommand } from '../skills/parallel-subagent-exec/scripts/parallel-exec.mjs';
import {
  createInitialState,
  transitionRunState,
} from '../skills/parallel-subagent-exec/scripts/state-lib.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');

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
    cwd: options.cwd || repoRoot,
    env: options.env || {},
    stdout: streams.stdout,
    stderr: streams.stderr,
    isInterrupted: options.isInterrupted || (() => false),
  });
  return { result, ...streams.output() };
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

async function fakeCursor(root, {
  authenticated = true,
  omitWorkspace = false,
  omitSandbox = false,
} = {}) {
  const directory = join(root, 'bin with spaces');
  const path = join(directory, process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent');
  const scriptPath = process.platform === 'win32' ? join(directory, 'cursor-agent.mjs') : path;
  await mkdir(dirname(path), { recursive: true });
  const help = [
    'Start the Cursor Agent',
    '--model <model>',
    '--print',
    '--output-format <format>',
    '--trust',
    '--force',
    ...(omitSandbox ? [] : ['--sandbox <mode>']),
    '--resume [chatId]',
    'create-chat',
    ...(omitWorkspace ? [] : ['--workspace <path>']),
  ].join('\n');
  await writeFile(scriptPath, `#!/usr/bin/env node
import { appendFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};
if (args[0] === 'about') {
  console.log(JSON.stringify({ cliVersion: 'test-cursor-1', osPlatform: process.platform, osArch: process.arch }));
  process.exit(0);
}
if (args[0] === 'status') {
  console.log(JSON.stringify({ status: '${authenticated ? 'authenticated' : 'unauthenticated'}', isAuthenticated: ${authenticated} }));
  process.exit(0);
}
if (args.includes('--help')) {
  console.log(${JSON.stringify(help)});
  process.exit(0);
}
if (args.at(-1) === 'create-chat' || args[0] === 'create-chat') {
  console.log('cursor-chat-' + process.pid);
  process.exit(0);
}

let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const workspace = resolve(value('--workspace'));
  const model = value('--model');
  const chat = value('--resume');
  const reportMatch = prompt.match(/REPORT_FILE=([^\\n]+)/);
  const sleepMatch = prompt.match(/SLEEP_MS=(\\d+)/);
  const badCwd = prompt.includes('BAD_CWD=1');
  const omitReport = prompt.includes('OMIT_REPORT=1');
  const stageFile = prompt.includes('STAGE_FILE=1');
  const symlinkOutbox = prompt.includes('SYMLINK_OUTBOX=1');
  if (process.env.FAKE_CURSOR_LOG) {
    appendFileSync(process.env.FAKE_CURSOR_LOG, JSON.stringify({ event: 'start', at: Date.now(), cwd: process.cwd(), args }) + '\\n');
  }
  console.log(JSON.stringify({ type: 'system', subtype: 'init', cwd: badCwd ? dirname(workspace) : workspace, session_id: chat, model }));
  setTimeout(() => {
    if (stageFile) {
      writeFileSync(resolve(workspace, 'README.md'), '# staged by worker\\n');
      execFileSync('git', ['add', 'README.md'], { cwd: workspace });
    }
    if (reportMatch && !omitReport) {
      if (symlinkOutbox) {
        const outbox = dirname(reportMatch[1]);
        const escaped = resolve(workspace, '..', 'escaped-' + chat);
        rmSync(outbox, { recursive: true, force: true });
        mkdirSync(escaped, { recursive: true });
        symlinkSync(escaped, outbox, process.platform === 'win32' ? 'junction' : 'dir');
      }
      mkdirSync(dirname(reportMatch[1]), { recursive: true });
      writeFileSync(reportMatch[1], 'worker report\\n');
    }
    if (process.env.FAKE_CURSOR_LOG) {
      appendFileSync(process.env.FAKE_CURSOR_LOG, JSON.stringify({ event: 'end', at: Date.now(), cwd: process.cwd(), args }) + '\\n');
    }
    console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'DONE', session_id: chat }));
  }, Number(sleepMatch?.[1] || 0));
});
`);
  if (process.platform === 'win32') {
    const node = process.execPath.replaceAll('%', '%%');
    const script = scriptPath.replaceAll('%', '%%');
    await writeFile(path, `@echo off\r\n"${node}" "${script}" %*\r\n`);
  } else {
    await chmod(path, 0o755);
  }
  return realpath(path);
}

async function workspace(root, name) {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  await git(path, ['init']);
  await git(path, ['config', 'user.name', 'Loopx Test']);
  await git(path, ['config', 'user.email', 'loopx@example.test']);
  await writeFile(join(path, '.gitignore'), '.loopx/\n');
  await writeFile(join(path, 'README.md'), '# fixture\n');
  await git(path, ['add', '.']);
  await git(path, ['commit', '-m', 'baseline']);
  return realpath(path);
}

async function operation(root, agentPath, workerId, {
  sleepMs = 0,
  badCwd = false,
  omitReport = false,
  stageFile = false,
  symlinkOutbox = false,
} = {}) {
  const filesystemId = createHash('sha256').update(workerId).digest('hex').slice(0, 20);
  const cwd = await workspace(root, `worktree-${filesystemId}`);
  const control = join(root, 'control', filesystemId);
  const brief = join(control, 'brief.md');
  const prompt = join(control, 'prompt.txt');
  const retainedReport = join(control, 'report.md');
  const operationPath = join(control, 'operation.json');
  await mkdir(control, { recursive: true });
  await writeFile(brief, '# task brief\n', { mode: 0o600 });
  await writeFile(prompt, [
    'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.',
    'Read {{input:brief}}.',
    'REPORT_FILE={{output:report}}',
    `SLEEP_MS=${sleepMs}`,
    `BAD_CWD=${badCwd ? 1 : 0}`,
    `OMIT_REPORT=${omitReport ? 1 : 0}`,
    `STAGE_FILE=${stageFile ? 1 : 0}`,
    `SYMLINK_OUTBOX=${symlinkOutbox ? 1 : 0}`,
  ].join('\n'), { mode: 0o600 });
  await ownerJson(operationPath, {
    schema: 'loopx.cursor-worker-operation.v1',
    worker_id: workerId,
    agent_path: agentPath,
    workspace: cwd,
    model: 'test-model',
    prompt_path: prompt,
    timeout_ms: 10_000,
    inputs: [{ name: 'brief', source_path: brief, target_path: 'inbox/brief.md' }],
    outputs: [{ name: 'report', source_path: 'outbox/report.md', retained_path: retainedReport, required: true }],
  });
  return { control, cwd, operationPath, retainedReport };
}

test('Cursor capability probe requires an authenticated CLI with explicit workspace support', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-probe-'));
  const reservationId = '7:implementation:docs/loopx/plans/example/01-core.md#T-001';
  const artifact = await run(['cursor', 'artifact-id', '--worker-id', reservationId], { cwd: root });
  assert.equal(artifact.result.exitCode, 0);
  assert.equal(
    JSON.parse(artifact.stdout).artifact_id,
    createHash('sha256').update(reservationId).digest('hex'),
  );
  const authenticated = await fakeCursor(root);
  const output = join(root, 'capabilities.json');
  const success = await run(['cursor', 'inspect', '--agent', authenticated, '--output', output], { cwd: root });

  assert.equal(success.result.exitCode, 0);
  const capabilities = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(capabilities.ready, true);
  assert.equal(capabilities.capabilities.explicit_cwd, true);
  assert.equal(capabilities.capabilities.observe, true);
  if (process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o777, 0o600);

  const unauthenticated = await fakeCursor(join(root, 'unauthenticated'), { authenticated: false });
  const unavailable = await run([
    'cursor', 'inspect', '--agent', unauthenticated, '--output', join(root, 'unavailable.json'),
  ], { cwd: root });
  assert.equal(unavailable.result.exitCode, 5);
  assert.match(unavailable.stderr, /cursor-agent-authenticated/);

  const noWorkspace = await fakeCursor(join(root, 'no-workspace'), { omitWorkspace: true });
  const missingCwd = await run([
    'cursor', 'inspect', '--agent', noWorkspace, '--output', join(root, 'missing-cwd.json'),
  ], { cwd: root });
  assert.equal(missingCwd.result.exitCode, 5);
  assert.match(missingCwd.stderr, /create-with-explicit-cwd/);

  const noSandbox = await fakeCursor(join(root, 'no-sandbox'), { omitSandbox: true });
  const missingSandbox = await run([
    'cursor', 'inspect', '--agent', noSandbox, '--output', join(root, 'missing-sandbox.json'),
  ], { cwd: root });
  assert.equal(missingSandbox.result.exitCode, 5);
  assert.match(missingSandbox.stderr, /workspace-sandbox/);
});

test('Cursor worker binds CLI and process cwd, observes terminal result, and retains report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-worker-'));
  const log = join(root, 'cursor.log');
  const agentPath = await fakeCursor(root);
  const item = await operation(root, agentPath, '7:implementation:01-core.md#T-001', { sleepMs: 500 });
  const env = { ...process.env, FAKE_CURSOR_LOG: log };

  const started = await run(['cursor', 'start', '--operation', item.operationPath], { cwd: root, env });
  assert.equal(started.result.exitCode, 0, started.stderr);
  const startResult = JSON.parse(started.stdout).result;
  assert.equal(startResult.cwd, item.cwd);
  assert.match(startResult.agent_id, /^cursor-chat-/);
  assert.equal(startResult.runtime, 'cursor');
  assert.equal(startResult.status, 'running');
  assert.equal(startResult.model, 'test-model');
  assert.match(startResult.operation_digest, /^[a-f0-9]{64}$/);
  assert.ok(startResult.supervisor_token.length >= 32);
  assert.equal(startResult.operation_path, await realpath(item.operationPath));
  assert.equal(startResult.heartbeat_path, join(await realpath(item.control), 'heartbeat.json'));
  assert.equal(startResult.report_path, join(await realpath(item.control), 'report.md'));

  const statePath = join(root, 'run-state', 'state.json');
  let state = await transitionRunState({
    statePath,
    expectedRevision: 0,
    operation: {
      type: 'initialize',
      state: createInitialState({
        runId: 'cursor-runtime-state-test',
        manifest: {
          input: { path: '01-core.md', sha256: 'a'.repeat(64) },
          plans: [{
            path: '01-core.md',
            depends_on: [],
            can_run_in_parallel: true,
            tasks: [{
              task_anchor: 'T-001',
              depends_on: [],
              write_scope: ['README.md'],
              parallel_safe: true,
            }],
          }],
        },
        repo: {
          control_root: root,
          git_common_dir: join(root, '.git'),
          baseline_head: 'b'.repeat(40),
          manifest_sha256: 'c'.repeat(64),
        },
        config: { effective_max_parallel: 1 },
        now: '2026-07-15T00:00:00.000Z',
      }),
    },
    now: '2026-07-15T00:00:00.000Z',
  });
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: {
      type: 'set_root_integration',
      value: {
        worktree: item.cwd,
        branch: 'loopx/parallel/cursor/root',
        head: 'b'.repeat(40),
        index_tree: 'd'.repeat(40),
        execution_start: {
          artifact_path: join(root, 'execution-start.json'),
          requirement_start_commit: 'b'.repeat(40),
        },
        finish_start: {
          artifact_path: join(root, 'finish-start.json'),
          finish_baseline_commit: 'b'.repeat(40),
        },
        canonical_final_review_report: join(root, 'final-review.md'),
      },
    },
    now: '2026-07-15T00:00:01.000Z',
  });
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: {
      type: 'reserve_worker',
      worker_id: startResult.worker_id,
      worker: {
        role: 'implementation',
        agent_id: null,
        model: 'test-model',
        node: '01-core.md#T-001',
        dispatch_attempt: 1,
        status: 'reserved',
      },
    },
    now: '2026-07-15T00:00:02.000Z',
  });
  state = await transitionRunState({
    statePath,
    expectedRevision: state.revision,
    operation: {
      type: 'set_worker_runtime',
      worker_id: startResult.worker_id,
      status: 'running',
      ...Object.fromEntries([
        'runtime', 'agent_id', 'model', 'process_id', 'supervisor_pid', 'cwd',
        'requested_model', 'report_path', 'started_at', 'operation_path',
        'operation_digest', 'supervisor_token', 'heartbeat_path',
      ].map((field) => [field, startResult[field]])),
    },
    now: '2026-07-15T00:00:03.000Z',
  });
  assert.equal(state.active_workers[startResult.worker_id].operation_digest, startResult.operation_digest);

  const waited = await run([
    'cursor', 'wait', '--operation', item.operationPath, '--timeout-ms', '10000',
  ], { cwd: root, env });
  assert.equal(waited.result.exitCode, 0, waited.stderr);
  assert.equal(await readFile(item.retainedReport, 'utf8'), 'worker report\n');
  const completion = JSON.parse(await readFile(join(item.control, 'completion.json'), 'utf8'));
  const supervisor = JSON.parse(await readFile(join(item.control, 'supervisor.json'), 'utf8'));
  assert.equal(completion.status, 'success');
  assert.equal(completion.started_at, supervisor.started_at);
  assert.equal(completion.cwd, item.cwd);
  assert.equal(completion.requested_model, 'test-model');
  assert.equal(completion.terminal_result.result, 'DONE');

  const [{ args, cwd }] = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(cwd, item.cwd);
  assert.equal(args[args.indexOf('--workspace') + 1], item.cwd);
  assert.equal(args[args.indexOf('--model') + 1], 'test-model');
  assert.equal(args.includes('--worktree'), false);
});

test('Cursor wait compact format keeps long-running observation output bounded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-compact-wait-'));
  const agentPath = await fakeCursor(root);
  const workerId = '9:implementation:01-core.md#T-compact-wait';
  const item = await operation(root, agentPath, workerId, { sleepMs: 5_000 });
  const started = await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
  });
  assert.equal(started.result.exitCode, 0, started.stderr);
  const running = JSON.parse(started.stdout).result;

  try {
    const waited = await run([
      'cursor', 'wait',
      '--operation', item.operationPath,
      '--timeout-ms', '1',
      '--format', 'compact',
    ], { cwd: root });

    assert.equal(waited.result.exitCode, 0, waited.stderr);
    assert.equal(waited.stderr, '');
    const payload = JSON.parse(waited.stdout);
    assert.deepEqual(payload, {
      ok: true,
      command: 'cursor wait',
      operation: item.operationPath,
      result: {
        status: 'running',
        worker_id: workerId,
        agent_id: running.agent_id,
        supervisor_pid: running.supervisor_pid,
        ended_at: null,
        report_size: null,
        completion_path: null,
      },
    });
    assert.equal(waited.stdout.includes('operation_digest'), false);
    assert.equal(waited.stdout.includes('supervisor_token'), false);
    assert.ok(Buffer.byteLength(waited.stdout) < 768);
  } finally {
    await run(['cursor', 'interrupt', '--operation', item.operationPath], { cwd: root });
  }
});

test('Cursor preparation rejects a pre-existing exchange symlink before copying controller inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-exchange-'));
  const agentPath = await fakeCursor(root);
  const workerId = '9:implementation:01-core.md#T-009';
  const item = await operation(root, agentPath, workerId);
  const exchangeId = createHash('sha256').update(workerId).digest('hex');
  const exchange = join(item.cwd, '.loopx', 'parallel-subagent-exec-workers', exchangeId);
  const escaped = join(root, 'escaped-exchange');
  await mkdir(dirname(exchange), { recursive: true });
  await mkdir(escaped, { recursive: true });
  await symlink(escaped, exchange, process.platform === 'win32' ? 'junction' : 'dir');

  const started = await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
  });
  assert.equal(started.result.exitCode, 4);
  assert.match(started.stderr, /artifact|symlink|owned root/i);
  await assert.rejects(readFile(join(escaped, 'inbox', 'brief.md')), (error) => error.code === 'ENOENT');
});

test('Cursor supervisors allow bounded workers to overlap and preserve durable completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-overlap-'));
  const log = join(root, 'cursor.log');
  const agentPath = await fakeCursor(root);
  const first = await operation(root, agentPath, 'worker-a', { sleepMs: 1_500 });
  const second = await operation(root, agentPath, 'worker-b', { sleepMs: 1_500 });
  const env = { ...process.env, FAKE_CURSOR_LOG: log };

  assert.equal((await run(['cursor', 'start', '--operation', first.operationPath], { cwd: root, env })).result.exitCode, 0);
  assert.equal((await run(['cursor', 'start', '--operation', second.operationPath], { cwd: root, env })).result.exitCode, 0);
  assert.equal((await run(['cursor', 'wait', '--operation', first.operationPath, '--timeout-ms', '10000'], { cwd: root, env })).result.exitCode, 0);
  assert.equal((await run(['cursor', 'wait', '--operation', second.operationPath, '--timeout-ms', '10000'], { cwd: root, env })).result.exitCode, 0);

  const events = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  const starts = events.filter(({ event }) => event === 'start');
  const ends = events.filter(({ event }) => event === 'end');
  assert.equal(starts.length, 2);
  assert.equal(ends.length, 2);
  assert.ok(Math.max(...starts.map(({ at }) => at)) < Math.min(...ends.map(({ at }) => at)));
});

test('concurrent Cursor starts attach to one supervisor and dispatch one chat', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-concurrent-start-'));
  const log = join(root, 'cursor.log');
  const agentPath = await fakeCursor(root);
  const item = await operation(root, agentPath, 'worker-concurrent-start', { sleepMs: 750 });
  const env = { ...process.env, FAKE_CURSOR_LOG: log };

  const [first, second] = await Promise.all([
    run(['cursor', 'start', '--operation', item.operationPath], { cwd: root, env }),
    run(['cursor', 'start', '--operation', item.operationPath], { cwd: root, env }),
  ]);
  assert.equal(first.result.exitCode, 0, first.stderr);
  assert.equal(second.result.exitCode, 0, second.stderr);
  assert.equal(JSON.parse(first.stdout).result.agent_id, JSON.parse(second.stdout).result.agent_id);
  assert.equal((await run([
    'cursor', 'wait', '--operation', item.operationPath, '--timeout-ms', '10000',
  ], { cwd: root, env })).result.exitCode, 0);

  const starts = (await readFile(log, 'utf8')).trim().split('\n')
    .map(JSON.parse)
    .filter(({ event }) => event === 'start');
  assert.equal(starts.length, 1);
});

test('Cursor worker fails closed on missing report, wrong cwd, or Git ownership mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-fail-closed-'));
  const agentPath = await fakeCursor(root);
  const scenarios = [
    ['missing-report', { omitReport: true }, /artifact|report|output/i],
    ['wrong-cwd', { badCwd: true }, /identity|cwd/i],
    ['git-index', { stageFile: true }, /Git|index|ownership/i],
    ['outbox-symlink', { symlinkOutbox: true }, /artifact|contain|symlink/i],
  ];

  for (const [name, options, message] of scenarios) {
    const item = await operation(root, agentPath, name, options);
    const started = await run(['cursor', 'start', '--operation', item.operationPath], {
      cwd: root,
      env: process.env,
    });
    if (started.result.exitCode === 4) {
      assert.equal(started.result.exitCode, 4);
      assert.match(started.stderr, message);
    } else {
      assert.equal(started.result.exitCode, 0, started.stderr);
      const waited = await run([
        'cursor', 'wait', '--operation', item.operationPath, '--timeout-ms', '10000',
      ], { cwd: root, env: process.env });
      assert.equal(waited.result.exitCode, 4);
      assert.match(waited.stderr, message);
    }
    const completion = JSON.parse(await readFile(join(item.control, 'completion.json'), 'utf8'));
    assert.equal(completion.status, 'failed');
    const repeated = await run(['cursor', 'start', '--operation', item.operationPath], {
      cwd: root,
      env: process.env,
    });
    assert.equal(repeated.result.exitCode, 4);
    assert.match(repeated.stderr, /terminal failure|worker failed/i);
  }
});

test('Cursor worker start is idempotent while active and interrupt retains terminal evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-interrupt-'));
  const agentPath = await fakeCursor(root);
  const item = await operation(root, agentPath, 'worker-interrupt', { sleepMs: 10_000 });

  const first = await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
  });
  assert.equal(first.result.exitCode, 0, first.stderr);
  const firstIdentity = JSON.parse(first.stdout).result;
  const repeated = await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
  });
  assert.equal(repeated.result.exitCode, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).result.agent_id, firstIdentity.agent_id);

  const interrupted = await run(['cursor', 'interrupt', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
  });
  assert.equal(interrupted.result.exitCode, 0, interrupted.stderr);
  assert.equal(JSON.parse(interrupted.stdout).result.status, 'interrupted');
  const cancel = JSON.parse(await readFile(join(item.control, 'cancel.json'), 'utf8'));
  assert.equal(cancel.worker_id, 'worker-interrupt');
  assert.match(cancel.operation_digest, /^[a-f0-9]{64}$/);
  const completion = JSON.parse(await readFile(join(item.control, 'completion.json'), 'utf8'));
  assert.equal(completion.status, 'interrupted');

  const waited = await run([
    'cursor', 'wait', '--operation', item.operationPath, '--timeout-ms', '1000',
  ], { cwd: root, env: process.env });
  assert.equal(waited.result.exitCode, 130);
  const restarted = await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
  });
  assert.equal(restarted.result.exitCode, 130);
});

test('Cursor start interruption waits for terminal cancellation evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-start-interrupt-'));
  const agentPath = await fakeCursor(root);
  const item = await operation(root, agentPath, 'worker-start-interrupt', { sleepMs: 10_000 });

  const interrupted = await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
    isInterrupted: () => true,
  });
  assert.equal(interrupted.result.exitCode, 130, interrupted.stderr);
  const completion = JSON.parse(await readFile(join(item.control, 'completion.json'), 'utf8'));
  assert.equal(completion.status, 'interrupted');
  assert.equal(completion.process_id === null || Number.isInteger(completion.process_id), true);
});

test('Cursor lifecycle evidence is bound to the immutable operation digest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-operation-identity-'));
  const agentPath = await fakeCursor(root);
  const item = await operation(root, agentPath, 'worker-identity');

  assert.equal((await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
  })).result.exitCode, 0);
  assert.equal((await run([
    'cursor', 'wait', '--operation', item.operationPath, '--timeout-ms', '10000',
  ], { cwd: root, env: process.env })).result.exitCode, 0);

  const changed = JSON.parse(await readFile(item.operationPath, 'utf8'));
  changed.model = 'different-model';
  await ownerJson(item.operationPath, changed);
  const stale = await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
  });
  assert.equal(stale.result.exitCode, 4);
  assert.match(stale.stderr, /identity|digest|stale/i);
});

test('Cursor lifecycle never trusts or signals a persisted PID without a matching heartbeat token', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-cursor-pid-identity-'));
  const agentPath = await fakeCursor(root);
  const item = await operation(root, agentPath, 'worker-stale-pid');
  const operationValue = JSON.parse(await readFile(item.operationPath, 'utf8'));
  const operationDigest = createHash('sha256').update(JSON.stringify(operationValue)).digest('hex');
  const canonicalControl = await realpath(item.control);
  const supervisorToken = '12345678-1234-4234-8234-123456789abc';
  await ownerJson(join(item.control, 'supervisor.json'), {
    schema: 'loopx.cursor-worker-supervisor.v1',
    worker_id: 'worker-stale-pid',
    agent_id: 'stale-chat',
    supervisor_pid: process.pid,
    supervisor_token: supervisorToken,
    operation_digest: operationDigest,
    operation_path: await realpath(item.operationPath),
    heartbeat_path: join(canonicalControl, 'heartbeat.json'),
    cwd: item.cwd,
    model: 'test-model',
    started_at: '2026-07-15T00:00:00.000Z',
  });
  await ownerJson(join(item.control, 'heartbeat.json'), {
    schema: 'loopx.cursor-worker-heartbeat.v1',
    status: 'running',
    worker_id: 'worker-stale-pid',
    agent_id: 'stale-chat',
    supervisor_pid: process.pid,
    supervisor_token: '87654321-4321-4321-8321-cba987654321',
    operation_digest: operationDigest,
    operation_path: await realpath(item.operationPath),
    heartbeat_path: join(canonicalControl, 'heartbeat.json'),
    cwd: item.cwd,
    model: 'test-model',
    updated_at: new Date().toISOString(),
  });

  const resumed = await run(['cursor', 'start', '--operation', item.operationPath], {
    cwd: root,
    env: process.env,
  });
  assert.equal(resumed.result.exitCode, 4);
  assert.match(resumed.stderr, /identity|heartbeat|stale/i);
  assert.equal(process.pid > 0, true);
});
