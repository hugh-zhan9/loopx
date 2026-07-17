import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  codexArtifactId,
  executeCodexOperation,
  inspectCodexRuntime,
  interruptCodexOperation,
  waitCodexOperation,
} from '../skills/parallel-subagent-exec/scripts/codex-runtime.mjs';
import {
  resolveCodexAdapterCapabilities,
  runParallelExecCommand,
} from '../skills/parallel-subagent-exec/scripts/parallel-exec.mjs';

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  return (await execFileAsync('git', args, { cwd })).stdout.trim();
}

async function ownerJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function workspace(root, name = 'worker') {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  await git(path, ['init']);
  await git(path, ['config', 'user.name', 'Loopx Test']);
  await git(path, ['config', 'user.email', 'loopx@example.test']);
  await writeFile(join(path, 'README.md'), '# fixture\n');
  await git(path, ['add', '.']);
  await git(path, ['commit', '-m', 'baseline']);
  return realpath(path);
}

async function fakeCodex(root, {
  authenticated = true,
  omitCd = false,
  omitDisable = false,
  omitIgnoreRules = false,
  omitJson = false,
} = {}) {
  const directory = join(root, 'bin with spaces');
  const path = join(directory, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  const scriptPath = process.platform === 'win32' ? join(directory, 'codex.mjs') : path;
  await mkdir(directory, { recursive: true });
  const rootHelp = [
    '-m, --model <MODEL>',
    ...(omitCd ? [] : ['-C, --cd <DIR>']),
    '-s, --sandbox <SANDBOX_MODE>',
    '-a, --ask-for-approval <APPROVAL_POLICY>',
    ...(omitDisable ? [] : ['--disable <FEATURE>']),
    '--dangerously-bypass-approvals-and-sandbox',
  ].join('\n');
  const execHelp = [
    ...(omitJson ? [] : ['--json']),
    ...(omitIgnoreRules ? [] : ['--ignore-rules']),
    '-o, --output-last-message <FILE>',
  ].join('\n');
  await writeFile(scriptPath, `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};
if (args.includes('--version')) {
  console.log('codex-cli 9.9.9-test');
  process.exit(0);
}
if (args.length === 1 && args[0] === '--help') {
  console.log(${JSON.stringify(rootHelp)});
  process.exit(0);
}
if (args[0] === 'login' && args[1] === 'status') {
  console.${authenticated ? 'log' : 'error'}('${authenticated ? 'Logged in using a test credential' : 'Not logged in'}');
  process.exit(${authenticated ? 0 : 1});
}
if (args[0] === 'exec' && args[1] === '--help') {
  console.log(${JSON.stringify(execHelp)});
  process.exit(0);
}

let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const workspace = value('-C');
  const model = value('-m');
  const output = value('-o');
  const sleepMatch = prompt.match(/SLEEP_MS=(\\d+)/);
  const omitEvidence = prompt.includes('OMIT_EVIDENCE=1');
  const mutateIndex = prompt.includes('MUTATE_INDEX=1');
  const mutateUnstaged = prompt.includes('MUTATE_UNSTAGED=1');
  const protectedMatch = prompt.match(/PROTECTED_PATH=([^\\n]+)/);
  const reconnectError = prompt.includes('RECONNECT_ERROR=1');
  if (prompt.includes('IGNORE_SIGTERM=1')) process.on('SIGTERM', () => {});
  if (prompt.includes('STUBBORN_GRANDCHILD=1')) {
    spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], {
      stdio: 'ignore',
    });
  }
  if (process.env.FAKE_CODEX_LOG) {
    appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ args, cwd: process.cwd(), prompt }) + '\\n');
  }
  console.log(JSON.stringify({
    type: 'thread.started',
    thread_id: 'codex-thread-' + process.pid,
    ...(omitEvidence ? {} : { model, cwd: process.cwd() }),
  }));
  setTimeout(() => {
    if (mutateIndex) {
      writeFileSync(new URL('README.md', 'file://' + workspace.replaceAll(' ', '%20') + '/'), '# changed\\n');
      execFileSync('git', ['add', 'README.md'], { cwd: workspace });
    }
    if (mutateUnstaged) writeFileSync(new URL('README.md', 'file://' + workspace.replaceAll(' ', '%20') + '/'), '# unstaged change\\n');
    if (protectedMatch?.[1]) writeFileSync(new URL('README.md', 'file://' + protectedMatch[1].replaceAll(' ', '%20') + '/'), '# sibling changed\\n');
    if (reconnectError) {
      console.log(JSON.stringify({
        type: 'error',
        message: 'Reconnecting... 1/5 (stream disconnected before completion: idle timeout waiting for SSE)',
      }));
      console.log(JSON.stringify({ type: 'item.started', item: { id: 'retry-item', type: 'reasoning', status: 'in_progress' } }));
      console.log(JSON.stringify({ type: 'item.completed', item: { id: 'retry-item', type: 'reasoning', status: 'completed' } }));
    }
    writeFileSync(output, 'codex report\\n');
    console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }));
  }, Number(sleepMatch?.[1] || 0));
});
`);
  if (process.platform === 'win32') {
    await writeFile(path, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`);
  } else {
    await chmod(path, 0o755);
  }
  return realpath(path);
}

async function operation(root, codexPath, workerId, {
  role = null,
  sandbox = 'workspace-write',
  sleepMs = 0,
  omitEvidence = false,
  mutateIndex = false,
  mutateUnstaged = false,
  concurrentWorktrees = [],
  ignoreSigterm = false,
  mutateProtectedWorktree = false,
  stubbornGrandchild = false,
  reconnectError = false,
  env = process.env,
} = {}) {
  const suffix = codexArtifactId(workerId).slice(0, 12);
  const invokingWorktree = await workspace(root, `repo-${suffix}`);
  const requestedCwd = join(root, `worktree-${suffix}`);
  await execFileAsync('git', ['worktree', 'add', '-b', `worker-${suffix}`, requestedCwd], {
    cwd: invokingWorktree,
  });
  const cwd = await realpath(requestedCwd);
  const protectedWorktrees = [invokingWorktree];
  const requestedControl = join(root, 'control', codexArtifactId(workerId));
  await mkdir(requestedControl, { recursive: true });
  const control = await realpath(requestedControl);
  const promptPath = join(control, 'prompt.txt');
  const reportPath = join(control, 'report.md');
  const operationPath = join(control, 'operation.json');
  const prompt = [
    'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.',
    `SLEEP_MS=${sleepMs}`,
    `OMIT_EVIDENCE=${omitEvidence ? 1 : 0}`,
    `MUTATE_INDEX=${mutateIndex ? 1 : 0}`,
    `MUTATE_UNSTAGED=${mutateUnstaged ? 1 : 0}`,
    `PROTECTED_PATH=${mutateProtectedWorktree ? protectedWorktrees[0] : ''}`,
    `IGNORE_SIGTERM=${ignoreSigterm ? 1 : 0}`,
    `STUBBORN_GRANDCHILD=${stubbornGrandchild ? 1 : 0}`,
    `RECONNECT_ERROR=${reconnectError ? 1 : 0}`,
  ].join('\n');
  await writeFile(promptPath, prompt, { mode: 0o600 });
  const capabilityPath = join(control, 'capabilities.json');
  const capability = await inspectCodexRuntime({ codexPath, cwd, env });
  await ownerJson(capabilityPath, capability);
  const capabilitySha256 = createHash('sha256').update(await readFile(capabilityPath)).digest('hex');
  await ownerJson(operationPath, {
    schema: 'loopx.codex-worker-operation.v1',
    worker_id: workerId,
    role: role || (sandbox === 'read-only' ? 'task_review' : workerId.startsWith('fix:') ? 'fix' : 'implementation'),
    codex_path: codexPath,
    capability_path: capabilityPath,
    capability_sha256: capabilitySha256,
    expected_agent_path: capability.agent_path,
    expected_cli_version: capability.cli_version,
    skill_source_sha256: capability.skill_source_sha256,
    codex_home_config_fingerprint: capability.codex_home_config_fingerprint,
    workspace: cwd,
    protected_worktrees: protectedWorktrees,
    concurrent_worktrees: concurrentWorktrees,
    model: 'gpt-5-test',
    sandbox,
    prompt_path: promptPath,
    prompt_sha256: createHash('sha256').update(prompt).digest('hex'),
    report_path: reportPath,
    timeout_ms: 10_000,
  });
  return { capabilityPath, control, cwd, invokingWorktree, operationPath, promptPath, reportPath };
}

test('Codex CLI inspect verifies identity, login, and strict non-interactive flags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-inspect-'));
  const codexPath = await fakeCodex(root);
  const inspected = await inspectCodexRuntime({ codexPath, cwd: root });

  assert.equal(inspected.adapter, 'codex-agent-cli');
  assert.equal(inspected.ready, process.platform !== 'win32');
  assert.equal(inspected.agent_path, codexPath);
  assert.equal(inspected.cli_version, '9.9.9-test');
  assert.equal(inspected.authenticated, true);
  assert.equal(inspected.workspace_root, await realpath(root));
  assert.match(inspected.skill_source_sha256, /^[a-f0-9]{64}$/);
  assert.match(inspected.codex_home_config_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Number.isFinite(Date.parse(inspected.generated_at)), true);
  assert.deepEqual(
    inspected.missing_capabilities,
    process.platform === 'win32' ? ['durable-process-tree-ownership'] : [],
  );
  assert.deepEqual(inspected.capabilities, {
    create: true,
    explicit_model: true,
    explicit_cwd: true,
    workspace_sandbox: true,
    approval_never: true,
    disable_multi_agent: true,
    ignore_rules: true,
    structured_events: true,
    output_report: true,
    observe: true,
    interrupt: process.platform !== 'win32',
  });

  const unavailable = await inspectCodexRuntime({
    codexPath: await fakeCodex(join(root, 'bad'), { authenticated: false, omitCd: true, omitJson: true }),
    cwd: root,
  });
  assert.equal(unavailable.ready, false);
  assert.deepEqual(unavailable.missing_capabilities.sort(), [
    'codex-authenticated',
    'create-with-explicit-cwd',
    'structured-events',
  ]);

  const withoutDisable = await inspectCodexRuntime({
    codexPath: await fakeCodex(join(root, 'no-disable'), { omitDisable: true }),
    cwd: root,
  });
  assert.equal(withoutDisable.ready, false);
  assert.equal(withoutDisable.missing_capabilities.includes('disable-multi-agent'), true);
});

test('Codex adapter resolver falls back to the CLI before worker dispatch', {
  skip: process.platform === 'win32',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-adapter-resolution-'));
  const codexPath = await fakeCodex(root);
  let inspectCount = 0;
  let dispatchCount = 0;

  const resolved = await resolveCodexAdapterCapabilities({
    nativeCapabilities: {
      create: true,
      observe: true,
      explicitModel: false,
      explicitCwd: false,
      adapter: 'codex-native',
    },
    codexPath,
    cwd: root,
    inspectRuntime: async (options) => {
      inspectCount += 1;
      return inspectCodexRuntime(options);
    },
  });

  assert.equal(inspectCount, 1);
  assert.equal(dispatchCount, 0);
  assert.equal(resolved.adapter, 'codex-agent-cli');
  assert.equal(resolved.isolationMode, 'strict-worktree');
  assert.equal(resolved.create, true);
  assert.equal(resolved.observe, true);
  assert.equal(resolved.explicitModel, true);
  assert.equal(resolved.explicitCwd, true);
  assert.equal(resolved.capabilityArtifact.ready, true);

  dispatchCount += 1;
  assert.equal(dispatchCount, 1);
});

test('Codex CLI inspect requires controlled automation rule isolation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-config-isolation-'));
  const codexPath = await fakeCodex(root, {
    omitIgnoreRules: true,
  });
  const inspected = await inspectCodexRuntime({ codexPath, cwd: root });

  assert.equal(inspected.ready, false);
  assert.deepEqual(inspected.missing_capabilities, ['ignore-user-rules']);
});

test('Codex CLI execution double-binds cwd, disables delegation, and retains verified evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-execute-'));
  const log = join(root, 'codex.log');
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'implementation:plan.md#T-001');
  const completion = await executeCodexOperation({
    operationPath: item.operationPath,
    env: { ...process.env, FAKE_CODEX_LOG: log },
  });

  assert.equal(completion.status, 'success');
  assert.equal(completion.runtime, 'codex');
  assert.match(completion.agent_id, /^codex-thread-/);
  assert.equal(completion.requested_model, 'gpt-5-test');
  assert.equal(completion.model, 'gpt-5-test');
  assert.equal(completion.observed_model, 'gpt-5-test');
  assert.equal(completion.cwd, item.cwd);
  assert.equal(completion.observed_cwd, item.cwd);
  assert.equal(completion.evidence_source, 'thread.started');
  assert.equal(completion.report_path, item.reportPath);
  assert.equal(await readFile(item.reportPath, 'utf8'), 'codex report\n');
  assert.equal((await stat(item.reportPath)).isFile(), true);
  if (process.platform !== 'win32') assert.equal((await stat(item.reportPath)).mode & 0o777, 0o600);

  const invocation = JSON.parse((await readFile(log, 'utf8')).trim());
  assert.equal(invocation.cwd, item.cwd);
  assert.equal(invocation.args[invocation.args.indexOf('-C') + 1], item.cwd);
  assert.equal(invocation.args[invocation.args.indexOf('-m') + 1], 'gpt-5-test');
  assert.equal(invocation.args[invocation.args.indexOf('-s') + 1], 'workspace-write');
  assert.equal(invocation.args[invocation.args.indexOf('-a') + 1], 'never');
  assert.equal(invocation.args[invocation.args.indexOf('--disable') + 1], 'multi_agent');
  assert.equal(invocation.args.includes('--ignore-user-config'), false);
  assert.equal(invocation.args.includes('--ignore-rules'), true);
  assert.equal(invocation.args.includes('--json'), true);
  assert.equal(invocation.args.includes('-o'), true);
  assert.equal(invocation.args.some((arg) => arg.includes('dangerously-bypass')), false);
  assert.equal(invocation.prompt.includes('leaf worker'), true);

  const events = (await readFile(completion.events_path, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map((event) => event.type), ['thread.started', 'turn.completed']);
  const persisted = JSON.parse(await readFile(completion.completion_path, 'utf8'));
  assert.equal(persisted.operation_digest, completion.operation_digest);
  assert.equal(persisted.terminal_event.type, 'turn.completed');
  assert.equal(persisted.report_size, Buffer.byteLength('codex report\n'));
  assert.equal(persisted.report_sha256, createHash('sha256').update('codex report\n').digest('hex'));
  if (process.platform !== 'win32') {
    assert.equal((await stat(completion.events_path)).mode & 0o777, 0o600);
    assert.equal((await stat(completion.completion_path)).mode & 0o777, 0o600);
  }
});

test('Codex CLI execution preserves reconnect diagnostics and waits for the real turn terminal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-reconnect-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'review:plan.md#T-reconnect', {
    role: 'task_review',
    sandbox: 'read-only',
    reconnectError: true,
  });

  const completion = await executeCodexOperation({ operationPath: item.operationPath });

  assert.equal(completion.status, 'success');
  assert.equal(completion.terminal_event.type, 'turn.completed');
  assert.equal(completion.report_size > 0, true);
  const events = (await readFile(completion.events_path, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map((event) => event.type), [
    'thread.started',
    'error',
    'item.started',
    'item.completed',
    'turn.completed',
  ]);
  assert.match(events[1].message, /^Reconnecting\.\.\. 1\/5/);
});

test('Codex CLI execution records explicit binding evidence when JSONL omits model and cwd', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-binding-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'review:plan.md#T-002', {
    sandbox: 'read-only',
    omitEvidence: true,
  });
  const completion = await executeCodexOperation({ operationPath: item.operationPath });

  assert.equal(completion.status, 'success');
  assert.equal(completion.requested_model, 'gpt-5-test');
  assert.equal(completion.model, 'gpt-5-test');
  assert.equal(completion.observed_model, null);
  assert.equal(completion.cwd, item.cwd);
  assert.equal(completion.observed_cwd, null);
  assert.equal(completion.evidence_source, 'explicit-cli-binding');
  assert.equal(completion.model_evidence_source, 'explicit-cli-binding');
  assert.equal(completion.cwd_evidence_source, 'explicit-cli-binding');
});

test('Codex operation wait observes running state and interrupt terminates only the bound child', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-interrupt-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'fix:plan.md#T-003', { sleepMs: 5_000 });
  const execution = executeCodexOperation({ operationPath: item.operationPath });

  let running;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    running = await waitCodexOperation({ operationPath: item.operationPath, timeoutMs: 20 });
    if (running.status === 'running' && running.agent_id) break;
  }
  assert.equal(running.status, 'running');
  assert.match(running.agent_id, /^codex-thread-/);
  assert.ok(Number.isInteger(running.process_id));
  const interrupted = await interruptCodexOperation({
    operationPath: item.operationPath,
    operationDigest: running.operation_digest,
    processId: running.process_id,
  });
  assert.equal(interrupted.status, 'interrupted');

  const completion = await execution;
  assert.equal(completion.status, 'interrupted');
  assert.equal(completion.process_id, running.process_id);
  const waited = await waitCodexOperation({ operationPath: item.operationPath, timeoutMs: 100 });
  assert.equal(waited.status, 'interrupted');
});

test('Codex cancel artifact kills a SIGTERM-resistant process group running in another Node process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-cross-process-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'fix:plan.md#T-005', {
    sleepMs: 10_000,
    ignoreSigterm: true,
  });
  const runtimeUrl = new URL('../skills/parallel-subagent-exec/scripts/codex-runtime.mjs', import.meta.url).href;
  const runner = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    `import { executeCodexOperation } from ${JSON.stringify(runtimeUrl)}; const result = await executeCodexOperation({ operationPath: process.argv[1] }); console.log(JSON.stringify(result));`,
    item.operationPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const runnerExit = new Promise((resolvePromise) => {
    runner.once('close', (code, signal) => resolvePromise({ code, signal }));
  });
  let stdout = '';
  let stderr = '';
  runner.stdout.setEncoding('utf8');
  runner.stderr.setEncoding('utf8');
  runner.stdout.on('data', (chunk) => { stdout += chunk; });
  runner.stderr.on('data', (chunk) => { stderr += chunk; });

  let running;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    running = await waitCodexOperation({ operationPath: item.operationPath, timeoutMs: 20 });
    if (running.agent_id) break;
  }
  assert.match(running.agent_id, /^codex-thread-/);
  const interrupted = await interruptCodexOperation({
    operationPath: item.operationPath,
    operationDigest: running.operation_digest,
    processId: running.process_id,
    timeoutMs: 5_000,
  });
  assert.equal(interrupted.status, 'interrupted');

  const exit = await runnerExit;
  assert.equal(exit.code, 0, stderr);
  const completion = JSON.parse(stdout.trim());
  assert.equal(completion.status, 'interrupted');
  assert.equal(completion.process_id, running.process_id);
  const cancel = JSON.parse(await readFile(join(item.control, 'cancel.json'), 'utf8'));
  assert.equal(cancel.operation_digest, running.operation_digest);
  assert.equal(cancel.process_id, running.process_id);
  if (process.platform !== 'win32') assert.equal((await stat(join(item.control, 'cancel.json'))).mode & 0o777, 0o600);
});

test('Codex cancellation kills a stubborn descendant after its process-group leader exits', {
  skip: process.platform === 'win32',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-descendant-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'fix:plan.md#T-descendant', {
    sleepMs: 10_000,
    stubbornGrandchild: true,
  });
  const runtimeUrl = new URL('../skills/parallel-subagent-exec/scripts/codex-runtime.mjs', import.meta.url).href;
  const runner = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    `import { executeCodexOperation } from ${JSON.stringify(runtimeUrl)}; const result = await executeCodexOperation({ operationPath: process.argv[1] }); console.log(JSON.stringify(result));`,
    item.operationPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const runnerExit = new Promise((resolvePromise) => {
    runner.once('close', (code, signal) => resolvePromise({ code, signal }));
  });

  let running;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    running = await waitCodexOperation({ operationPath: item.operationPath, timeoutMs: 20 });
    if (running.agent_id) break;
  }
  assert.match(running.agent_id, /^codex-thread-/);
  try {
    const interrupted = await interruptCodexOperation({
      operationPath: item.operationPath,
      operationDigest: running.operation_digest,
      processId: running.process_id,
      timeoutMs: 5_000,
    });
    assert.equal(interrupted.status, 'interrupted');
    const exit = await runnerExit;
    assert.equal(exit.code, 0);
    assert.throws(
      () => process.kill(-running.process_id, 0),
      (error) => error.code === 'ESRCH',
    );
  } finally {
    try {
      process.kill(-running.process_id, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
});

test('Codex operation rejects stale capability and CODEX_HOME config identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-capability-binding-'));
  const codexPath = await fakeCodex(root);
  const codexHome = join(root, 'codex-home');
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, 'config.toml'), 'model = "first"\n', { mode: 0o600 });
  const env = { ...process.env, CODEX_HOME: codexHome };
  const item = await operation(root, codexPath, 'implementation:plan.md#T-cap', { env });
  await writeFile(join(codexHome, 'config.toml'), 'model = "changed"\n', { mode: 0o600 });

  await assert.rejects(
    executeCodexOperation({ operationPath: item.operationPath, env }),
    (error) => error.code === 'parallel_codex_capability_identity_mismatch',
  );
});

test('Codex operation rejects non-secret provider endpoint environment drift', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-provider-env-'));
  const codexPath = await fakeCodex(root);
  const env = { ...process.env, OPENAI_BASE_URL: 'https://first.example.test/v1' };
  const item = await operation(root, codexPath, 'implementation:plan.md#T-provider-env', { env });

  await assert.rejects(
    executeCodexOperation({
      operationPath: item.operationPath,
      env: { ...env, OPENAI_BASE_URL: 'https://changed.example.test/v1' },
    }),
    (error) => error.code === 'parallel_codex_capability_identity_mismatch',
  );
});

test('Codex role policy rejects writable review workers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-role-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'review:plan.md#T-role', {
    role: 'task_review',
    sandbox: 'workspace-write',
  });
  await assert.rejects(
    executeCodexOperation({ operationPath: item.operationPath }),
    (error) => error.code === 'parallel_codex_operation_invalid',
  );
});

test('read-only Codex roles reject unstaged tracked worktree mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-read-only-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'review:plan.md#T-read-only', {
    role: 'task_review',
    sandbox: 'read-only',
    mutateUnstaged: true,
  });
  const completion = await executeCodexOperation({ operationPath: item.operationPath });
  assert.equal(completion.status, 'failed');
  assert.equal(completion.error.code, 'parallel_codex_read_only_violation');
});

test('Codex execution rejects mutation in a protected sibling worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-protected-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'implementation:plan.md#T-protected', {
    mutateProtectedWorktree: true,
  });
  const completion = await executeCodexOperation({ operationPath: item.operationPath });
  assert.equal(completion.status, 'failed');
  assert.equal(completion.error.code, 'parallel_codex_protected_worktree_violation');
});

test('Codex operation rejects an omitted invoking checkout protection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-protected-required-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'implementation:plan.md#T-protected-required');
  const value = JSON.parse(await readFile(item.operationPath, 'utf8'));
  value.protected_worktrees = [];
  await ownerJson(item.operationPath, value);

  await assert.rejects(
    executeCodexOperation({ operationPath: item.operationPath }),
    (error) => error.code === 'parallel_codex_operation_invalid',
  );
});

test('Codex wait rejects a report mutated after completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-report-binding-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'implementation:plan.md#T-report');
  const completion = await executeCodexOperation({ operationPath: item.operationPath });
  assert.equal(completion.status, 'success');
  await writeFile(item.reportPath, 'tampered report\n', { mode: 0o600 });
  await assert.rejects(
    waitCodexOperation({ operationPath: item.operationPath, timeoutMs: 10 }),
    (error) => error.code === 'parallel_codex_artifact_invalid',
  );
});

test('Codex wait reports not_started when no lifecycle evidence exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-not-started-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'implementation:plan.md#T-not-started');
  const result = await waitCodexOperation({ operationPath: item.operationPath, timeoutMs: 10 });
  assert.equal(result.status, 'not_started');
  assert.equal(result.process_id, null);
});

test('Codex execution rejects controller-owned Git index mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-git-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'implementation:plan.md#T-004', { mutateIndex: true });
  const before = await git(item.cwd, ['ls-files', '--stage']);
  const completion = await executeCodexOperation({ operationPath: item.operationPath });

  assert.equal(completion.status, 'failed');
  assert.equal(completion.error.code, 'parallel_codex_git_ownership_violation');
  assert.notEqual(await git(item.cwd, ['ls-files', '--stage']), before);
});

test('Codex execution rejects prompt content that no longer matches the immutable operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-codex-prompt-drift-'));
  const codexPath = await fakeCodex(root);
  const item = await operation(root, codexPath, 'implementation:plan.md#T-prompt');
  await writeFile(item.promptPath, `${await readFile(item.promptPath, 'utf8')}\nchanged\n`, { mode: 0o600 });

  await assert.rejects(
    executeCodexOperation({ operationPath: item.operationPath }),
    (error) => error.code === 'parallel_codex_operation_invalid',
  );
});

test('Codex artifact ids are stable filesystem-safe hashes', () => {
  const workerId = '7:implementation:docs/loopx/plans/example.md#T-001';
  assert.equal(codexArtifactId(workerId), createHash('sha256').update(workerId).digest('hex'));
});

test('parallel exec CLI exposes Codex inspect and artifact-id commands', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-codex-cli-'));
  const codex = await fakeCodex(root);
  const output = join(root, 'capabilities.json');
  const stdout = [];
  const stderr = [];
  const inspected = await runParallelExecCommand({
    argv: ['codex', 'inspect', '--agent', codex, '--output', output],
    cwd: root,
    env: process.env,
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
  });
  assert.equal(inspected.exitCode, 0);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).adapter, 'codex-agent-cli');
  assert.equal(stderr.join(''), '');

  const artifact = await runParallelExecCommand({
    argv: ['codex', 'artifact-id', '--worker-id', 'plan#T-001:implementation:1'],
    cwd: root,
    env: process.env,
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
  });
  assert.equal(artifact.exitCode, 0);
  assert.match(artifact.result.artifact_id, /^[a-f0-9]{64}$/);
});

test('parallel exec CLI returns stable exits for Codex run success and failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'parallel-codex-run-cli-'));
  const codex = await fakeCodex(root);
  const stdout = [];
  const stderr = [];
  const success = await operation(root, codex, 'implementation:plan.md#T-005');
  const completed = await runParallelExecCommand({
    argv: ['codex', 'run', '--operation', success.operationPath],
    cwd: root,
    env: process.env,
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
  });
  assert.equal(completed.exitCode, 0);
  assert.equal(completed.result.result.status, 'success');

  const failed = await operation(root, codex, 'implementation:plan.md#T-006', { mutateIndex: true });
  const rejected = await runParallelExecCommand({
    argv: ['codex', 'run', '--operation', failed.operationPath],
    cwd: root,
    env: process.env,
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
  });
  assert.equal(rejected.exitCode, 4);
  assert.equal(rejected.error.code, 'parallel_codex_git_ownership_violation');
});
