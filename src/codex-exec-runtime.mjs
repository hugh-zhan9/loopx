import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_CODEX_TIMEOUT_MS = 120000;

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
}) {
  const args = [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '-C',
    cwd,
    '-m',
    model,
    '-o',
    outputPath,
    ...extraArgs,
    prompt,
  ];

  try {
    const result = await execFileAsync(codexBinary(), args, {
      cwd,
      env: {
        ...process.env,
        CODEX_DISABLE_UPDATE: '1',
      },
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 8,
    });
    const finalMessage = existsSync(outputPath) ? await readFile(outputPath, 'utf8') : '';
    return {
      ok: true,
      finalMessage,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } catch (error) {
    const stdout = error?.stdout || '';
    const stderr = error?.stderr || '';
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
