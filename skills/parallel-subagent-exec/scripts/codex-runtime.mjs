import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  appendFile,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CODEX_OPERATION_SCHEMA = 'loopx.codex-worker-operation.v1';
const CODEX_CAPABILITY_SCHEMA = 'loopx.codex-runtime-capabilities.v1';
const CODEX_RUNNING_SCHEMA = 'loopx.codex-worker-running.v1';
const CODEX_HANDSHAKE_SCHEMA = 'loopx.codex-worker-handshake.v1';
const CODEX_CANCEL_SCHEMA = 'loopx.codex-worker-cancel.v1';
const CODEX_COMPLETION_SCHEMA = 'loopx.codex-worker-completion.v1';
const EXACT_LEAF = 'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.';
const MAX_STDERR_BYTES = 256 * 1024;
const MAX_EVENT_LINE_BYTES = 4 * 1024 * 1024;
const TERMINATE_GRACE_MS = 750;
const ACTIVE = new Map();
const SKILL_PATH = fileURLToPath(new URL('../SKILL.md', import.meta.url));

export class CodexRuntimeError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'CodexRuntimeError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CodexRuntimeError(code, message, details);
}

function mergedEnv(env) {
  return { ...process.env, ...(env || {}) };
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    fail('parallel_codex_protocol_invalid', `${label} is not valid JSON`);
  }
}

function digestJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function codexConfigFingerprint(env) {
  const home = resolve(env.CODEX_HOME || join(homedir(), '.codex'));
  const configPath = join(home, 'config.toml');
  let configSha256 = null;
  try {
    await assertRegularFile(configPath, 'Codex config');
    configSha256 = await sha256File(configPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const providerEnvironment = {};
  for (const name of [
    'OPENAI_BASE_URL',
    'OPENAI_API_BASE',
    'OPENAI_API_TYPE',
    'OPENAI_API_VERSION',
    'OPENAI_ORGANIZATION',
    'OPENAI_PROJECT',
    'AZURE_OPENAI_ENDPOINT',
  ]) {
    if (env[name]) providerEnvironment[name] = String(env[name]);
  }
  return digestJson({
    codex_home: home,
    config_sha256: configSha256,
    provider_environment: providerEnvironment,
  });
}

async function writeJsonAtomic(path, value) {
  const absolute = resolve(path);
  const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600).catch(() => {});
    await rename(temporary, absolute);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function assertRegularFile(path, label, { nonempty = false, ownerOnly = false } = {}) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail('parallel_codex_artifact_invalid', `${label} must be a regular non-symlink file: ${path}`);
  }
  if (nonempty && metadata.size === 0) {
    fail('parallel_codex_artifact_invalid', `${label} must not be empty: ${path}`);
  }
  if (ownerOnly && process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    fail('parallel_codex_operation_invalid', `${label} must be owner-only (0600): ${path}`);
  }
  return metadata;
}

async function readOwnerJson(path) {
  await assertRegularFile(path, 'controller JSON', { ownerOnly: true });
  return parseJson(await readFile(path, 'utf8'), path);
}

function isPathInside(root, candidate) {
  const child = relative(root, candidate);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`));
}

function assertOutsideWorkspace(path, workspace, label) {
  if (isPathInside(workspace, path)) {
    fail('parallel_codex_operation_invalid', `${label} must remain outside the worker workspace`, {
      path,
      workspace,
    });
  }
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

async function resolveCodexPath(codexPath, cwd, env) {
  let candidates;
  const requested = codexPath || env.LOOPX_CODEX_BIN || 'codex';
  if (isAbsolute(requested) || requested.includes('/') || requested.includes('\\')) {
    candidates = [resolve(cwd, requested)];
  } else {
    candidates = await pathCandidates(requested, env);
  }
  for (const candidate of [...new Set(candidates)]) {
    if (await isExecutable(candidate)) return realpath(candidate);
  }
  return null;
}

function codexInvocation(path, args, env) {
  const commandEnv = mergedEnv(env);
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(path)) {
    return { file: path, args, env: commandEnv };
  }
  if (args.some((value) => /["\r\n]/.test(String(value)))) {
    fail('parallel_codex_operation_invalid', 'Codex batch-wrapper arguments contain unsupported characters');
  }
  const prefix = `LOOPX_CODEX_ARG_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  commandEnv[`${prefix}_BIN`] = path;
  const references = args.map((value, index) => {
    const name = `${prefix}_${index}`;
    commandEnv[name] = String(value);
    return `"%${name}%"`;
  });
  return {
    file: commandEnv.ComSpec || commandEnv.COMSPEC || 'cmd.exe',
    args: ['/d', '/s', '/v:off', '/c', `""%${prefix}_BIN%" ${references.join(' ')}"`],
    env: commandEnv,
  };
}

