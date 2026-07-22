import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  resumeAdaptiveExecution as resumeAdaptiveExecutionBase,
  runAdaptiveExecution as runAdaptiveExecutionBase,
} from '../skills/exec/scripts/adaptive-exec.mjs';

const execFileAsync = promisify(execFile);

function runAdaptiveExecution(options) {
  return runAdaptiveExecutionBase({
    reviewContext: { source: 'test requirements', plan: 'test execution plan' },
    ...options,
  });
}

function resumeAdaptiveExecution(options) {
  return resumeAdaptiveExecutionBase({
    reviewContext: { source: 'test requirements', plan: 'test execution plan' },
    ...options,
  });
}

async function git(cwd, args) {
  return (await execFileAsync('git', args, { cwd })).stdout.trim();
}

async function createRepo() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'loopx-reviewed-runtime-')));
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'test@example.com']);
  await git(root, ['config', 'user.name', 'Test User']);
  await writeFile(join(root, '.gitignore'), '.worktrees/\n.loopx/\n');
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'base.mjs'), "export const base = true;\n");
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', 'baseline']);
  return root;
}

function outcome(id, dependsOn = []) {
  return {
    id,
    outcome: `Deliver ${id}`,
    depends_on: dependsOn,
    write_scope: [`src/${id}.mjs`],
    relevant_paths: [],
    exclusive_resources: [],
    parallel_safe: true,
    parallel_rationale: 'Independent task-local change.',
    interfaces: { consumes: dependsOn.map((dependency) => `result:${dependency}`), produces: [`result:${id}`] },
    source_anchors: [`AC-${id}`],
    acceptance: [`${id} is observable.`],
    verification: [`verify ${id}`],
    expected_evidence: [`${id} verification passes.`],
    review_focus: [`Review ${id}.`],
    content: `export const ${id} = '${id}';\n`,
  };
}

function approvedRawMessage(taskId) {
  return [
    '```loopx-review-result',
    JSON.stringify({
      schema: 'loopx.task-review-result.v1',
      task_id: taskId,
      spec_compliance: 'APPROVED',
      code_quality: 'APPROVED',
      cannot_verify: [],
      findings: [],
    }),
    '```',
  ].join('\n');
}

function issuesRawMessage(taskId) {
  return [
    '```loopx-review-result',
    JSON.stringify({
      schema: 'loopx.task-review-result.v1',
      task_id: taskId,
      spec_compliance: 'ISSUES_FOUND',
      code_quality: 'APPROVED',
      cannot_verify: [],
      findings: [{
        id: 'F-001',
        axis: 'spec_compliance',
        severity: 'Important',
        anchor_ids: ['AC-001'],
        summary: 'The candidate still contains the broken value.',
      }],
    }),
    '```',
  ].join('\n');
}

function finalResult(axis, candidate) {
  return {
    schema: 'loopx.final-review-result.v1',
    axis,
    verdict: 'APPROVED',
    findings: [],
    candidate,
    reviewer: { id: `final-${axis}`, model: 'test', platform: 'test' },
  };
}

