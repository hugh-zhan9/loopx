import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_CODEX_TIMEOUT_MS = 120000;
const DEFAULT_CODEX_REASONING = 'low';

function codexBinary() {
  return process.env.LOOPX_CODEX_BIN || 'codex';
}

export async function readJsonArtifact(path) {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text);
}

export async function runCodexExec({
  cwd,
  prompt,
  outputPath,
  model = DEFAULT_CODEX_MODEL,
  extraArgs = [],
  timeoutMs = DEFAULT_CODEX_TIMEOUT_MS,
  reasoningEffort = DEFAULT_CODEX_REASONING,
}) {
  const args = [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '-C',
    cwd,
    '-m',
    model,
    '-c',
    `model_reasoning_effort=\"${reasoningEffort}\"`,
    '-o',
    outputPath,
    ...extraArgs,
    prompt,
  ];

  const child = spawn(codexBinary(), args, {
    cwd,
    env: {
      ...process.env,
      CODEX_DISABLE_UPDATE: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdin.end();

  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));

  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
  }, timeoutMs);

  try {
    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    clearTimeout(timeout);
    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    const finalMessage = existsSync(outputPath) ? await readFile(outputPath, 'utf8') : '';
    if (exitCode !== 0) {
      throw new Error(`exit_${exitCode}`);
    }
    return {
      ok: true,
      finalMessage,
      stdout,
      stderr,
    };
  } catch (error) {
    clearTimeout(timeout);
    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    const finalMessage = existsSync(outputPath) ? await readFile(outputPath, 'utf8') : '';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`codex_exec_failed:${message}\nstdout:${stdout}\nstderr:${stderr}\nfinal:${finalMessage}`);
  }
}

export async function runCodexExecJson(options) {
  const result = await runCodexExec(options);
  const text = result.finalMessage.trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`codex_exec_invalid_json:${error instanceof Error ? error.message : String(error)}\nbody:${text}`);
  }
}