async function execCodex(path, args, { cwd, env, timeout = 15_000 } = {}) {
  const invocation = codexInvocation(path, args, env);
  try {
    return await execFileAsync(invocation.file, invocation.args, {
      cwd,
      env: invocation.env,
      timeout,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    throw new CodexRuntimeError(
      'parallel_codex_command_failed',
      `Codex CLI command failed: ${args.join(' ')}`,
      {
        exit_code: error.code ?? null,
        stderr: String(error.stderr || error.message || '').slice(0, MAX_STDERR_BYTES),
      },
    );
  }
}

function hasFlag(help, shortFlag, longFlag) {
  return help.includes(longFlag) || new RegExp(`(^|\\s)${shortFlag.replace('-', '\\-')}(?:,|\\s)`, 'm').test(help);
}

export async function inspectCodexRuntime({
  codexPath = null,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const absoluteCwd = await realpath(resolve(cwd));
  const skillSourceSha256 = createHash('sha256').update(await readFile(SKILL_PATH)).digest('hex');
  const generatedAt = new Date().toISOString();
  const commandEnv = mergedEnv(env);
  const codexHomeConfigFingerprint = await codexConfigFingerprint(commandEnv);
  const resolvedPath = await resolveCodexPath(codexPath, absoluteCwd, commandEnv);
  if (!resolvedPath) {
    return {
      schema: CODEX_CAPABILITY_SCHEMA,
      runtime: 'codex',
      adapter: 'codex-agent-cli',
      ready: false,
      missing_capabilities: ['codex-cli'],
      workspace_root: absoluteCwd,
      skill_source_sha256: skillSourceSha256,
      codex_home_config_fingerprint: codexHomeConfigFingerprint,
      generated_at: generatedAt,
      capabilities: {},
    };
  }

  let version = '';
  let rootHelp = '';
  let execHelp = '';
  let authenticated = false;
  try {
    version = (await execCodex(resolvedPath, ['--version'], { cwd: absoluteCwd, env: commandEnv })).stdout.trim();
  } catch {
    version = '';
  }
  try {
    rootHelp = (await execCodex(resolvedPath, ['--help'], { cwd: absoluteCwd, env: commandEnv })).stdout;
  } catch {
    rootHelp = '';
  }
  try {
    execHelp = (await execCodex(resolvedPath, ['exec', '--help'], { cwd: absoluteCwd, env: commandEnv })).stdout;
  } catch {
    execHelp = '';
  }
  try {
    const login = await execCodex(resolvedPath, ['login', 'status'], { cwd: absoluteCwd, env: commandEnv });
    const loginText = `${login.stdout}\n${login.stderr}`;
    authenticated = !/not\s+logged\s+in|logged\s+out/i.test(loginText) && /logged\s+in/i.test(loginText);
  } catch {
    authenticated = false;
  }

  const match = version.match(/^codex-cli\s+([^\s]+)$/m);
  const capabilities = {
    create: Boolean(match && execHelp),
    explicit_model: hasFlag(rootHelp, '-m', '--model'),
    explicit_cwd: hasFlag(rootHelp, '-C', '--cd'),
    workspace_sandbox: hasFlag(rootHelp, '-s', '--sandbox'),
    approval_never: hasFlag(rootHelp, '-a', '--ask-for-approval'),
    disable_multi_agent: rootHelp.includes('--disable'),
    ignore_rules: execHelp.includes('--ignore-rules'),
    structured_events: execHelp.includes('--json'),
    output_report: execHelp.includes('--output-last-message') || hasFlag(execHelp, '-o', '--output-last-message'),
    observe: execHelp.includes('--json')
      && (execHelp.includes('--output-last-message') || hasFlag(execHelp, '-o', '--output-last-message')),
    interrupt: process.platform !== 'win32',
  };
  const missing = [];
  if (!match) missing.push('codex-cli-version');
  if (!authenticated) missing.push('codex-authenticated');
  if (!capabilities.create) missing.push('create');
  if (!capabilities.explicit_model) missing.push('create-with-explicit-model');
  if (!capabilities.explicit_cwd) missing.push('create-with-explicit-cwd');
  if (!capabilities.workspace_sandbox) missing.push('workspace-sandbox');
  if (!capabilities.approval_never) missing.push('approval-never');
  if (!capabilities.disable_multi_agent) missing.push('disable-multi-agent');
  if (!capabilities.ignore_rules) missing.push('ignore-user-rules');
  if (!capabilities.structured_events) missing.push('structured-events');
  if (!capabilities.output_report) missing.push('output-report');
  if (!capabilities.interrupt) missing.push('durable-process-tree-ownership');

  return {
    schema: CODEX_CAPABILITY_SCHEMA,
    runtime: 'codex',
    adapter: 'codex-agent-cli',
    ready: missing.length === 0,
    missing_capabilities: [...new Set(missing)],
    agent_path: resolvedPath,
    cli_version: match?.[1] || null,
    authenticated,
    workspace_root: absoluteCwd,
    skill_source_sha256: skillSourceSha256,
    codex_home_config_fingerprint: codexHomeConfigFingerprint,
    generated_at: generatedAt,
    capabilities,
  };
}

function assertWorkerId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_024 || /[\0\r\n]/.test(value)) {
    fail('parallel_codex_operation_invalid', 'worker_id must be a bounded non-empty reservation id');
  }
  return value;
}

export function codexArtifactId(workerId) {
  return createHash('sha256').update(assertWorkerId(workerId)).digest('hex');
}

function assertAbsolutePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value) || !isAbsolute(value)) {
    fail('parallel_codex_operation_invalid', `${label} must be an absolute path`);
  }
  return value;
}

function artifactPaths(operationPath) {
  const control = dirname(resolve(operationPath));
  return {
    control,
    running: join(control, 'running.json'),
    handshake: join(control, 'handshake.json'),
    cancel: join(control, 'cancel.json'),
    events: join(control, 'events.ndjson'),
    stderr: join(control, 'stderr.log'),
    completion: join(control, 'completion.json'),
  };
}