test('runs a reviewed diamond graph in dependency waves before final dual review', async () => {
  const root = await createRepo();
  const outcomes = [outcome('alpha'), outcome('beta'), outcome('gamma', ['alpha', 'beta'])];
  let active = 0;
  let peak = 0;
  const dispatchOrder = [];
  const reviews = [];

  const result = await runAdaptiveExecution({
    cwd: root,
    runId: 'reviewed-diamond',
    outcomes,
    planned: true,
    runtimeCapability: { worker_capacity: 4, task_worktree_binding: true },
    dispatchWorker: async ({ outcome: current, workspace }) => {
      active += 1;
      peak = Math.max(peak, active);
      dispatchOrder.push(current.id);
      try {
        if (current.id === 'gamma') {
          assert.equal(await readFile(join(workspace, 'src', 'alpha.mjs'), 'utf8'), outcomes[0].content);
          assert.equal(await readFile(join(workspace, 'src', 'beta.mjs'), 'utf8'), outcomes[1].content);
        }
        await delay(current.id === 'gamma' ? 5 : 30);
        const path = join(workspace, current.write_scope[0]);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, current.content);
        return {
          worker: { id: `${current.id}-implementer`, model: 'test', platform: 'test' },
          report: `implemented ${current.id}`,
          verification: { status: 'passed', commands: [`verify ${current.id}`] },
        };
      } finally {
        active -= 1;
      }
    },
    dispatchReviewer: async ({ taskId, attempt }) => {
      reviews.push(taskId);
      return {
        reviewer: { id: `${taskId}-review-${attempt}`, model: 'test', platform: 'test' },
        rawMessage: approvedRawMessage(taskId),
      };
    },
    dispatchFinalReviewer: async ({ axis, candidate, reviewContext }) => {
      assert.equal(reviewContext.source, 'test requirements');
      assert.equal(reviewContext.plan, 'test execution plan');
      assert.equal(reviewContext.acceptance.length, 3);
      assert.equal(reviewContext.scope.length, 3);
      return finalResult(axis, candidate);
    },
    verifyCombined: async ({ phase, workspace }) => {
      for (const current of outcomes) {
        assert.equal(await readFile(join(workspace, current.write_scope[0]), 'utf8'), current.content);
      }
      return { status: 'passed', commands: [`verify ${phase}`] };
    },
  });

  assert.equal(result.profile, 'parallel-strict-v1');
  assert.equal(result.kind, 'concurrent');
  assert.equal(peak, 2);
  assert.deepEqual(dispatchOrder.slice(0, 2).sort(), ['alpha', 'beta']);
  assert.equal(dispatchOrder[2], 'gamma');
  assert.deepEqual(reviews.sort(), ['alpha', 'beta', 'gamma']);
  assert.equal(result.review.final.status, 'approved');
  assert.deepEqual(result.integration_order, ['alpha', 'beta', 'gamma']);
  assert.equal(existsSync(join(root, '.loopx', 'exec', 'reviewed-diamond')), false);
});

test('runs a planned linear graph with fresh reviewed workers instead of inline ownership', async () => {
  const root = await createRepo();
  const outcomes = [outcome('alpha'), outcome('beta', ['alpha'])];
  let active = 0;
  let peak = 0;
  const reviews = [];

  const result = await runAdaptiveExecution({
    cwd: root,
    runId: 'reviewed-linear',
    outcomes,
    runtimeCapability: { worker_capacity: 4, task_worktree_binding: true },
    dispatchWorker: async ({ outcome: current, workspace }) => {
      active += 1;
      peak = Math.max(peak, active);
      try {
        const path = join(workspace, current.write_scope[0]);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, current.content);
        return {
          worker: { id: `${current.id}-implementer`, model: 'test', platform: 'test' },
          report: `implemented ${current.id}`,
          verification: { status: 'passed', commands: [`verify ${current.id}`] },
        };
      } finally {
        active -= 1;
      }
    },
    dispatchReviewer: async ({ taskId, attempt }) => {
      reviews.push(taskId);
      return {
        reviewer: { id: `${taskId}-review-${attempt}`, model: 'test', platform: 'test' },
        rawMessage: approvedRawMessage(taskId),
      };
    },
    dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });

  assert.equal(result.profile, 'delegated-serial-v1');
  assert.equal(result.kind, 'serial');
  assert.equal(peak, 1);
  assert.deepEqual(reviews, ['alpha', 'beta']);
});

