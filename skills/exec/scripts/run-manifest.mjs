import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

function manifestPath(cwd, runId) {
  if (!RUN_ID_PATTERN.test(runId)) throw new TypeError('runId must be lowercase kebab-case');
  return join(resolve(cwd), '.loopx', 'exec', runId, 'manifest.json');
}

export async function createRunManifest({
  cwd,
  runId,
  baselineHead,
  targetSnapshot,
  outcomes,
  workerLimit,
  ownership,
}) {
  const path = manifestPath(cwd, runId);
  const runState = {
    schema: 'loopx.exec-run.v2',
    run_id: runId,
    status: 'active',
    baseline_head: baselineHead,
    target_snapshot: targetSnapshot,
    worker_limit: workerLimit,
    resume_instruction: `$exec --resume ${runId}`,
    ownership,
    tasks: outcomes.map((outcome) => ({
      id: outcome.id,
      outcome: structuredClone(outcome),
      write_scope: [...outcome.write_scope],
      changed_paths: [],
      status: 'pending',
      verification: null,
      commit: null,
      workspace: ownership.tasks.find((task) => task.id === outcome.id).workspace,
    })),
    integration: {
      status: 'pending',
      verification: null,
      commit: null,
      workspace: ownership.integration,
    },
    application: { status: 'pending', verification: null },
  };
  await writeRunManifest({ path, runState });
  return { path, runState };
}

export async function writeRunManifest({ path, runState }) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(runState, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
  return { path, runState };
}

export async function loadRunManifest({ cwd, runId }) {
  const path = manifestPath(cwd, runId);
  const runState = JSON.parse(await readFile(path, 'utf8'));
  if (runState.schema !== 'loopx.exec-run.v2' || runState.run_id !== runId) {
    throw new Error(`unsupported or mismatched exec run manifest: ${path}`);
  }
  return { path, runState };
}

export async function removeRunManifest({ path }) {
  await rm(dirname(path), { recursive: true, force: true });
  try {
    await rmdir(dirname(dirname(path)));
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
  }
  return { removed: true, path };
}