async function loadOperation(operationPath) {
  const requestedOperationPath = resolve(operationPath);
  await assertRegularFile(requestedOperationPath, 'operation', { ownerOnly: true });
  const canonicalOperationPath = await realpath(requestedOperationPath);
  const operation = await readOwnerJson(canonicalOperationPath);
  if (operation?.schema !== CODEX_OPERATION_SCHEMA) {
    fail('parallel_codex_operation_invalid', `operation schema must be ${CODEX_OPERATION_SCHEMA}`);
  }
  assertWorkerId(operation.worker_id);
  const roles = new Set(['implementation', 'fix', 'reconciliation', 'task_review', 'plan_review', 'final_review']);
  if (!roles.has(operation.role)) {
    fail('parallel_codex_operation_invalid', 'role must be a supported strict worker role');
  }
  assertAbsolutePath(operation.codex_path, 'codex_path');
  assertAbsolutePath(operation.workspace, 'workspace');
  assertAbsolutePath(operation.prompt_path, 'prompt_path');
  assertAbsolutePath(operation.report_path, 'report_path');
  assertAbsolutePath(operation.capability_path, 'capability_path');
  for (const field of ['capability_sha256', 'skill_source_sha256', 'codex_home_config_fingerprint']) {
    if (!/^[a-f0-9]{64}$/.test(operation[field] || '')) {
      fail('parallel_codex_operation_invalid', `${field} must be a lowercase SHA-256 digest`);
    }
  }
  if (typeof operation.expected_agent_path !== 'string' || !isAbsolute(operation.expected_agent_path)
    || typeof operation.expected_cli_version !== 'string' || operation.expected_cli_version.length === 0) {
    fail('parallel_codex_operation_invalid', 'expected Codex agent path and CLI version are required');
  }
  if (!/^[a-f0-9]{64}$/.test(operation.prompt_sha256 || '')) {
    fail('parallel_codex_operation_invalid', 'prompt_sha256 must be a lowercase SHA-256 digest');
  }
  if (typeof operation.model !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/.test(operation.model)
    || operation.model.toLowerCase() === 'auto') {
    fail('parallel_codex_operation_invalid', 'an explicit non-auto model is required');
  }
  if (!['workspace-write', 'read-only'].includes(operation.sandbox)) {
    fail('parallel_codex_operation_invalid', 'sandbox must be workspace-write or read-only; bypass is forbidden');
  }
  const expectedSandbox = ['implementation', 'fix', 'reconciliation'].includes(operation.role)
    ? 'workspace-write'
    : 'read-only';
  if (operation.sandbox !== expectedSandbox) {
    fail('parallel_codex_operation_invalid', `${operation.role} requires sandbox ${expectedSandbox}`);
  }
  if (!Array.isArray(operation.protected_worktrees) || !Array.isArray(operation.concurrent_worktrees)) {
    fail('parallel_codex_operation_invalid', 'protected_worktrees and concurrent_worktrees must be arrays');
  }
  if (!Number.isInteger(operation.timeout_ms) || operation.timeout_ms < 1) {
    fail('parallel_codex_operation_invalid', 'timeout_ms must be a positive integer');
  }

  const workspace = await realpath(resolve(operation.workspace));
  if (workspace !== resolve(operation.workspace)) {
    fail('parallel_codex_operation_invalid', 'workspace must be a canonical real path');
  }
  const workspaceMetadata = await lstat(workspace);
  if (!workspaceMetadata.isDirectory() || workspaceMetadata.isSymbolicLink()) {
    fail('parallel_codex_operation_invalid', 'workspace must be a real directory');
  }
  const promptPath = await realpath(resolve(operation.prompt_path));
  await assertRegularFile(promptPath, 'prompt', { ownerOnly: true });
  const prompt = await readFile(promptPath, 'utf8');
  const promptSha256 = createHash('sha256').update(prompt).digest('hex');
  if (promptSha256 !== operation.prompt_sha256) {
    fail('parallel_codex_operation_invalid', 'prompt content does not match prompt_sha256');
  }
  const paths = artifactPaths(canonicalOperationPath);
  const control = await realpath(paths.control);
  const capabilityPath = await realpath(resolve(operation.capability_path));
  await assertRegularFile(capabilityPath, 'capability artifact', { ownerOnly: true });
  if (await sha256File(capabilityPath) !== operation.capability_sha256) {
    fail('parallel_codex_capability_identity_mismatch', 'capability artifact does not match capability_sha256');
  }
  const capability = await readOwnerJson(capabilityPath);
  if (capability.schema !== CODEX_CAPABILITY_SCHEMA || capability.ready !== true) {
    fail('parallel_codex_capability_identity_mismatch', 'capability artifact is not a ready Codex capability');
  }
  const reportParent = await realpath(dirname(resolve(operation.report_path)));
  const reportPath = join(reportParent, resolve(operation.report_path).slice(resolve(dirname(operation.report_path)).length + 1));
  assertOutsideWorkspace(control, workspace, 'Codex controller directory');
  assertOutsideWorkspace(promptPath, workspace, 'prompt');
  assertOutsideWorkspace(capabilityPath, workspace, 'capability artifact');
  assertOutsideWorkspace(reportPath, workspace, 'report');
  const lifecyclePaths = new Set([
    canonicalOperationPath,
    paths.running,
    paths.handshake,
    paths.cancel,
    paths.events,
    paths.stderr,
    paths.completion,
  ]);
  if (lifecyclePaths.has(reportPath)) {
    fail('parallel_codex_operation_invalid', 'report_path cannot replace Codex lifecycle evidence');
  }
  const protectedWorktrees = [];
  for (const value of operation.protected_worktrees) {
    assertAbsolutePath(value, 'protected worktree');
    const path = await realpath(resolve(value));
    if (path !== resolve(value) || path === workspace || protectedWorktrees.includes(path)) {
      fail('parallel_codex_operation_invalid', 'protected_worktrees must be unique and exclude the active workspace');
    }
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      fail('parallel_codex_operation_invalid', 'protected worktree must be a real directory');
    }
    protectedWorktrees.push(path);
  }
  const concurrentWorktrees = [];
  for (const value of operation.concurrent_worktrees) {
    assertAbsolutePath(value, 'concurrent worktree');
    const path = await realpath(resolve(value));
    if (path !== resolve(value) || path === workspace || protectedWorktrees.includes(path)
      || concurrentWorktrees.includes(path)) {
      fail('parallel_codex_operation_invalid', 'concurrent_worktrees must be unique and disjoint from protected/active worktrees');
    }
    concurrentWorktrees.push(path);
  }
  const topologyWorktrees = await gitWorktreePaths(workspace);
  for (const path of concurrentWorktrees) {
    if (!topologyWorktrees.includes(path)) {
      fail('parallel_codex_operation_invalid', 'concurrent_worktrees must belong to the active Git worktree topology');
    }
  }
  const requiredProtected = topologyWorktrees
    .filter((path) => path !== workspace && !concurrentWorktrees.includes(path))
    .sort();
  if (JSON.stringify([...protectedWorktrees].sort()) !== JSON.stringify(requiredProtected)) {
    fail('parallel_codex_operation_invalid', 'protected_worktrees must exactly cover non-concurrent Git worktrees', {
      expected: requiredProtected,
      observed: [...protectedWorktrees].sort(),
    });
  }
  return {
    operation,
    operationPath: canonicalOperationPath,
    operationDigest: digestJson(operation),
    workspace,
    promptPath,
    prompt,
    capability,
    capabilityPath,
    protectedWorktrees,
    concurrentWorktrees,
    reportPath,
    paths,
  };
}