test('blocks delegated mutation when complete source and plan review context is missing', async () => {
  const root = await createRepo();
  let dispatched = 0;

  await assert.rejects(runAdaptiveExecutionBase({
    cwd: root,
    runId: 'missing-review-context',
    outcomes: [outcome('alpha')],
    runtimeCapability: { worker_capacity: 1, task_worktree_binding: true },
    dispatchWorker: async () => {
      dispatched += 1;
      throw new Error('must not dispatch');
    },
    dispatchReviewer: async () => {
      dispatched += 1;
      throw new Error('must not dispatch');
    },
    dispatchFinalReviewer: async () => {
      dispatched += 1;
      throw new Error('must not dispatch');
    },
    verifyCombined: async () => ({ status: 'passed', commands: ['not reached'] }),
  }), (error) => error.code === 'adaptive_review_context_incomplete');

  assert.equal(dispatched, 0);
});

test('routes blocking task findings through a separate fixer and fresh re-review', async () => {
  const root = await createRepo();
  const current = outcome('alpha');
  current.content = "export const alpha = 'broken';\n";
  let reviewAttempt = 0;
  let fixerCalls = 0;

  const result = await runAdaptiveExecution({
    cwd: root,
    runId: 'reviewed-fix-loop',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 4, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), current.content);
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        report: 'implemented broken candidate',
        verification: { status: 'passed', commands: ['verify initial'] },
      };
    },
    dispatchReviewer: async ({ taskId, attempt }) => {
      reviewAttempt += 1;
      return {
        reviewer: { id: `reviewer-${attempt}`, model: 'test', platform: 'test' },
        rawMessage: reviewAttempt === 1 ? issuesRawMessage(taskId) : approvedRawMessage(taskId),
      };
    },
    dispatchFixer: async ({ workspace }) => {
      fixerCalls += 1;
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'fixed';\n");
      return {
        worker: { id: 'alpha-fixer', model: 'test', platform: 'test' },
        report: 'fixed F-001',
        verification: { status: 'passed', commands: ['verify fixed'] },
      };
    },
    dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });

  assert.equal(fixerCalls, 1);
  assert.equal(reviewAttempt, 2);
  assert.equal(result.review.tasks[0].attempt, 2);
  assert.equal(await readFile(join(root, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'fixed';\n");
});

test('fails closed when a read-only delegated task review is blocking', async () => {
  const outcomes = [outcome('alpha'), outcome('beta')].map((current) => ({
    ...current,
    mutates: false,
    write_scope: [],
  }));

  await assert.rejects(
    runAdaptiveExecution({
      cwd: process.cwd(),
      runId: 'read-only-review',
      outcomes,
      runtimeCapability: { worker_capacity: 4, read_only_binding: true },
      dispatchWorker: async ({ outcome: current }) => ({
        worker: { id: `${current.id}-implementer`, model: 'test', platform: 'test' },
        report: `inspected ${current.id}`,
        verification: { status: 'passed', commands: [`verify ${current.id}`] },
      }),
      dispatchReviewer: async ({ taskId }) => ({
        reviewer: { id: `${taskId}-reviewer`, model: 'test', platform: 'test' },
        rawMessage: taskId === 'alpha' ? issuesRawMessage(taskId) : approvedRawMessage(taskId),
      }),
      dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
      verifyCombined: async () => ({ status: 'passed', commands: ['verify read-only'] }),
    }),
    (error) => error.code === 'adaptive_task_review_blocked',
  );
});

test('rejects a reviewer mutation that is absent from the approved diff package', async () => {
  const root = await createRepo();
  const current = outcome('alpha');

  await assert.rejects(
    runAdaptiveExecution({
      cwd: root,
      runId: 'reviewer-mutation',
      outcomes: [current],
      runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
      dispatchWorker: async ({ workspace }) => {
        await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'reviewed';\n");
        return {
          worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
          report: 'implemented alpha',
          verification: { status: 'passed', commands: ['verify alpha'] },
        };
      },
      dispatchReviewer: async ({ taskId, workspace }) => {
        await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'unreviewed';\n");
        return {
          reviewer: { id: 'alpha-reviewer', model: 'test', platform: 'test' },
          rawMessage: approvedRawMessage(taskId),
        };
      },
      dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
      verifyCombined: async () => ({ status: 'passed', commands: ['verify combined'] }),
    }),
    (error) => error.code === 'adaptive_reviewed_candidate_changed',
  );
});

test('rejects review evidence files mutated after candidate capture', async () => {
  const root = await createRepo();
  const current = outcome('alpha');

  await assert.rejects(runAdaptiveExecution({
    cwd: root,
    runId: 'review-evidence-mutation',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), current.content);
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        report: 'implemented alpha',
        verification: { status: 'passed', commands: ['verify alpha'] },
      };
    },
    dispatchReviewer: async ({ taskId, paths }) => {
      await writeFile(paths.brief, '{"tampered":true}\n');
      return {
        reviewer: { id: 'alpha-reviewer', model: 'test', platform: 'test' },
        rawMessage: approvedRawMessage(taskId),
      };
    },
    dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
    verifyCombined: async () => ({ status: 'passed', commands: ['verify combined'] }),
  }), (error) => error.code === 'adaptive_review_evidence_changed');
});

