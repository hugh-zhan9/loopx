import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_CODEX_TIMEOUT_MS = 120000;
const DEFAULT_CODEX_REASONING = 'low';
const DIAGNOSTIC_TAIL_CHARS = 4000;

function diagnosticTail(value) {
  return String(value || '').slice(-DIAGNOSTIC_TAIL_CHARS);
}

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
  outputSchema = null,
  promptViaStdin = false,
}) {
  await unlink(outputPath).catch((error) => {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  });
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
    ...(outputSchema ? ['--output-schema', outputSchema] : []),
    ...extraArgs,
    promptViaStdin ? '-' : prompt,
  ];

  const child = spawn(codexBinary(), args, {
    cwd,
    env: {
      ...process.env,
      CODEX_DISABLE_UPDATE: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdin.end(promptViaStdin ? prompt : undefined);

  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
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
    if (timedOut) {
      throw new Error('timeout');
    }
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
    throw new Error(`codex_exec_failed:${message}\nstdout:${diagnosticTail(stdout)}\nstderr:${diagnosticTail(stderr)}\nfinal:${diagnosticTail(finalMessage)}`);
  }
}

export async function runCodexExecJson(options) {
  const result = await runCodexExec(options);
  const text = result.finalMessage.trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    const stdout = diagnosticTail(result.stdout);
    const stderr = diagnosticTail(result.stderr);
    throw new Error(`codex_exec_invalid_json:${error instanceof Error ? error.message : String(error)}\nbody:${text}\nstdout:${stdout}\nstderr:${stderr}`);
  }
}

export async function runCodexReviewJson({
  cwd,
  prompt,
  outputPath,
  model = DEFAULT_CODEX_MODEL,
  timeoutMs = DEFAULT_CODEX_TIMEOUT_MS,
  reasoningEffort = DEFAULT_CODEX_REASONING,
  uncommitted = true,
  outputSchema = null,
}) {
  let schemaDir = null;
  let schemaPath = outputSchema;
  try {
    if (!schemaPath) {
      schemaDir = await mkdtemp(join(tmpdir(), 'loopx-code-review-schema-'));
      schemaPath = join(schemaDir, 'schema.json');
      await writeFile(schemaPath, JSON.stringify({
        type: 'object',
        additionalProperties: false,
        required: ['status', 'verdict', 'summary', 'findings'],
        properties: {
          status: { enum: ['complete', 'skipped'] },
          verdict: { enum: ['approve', 'request-changes'] },
          summary: { type: 'string' },
          rollbackTarget: {
            anyOf: [
              { enum: ['build', 'plan', 'clarify'] },
              { type: 'null' },
            ],
          },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['severity', 'file', 'line', 'message'],
              properties: {
                severity: { enum: ['high', 'medium', 'low'] },
                file: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                line: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                message: { type: 'string' },
              },
            },
          },
        },
      }));
    }
    try {
      return await runCodexExecJson({
        cwd,
        prompt,
        outputPath,
        model,
        timeoutMs,
        reasoningEffort,
        outputSchema: schemaPath,
        promptViaStdin: true,
        extraArgs: uncommitted ? [] : [],
      });
    } catch (error) {
      return await runCodexExecJson({
        cwd,
        prompt,
        outputPath,
        model,
        timeoutMs,
        reasoningEffort,
        promptViaStdin: true,
        extraArgs: uncommitted ? [] : [],
      });
    }
  } finally {
    if (schemaDir) {
      await rm(schemaDir, { recursive: true, force: true });
    }
  }
}
