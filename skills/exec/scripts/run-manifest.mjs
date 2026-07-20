import { mkdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

function manifestPath(cwd, runId) {
  if (!RUN_ID_PATTERN.test(runId)) throw new TypeError('runId must be lowercase kebab-case');
  return join(resolve(cwd), '.loopx', 'exec', runId, 'manifest.json');
}

export async function createRunManifest({ cwd, runId, baselineHead, outcomes, workerLimit }) {
  const path = manifestPath(cwd, runId);
  const value = {
    schema: 'loopx.exec-run.v1',
    run_id: runId,
    status: 'active',
    baseline_head: baselineHead,
    worker_limit: workerLimit,
    tasks: outcomes.map((outcome) => ({
      id: outcome.id,
      write_scope: [...outcome.write_scope],
      status: 'pending',
      verification: null,
      commit: null,
    })),
    integration: { status: 'pending', verification: null, commit: null },
  };
  await writeRunManifest({ path, value });
  return { path, value };
}

export async function writeRunManifest({ path, value }) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return { path, value };
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
