import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  appendFile,
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CURSOR_OPERATION_SCHEMA = 'loopx.cursor-worker-operation.v1';
const CURSOR_CAPABILITY_SCHEMA = 'loopx.cursor-runtime-capabilities.v1';
const CURSOR_COMPLETION_SCHEMA = 'loopx.cursor-worker-completion.v1';
const CURSOR_PREPARED_SCHEMA = 'loopx.cursor-worker-prepared.v1';
const CURSOR_SUPERVISOR_SCHEMA = 'loopx.cursor-worker-supervisor.v1';
const CURSOR_HANDSHAKE_SCHEMA = 'loopx.cursor-worker-handshake.v1';
const CURSOR_HEARTBEAT_SCHEMA = 'loopx.cursor-worker-heartbeat.v1';
const CURSOR_CANCEL_SCHEMA = 'loopx.cursor-worker-cancel.v1';
const EXACT_LEAF = 'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.';
const MAX_STDERR_BYTES = 256 * 1024;
const MAX_EVENT_LINE_BYTES = 4 * 1024 * 1024;
const HEARTBEAT_INTERVAL_MS = 250;
const HEARTBEAT_STALE_MS = 5_000;
const CANCEL_POLL_MS = 50;
const INTERRUPT_TIMEOUT_MS = 15_000;
const WAIT_POLL_INTERVAL_MS = 1_000;

export class CursorRuntimeError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'CursorRuntimeError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CursorRuntimeError(code, message, details);
}

function mergedEnv(env) {
  return { ...process.env, ...(env || {}) };
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    fail('parallel_cursor_protocol_invalid', `${label} did not return valid JSON`);
  }
}

function digestJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function writeJsonAtomic(path, value) {
  const absolute = resolve(path);
  const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(dirname(absolute), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600).catch(() => {});
    await rename(temporary, absolute);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function readOwnerJson(path) {
  const absolute = resolve(path);
  const metadata = await stat(absolute);
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    fail('parallel_cursor_operation_invalid', `controller JSON must be owner-only (0600): ${absolute}`);
  }
  return parseJson(await readFile(absolute, 'utf8'), absolute);
}

async function isExecutable(path) {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableNames(name) {
  if (process.platform !== 'win32') return [name];
  if (/\.[A-Za-z0-9]+$/.test(name)) return [name];
  return ['.exe', '.cmd', '.bat', '.com'].map((extension) => `${name}${extension}`);
}

async function pathCandidates(name, env) {
  const candidates = [];
  for (const directory of String(env.PATH || '').split(delimiter).filter(Boolean)) {
    for (const executable of executableNames(name)) candidates.push(join(directory, executable));
  }
  return candidates;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => resolve(value)))];
}

async function candidatePaths(explicit, cwd, env) {
  if (explicit) {
    if (isAbsolute(explicit) || explicit.includes('/') || explicit.includes('\\')) {
      return [resolve(cwd, explicit)];
    }
    return pathCandidates(explicit, env);
  }
  if (env.LOOPX_CURSOR_AGENT_BIN) {
    return candidatePaths(env.LOOPX_CURSOR_AGENT_BIN, cwd, env);
  }
  const candidates = [
    ...await pathCandidates('cursor-agent', env),
  ];
  if (process.platform === 'win32') {
    const local = env.LOCALAPPDATA;
    if (local) {
      candidates.push(join(local, 'cursor-agent', 'cursor-agent.exe'));
      candidates.push(join(local, 'cursor-agent', 'agent.exe'));
    }
  } else {
    candidates.push(join(homedir(), '.local', 'bin', 'cursor-agent'));
    candidates.push(join(homedir(), '.local', 'bin', 'agent'));
  }
  candidates.push(...await pathCandidates('agent', env));
  return unique(candidates);
}