test('accepts files nested under a declared directory write scope', async () => {
  const root = await createRepo();
  const current = outcome('alpha');
  current.write_scope = ['src/generated'];

  const result = await runAdaptiveExecution({
    cwd: root,
    runId: 'directory-scope',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await mkdir(join(workspace, 'src', 'generated'), { recursive: true });
      await writeFile(join(workspace, 'src', 'generated', 'alpha.mjs'), current.content);
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        report: 'generated alpha',
        verification: { status: 'passed', commands: ['verify alpha'] },
      };
    },
    dispatchReviewer: async ({ taskId }) => ({
      reviewer: { id: 'alpha-reviewer', model: 'test', platform: 'test' },
      rawMessage: approvedRawMessage(taskId),
    }),
    dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });

  assert.deepEqual(result.changed_paths, ['src/generated/alpha.mjs']);
});

test('routes blocking final findings through a separate fixer and fresh dual review', async () => {
  const root = await createRepo();
  const current = outcome('alpha');
  let finalFixes = 0;

  const result = await runAdaptiveExecution({
    cwd: root,
    runId: 'final-fix-loop',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 3, task_worktree_binding: true },
    reviewContext: { source: 'AC-alpha', plan: 'test plan' },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'initial';\n");
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        report: 'implemented alpha',
        verification: { status: 'passed', commands: ['verify alpha'] },
      };
    },
    dispatchReviewer: async ({ taskId }) => ({
      reviewer: { id: 'alpha-task-reviewer', model: 'test', platform: 'test' },
      rawMessage: approvedRawMessage(taskId),
    }),
    dispatchFixer: async ({ taskId, workspace }) => {
      assert.equal(taskId, 'final-integration');
      finalFixes += 1;
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'final-fixed';\n");
      return {
        worker: { id: 'final-fixer', model: 'test', platform: 'test' },
        report: 'fixed final finding',
        verification: { status: 'passed', commands: ['verify final fix'] },
      };
    },
    dispatchFinalReviewer: async ({ axis, attempt, candidate, reviewContext, tasks }) => {
      assert.equal(reviewContext.source, 'AC-alpha');
      assert.equal(tasks[0].outcome.id, 'alpha');
      if (attempt === 1 && axis === 'spec') {
        return {
          schema: 'loopx.final-review-result.v1',
          axis,
          verdict: 'ISSUES_FOUND',
          findings: [{ id: 'F-001', severity: 'Important', summary: 'Final value is incomplete.' }],
          candidate,
          reviewer: { id: 'final-spec-1', model: 'test', platform: 'test' },
        };
      }
      return {
        ...finalResult(axis, candidate),
        reviewer: { id: `final-${axis}-${attempt}`, model: 'test', platform: 'test' },
      };
    },
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });

  assert.equal(finalFixes, 1);
  assert.equal(result.review.final.status, 'approved');
  assert.deepEqual(result.verification.integration.commands, ['verify final-fix']);
  assert.equal(await readFile(join(root, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'final-fixed';\n");
});

test('resets integration mutations produced by an invalid final fixer', async () => {
  const root = await createRepo();
  const current = outcome('alpha');

  await assert.rejects(runAdaptiveExecution({
    cwd: root,
    runId: 'invalid-final-fixer',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 3, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'initial';\n");
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: ['verify alpha'] },
      };
    },
    dispatchReviewer: async ({ taskId }) => ({
      reviewer: { id: 'alpha-task-reviewer', model: 'test', platform: 'test' },
      rawMessage: approvedRawMessage(taskId),
    }),
    dispatchFixer: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'rejected';\n");
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: ['verify rejected fix'] },
      };
    },
    dispatchFinalReviewer: async ({ axis, candidate }) => ({
      ...finalResult(axis, candidate),
      verdict: axis === 'spec' ? 'ISSUES_FOUND' : 'APPROVED',
      findings: axis === 'spec'
        ? [{ id: 'F-001', severity: 'Important', summary: 'Needs a final fix.' }]
        : [],
      reviewer: { id: `final-${axis}-1`, model: 'test', platform: 'test' },
    }),
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  }), (error) => error.code === 'adaptive_final_fixer_not_independent');

  const manifest = JSON.parse(await readFile(
    join(root, '.loopx', 'exec', 'invalid-final-fixer', 'manifest.json'),
    'utf8',
  ));
  assert.equal(await git(manifest.integration.workspace.path, ['status', '--porcelain']), '');
  assert.equal(
    await readFile(join(manifest.integration.workspace.path, 'src', 'alpha.mjs'), 'utf8'),
    "export const alpha = 'initial';\n",
  );
});