async function git(workspace, args) {
  try {
    return (await execFileAsync('git', args, {
      cwd: workspace,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    })).stdout;
  } catch (error) {
    fail('parallel_codex_git_identity_invalid', `git ${args.join(' ')} failed`, {
      stderr: String(error.stderr || error.message || '').slice(0, MAX_STDERR_BYTES),
    });
  }
}

async function gitWorktreePaths(workspace) {
  const output = await git(workspace, ['worktree', 'list', '--porcelain', '-z']);
  const paths = [];
  for (const record of output.split('\0\0').filter(Boolean)) {
    const field = record.split('\0').find((value) => value.startsWith('worktree '));
    if (!field) continue;
    const path = await realpath(field.slice('worktree '.length));
    if (!paths.includes(path)) paths.push(path);
  }
  if (!paths.includes(workspace)) {
    fail('parallel_codex_git_identity_invalid', 'active Codex workspace is absent from Git worktree topology');
  }
  return paths.sort();
}

async function gitIdentity(workspace) {
  const top = await realpath((await git(workspace, ['rev-parse', '--show-toplevel'])).trim());
  if (top !== workspace) {
    fail('parallel_codex_git_identity_invalid', 'Codex workspace is not the owned worktree root', {
      expected: workspace,
      observed: top,
    });
  }
  return {
    branch: (await git(workspace, ['symbolic-ref', '--quiet', 'HEAD'])).trim(),
    head: (await git(workspace, ['rev-parse', 'HEAD'])).trim(),
    index: createHash('sha256').update(await git(workspace, ['ls-files', '--stage', '-z'])).digest('hex'),
  };
}

async function assertGitIdentity(workspace, expected) {
  const observed = await gitIdentity(workspace);
  for (const field of ['branch', 'head', 'index']) {
    if (observed[field] !== expected[field]) {
      fail('parallel_codex_git_ownership_violation', `Codex worker changed controller-owned Git ${field}`, {
        field,
        expected: expected[field],
        observed: observed[field],
      });
    }
  }
}

async function worktreeContentSnapshot(workspace) {
  const identity = await gitIdentity(workspace);
  const trackedDiff = await git(workspace, ['diff', '--binary', '--no-ext-diff', '--', '.']);
  const untrackedNames = (await git(workspace, ['ls-files', '--others', '--exclude-standard', '-z']))
    .split('\0').filter(Boolean).sort();
  const untracked = [];
  for (const name of untrackedNames) {
    const path = resolve(workspace, name);
    if (!isPathInside(workspace, path)) {
      fail('parallel_codex_git_identity_invalid', 'untracked path escapes its worktree');
    }
    const metadata = await lstat(path);
    if (metadata.isFile()) {
      untracked.push({ name, type: 'file', mode: metadata.mode & 0o777, sha256: await sha256File(path) });
    } else if (metadata.isSymbolicLink()) {
      untracked.push({ name, type: 'symlink', target: await readlink(path) });
    } else {
      untracked.push({ name, type: 'other', mode: metadata.mode & 0o777 });
    }
  }
  const snapshot = {
    ...identity,
    tracked_diff_sha256: createHash('sha256').update(trackedDiff).digest('hex'),
    untracked,
  };
  return { ...snapshot, snapshot_sha256: digestJson(snapshot) };
}