async function execCursor(path, args, { cwd, env, timeout = 15_000 } = {}) {
  const invocation = cursorInvocation(path, args, env);
  try {
    return await execFileAsync(invocation.file, invocation.args, {
      cwd,
      env: invocation.env,
      timeout,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = String(error.stderr || error.message || '').slice(0, MAX_STDERR_BYTES);
    throw new CursorRuntimeError(
      'parallel_cursor_command_failed',
      `Cursor Agent CLI command failed: ${args[0] || '<root>'}`,
      { exit_code: error.code ?? null, stderr },
    );
  }
}

function cursorInvocation(path, args, env) {
  const commandEnv = mergedEnv(env);
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(path)) {
    return { file: path, args, env: commandEnv };
  }
  if (args.some((value) => /["\r\n]/.test(String(value)))) {
    fail('parallel_cursor_operation_invalid', 'Cursor batch-wrapper arguments contain unsupported characters');
  }
  const prefix = `LOOPX_CURSOR_ARG_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  commandEnv[`${prefix}_BIN`] = path;
  const references = args.map((value, index) => {
    const name = `${prefix}_${index}`;
    commandEnv[name] = String(value);
    return `"%${name}%"`;
  });
  const command = `""%${prefix}_BIN%"${references.length > 0 ? ` ${references.join(' ')}` : ''}"`;
  return {
    file: commandEnv.ComSpec || commandEnv.COMSPEC || 'cmd.exe',
    args: ['/d', '/s', '/v:off', '/c', command],
    env: commandEnv,
  };
}

async function inspectCandidate(path, { cwd, env }) {
  if (!await isExecutable(path)) return null;
  let about;
  try {
    const result = await execCursor(path, ['about', '--format', 'json'], { cwd, env });
    about = parseJson(result.stdout, 'cursor agent about');
  } catch {
    return null;
  }
  if (typeof about.cliVersion !== 'string' || typeof about.osPlatform !== 'string'
    || typeof about.osArch !== 'string') return null;
  return { path: await realpath(path), about };
}

async function resolveCursorAgent({ agentPath = null, cwd, env }) {
  const candidates = await candidatePaths(agentPath, cwd, env);
  for (const candidate of candidates) {
    const inspected = await inspectCandidate(candidate, { cwd, env });
    if (inspected) return inspected;
  }
  return null;
}

function flagPresent(help, flag) {
  return help.includes(flag);
}

export async function inspectCursorRuntime({ agentPath = null, cwd = process.cwd(), env = process.env } = {}) {
  const absoluteCwd = await realpath(resolve(cwd));
  const executable = await resolveCursorAgent({ agentPath, cwd: absoluteCwd, env: mergedEnv(env) });
  if (!executable) {
    return {
      schema: CURSOR_CAPABILITY_SCHEMA,
      runtime: 'cursor',
      adapter: 'cursor-agent-cli',
      ready: false,
      missing_capabilities: ['cursor-agent-cli'],
      capabilities: {},
    };
  }

  const help = (await execCursor(executable.path, ['--help'], { cwd: absoluteCwd, env })).stdout;
  let status = {};
  try {
    status = parseJson(
      (await execCursor(executable.path, ['status', '--format', 'json'], { cwd: absoluteCwd, env })).stdout,
      'cursor agent status',
    );
  } catch (error) {
    status = { isAuthenticated: false, error: error.message };
  }
  const capabilities = {
    create: flagPresent(help, '--resume') && /create-chat/.test(help),
    explicit_model: flagPresent(help, '--model'),
    explicit_cwd: flagPresent(help, '--workspace'),
    observe: flagPresent(help, '--output-format') && flagPresent(help, '--print'),
    headless_write: flagPresent(help, '--force') && flagPresent(help, '--trust'),
    workspace_sandbox: flagPresent(help, '--sandbox'),
    interrupt: true,
  };
  const missing = [];
  if (!status.isAuthenticated) missing.push('cursor-agent-authenticated');
  if (!capabilities.create || !capabilities.headless_write) missing.push('create');
  if (!capabilities.explicit_model) missing.push('create-with-explicit-model');
  if (!capabilities.explicit_cwd) missing.push('create-with-explicit-cwd');
  if (!capabilities.observe) missing.push('observe-or-wait');
  if (!capabilities.workspace_sandbox) missing.push('workspace-sandbox');

  return {
    schema: CURSOR_CAPABILITY_SCHEMA,
    runtime: 'cursor',
    adapter: 'cursor-agent-cli',
    ready: missing.length === 0,
    missing_capabilities: [...new Set(missing)],
    agent_path: executable.path,
    cli_version: executable.about.cliVersion,
    os_platform: executable.about.osPlatform,
    os_arch: executable.about.osArch,
    authenticated: Boolean(status.isAuthenticated),
    capabilities,
  };
}

function assertName(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    fail('parallel_cursor_operation_invalid', `${label} must use letters, digits, underscore, or hyphen`);
  }
  return value;
}

function assertWorkerId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_024 || /[\0\r\n]/.test(value)) {
    fail('parallel_cursor_operation_invalid', 'worker_id must be a bounded non-empty reservation id');
  }
  return value;
}

export function cursorArtifactId(workerId) {
  return createHash('sha256').update(assertWorkerId(workerId)).digest('hex');
}

function assertAbsolutePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value) || !isAbsolute(value)) {
    fail('parallel_cursor_operation_invalid', `${label} must be an absolute path`);
  }
  return value;
}

function assertRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value) || isAbsolute(value)) {
    fail('parallel_cursor_operation_invalid', `${label} must be a relative path`);
  }
  if (value.split(/[\\/]/).includes('..')) {
    fail('parallel_cursor_operation_invalid', `${label} escapes the worker exchange directory`);
  }
  return value;
}

function resolveInside(root, relativePath, label) {
  assertRelativePath(relativePath, label);
  const absolute = resolve(root, relativePath);
  const child = relative(root, absolute);
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    fail('parallel_cursor_operation_invalid', `${label} escapes the worker exchange directory`);
  }
  return absolute;
}

function isPathInside(root, candidate) {
  const child = relative(root, candidate);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`));
}

function assertOutsideWorkspace(path, workspace, label) {
  if (isPathInside(workspace, path)) {
    fail('parallel_cursor_operation_invalid', `${label} must remain outside the worker workspace`, {
      workspace,
      path,
    });
  }
}

function artifactPaths(operationPath) {
  const control = dirname(resolve(operationPath));
  return {
    control,
    startLock: join(control, 'start.lock'),
    prepared: join(control, 'prepared.json'),
    supervisor: join(control, 'supervisor.json'),
    handshake: join(control, 'handshake.json'),
    heartbeat: join(control, 'heartbeat.json'),
    cancel: join(control, 'cancel.json'),
    events: join(control, 'events.ndjson'),
    stderr: join(control, 'stderr.log'),
    completion: join(control, 'completion.json'),
  };
}

async function assertRegularFile(path, label, { nonempty = false } = {}) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail('parallel_cursor_artifact_invalid', `${label} must be a regular non-symlink file: ${path}`);
  }
  if (nonempty && metadata.size === 0) {
    fail('parallel_cursor_artifact_invalid', `${label} must not be empty: ${path}`);
  }
  return metadata;
}

async function assertCanonicalDirectory(path, root, label) {
  const expected = resolve(path);
  const metadata = await lstat(expected);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail('parallel_cursor_artifact_invalid', `${label} must be a real directory`, { expected });
  }
  const canonical = await realpath(expected);
  const child = relative(root, canonical);
  if (canonical !== expected || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    fail('parallel_cursor_artifact_invalid', `${label} contains a symlink or escapes its owned root`, {
      root,
      expected,
      canonical,
    });
  }
  return canonical;
}