test('rejects and resets a final reviewer mutation before any fixer can run', async () => {
  const root = await createRepo();
  const current = outcome('alpha');
  let fixerCalls = 0;

  await assert.rejects(runAdaptiveExecution({
    cwd: root,
    runId: 'final-reviewer-mutation',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 3, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'initial';\n");
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: ['verify alpha'] },
      };
    },
    dispatchReviewer: async ({ taskId }) => ({
      reviewer: { id: 'alpha-task-reviewer', model: 'test', platform: 'test' },
      rawMessage: approvedRawMessage(taskId),
    }),
    dispatchFixer: async () => {
      fixerCalls += 1;
      throw new Error('must not fix an unattributed reviewer mutation');
    },
    dispatchFinalReviewer: async ({ axis, workspace, candidate }) => {
      if (axis === 'spec') {
        await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'reviewer-mutated';\n");
      }
      return finalResult(axis, candidate);
    },
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  }), (error) => error.code === 'adaptive_final_reviewer_mutated_candidate');

  assert.equal(fixerCalls, 0);
  const manifest = JSON.parse(await readFile(
    join(root, '.loopx', 'exec', 'final-reviewer-mutation', 'manifest.json'),
    'utf8',
  ));
  assert.equal(await git(manifest.integration.workspace.path, ['status', '--porcelain']), '');
  assert.equal(await readFile(join(manifest.integration.workspace.path, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'initial';\n");
});

test('resets a terminal final fixer failure before resume or replacement', async () => {
  const root = await createRepo();
  const current = outcome('alpha');

  await assert.rejects(runAdaptiveExecution({
    cwd: root,
    runId: 'terminal-final-fixer-failure',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 3, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'initial';\n");
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: ['verify alpha'] },
      };
    },
    dispatchReviewer: async ({ taskId }) => ({
      reviewer: { id: 'alpha-task-reviewer', model: 'test', platform: 'test' },
      rawMessage: approvedRawMessage(taskId),
    }),
    dispatchFixer: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'terminal-failure';\n");
      const error = new Error('terminal final fixer failure');
      error.workerTerminal = true;
      throw error;
    },
    dispatchFinalReviewer: async ({ axis, candidate }) => ({
      ...finalResult(axis, candidate),
      verdict: axis === 'spec' ? 'ISSUES_FOUND' : 'APPROVED',
      findings: axis === 'spec'
        ? [{ id: 'F-001', severity: 'Important', summary: 'Needs a final fix.' }]
        : [],
      reviewer: { id: `final-${axis}-1`, model: 'test', platform: 'test' },
    }),
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  }), /terminal final fixer failure/);

  const manifest = JSON.parse(await readFile(
    join(root, '.loopx', 'exec', 'terminal-final-fixer-failure', 'manifest.json'),
    'utf8',
  ));
  assert.equal(Object.keys(manifest.active_workers).length, 0);
  assert.equal(await git(manifest.integration.workspace.path, ['status', '--porcelain']), '');
  assert.equal(await readFile(join(manifest.integration.workspace.path, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'initial';\n");
});

test('rejects a final fixer reused as a post-fix reviewer', async () => {
  const root = await createRepo();
  const current = outcome('alpha');

  await assert.rejects(runAdaptiveExecution({
    cwd: root,
    runId: 'final-fixer-reviewer-reuse',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 3, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'initial';\n");
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: ['verify alpha'] },
      };
    },
    dispatchReviewer: async ({ taskId }) => ({
      reviewer: { id: 'alpha-task-reviewer', model: 'test', platform: 'test' },
      rawMessage: approvedRawMessage(taskId),
    }),
    dispatchFixer: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'fixed';\n");
      return {
        worker: { id: 'final-fixer', model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: ['verify final fix'] },
      };
    },
    dispatchFinalReviewer: async ({ axis, attempt, candidate }) => {
      if (attempt === 1 && axis === 'spec') {
        return {
          schema: 'loopx.final-review-result.v1',
          axis,
          verdict: 'ISSUES_FOUND',
          findings: [{ id: 'F-001', severity: 'Important', summary: 'Needs a final fix.' }],
          candidate,
          reviewer: { id: 'final-spec-1', model: 'test', platform: 'test' },
        };
      }
      return {
        ...finalResult(axis, candidate),
        reviewer: {
          id: attempt === 2 && axis === 'spec' ? 'final-fixer' : `final-${axis}-${attempt}`,
          model: 'test',
          platform: 'test',
        },
      };
    },
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
}), (error) => error.code === 'adaptive_final_review_not_fresh');
});

