import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import * as runManifest from '../skills/exec/scripts/run-manifest.mjs';

test('retains only a compact owner-only active manifest and removes all success state', async () => {
  assert.deepEqual(Object.keys(runManifest).sort(), [
    'createRunManifest',
    'removeRunManifest',
    'writeRunManifest',
  ]);
  const cwd = await mkdtemp(join(tmpdir(), 'loopx-exec-manifest-'));
  const created = await runManifest.createRunManifest({
    cwd,
    runId: 'manifest-run',
    baselineHead: 'abc123',
    workerLimit: 2,
    outcomes: [
      { id: 'alpha', write_scope: ['src/alpha.mjs'] },
      { id: 'beta', write_scope: ['src/beta.mjs'] },
    ],
  });

  assert.equal((await stat(created.path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(created.path, 'utf8')), {
    schema: 'loopx.exec-run.v1',
    run_id: 'manifest-run',
    status: 'active',
    baseline_head: 'abc123',
    worker_limit: 2,
    tasks: [
      { id: 'alpha', write_scope: ['src/alpha.mjs'], status: 'pending', verification: null, commit: null },
      { id: 'beta', write_scope: ['src/beta.mjs'], status: 'pending', verification: null, commit: null },
    ],
    integration: { status: 'pending', verification: null, commit: null },
  });

  created.value.tasks[0].status = 'verified';
  await runManifest.writeRunManifest(created);
  assert.equal(JSON.parse(await readFile(created.path, 'utf8')).tasks[0].status, 'verified');

  await runManifest.removeRunManifest(created);
  assert.equal(existsSync(created.path), false);
  assert.equal(existsSync(dirname(dirname(created.path))), false);
});