async function createCanonicalDirectory(path, root, label, mode = 0o700) {
  try {
    await mkdir(path, { recursive: true, mode });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return assertCanonicalDirectory(path, root, label);
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function git(workspace, args) {
  try {
    return (await execFileAsync('git', args, {
      cwd: workspace,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    })).stdout;
  } catch (error) {
    fail('parallel_cursor_git_identity_invalid', `git ${args.join(' ')} failed`, {
      stderr: String(error.stderr || error.message || '').slice(0, MAX_STDERR_BYTES),
    });
  }
}

async function gitIdentity(workspace) {
  const top = await realpath((await git(workspace, ['rev-parse', '--show-toplevel'])).trim());
  if (top !== workspace) {
    fail('parallel_cursor_git_identity_invalid', 'Cursor workspace is not the owned worktree root', {
      expected: workspace,
      observed: top,
    });
  }
  const branch = (await git(workspace, ['symbolic-ref', '--quiet', 'HEAD'])).trim();
  const head = (await git(workspace, ['rev-parse', 'HEAD'])).trim();
  const index = createHash('sha256').update(await git(workspace, ['ls-files', '--stage', '-z'])).digest('hex');
  return { branch, head, index };
}

async function assertGitIdentity(workspace, expected) {
  const observed = await gitIdentity(workspace);
  for (const field of ['branch', 'head', 'index']) {
    if (observed[field] !== expected[field]) {
      fail('parallel_cursor_git_ownership_violation', `Cursor worker changed controller-owned Git ${field}`, {
        field,
        expected: expected[field],
        observed: observed[field],
      });
    }
  }
  return observed;
}

async function loadOperation(operationPath) {
  const absoluteOperationPath = resolve(operationPath);
  await assertRegularFile(absoluteOperationPath, 'operation');
  const canonicalOperationPath = await realpath(absoluteOperationPath);
  const operation = await readOwnerJson(canonicalOperationPath);
  if (operation?.schema !== CURSOR_OPERATION_SCHEMA) {
    fail('parallel_cursor_operation_invalid', `operation schema must be ${CURSOR_OPERATION_SCHEMA}`);
  }
  assertWorkerId(operation.worker_id);
  assertAbsolutePath(operation.agent_path, 'agent_path');
  assertAbsolutePath(operation.workspace, 'workspace');
  assertAbsolutePath(operation.prompt_path, 'prompt_path');
  if (typeof operation.model !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/.test(operation.model)
    || operation.model.toLowerCase() === 'auto') {
    fail('parallel_cursor_operation_invalid', 'an explicit non-auto model is required');
  }
  if (!Number.isInteger(operation.timeout_ms) || operation.timeout_ms < 1) {
    fail('parallel_cursor_operation_invalid', 'timeout_ms must be a positive integer');
  }
  if (!Array.isArray(operation.inputs) || !Array.isArray(operation.outputs) || operation.outputs.length === 0) {
    fail('parallel_cursor_operation_invalid', 'inputs and at least one output are required');
  }
  const workspace = await realpath(resolve(operation.workspace));
  const requestedPromptPath = resolve(operation.prompt_path);
  await assertRegularFile(requestedPromptPath, 'prompt');
  const promptPath = await realpath(requestedPromptPath);
  const paths = artifactPaths(canonicalOperationPath);
  const canonicalControl = await realpath(paths.control);
  assertOutsideWorkspace(canonicalControl, workspace, 'Cursor controller directory');
  assertOutsideWorkspace(promptPath, workspace, 'prompt');
  const operationDigest = digestJson(operation);
  return {
    operation,
    operationPath: canonicalOperationPath,
    operationDigest,
    workspace,
    promptPath,
    paths,
  };
}

function operationIdentity(loaded) {
  return {
    worker_id: loaded.operation.worker_id,
    operation_digest: loaded.operationDigest,
    operation_path: loaded.operationPath,
    heartbeat_path: loaded.paths.heartbeat,
    cwd: loaded.workspace,
    model: loaded.operation.model,
  };
}

function assertLifecyclePaths(record, label, identity) {
  for (const field of ['operation_path', 'heartbeat_path']) {
    if (record[field] !== identity[field]) {
      lifecycleMismatch(label, field, identity[field], record[field]);
    }
  }
  return record;
}

function lifecycleMismatch(label, field, expected, observed) {
  fail('parallel_cursor_resume_identity_mismatch', `${label} has stale or mismatched ${field}`, {
    field,
    expected,
    observed,
  });
}

function assertLifecycleIdentity(record, {
  schema,
  label,
  identity,
  cwdField = 'cwd',
  modelField = 'model',
}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    lifecycleMismatch(label, 'record', 'object', record);
  }
  const expected = {
    schema,
    worker_id: identity.worker_id,
    operation_digest: identity.operation_digest,
    [cwdField]: identity.cwd,
    [modelField]: identity.model,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (record[field] !== value) lifecycleMismatch(label, field, value, record[field]);
  }
  return record;
}

function assertSupervisor(record, identity) {
  assertLifecycleIdentity(record, {
    schema: CURSOR_SUPERVISOR_SCHEMA,
    label: 'Cursor supervisor',
    identity,
  });
  assertLifecyclePaths(record, 'Cursor supervisor', identity);
  if (!Number.isInteger(record.supervisor_pid) || record.supervisor_pid < 1) {
    lifecycleMismatch('Cursor supervisor', 'supervisor_pid', 'positive integer', record.supervisor_pid);
  }
  if (typeof record.agent_id !== 'string' || record.agent_id.length === 0) {
    lifecycleMismatch('Cursor supervisor', 'agent_id', 'non-empty string', record.agent_id);
  }
  if (typeof record.supervisor_token !== 'string' || record.supervisor_token.length < 32) {
    lifecycleMismatch('Cursor supervisor', 'supervisor_token', 'unguessable token', record.supervisor_token);
  }
  if (typeof record.started_at !== 'string' || !Number.isFinite(Date.parse(record.started_at))) {
    lifecycleMismatch('Cursor supervisor', 'started_at', 'ISO timestamp', record.started_at);
  }
  return record;
}

function assertMatchingSupervisorArtifact(record, {
  schema,
  label,
  identity,
  supervisor,
  cwdField = 'cwd',
  modelField = 'model',
}) {
  assertLifecycleIdentity(record, { schema, label, identity, cwdField, modelField });
  assertLifecyclePaths(record, label, identity);
  for (const field of ['agent_id', 'supervisor_pid', 'supervisor_token']) {
    if (record[field] !== supervisor[field]) {
      lifecycleMismatch(label, field, supervisor[field], record[field]);
    }
  }
  return record;
}

function assertHeartbeat(record, identity, supervisor, { requireFresh = true } = {}) {
  assertMatchingSupervisorArtifact(record, {
    schema: CURSOR_HEARTBEAT_SCHEMA,
    label: 'Cursor heartbeat',
    identity,
    supervisor,
  });
  const updatedAt = Date.parse(record.updated_at);
  const age = Date.now() - updatedAt;
  if (!Number.isFinite(updatedAt) || (requireFresh && (age < -1_000 || age > HEARTBEAT_STALE_MS))) {
    lifecycleMismatch('Cursor heartbeat', 'updated_at', `fresh within ${HEARTBEAT_STALE_MS}ms`, record.updated_at);
  }
  return record;
}

function assertHandshake(record, identity, supervisor) {
  return assertMatchingSupervisorArtifact(record, {
    schema: CURSOR_HANDSHAKE_SCHEMA,
    label: 'Cursor handshake',
    identity,
    supervisor,
    modelField: 'requested_model',
  });
}

function assertCompletion(record, identity) {
  assertLifecycleIdentity(record, {
    schema: CURSOR_COMPLETION_SCHEMA,
    label: 'Cursor completion',
    identity,
    modelField: 'requested_model',
  });
  assertLifecyclePaths(record, 'Cursor completion', identity);
  if (!['success', 'failed', 'interrupted'].includes(record.status)) {
    lifecycleMismatch('Cursor completion', 'status', 'terminal status', record.status);
  }
  return record;
}

function assertPrepared(record, identity) {
  assertLifecycleIdentity(record, {
    schema: CURSOR_PREPARED_SCHEMA,
    label: 'Cursor prepared operation',
    identity,
    cwdField: 'workspace',
  });
  assertLifecyclePaths(record, 'Cursor prepared operation', identity);
  if (typeof record.exchange_root !== 'string' || !isAbsolute(record.exchange_root)) {
    lifecycleMismatch('Cursor prepared operation', 'exchange_root', 'canonical absolute path', record.exchange_root);
  }
  return record;
}

function assertCancel(record, identity, supervisor) {
  return assertMatchingSupervisorArtifact(record, {
    schema: CURSOR_CANCEL_SCHEMA,
    label: 'Cursor cancellation',
    identity,
    supervisor,
  });
}

async function assertCurrentOperationDigest(operationPath, expectedDigest) {
  const operation = await readOwnerJson(operationPath);
  const observedDigest = digestJson(operation);
  if (observedDigest !== expectedDigest) {
    lifecycleMismatch('Cursor operation', 'operation_digest', expectedDigest, observedDigest);
  }
}

async function prepareOperation(operationPath) {
  const loaded = await loadOperation(operationPath);
  const { operation, workspace, promptPath, paths } = loaded;
  const exchangeId = cursorArtifactId(operation.worker_id);
  const exchangeRelative = `.loopx/parallel-subagent-exec-workers/${exchangeId}`;
  const exchange = resolveInside(workspace, exchangeRelative, 'exchange directory');
  const exchangeRoot = await createCanonicalDirectory(
    exchange,
    workspace,
    'worker exchange directory',
  );
  try {
    await execFileAsync('git', ['check-ignore', '-q', '--', exchangeRelative], { cwd: workspace });
  } catch {
    fail('parallel_cursor_exchange_not_ignored', `worker exchange directory must be gitignored: ${exchangeRelative}`);
  }

  const inputPaths = {};
  const inputHashes = {};
  for (const item of operation.inputs) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail('parallel_cursor_operation_invalid', 'each input must be an object');
    }
    const name = assertName(item.name, 'input name');
    if (Object.hasOwn(inputPaths, name)) fail('parallel_cursor_operation_invalid', `duplicate input name: ${name}`);
    assertAbsolutePath(item.source_path, `input ${name} source_path`);
    const requestedSource = resolve(item.source_path);
    await assertRegularFile(requestedSource, `input ${name}`);
    const source = await realpath(requestedSource);
    assertOutsideWorkspace(source, workspace, `input ${name} source`);
    const target = resolveInside(exchange, item.target_path, `input ${name} target_path`);
    await createCanonicalDirectory(dirname(target), exchangeRoot, `input ${name} directory`);
    try {
      await lstat(target);
      fail('parallel_cursor_stale_artifact', `input already exists before dispatch: ${target}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await copyFile(source, target);
    await assertRegularFile(target, `input ${name}`);
    await chmod(target, 0o400).catch(() => {});
    inputPaths[name] = target;
    inputHashes[name] = await sha256(target);
  }

  const outputPaths = {};
  const retainedPaths = {};
  const outputSources = new Set();
  const retainedOutputs = new Set();
  const lifecyclePaths = new Set([
    loaded.operationPath,
    ...Object.entries(paths)
      .filter(([name]) => name !== 'control')
      .map(([, path]) => path),
  ]);
  for (const item of operation.outputs) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail('parallel_cursor_operation_invalid', 'each output must be an object');
    }
    const name = assertName(item.name, 'output name');
    if (Object.hasOwn(outputPaths, name)) fail('parallel_cursor_operation_invalid', `duplicate output name: ${name}`);
    const source = resolveInside(exchange, item.source_path, `output ${name} source_path`);
    if (outputSources.has(source)) {
      fail('parallel_cursor_operation_invalid', `duplicate output source_path: ${item.source_path}`);
    }
    outputSources.add(source);
    assertAbsolutePath(item.retained_path, `output ${name} retained_path`);
    const requestedRetained = resolve(item.retained_path);
    await mkdir(dirname(requestedRetained), { recursive: true, mode: 0o700 });
    const canonicalRetainedParent = await realpath(dirname(requestedRetained));
    const retained = join(canonicalRetainedParent, basename(requestedRetained));
    assertOutsideWorkspace(retained, workspace, `output ${name} retained_path`);
    if (retainedOutputs.has(retained)) {
      fail('parallel_cursor_operation_invalid', `duplicate output retained_path: ${retained}`);
    }
    retainedOutputs.add(retained);
    if (lifecyclePaths.has(retained)) {
      fail('parallel_cursor_operation_invalid', `output ${name} cannot replace Cursor lifecycle evidence`);
    }
    if (item.required !== undefined && typeof item.required !== 'boolean') {
      fail('parallel_cursor_operation_invalid', `output ${name} required must be boolean`);
    }
    await createCanonicalDirectory(dirname(source), exchangeRoot, `output ${name} directory`);
    try {
      await lstat(source);
      fail('parallel_cursor_stale_artifact', `output already exists before dispatch: ${source}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await lstat(retained);
      fail('parallel_cursor_stale_artifact', `retained output already exists before dispatch: ${retained}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    outputPaths[name] = source;
    retainedPaths[name] = retained;
  }

  let prompt = await readFile(promptPath, 'utf8');
  prompt = prompt.replace(/\{\{input:([A-Za-z0-9_-]+)\}\}/g, (_, name) => {
    if (!inputPaths[name]) fail('parallel_cursor_operation_invalid', `unknown prompt input placeholder: ${name}`);
    return inputPaths[name];
  });
  prompt = prompt.replace(/\{\{output:([A-Za-z0-9_-]+)\}\}/g, (_, name) => {
    if (!outputPaths[name]) fail('parallel_cursor_operation_invalid', `unknown prompt output placeholder: ${name}`);
    return outputPaths[name];
  });
  if (/\{\{(?:input|output):/.test(prompt)) {
    fail('parallel_cursor_operation_invalid', 'prompt contains an unresolved adapter placeholder');
  }
  if (!prompt.includes(EXACT_LEAF)) {
    fail('parallel_cursor_leaf_clause_missing', 'Cursor worker prompt is missing the exact leaf-worker clause');
  }

  const prepared = {
    schema: CURSOR_PREPARED_SCHEMA,
    worker_id: operation.worker_id,
    operation_digest: loaded.operationDigest,
    operation_path: loaded.operationPath,
    heartbeat_path: paths.heartbeat,
    agent_path: resolve(operation.agent_path),
    workspace,
    model: operation.model,
    timeout_ms: operation.timeout_ms,
    prompt,
    exchange,
    exchange_root: exchangeRoot,
    input_paths: inputPaths,
    input_hashes: inputHashes,
    output_paths: outputPaths,
    retained_paths: retainedPaths,
    required_outputs: Object.fromEntries(operation.outputs.map((item) => [item.name, item.required !== false])),
    git_identity: await gitIdentity(workspace),
  };
  await writeJsonAtomic(paths.prepared, prepared);
  await writeFile(paths.events, '', { mode: 0o600 });
  await writeFile(paths.stderr, '', { mode: 0o600 });
  return { ...loaded, prepared };
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function readJsonIfPresent(path) {
  try {
    return await readOwnerJson(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readActiveSupervisor(loaded, { requireAlive = true } = {}) {
  const identity = operationIdentity(loaded);
  const supervisorRecord = await readJsonIfPresent(loaded.paths.supervisor);
  if (!supervisorRecord) {
    fail('parallel_cursor_supervisor_lost', 'Cursor worker supervisor evidence is missing');
  }
  const supervisor = assertSupervisor(supervisorRecord, identity);
  const heartbeatRecord = await readJsonIfPresent(loaded.paths.heartbeat);
  if (!heartbeatRecord) {
    lifecycleMismatch('Cursor heartbeat', 'record', 'fresh matching heartbeat', null);
  }
  const heartbeat = assertHeartbeat(heartbeatRecord, identity, supervisor);
  if (requireAlive && !isAlive(supervisor.supervisor_pid)) {
    fail('parallel_cursor_supervisor_lost', 'Cursor worker supervisor exited without completion evidence');
  }
  return { supervisor, heartbeat };
}

async function readValidatedCompletion(loaded) {
  const completion = await readJsonIfPresent(loaded.paths.completion);
  if (!completion) return null;
  const identity = operationIdentity(loaded);
  assertCompletion(completion, identity);
  const supervisorRecord = await readJsonIfPresent(loaded.paths.supervisor);
  if (!supervisorRecord) {
    lifecycleMismatch('Cursor completion', 'supervisor', 'matching supervisor record', null);
  }
  const supervisor = assertSupervisor(supervisorRecord, identity);
  for (const field of ['agent_id', 'supervisor_pid', 'supervisor_token']) {
    if (completion[field] !== supervisor[field]) {
      lifecycleMismatch('Cursor completion', field, supervisor[field], completion[field]);
    }
  }
  return completion;
}

async function pollArtifacts(loaded, supervisor, timeoutMs, isInterrupted = () => false) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (isInterrupted()) fail('parallel_runtime_interrupted', 'Cursor worker observation interrupted');
    const completion = await readValidatedCompletion(loaded);
    if (completion) return { kind: 'completion', value: completion };
    const handshake = await readJsonIfPresent(loaded.paths.handshake);
    if (handshake) {
      return {
        kind: 'handshake',
        value: assertHandshake(handshake, operationIdentity(loaded), supervisor),
      };
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  return null;
}

async function pollCompletion(loaded, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const completion = await readValidatedCompletion(loaded);
    if (completion) return completion;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  return null;
}

async function requestCancellation(loaded, supervisor, reason) {
  const identity = operationIdentity(loaded);
  await writeJsonAtomic(loaded.paths.cancel, {
    schema: CURSOR_CANCEL_SCHEMA,
    worker_id: identity.worker_id,
    operation_digest: identity.operation_digest,
    operation_path: identity.operation_path,
    heartbeat_path: identity.heartbeat_path,
    cwd: identity.cwd,
    model: identity.model,
    agent_id: supervisor.agent_id,
    supervisor_pid: supervisor.supervisor_pid,
    supervisor_token: supervisor.supervisor_token,
    reason,
    requested_at: new Date().toISOString(),
  });
}

function capabilityError(capabilities) {
  return new CursorRuntimeError(
    'parallel_runtime_capability_unavailable',
    `Cursor runtime is missing required capabilities: ${capabilities.missing_capabilities.join(', ')}`,
    { missing_capabilities: capabilities.missing_capabilities, capabilities },
  );
}

async function acquireStartLock(loaded) {
  try {
    const handle = await open(loaded.paths.startLock, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({
      schema: 'loopx.cursor-worker-start-lock.v1',
      worker_id: loaded.operation.worker_id,
      operation_digest: loaded.operationDigest,
      controller_pid: process.pid,
      acquired_at: new Date().toISOString(),
    }, null, 2)}\n`);
    return handle;
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }
}

async function observeConcurrentStart(loaded, timeoutMs, isInterrupted) {
  const identity = operationIdentity(loaded);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (isInterrupted()) fail('parallel_runtime_interrupted', 'Cursor worker start observation interrupted');
    const completion = await readValidatedCompletion(loaded);
    if (completion) {
      if (completion.status === 'success') return completion;
      if (completion.status === 'interrupted') {
        fail('parallel_runtime_interrupted', 'Cursor worker was interrupted', completion);
      }
      fail('parallel_cursor_worker_failed', 'Cursor worker failed during concurrent start', completion);
    }
    const supervisorRecord = await readJsonIfPresent(loaded.paths.supervisor);
    if (supervisorRecord) {
      const supervisor = assertSupervisor(supervisorRecord, identity);
      const heartbeat = await readJsonIfPresent(loaded.paths.heartbeat);
      if (heartbeat) {
        assertHeartbeat(heartbeat, identity, supervisor);
        const handshake = await readJsonIfPresent(loaded.paths.handshake);
        if (handshake) return assertHandshake(handshake, identity, supervisor);
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  fail('parallel_cursor_start_timeout', 'timed out observing the concurrent Cursor start');
}

export async function startCursorWorker({ operationPath, env = process.env, isInterrupted = () => false }) {
  const loaded = await loadOperation(operationPath);
  const lock = await acquireStartLock(loaded);
  if (!lock) {
    return observeConcurrentStart(
      loaded,
      Math.min(loaded.operation.startup_timeout_ms || 30_000, loaded.operation.timeout_ms),
      isInterrupted,
    );
  }
  try {
    return await startCursorWorkerLocked({
      operationPath,
      expectedDigest: loaded.operationDigest,
      env,
      isInterrupted,
    });
  } finally {
    await lock.close();
    await unlink(loaded.paths.startLock).catch(() => {});
  }
}

async function startCursorWorkerLocked({ operationPath, expectedDigest, env, isInterrupted }) {
  const loaded = await loadOperation(operationPath);
  if (loaded.operationDigest !== expectedDigest) {
    lifecycleMismatch('Cursor operation', 'operation_digest', expectedDigest, loaded.operationDigest);
  }
  const identity = operationIdentity(loaded);
  const existingCompletion = await readValidatedCompletion(loaded);
  if (existingCompletion) {
    if (existingCompletion.status === 'success') return existingCompletion;
    if (existingCompletion.status === 'interrupted') {
      fail('parallel_runtime_interrupted', 'Cursor worker was interrupted', existingCompletion);
    }
    fail('parallel_cursor_worker_failed', 'Cursor worker has terminal failure evidence', existingCompletion);
  }
  const existingSupervisor = await readJsonIfPresent(loaded.paths.supervisor);
  const existingHandshake = await readJsonIfPresent(loaded.paths.handshake);
  const existingHeartbeat = await readJsonIfPresent(loaded.paths.heartbeat);
  const existingCancel = await readJsonIfPresent(loaded.paths.cancel);
  if (existingSupervisor) {
    const active = await readActiveSupervisor(loaded);
    if (existingHandshake) return assertHandshake(existingHandshake, identity, active.supervisor);
    const observed = await pollArtifacts(
      loaded,
      active.supervisor,
      Math.min(loaded.operation.startup_timeout_ms || 30_000, loaded.operation.timeout_ms),
      isInterrupted,
    );
    if (!observed) {
      fail('parallel_cursor_start_timeout', 'Cursor worker did not emit a verified init event before startup timeout');
    }
    if (observed.kind === 'completion') {
      if (observed.value.status === 'success') return observed.value;
      if (observed.value.status === 'interrupted') {
        fail('parallel_runtime_interrupted', 'Cursor worker was interrupted before startup completed', observed.value);
      }
      fail('parallel_cursor_worker_failed', 'Cursor worker failed before startup completed', observed.value);
    }
    return observed.value;
  }
  if (existingHandshake || existingHeartbeat || existingCancel) {
    fail('parallel_cursor_resume_identity_mismatch', 'stale Cursor worker lifecycle artifacts require explicit cleanup');
  }

  const capabilities = await inspectCursorRuntime({
    agentPath: loaded.operation.agent_path,
    cwd: loaded.workspace,
    env,
  });
  if (!capabilities.ready) throw capabilityError(capabilities);
  const prepared = await prepareOperation(operationPath);
  prepared.prepared.agent_path = capabilities.agent_path;
  prepared.prepared.cli_version = capabilities.cli_version;
  await writeJsonAtomic(prepared.paths.prepared, prepared.prepared);
  const chat = await execCursor(
    capabilities.agent_path,
    ['--workspace', prepared.workspace, 'create-chat'],
    { cwd: prepared.workspace, env },
  );
  const agentId = chat.stdout.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,}$/.test(agentId)) {
    fail('parallel_cursor_protocol_invalid', 'Cursor create-chat returned an invalid session id');
  }

  const runner = fileURLToPath(import.meta.url);
  const supervisorToken = randomUUID();
  const supervisor = spawn(process.execPath, [
    runner,
    'supervise',
    resolve(operationPath),
    agentId,
    supervisorToken,
    loaded.operationDigest,
  ], {
    cwd: prepared.workspace,
    env: mergedEnv(env),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      supervisor.once('spawn', resolvePromise);
      supervisor.once('error', rejectPromise);
    });
  } catch (error) {
    fail('parallel_cursor_supervisor_start_failed', 'failed to start the Cursor worker supervisor', {
      message: error.message,
    });
  }
  supervisor.unref();
  const supervisorRecord = {
    schema: CURSOR_SUPERVISOR_SCHEMA,
    worker_id: prepared.operation.worker_id,
    operation_digest: loaded.operationDigest,
    agent_id: agentId,
    supervisor_pid: supervisor.pid,
    supervisor_token: supervisorToken,
    runtime: 'cursor',
    operation_path: loaded.operationPath,
    heartbeat_path: loaded.paths.heartbeat,
    cwd: prepared.workspace,
    model: prepared.operation.model,
    requested_model: prepared.operation.model,
    report_path: prepared.prepared.retained_paths.report
      || Object.values(prepared.prepared.retained_paths)[0],
    cli_version: capabilities.cli_version,
    agent_path: capabilities.agent_path,
    started_at: new Date().toISOString(),
  };
  await writeJsonAtomic(prepared.paths.supervisor, supervisorRecord);

  let observed;
  try {
    observed = await pollArtifacts(
      loaded,
      supervisorRecord,
      Math.min(prepared.operation.startup_timeout_ms || 30_000, prepared.operation.timeout_ms),
      isInterrupted,
    );
  } catch (error) {
    await requestCancellation(loaded, supervisorRecord, 'controller_interrupted_during_start').catch(() => {});
    const completion = await pollCompletion(loaded, INTERRUPT_TIMEOUT_MS).catch(() => null);
    if (!completion) {
      fail('parallel_cursor_interrupt_timeout', 'Cursor supervisor did not retain terminal cancellation evidence');
    }
    throw error;
  }
  if (!observed) {
    await requestCancellation(loaded, supervisorRecord, 'startup_timeout');
    const completion = await pollCompletion(loaded, INTERRUPT_TIMEOUT_MS).catch(() => null);
    if (!completion) {
      fail('parallel_cursor_interrupt_timeout', 'Cursor supervisor did not retain terminal cancellation evidence');
    }
    fail('parallel_cursor_start_timeout', 'Cursor worker did not emit a verified init event before startup timeout');
  }
  if (observed.kind === 'completion') {
    if (observed.value.status === 'success') return observed.value;
    if (observed.value.status === 'interrupted') {
      fail('parallel_runtime_interrupted', 'Cursor worker was interrupted before startup completed', observed.value);
    }
    fail('parallel_cursor_worker_failed', 'Cursor worker failed before startup completed', observed.value);
  }
  return observed.value;
}

