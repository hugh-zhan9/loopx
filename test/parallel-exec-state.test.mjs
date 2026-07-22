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
    'deriveRunPhase',
    'loadRunManifest',
    'removeRunManifest',
    'writeRunManifest',
  ]);
  const cwd = await mkdtemp(join(tmpdir(), 'loopx-exec-manifest-'));
  const integration = {
    kind: 'root', run_id: 'manifest-run', path: '/owned/integration', branch: 'loopx/parallel/run/root',
    common_dir: '/repo/.git', head: 'abc123',
  };
  const taskWorkspaces = ['alpha', 'beta'].map((id) => ({
    id,
    workspace: {
      kind: 'task', run_id: 'manifest-run', path: `/owned/${id}`, branch: `loopx/parallel/run/${id}`,
      common_dir: '/repo/.git', head: 'abc123',
    },
  }));
  const ownership = {
    invoking_root: '/repo',
    common_dir: '/repo/.git',
    branch: 'main',
    integration,
    tasks: taskWorkspaces,
  };
  const created = await runManifest.createRunManifest({
    cwd,
    runId: 'manifest-run',
    baselineHead: 'abc123',
    targetSnapshot: [{ path: 'src/alpha.mjs', kind: 'file', mode: 420, sha256: 'hash' }],
    workerLimit: 2,
    ownership,
    reviewContext: { source: 'test requirements', plan: 'test execution plan' },
    outcomes: [
      { id: 'alpha', write_scope: ['src/alpha.mjs'] },
      { id: 'beta', write_scope: ['src/beta.mjs'] },
    ],
  });

  assert.equal((await stat(created.path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(created.path, 'utf8')), {
    schema: 'loopx.exec-run.v3',
    run_id: 'manifest-run',
    status: 'active',
    profile: 'parallel-strict-v1',
    baseline_head: 'abc123',
    target_snapshot: [{ path: 'src/alpha.mjs', kind: 'file', mode: 420, sha256: 'hash' }],
    configured_worker_limit: 2,
    worker_limit: 2,
    review_policy: { task: 'mandatory', final: ['spec', 'standards'] },
    review_context: {
      source: 'test requirements',
      plan: 'test execution plan',
      acceptance: [{ id: 'alpha', acceptance: [] }, { id: 'beta', acceptance: [] }],
      scope: [
        { id: 'alpha', write_scope: ['src/alpha.mjs'], relevant_paths: [] },
        { id: 'beta', write_scope: ['src/beta.mjs'], relevant_paths: [] },
      ],
    },
    resume_instruction: '$exec --resume manifest-run',
    ownership,
    active_workers: {},
    tasks: [
      {
        id: 'alpha', outcome: { id: 'alpha', write_scope: ['src/alpha.mjs'] }, depends_on: [], write_scope: ['src/alpha.mjs'],
        changed_paths: [], status: 'pending', attempts: { implementation: 0, review: 0, fix: 0 },
        workers: { implementers: [], reviewers: [], fixers: [] },
        prepared_dependencies: [], implementation: null, verification: null, review: null, commit: null,
        workspace: taskWorkspaces[0].workspace,
      },
      {
        id: 'beta', outcome: { id: 'beta', write_scope: ['src/beta.mjs'] }, depends_on: [], write_scope: ['src/beta.mjs'],
        changed_paths: [], status: 'pending', attempts: { implementation: 0, review: 0, fix: 0 },
        workers: { implementers: [], reviewers: [], fixers: [] },
        prepared_dependencies: [], implementation: null, verification: null, review: null, commit: null,
        workspace: taskWorkspaces[1].workspace,
      },
    ],
    integration: {
      status: 'pending', verification: null, commit: null, changed_paths: [], integration_order: [], workspace: integration,
    },
    final_review: {
      status: 'pending', attempt: 1, fix_attempt: 0, spec: null, standards: null,
      workers: { reviewers: [], fixers: [] },
    },
    application: { status: 'pending', verification: null, post_apply_snapshot: null },
  });

  assert.deepEqual((await runManifest.loadRunManifest({ cwd, runId: 'manifest-run' })).runState, created.runState);

  created.runState.tasks[0].status = 'verified';
  await runManifest.writeRunManifest(created);
  assert.equal(JSON.parse(await readFile(created.path, 'utf8')).tasks[0].status, 'verified');
  assert.equal(runManifest.deriveRunPhase(created.runState), 'tasks');

  await runManifest.removeRunManifest(created);
  assert.equal(existsSync(created.path), false);
  assert.equal(existsSync(dirname(dirname(created.path))), false);
});