async function assertWorktreeSnapshot(workspace, expected, code, label) {
  const observed = await worktreeContentSnapshot(workspace);
  if (observed.snapshot_sha256 !== expected.snapshot_sha256) {
    fail(code, `${label} content changed during Codex execution`, { expected, observed });
  }
}

function assertCapabilityIdentity(loaded, inspected) {
  const expected = {
    agent_path: loaded.operation.expected_agent_path,
    cli_version: loaded.operation.expected_cli_version,
    skill_source_sha256: loaded.operation.skill_source_sha256,
    codex_home_config_fingerprint: loaded.operation.codex_home_config_fingerprint,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (loaded.capability[field] !== value || inspected[field] !== value) {
      fail('parallel_codex_capability_identity_mismatch', `Codex capability ${field} changed`, {
        expected: value,
        artifact: loaded.capability[field] ?? null,
        observed: inspected[field] ?? null,
      });
    }
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

function baseEvidence(loaded, startedAt, processId) {
  return {
    worker_id: loaded.operation.worker_id,
    role: loaded.operation.role,
    operation_path: loaded.operationPath,
    operation_digest: loaded.operationDigest,
    capability_path: loaded.capabilityPath,
    capability_sha256: loaded.operation.capability_sha256,
    expected_agent_path: loaded.operation.expected_agent_path,
    expected_cli_version: loaded.operation.expected_cli_version,
    skill_source_sha256: loaded.operation.skill_source_sha256,
    codex_home_config_fingerprint: loaded.operation.codex_home_config_fingerprint,
    prompt_sha256: loaded.operation.prompt_sha256,
    protected_worktrees: [...loaded.protectedWorktrees],
    concurrent_worktrees: [...loaded.concurrentWorktrees],
    runtime: 'codex',
    runtime_adapter: 'codex-agent-cli',
    isolation_mode: 'strict-worktree',
    model_binding: 'explicit',
    process_id: processId,
    requested_model: loaded.operation.model,
    model: loaded.operation.model,
    observed_model: null,
    cwd: loaded.workspace,
    observed_cwd: null,
    evidence_source: 'explicit-cli-binding',
    model_evidence_source: 'explicit-cli-binding',
    cwd_evidence_source: 'explicit-cli-binding',
    report_path: loaded.reportPath,
    events_path: loaded.paths.events,
    completion_path: loaded.paths.completion,
    started_at: startedAt,
  };
}

function validateLifecycle(record, schema, loaded, label) {
  if (!record || record.schema !== schema
    || record.operation_path !== loaded.operationPath
    || record.operation_digest !== loaded.operationDigest
    || record.worker_id !== loaded.operation.worker_id) {
    fail('parallel_codex_resume_identity_mismatch', `${label} does not match the current operation`);
  }
  return record;
}

async function validateCompletionReport(completion, loaded) {
  if (!/^[a-f0-9]{64}$/.test(completion.report_sha256 || '')
    || !Number.isInteger(completion.report_size) || completion.report_size < 0) {
    fail('parallel_codex_artifact_invalid', 'Codex completion is missing immutable report evidence');
  }
  const metadata = await assertRegularFile(loaded.reportPath, 'Codex report');
  const observedSha256 = await sha256File(loaded.reportPath);
  if (metadata.size !== completion.report_size || observedSha256 !== completion.report_sha256) {
    fail('parallel_codex_artifact_invalid', 'Codex report no longer matches completion evidence', {
      expected: { sha256: completion.report_sha256, size: completion.report_size },
      observed: { sha256: observedSha256, size: metadata.size },
    });
  }
  return completion;
}

async function assertOperationDigest(loaded) {
  const observed = digestJson(await readOwnerJson(loaded.operationPath));
  if (observed !== loaded.operationDigest) {
    fail('parallel_codex_resume_identity_mismatch', 'Codex operation changed during execution');
  }
}

async function prepareReport(path) {
  const parent = await realpath(dirname(path));
  if (join(parent, path.slice(dirname(path).length + 1)) !== path) {
    fail('parallel_codex_artifact_invalid', 'report parent changed or contains a symlink');
  }
  const handle = await open(path, 'wx', 0o600).catch((error) => {
    if (error.code === 'EEXIST') {
      fail('parallel_codex_stale_artifact', `report already exists before dispatch: ${path}`);
    }
    throw error;
  });
  await handle.close();
}

async function validateReport(path) {
  const metadata = await assertRegularFile(path, 'Codex report', { nonempty: true });
  await chmod(path, 0o600).catch(() => {});
  const parent = await realpath(dirname(path));
  if (join(parent, path.slice(dirname(path).length + 1)) !== path) {
    fail('parallel_codex_artifact_invalid', 'report parent changed or contains a symlink');
  }
  return { report_sha256: await sha256File(path), report_size: metadata.size };
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function terminateOwnedProcessTree(child, { force = false } = {}) {
  if (!child?.pid) return;
  if (!force && (child.exitCode !== null || child.signalCode !== null)) return;
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill.exe', [
        '/PID', String(child.pid), '/T', ...(force ? ['/F'] : []),
      ], { windowsHide: true, timeout: 10_000 });
    } catch (error) {
      if (isAlive(child.pid) && force) {
        fail('parallel_codex_interrupt_failed', 'failed to terminate Codex process tree', {
          process_id: child.pid,
          message: error.message,
        });
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

function terminalKind(event) {
  if (event?.type === 'turn.completed') return 'success';
  if (event?.type === 'turn.failed') return 'failed';
  return null;
}

async function writeRunning(loaded, evidence) {
  await writeJsonAtomic(loaded.paths.running, {
    schema: CODEX_RUNNING_SCHEMA,
    status: 'running',
    ...evidence,
  });
}

export async function executeCodexOperation({
  operationPath,
  env = process.env,
  isInterrupted = () => false,
} = {}) {
  const loaded = await loadOperation(operationPath);
  if (ACTIVE.has(loaded.operationPath)) {
    fail('parallel_codex_operation_active', 'Codex operation is already active in this process');
  }
  for (const path of [loaded.paths.running, loaded.paths.handshake, loaded.paths.events,
    loaded.paths.cancel, loaded.paths.stderr, loaded.paths.completion]) {
    try {
      await lstat(path);
      fail('parallel_codex_stale_artifact', `lifecycle artifact already exists before dispatch: ${path}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const prompt = loaded.prompt;
  if (!prompt.includes(EXACT_LEAF)) {
    fail('parallel_codex_leaf_clause_missing', 'Codex worker prompt is missing the exact leaf-worker clause');
  }
  const inspected = await inspectCodexRuntime({
    codexPath: loaded.operation.codex_path,
    cwd: loaded.workspace,
    env,
  });
  if (!inspected.ready) {
    fail('parallel_runtime_capability_unavailable', 'Codex CLI strict runtime is unavailable', {
      missing_capabilities: inspected.missing_capabilities,
    });
  }
  assertCapabilityIdentity(loaded, inspected);
  const gitBefore = await gitIdentity(loaded.workspace);
  const readOnlyBefore = loaded.operation.sandbox === 'read-only'
    ? await worktreeContentSnapshot(loaded.workspace)
    : null;
  const protectedBefore = new Map();
  for (const path of loaded.protectedWorktrees) {
    protectedBefore.set(path, await worktreeContentSnapshot(path));
  }
  await prepareReport(loaded.reportPath);
  await writeFile(loaded.paths.events, '', { mode: 0o600 });
  await writeFile(loaded.paths.stderr, '', { mode: 0o600 });

  const args = [
    '-m', loaded.operation.model,
    '-C', loaded.workspace,
    '-s', loaded.operation.sandbox,
    '-a', 'never',
    '--disable', 'multi_agent',
    'exec',
    '--ignore-rules',
    '--json',
    '-o', loaded.reportPath,
    '-',
  ];
  if (args.some((argument) => String(argument).includes('dangerously-bypass'))) {
    fail('parallel_codex_operation_invalid', 'approval or sandbox bypass is forbidden');
  }
  const invocation = codexInvocation(inspected.agent_path, args, env);
  const child = spawn(invocation.file, invocation.args, {
    cwd: loaded.workspace,
    env: invocation.env,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const startedAt = new Date().toISOString();
  const active = {
    child,
    operationDigest: loaded.operationDigest,
    processId: child.pid,
    interrupted: false,
    timedOut: false,
  };
  ACTIVE.set(loaded.operationPath, active);
  let evidence = baseEvidence(loaded, startedAt, child.pid);
  let thread = null;
  let terminal = null;
  let protocolError = null;
  let stdoutBuffer = '';
  let stdoutQueue = Promise.resolve();
  let stderrBytes = 0;
  let stderrQueue = Promise.resolve();
  let timeoutTimer;
  let interruptTimer;
  let cancelCheckPending = false;
  let terminationPromise = null;

  const stopChild = () => {
    terminationPromise ||= (async () => {
      await terminateOwnedProcessTree(child);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, TERMINATE_GRACE_MS));
      await terminateOwnedProcessTree(child, { force: true });
    })().catch((error) => {
      protocolError ||= error;
    });
    return terminationPromise;
  };
  try {
    await writeRunning(loaded, { ...evidence, agent_id: null });
  } catch (error) {
    active.interrupted = true;
    await stopChild();
    const reportMetadata = await stat(loaded.reportPath).catch(() => null);
    await writeJsonAtomic(loaded.paths.completion, {
      schema: CODEX_COMPLETION_SCHEMA,
      status: 'failed',
      ...evidence,
      agent_id: null,
      ended_at: new Date().toISOString(),
      exit_code: child.exitCode,
      signal: child.signalCode,
      terminal_event: null,
      stderr_path: loaded.paths.stderr,
      error: {
        code: error.code || 'parallel_codex_lifecycle_write_failed',
        message: error.message || String(error),
      },
      report_sha256: reportMetadata ? await sha256File(loaded.reportPath) : createHash('sha256').update('').digest('hex'),
      report_size: reportMetadata?.size || 0,
    }).catch(() => {});
    ACTIVE.delete(loaded.operationPath);
    throw error;
  }
  const onSignal = () => {
    active.interrupted = true;
    stopChild();
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const consumeLine = async (rawLine) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line) return;
    if (Buffer.byteLength(line) > MAX_EVENT_LINE_BYTES) {
      fail('parallel_codex_protocol_invalid', 'Codex JSONL event exceeds the maximum line size');
    }
    if (terminal) fail('parallel_codex_protocol_invalid', 'Codex emitted an event after terminal state');
    const event = parseJson(line, 'Codex JSONL event');
    await appendFile(loaded.paths.events, `${line}\n`);
    if (event.type === 'thread.started') {
      if (thread || typeof event.thread_id !== 'string' || event.thread_id.length === 0) {
        fail('parallel_codex_protocol_invalid', 'Codex emitted an invalid or duplicate thread.started event');
      }
      thread = event;
      let observedModel = null;
      let observedCwd = null;
      if (event.model !== undefined) {
        if (event.model !== loaded.operation.model) {
          fail('parallel_codex_identity_mismatch', 'Codex observed model does not match requested model');
        }
        observedModel = event.model;
      }
      if (event.cwd !== undefined) {
        observedCwd = await realpath(resolve(event.cwd));
        if (observedCwd !== loaded.workspace) {
          fail('parallel_codex_identity_mismatch', 'Codex observed cwd does not match the bound workspace');
        }
      }
      evidence = {
        ...evidence,
        agent_id: event.thread_id,
        observed_model: observedModel,
        observed_cwd: observedCwd,
        evidence_source: observedModel && observedCwd ? 'thread.started' : 'explicit-cli-binding',
        model_evidence_source: observedModel ? 'thread.started' : 'explicit-cli-binding',
        cwd_evidence_source: observedCwd ? 'thread.started' : 'explicit-cli-binding',
      };
      await writeJsonAtomic(loaded.paths.handshake, {
        schema: CODEX_HANDSHAKE_SCHEMA,
        status: 'running',
        ...evidence,
      });
      await writeRunning(loaded, evidence);
      return;
    }
    const kind = terminalKind(event);
    if (kind) terminal = event;
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    if (Buffer.byteLength(stdoutBuffer) > MAX_EVENT_LINE_BYTES) {
      protocolError ||= new CodexRuntimeError(
        'parallel_codex_protocol_invalid',
        'Codex buffered an oversized unterminated JSONL event',
      );
      stopChild();
      return;
    }
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop();
    for (const line of lines) {
      stdoutQueue = stdoutQueue.then(() => consumeLine(line)).catch((error) => {
        protocolError ||= error;
        stopChild();
      });
    }
  });
  child.stderr.on('data', (chunk) => {
    if (stderrBytes >= MAX_STDERR_BYTES) return;
    const slice = chunk.subarray(0, MAX_STDERR_BYTES - stderrBytes);
    stderrBytes += slice.length;
    stderrQueue = stderrQueue.then(() => appendFile(loaded.paths.stderr, slice)).catch((error) => {
      protocolError ||= error;
      stopChild();
    });
  });
  child.stdin.on('error', (error) => {
    protocolError ||= error;
    stopChild();
  });
  child.stdin.end(prompt);
  timeoutTimer = setTimeout(() => {
    active.timedOut = true;
    stopChild();
  }, loaded.operation.timeout_ms);
  timeoutTimer.unref();
  interruptTimer = setInterval(() => {
    if (isInterrupted() && !active.interrupted) {
      active.interrupted = true;
      stopChild();
    }
    if (!cancelCheckPending && !active.interrupted) {
      cancelCheckPending = true;
      void readJsonIfPresent(loaded.paths.cancel).then((cancel) => {
        if (!cancel) return;
        validateLifecycle(cancel, CODEX_CANCEL_SCHEMA, loaded, 'Codex cancellation');
        if (cancel.process_id !== child.pid) {
          fail('parallel_codex_resume_identity_mismatch', 'Codex cancellation process id is stale');
        }
        active.interrupted = true;
        stopChild();
      }).catch((error) => {
        protocolError ||= error;
        stopChild();
      }).finally(() => {
        cancelCheckPending = false;
      });
    }
  }, 25);
  interruptTimer.unref();

  let exit;
  try {
    exit = await new Promise((resolvePromise) => {
      child.once('error', (error) => {
        protocolError ||= error;
        resolvePromise({ code: null, signal: null });
      });
      child.once('close', (code, signal) => resolvePromise({ code, signal }));
    });
    if (stdoutBuffer) stdoutQueue = stdoutQueue.then(() => consumeLine(stdoutBuffer));
    await Promise.all([stdoutQueue, stderrQueue]);
    if (terminationPromise) await terminationPromise;
  } finally {
    clearTimeout(timeoutTimer);
    clearInterval(interruptTimer);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    ACTIVE.delete(loaded.operationPath);
  }

  let status = 'success';
  let error = null;
  let reportEvidence = null;
  try {
    if (protocolError) throw protocolError;
    await assertOperationDigest(loaded);
    if (readOnlyBefore) {
      await assertWorktreeSnapshot(
        loaded.workspace,
        readOnlyBefore,
        'parallel_codex_read_only_violation',
        'read-only worktree',
      );
    } else {
      await assertGitIdentity(loaded.workspace, gitBefore);
    }
    for (const [path, snapshot] of protectedBefore) {
      await assertWorktreeSnapshot(
        path,
        snapshot,
        'parallel_codex_protected_worktree_violation',
        'protected worktree',
      );
    }
    if (active.interrupted) fail('parallel_runtime_interrupted', 'Codex worker was interrupted');
    if (active.timedOut) fail('parallel_codex_worker_timeout', 'Codex worker exceeded its timeout');
    if (exit.code !== 0) {
      fail('parallel_codex_worker_failed', `Codex worker exited nonzero: ${exit.code}`, {
        exit_code: exit.code,
        signal: exit.signal,
      });
    }
    if (!thread) fail('parallel_codex_protocol_invalid', 'Codex did not emit thread.started');
    if (!terminal || terminalKind(terminal) !== 'success') {
      fail('parallel_codex_worker_failed', 'Codex did not emit turn.completed');
    }
    reportEvidence = await validateReport(loaded.reportPath);
  } catch (caught) {
    status = caught.code === 'parallel_runtime_interrupted' ? 'interrupted' : 'failed';
    error = {
      code: caught.code || 'parallel_codex_worker_failed',
      message: caught.message || String(caught),
      details: caught.details || null,
    };
  }
  if (!reportEvidence) {
    const metadata = await assertRegularFile(loaded.reportPath, 'Codex report');
    await chmod(loaded.reportPath, 0o600).catch(() => {});
    reportEvidence = { report_sha256: await sha256File(loaded.reportPath), report_size: metadata.size };
  }

  const completion = {
    schema: CODEX_COMPLETION_SCHEMA,
    status,
    ...evidence,
    agent_id: thread?.thread_id || evidence.agent_id || null,
    cli_version: inspected.cli_version,
    agent_path: inspected.agent_path,
    ended_at: new Date().toISOString(),
    exit_code: exit.code,
    signal: exit.signal,
    terminal_event: terminal,
    stderr_path: loaded.paths.stderr,
    error,
    ...reportEvidence,
  };
  await writeJsonAtomic(loaded.paths.completion, completion);
  return completion;
}

export const runCodexOperation = executeCodexOperation;

export async function waitCodexOperation({ operationPath, timeoutMs = 0 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0) {
    fail('parallel_codex_operation_invalid', 'timeoutMs must be a non-negative integer');
  }
  const loaded = await loadOperation(operationPath);
  const deadline = Date.now() + timeoutMs;
  let running = null;
  do {
    const completion = await readJsonIfPresent(loaded.paths.completion);
    if (completion) {
      validateLifecycle(completion, CODEX_COMPLETION_SCHEMA, loaded, 'Codex completion');
      return validateCompletionReport(completion, loaded);
    }
    const handshake = await readJsonIfPresent(loaded.paths.handshake);
    if (handshake) running = validateLifecycle(handshake, CODEX_HANDSHAKE_SCHEMA, loaded, 'Codex handshake');
    if (!running) {
      const record = await readJsonIfPresent(loaded.paths.running);
      if (record) running = validateLifecycle(record, CODEX_RUNNING_SCHEMA, loaded, 'Codex running state');
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  } while (Date.now() <= deadline);
  return running || {
    schema: CODEX_RUNNING_SCHEMA,
    status: 'not_started',
    ...baseEvidence(loaded, null, null),
    agent_id: null,
  };
}

export async function interruptCodexOperation({
  operationPath,
  operationDigest = null,
  processId = null,
  timeoutMs = 5_000,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    fail('parallel_codex_operation_invalid', 'interrupt timeoutMs must be a positive integer');
  }
  const loaded = await loadOperation(operationPath);
  if (operationDigest && operationDigest !== loaded.operationDigest) {
    fail('parallel_codex_resume_identity_mismatch', 'interrupt digest does not match the Codex operation');
  }
  const completed = await readJsonIfPresent(loaded.paths.completion);
  if (completed) {
    validateLifecycle(completed, CODEX_COMPLETION_SCHEMA, loaded, 'Codex completion');
    return validateCompletionReport(completed, loaded);
  }
  const handshake = await readJsonIfPresent(loaded.paths.handshake);
  let running = null;
  if (handshake) running = validateLifecycle(handshake, CODEX_HANDSHAKE_SCHEMA, loaded, 'Codex handshake');
  if (!running) {
    const record = await readJsonIfPresent(loaded.paths.running);
    if (record) running = validateLifecycle(record, CODEX_RUNNING_SCHEMA, loaded, 'Codex running state');
  }
  if (!running || !Number.isInteger(running.process_id)) {
    return { schema: CODEX_RUNNING_SCHEMA, status: 'not_started', process_id: null };
  }
  if (processId && processId !== running.process_id) {
    fail('parallel_codex_resume_identity_mismatch', 'interrupt process id does not match the running Codex child');
  }
  await writeJsonAtomic(loaded.paths.cancel, {
    schema: CODEX_CANCEL_SCHEMA,
    status: 'requested',
    worker_id: loaded.operation.worker_id,
    operation_path: loaded.operationPath,
    operation_digest: loaded.operationDigest,
    process_id: running.process_id,
    requested_at: new Date().toISOString(),
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const terminal = await readJsonIfPresent(loaded.paths.completion);
    if (terminal) {
      validateLifecycle(terminal, CODEX_COMPLETION_SCHEMA, loaded, 'Codex completion');
      return validateCompletionReport(terminal, loaded);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  fail('parallel_codex_interrupt_timeout', 'Codex interrupt did not reach terminal completion in time', {
    process_id: running.process_id,
    timeout_ms: timeoutMs,
  });
}