export async function waitCursorWorker({
  operationPath,
  timeoutMs = 30_000,
  isInterrupted = () => false,
}) {
  const loaded = await loadOperation(operationPath);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (isInterrupted()) {
      await interruptCursorWorker({ operationPath });
      fail('parallel_runtime_interrupted', 'Cursor worker observation interrupted');
    }
    const completion = await readValidatedCompletion(loaded);
    if (completion) {
      if (completion.status === 'success') return completion;
      if (completion.status === 'interrupted') {
        fail('parallel_runtime_interrupted', 'Cursor worker was interrupted', completion);
      }
      fail('parallel_cursor_worker_failed', 'Cursor worker failed', completion);
    }
    try {
      await readActiveSupervisor(loaded);
    } catch (error) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      const finalCompletion = await readValidatedCompletion(loaded);
      if (finalCompletion) {
        if (finalCompletion.status === 'success') return finalCompletion;
        if (finalCompletion.status === 'interrupted') {
          fail('parallel_runtime_interrupted', 'Cursor worker was interrupted', finalCompletion);
        }
        fail('parallel_cursor_worker_failed', 'Cursor worker failed', finalCompletion);
      }
      throw error;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await new Promise((resolvePromise) => {
        setTimeout(resolvePromise, Math.min(WAIT_POLL_INTERVAL_MS, remainingMs));
      });
    }
  }
  const { supervisor } = await readActiveSupervisor(loaded);
  return {
    status: 'running',
    worker_id: supervisor?.worker_id || null,
    agent_id: supervisor?.agent_id || null,
    supervisor_pid: supervisor?.supervisor_pid || null,
    operation_digest: supervisor?.operation_digest || null,
  };
}