test('rolls forward an independently reviewed task commit after manifest persistence is interrupted', async () => {
  const root = await createRepo();
  const current = outcome('alpha');

  await assert.rejects(runAdaptiveExecution({
    cwd: root,
    runId: 'task-commit-recovery',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 2, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'reviewed';\n");
      throw new Error('retain task workspace before simulated commit');
    },
    dispatchReviewer: async () => {
      throw new Error('review is simulated from persisted evidence');
    },
    dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  }), /retain task workspace/);

  const manifestPath = join(root, '.loopx', 'exec', 'task-commit-recovery', 'manifest.json');
  const retained = JSON.parse(await readFile(manifestPath, 'utf8'));
  const task = retained.tasks[0];
  await git(task.workspace.path, ['add', '--intent-to-add', '--all']);
  const candidateDiff = (await execFileAsync('git', ['diff', '--binary', 'HEAD', '--'], {
    cwd: task.workspace.path,
  })).stdout;
  retained.active_workers = {
    'alpha:commit:1': {
      task_id: 'alpha',
      role: 'task-commit',
      status: 'committing',
      expected_parent: task.workspace.head,
      reviewed_diff_sha256: createHash('sha256').update(candidateDiff).digest('hex'),
      changed_paths: ['src/alpha.mjs'],
    },
  };
  task.status = 'reviewing';
  task.verification = { status: 'passed', commands: ['verify alpha'] };
  task.review = { status: 'reviewed', reviewer: { id: 'alpha-reviewer', model: 'test', platform: 'test' } };
  await git(task.workspace.path, ['add', 'src/alpha.mjs']);
  await git(task.workspace.path, ['commit', '-m', 'simulate task commit before manifest persist']);
  await writeFile(manifestPath, `${JSON.stringify(retained, null, 2)}\n`);

  let redispatched = false;
  const resumed = await resumeAdaptiveExecution({
    cwd: root,
    runId: 'task-commit-recovery',
    dispatchWorker: async () => {
      redispatched = true;
      throw new Error('recovered commit must not redispatch implementation');
    },
    dispatchReviewer: async () => {
      redispatched = true;
      throw new Error('recovered commit must not redispatch task review');
    },
    dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  });

  assert.equal(redispatched, false);
  assert.deepEqual(resumed.changed_paths, ['src/alpha.mjs']);
  assert.equal(await readFile(join(root, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'reviewed';\n");
});

test('persists final worker identities and resets an uncertain final reviewer on resume', async () => {
  const root = await createRepo();
  const current = outcome('alpha');
  let firstRun = true;

  await assert.rejects(runAdaptiveExecution({
    cwd: root,
    runId: 'final-review-resume-history',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 3, task_worktree_binding: true },
    dispatchWorker: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'initial';\n");
      return {
        worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: ['verify alpha'] },
      };
    },
    dispatchReviewer: async ({ taskId }) => ({
      reviewer: { id: 'alpha-task-reviewer', model: 'test', platform: 'test' },
      rawMessage: approvedRawMessage(taskId),
    }),
    dispatchFixer: async ({ workspace }) => {
      await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'fixed';\n");
      return {
        worker: { id: 'final-fixer', model: 'test', platform: 'test' },
        verification: { status: 'passed', commands: ['verify final fix'] },
      };
    },
    dispatchFinalReviewer: async ({ axis, attempt, workspace, candidate }) => {
      if (attempt === 1 && axis === 'spec') {
        return {
          ...finalResult(axis, candidate),
          verdict: 'ISSUES_FOUND',
          findings: [{ id: 'F-001', severity: 'Important', summary: 'Needs a final fix.' }],
          reviewer: { id: 'final-spec-1', model: 'test', platform: 'test' },
        };
      }
      if (attempt > 1 && firstRun) {
        await writeFile(join(workspace, 'src', 'alpha.mjs'), "export const alpha = 'rogue';\n");
        throw new Error('ambiguous final reviewer transport');
      }
      if (attempt > 1) {
        assert.equal(await readFile(join(workspace, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'fixed';\n");
      }
      return {
        ...finalResult(axis, candidate),
        reviewer: {
          id: axis === 'spec' ? 'final-fixer' : `final-standards-${attempt}`,
          model: 'test',
          platform: 'test',
        },
      };
    },
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  }), (error) => error.message === 'ambiguous final reviewer transport');

  const manifestPath = join(root, '.loopx', 'exec', 'final-review-resume-history', 'manifest.json');
  const retained = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(retained.final_review.workers.fixers.some(({ id }) => id === 'final-fixer'), true);
  assert.equal(Object.values(retained.active_workers).some(({ status }) => status === 'uncertain'), true);
  await writeFile(
    join(retained.integration.workspace.path, 'src', 'alpha.mjs'),
    "export const alpha = 'committed-after-stale-manifest';\n",
  );
  await git(retained.integration.workspace.path, ['add', 'src/alpha.mjs']);
  await git(retained.integration.workspace.path, ['commit', '-m', 'simulate commit before manifest persist']);
  for (const worker of Object.values(retained.active_workers)) {
    worker.role = 'fix';
    worker.status = 'committing';
  }
  await writeFile(manifestPath, `${JSON.stringify(retained, null, 2)}\n`);
  firstRun = false;

  await assert.rejects(resumeAdaptiveExecution({
    cwd: root,
    runId: 'final-review-resume-history',
    confirmWorkerTerminal: async () => ({ terminal: true }),
    dispatchFinalReviewer: async ({ axis, attempt, workspace, candidate }) => {
      assert.equal(await readFile(join(workspace, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'fixed';\n");
      return {
        ...finalResult(axis, candidate),
        reviewer: {
          id: axis === 'spec' ? 'final-fixer' : `final-standards-${attempt}`,
          model: 'test',
          platform: 'test',
        },
      };
    },
    verifyCombined: async ({ phase }) => ({ status: 'passed', commands: [`verify ${phase}`] }),
  }), (error) => error.code === 'adaptive_final_review_not_fresh');
  const resumedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(await git(resumedManifest.integration.workspace.path, ['status', '--porcelain']), '');
  assert.equal(await readFile(join(resumedManifest.integration.workspace.path, 'src', 'alpha.mjs'), 'utf8'), "export const alpha = 'fixed';\n");
});

test('runs linear read-only planned tasks in dependency order with mandatory review', async () => {
  const outcomes = [outcome('alpha'), outcome('beta', ['alpha'])].map((current) => ({
    ...current,
    mutates: false,
    write_scope: [],
  }));
  const order = [];
  const result = await runAdaptiveExecution({
    cwd: process.cwd(),
    runId: 'read-only-linear',
    outcomes,
    runtimeCapability: { worker_capacity: 2, read_only_binding: true },
    dispatchWorker: async ({ outcome: current }) => {
      order.push(`implement:${current.id}`);
      return {
        worker: { id: `${current.id}-implementer`, model: 'test', platform: 'test' },
        report: `inspected ${current.id}`,
        verification: { status: 'passed', commands: [`verify ${current.id}`] },
      };
    },
    dispatchReviewer: async ({ taskId }) => {
      order.push(`review:${taskId}`);
      return {
        reviewer: { id: `${taskId}-reviewer`, model: 'test', platform: 'test' },
        rawMessage: approvedRawMessage(taskId),
      };
    },
    dispatchFinalReviewer: async ({ axis, candidate }) => finalResult(axis, candidate),
    verifyCombined: async () => ({ status: 'passed', commands: ['verify read-only'] }),
  });

  assert.equal(result.profile, 'delegated-serial-v1');
  assert.deepEqual(order, ['implement:alpha', 'review:alpha', 'implement:beta', 'review:beta']);
});

test('fails closed on a blocking read-only final review', async () => {
  const current = { ...outcome('alpha'), mutates: false, write_scope: [] };
  await assert.rejects(runAdaptiveExecution({
    cwd: process.cwd(),
    runId: 'read-only-final-block',
    outcomes: [current],
    runtimeCapability: { worker_capacity: 1, read_only_binding: true },
    dispatchWorker: async () => ({
      worker: { id: 'alpha-implementer', model: 'test', platform: 'test' },
      report: 'inspected alpha',
      verification: { status: 'passed', commands: ['verify alpha'] },
    }),
    dispatchReviewer: async ({ taskId }) => ({
      reviewer: { id: 'alpha-reviewer', model: 'test', platform: 'test' },
      rawMessage: approvedRawMessage(taskId),
    }),
    dispatchFinalReviewer: async ({ axis, candidate }) => axis === 'spec' ? {
      schema: 'loopx.final-review-result.v1',
      axis,
      verdict: 'ISSUES_FOUND',
      findings: [{ id: 'F-001', severity: 'Important', summary: 'The result is incomplete.' }],
      candidate,
      reviewer: { id: 'final-spec', model: 'test', platform: 'test' },
    } : finalResult(axis, candidate),
    verifyCombined: async () => ({ status: 'passed', commands: ['verify read-only'] }),
  }), (error) => error.code === 'adaptive_final_review_blocked');
});