export async function interruptCursorWorker({ operationPath }) {
  const loaded = await loadOperation(operationPath);
  const completion = await readValidatedCompletion(loaded);
  if (completion) return completion;
  const { supervisor } = await readActiveSupervisor(loaded);
  await requestCancellation(loaded, supervisor, 'controller_interrupt');
  const interrupted = await pollCompletion(loaded, INTERRUPT_TIMEOUT_MS);
  if (!interrupted) {
    fail('parallel_cursor_interrupt_timeout', 'Cursor supervisor did not retain terminal cancellation evidence');
  }
  return interrupted;
}

async function retainOutputs(prepared) {
  const retained = {};
  const currentExchangeRoot = await realpath(prepared.exchange);
  if (currentExchangeRoot !== prepared.exchange_root) {
    fail('parallel_cursor_artifact_invalid', 'worker exchange directory changed or became a symlink', {
      expected: prepared.exchange_root,
      observed: currentExchangeRoot,
    });
  }
  for (const [name, source] of Object.entries(prepared.output_paths)) {
    const required = prepared.required_outputs[name];
    try {
      const metadata = await assertRegularFile(source, `output ${name}`, { nonempty: required });
      const canonicalSource = await realpath(source);
      const child = relative(prepared.exchange_root, canonicalSource);
      if (child === '' || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
        fail('parallel_cursor_artifact_invalid', `output ${name} escapes the canonical worker exchange directory`, {
          exchange_root: prepared.exchange_root,
          source,
          canonical_source: canonicalSource,
        });
      }
      const destination = prepared.retained_paths[name];
      const canonicalDestination = join(await realpath(dirname(destination)), basename(destination));
      if (canonicalDestination !== destination) {
        fail('parallel_cursor_artifact_invalid', `retained output ${name} directory changed or became a symlink`);
      }
      const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
      await mkdir(dirname(destination), { recursive: true });
      try {
        await copyFile(source, temporary);
        await chmod(temporary, 0o600).catch(() => {});
        await rename(temporary, destination);
      } finally {
        await unlink(temporary).catch(() => {});
      }
      retained[name] = {
        path: destination,
        sha256: await sha256(destination),
        size: metadata.size,
      };
    } catch (error) {
      if (!required && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return retained;
}

async function waitForSupervisorRecord(loaded, agentId, supervisorToken) {
  const identity = operationIdentity(loaded);
  const deadline = Date.now() + 5_000;
  while (Date.now() <= deadline) {
    const record = await readJsonIfPresent(loaded.paths.supervisor);
    if (record) {
      const supervisor = assertSupervisor(record, identity);
      const expected = {
        agent_id: agentId,
        supervisor_pid: process.pid,
        supervisor_token: supervisorToken,
      };
      for (const [field, value] of Object.entries(expected)) {
        if (supervisor[field] !== value) {
          lifecycleMismatch('Cursor supervisor', field, value, supervisor[field]);
        }
      }
      return supervisor;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  fail('parallel_cursor_supervisor_lost', 'Cursor supervisor record was not initialized');
}

async function terminateOwnedProcessTree(child, { force = false } = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        timeout: 10_000,
      });
    } catch (error) {
      if (isAlive(child.pid)) {
        throw new CursorRuntimeError(
          'parallel_cursor_interrupt_failed',
          'failed to terminate the Cursor worker process tree',
          { process_id: child.pid, message: error.message },
        );
      }
    }
    return;
  }
  try {
    process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function supervise(operationPath, agentId, supervisorToken, expectedDigest, env = process.env) {
  const loaded = await loadOperation(operationPath);
  if (loaded.operationDigest !== expectedDigest) {
    lifecycleMismatch('Cursor operation', 'operation_digest', expectedDigest, loaded.operationDigest);
  }
  const identity = operationIdentity(loaded);
  const prepared = assertPrepared(await readOwnerJson(loaded.paths.prepared), identity);
  const supervisor = await waitForSupervisorRecord(loaded, agentId, supervisorToken);
  const startedAt = supervisor.started_at;
  let child = null;
  let interrupted = false;
  let timedOut = false;
  let init = null;
  let terminal = null;
  let stderrBytes = 0;
  let failure = null;
  let hardKillTimer = null;
  let timeoutTimer = null;
  let monitorTimer = null;
  let monitorPromise = Promise.resolve();
  let terminationPromise = null;
  let lastHeartbeatAt = 0;

  const stopChild = () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    if (!terminationPromise) {
      terminationPromise = terminateOwnedProcessTree(child).catch((error) => {
        failure ||= error;
      });
    }
    if (process.platform !== 'win32' && !hardKillTimer) {
      hardKillTimer = setTimeout(() => {
        if (child && child.exitCode === null && child.signalCode === null) {
          void terminateOwnedProcessTree(child, { force: true }).catch((error) => {
            failure ||= error;
          });
        }
      }, 2_000);
      hardKillTimer.unref();
    }
    return terminationPromise;
  };
  const interrupt = () => {
    interrupted = true;
    void stopChild();
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  try {
    const writeHeartbeat = async () => {
      await assertCurrentOperationDigest(operationPath, identity.operation_digest);
      await writeJsonAtomic(loaded.paths.heartbeat, {
        schema: CURSOR_HEARTBEAT_SCHEMA,
        status: 'running',
        worker_id: identity.worker_id,
        operation_digest: identity.operation_digest,
        operation_path: identity.operation_path,
        heartbeat_path: identity.heartbeat_path,
        agent_id: supervisor.agent_id,
        supervisor_pid: supervisor.supervisor_pid,
        supervisor_token: supervisor.supervisor_token,
        cwd: identity.cwd,
        model: identity.model,
        updated_at: new Date().toISOString(),
      });
      lastHeartbeatAt = Date.now();
    };
    const monitorLifecycle = async () => {
      if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) await writeHeartbeat();
      const cancellation = await readJsonIfPresent(loaded.paths.cancel);
      if (cancellation && !interrupted) {
        assertCancel(cancellation, identity, supervisor);
        interrupted = true;
        await stopChild();
      }
    };
    const scheduleMonitor = () => {
      monitorPromise = monitorPromise.then(monitorLifecycle).catch((error) => {
        failure ||= error;
        void stopChild();
      });
    };
    await monitorLifecycle();
    if (interrupted) fail('parallel_runtime_interrupted', 'Cursor worker was interrupted before launch');
    monitorTimer = setInterval(scheduleMonitor, CANCEL_POLL_MS);
    monitorTimer.unref();

    const args = [
      '--resume', agentId,
      '--workspace', prepared.workspace,
      '--model', prepared.model,
      '--print',
      '--force',
      '--trust',
      '--output-format', 'stream-json',
      '--sandbox', 'enabled',
    ];
    const invocation = cursorInvocation(prepared.agent_path, args, env);
    child = spawn(invocation.file, invocation.args, {
      cwd: prepared.workspace,
      env: invocation.env,
      detached: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      void stopChild();
    }, prepared.timeout_ms);
    timeoutTimer.unref();

    let buffer = '';
    const consumeLine = async (rawLine) => {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line) return;
      if (Buffer.byteLength(line) > MAX_EVENT_LINE_BYTES) {
        fail('parallel_cursor_protocol_invalid', 'Cursor stream event exceeds the maximum line size');
      }
      const event = parseJson(line, 'Cursor stream event');
      await appendFile(loaded.paths.events, `${line}\n`);
      if (!init) {
        if (event.type !== 'system' || event.subtype !== 'init') {
          fail('parallel_cursor_protocol_invalid', 'Cursor stream must begin with system/init');
        }
        const observedCwd = await realpath(resolve(event.cwd));
        if (observedCwd !== prepared.workspace || event.session_id !== agentId
          || typeof event.model !== 'string' || event.model.length === 0) {
          fail('parallel_cursor_identity_mismatch', 'Cursor system/init identity does not match the reservation', {
            expected: { cwd: prepared.workspace, session_id: agentId, requested_model: prepared.model },
            observed: { cwd: observedCwd, session_id: event.session_id, model: event.model },
          });
        }
        init = event;
        await writeJsonAtomic(loaded.paths.handshake, {
          schema: CURSOR_HANDSHAKE_SCHEMA,
          status: 'running',
          worker_id: prepared.worker_id,
          operation_digest: identity.operation_digest,
          agent_id: agentId,
          supervisor_pid: supervisor.supervisor_pid,
          supervisor_token: supervisor.supervisor_token,
          process_id: child.pid,
          runtime: 'cursor',
          operation_path: loaded.operationPath,
          heartbeat_path: loaded.paths.heartbeat,
          cwd: prepared.workspace,
          model: event.model,
          requested_model: prepared.model,
          observed_model: event.model,
          cli_version: supervisor.cli_version,
          agent_path: supervisor.agent_path,
          report_path: prepared.retained_paths.report || Object.values(prepared.retained_paths)[0],
          report_paths: prepared.retained_paths,
          started_at: startedAt,
        });
        return;
      }
      if (event.session_id && event.session_id !== agentId) {
        fail('parallel_cursor_identity_mismatch', 'Cursor stream changed session id');
      }
      if (terminal) {
        fail('parallel_cursor_protocol_invalid', 'Cursor stream emitted an event after terminal result');
      }
      if (event.type === 'system' && event.subtype === 'init') {
        fail('parallel_cursor_protocol_invalid', 'Cursor stream emitted duplicate system/init');
      }
      if (event.type === 'result') {
        if (terminal) fail('parallel_cursor_protocol_invalid', 'Cursor stream emitted duplicate terminal result');
        terminal = event;
      }
    };

    let queue = Promise.resolve();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_EVENT_LINE_BYTES) {
        failure ||= new CursorRuntimeError(
          'parallel_cursor_protocol_invalid',
          'Cursor stream buffered an oversized unterminated event',
        );
        void stopChild();
        return;
      }
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        queue = queue.then(() => consumeLine(line)).catch((error) => {
          failure ||= error;
          void stopChild();
        });
      }
    });
    child.stderr.on('data', (chunk) => {
      if (stderrBytes >= MAX_STDERR_BYTES) return;
      const slice = chunk.subarray(0, MAX_STDERR_BYTES - stderrBytes);
      stderrBytes += slice.length;
      void appendFile(loaded.paths.stderr, slice).catch((error) => {
        failure ||= error;
        void stopChild();
      });
    });
    child.stdin.on('error', (error) => {
      failure ||= error;
      void stopChild();
    });
    child.stdin.end(prepared.prompt);

    const exit = await new Promise((resolvePromise, rejectPromise) => {
      child.once('error', rejectPromise);
      child.once('close', (code, signal) => resolvePromise({ code, signal }));
    });
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
    if (buffer) queue = queue.then(() => consumeLine(buffer));
    await queue;
    await monitorPromise;
    if (failure) throw failure;
    if (interrupted) fail('parallel_runtime_interrupted', 'Cursor worker was interrupted');
    if (timedOut) fail('parallel_cursor_worker_timeout', 'Cursor worker exceeded its timeout');
    if (exit.code !== 0) {
      fail('parallel_cursor_worker_failed', `Cursor worker exited nonzero: ${exit.code}`, {
        exit_code: exit.code,
        signal: exit.signal,
      });
    }
    if (!init || !terminal || terminal.subtype !== 'success' || terminal.is_error === true
      || terminal.session_id !== agentId) {
      fail('parallel_cursor_protocol_invalid', 'Cursor worker did not emit a valid terminal success result');
    }
    for (const [name, path] of Object.entries(prepared.input_paths)) {
      if (await sha256(path) !== prepared.input_hashes[name]) {
        fail('parallel_cursor_input_mutation', `Cursor worker mutated controller input: ${name}`);
      }
    }
    await assertCurrentOperationDigest(operationPath, identity.operation_digest);
    await assertGitIdentity(prepared.workspace, prepared.git_identity);
    const outputs = await retainOutputs(prepared);
    await monitorPromise;
    if (failure) throw failure;
    const completion = {
      schema: CURSOR_COMPLETION_SCHEMA,
      status: 'success',
      worker_id: prepared.worker_id,
      operation_digest: identity.operation_digest,
      agent_id: agentId,
      supervisor_pid: supervisor.supervisor_pid,
      supervisor_token: supervisor.supervisor_token,
      process_id: child.pid,
      runtime: 'cursor',
      operation_path: loaded.operationPath,
      heartbeat_path: loaded.paths.heartbeat,
      cwd: prepared.workspace,
      model: init.model,
      requested_model: prepared.model,
      observed_model: init.model,
      cli_version: supervisor.cli_version,
      agent_path: supervisor.agent_path,
      report_path: prepared.retained_paths.report || Object.values(prepared.retained_paths)[0],
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      exit_code: exit.code,
      signal: exit.signal,
      terminal_result: terminal,
      events_path: loaded.paths.events,
      stderr_path: loaded.paths.stderr,
      outputs,
    };
    await writeJsonAtomic(loaded.paths.completion, completion);
    return completion;
  } catch (error) {
    await stopChild();
    const completion = {
      schema: CURSOR_COMPLETION_SCHEMA,
      status: interrupted || error.code === 'parallel_runtime_interrupted' ? 'interrupted' : 'failed',
      worker_id: prepared.worker_id,
      operation_digest: identity.operation_digest,
      agent_id: agentId,
      supervisor_pid: supervisor.supervisor_pid,
      supervisor_token: supervisor.supervisor_token,
      process_id: child?.pid || null,
      runtime: 'cursor',
      operation_path: loaded.operationPath,
      heartbeat_path: loaded.paths.heartbeat,
      cwd: prepared.workspace,
      model: init?.model || prepared.model,
      requested_model: prepared.model,
      observed_model: init?.model || null,
      cli_version: supervisor.cli_version,
      agent_path: supervisor.agent_path,
      report_path: prepared.retained_paths.report || Object.values(prepared.retained_paths)[0],
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      error: {
        code: error.code || 'parallel_cursor_worker_failed',
        message: error.message || String(error),
        details: error.details || null,
      },
      terminal_result: terminal,
      events_path: loaded.paths.events,
      stderr_path: loaded.paths.stderr,
    };
    await writeJsonAtomic(loaded.paths.completion, completion);
    return completion;
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (monitorTimer) clearInterval(monitorTimer);
    if (hardKillTimer) clearTimeout(hardKillTimer);
    await monitorPromise;
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
  && process.argv[2] === 'supervise') {
  const completion = await supervise(
    process.argv[3],
    process.argv[4],
    process.argv[5],
    process.argv[6],
    process.env,
  );
  process.exitCode = completion.status === 'success' ? 0 : 1;
}
