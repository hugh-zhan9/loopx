import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  PARALLEL_SCHEMA_IDS,
  inspectParallelInput,
  validateParallelManifest,
} from '../skills/shared/scripts/parallel-plan-contract.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');
const cliPath = join(repoRoot, 'skills', 'shared', 'scripts', 'parallel-plan-contract.mjs');

function jsonFence(name, value) {
  return `\`\`\`${name}\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function taskSection({ anchor, files, metadata }) {
  return [
    `### ${anchor} / Task ${Number(anchor.slice(2))}: Example`,
    '',
    '**Files:**',
    ...files.map(([action, path]) => `- ${action}: \`${path}\``),
    '',
    '**Parallel execution:**',
    '',
    jsonFence('loopx-parallel-task', metadata),
    '',
    '**Interfaces:**',
    '- Consumes: fixture input.',
    '- Produces: fixture output.',
  ].join('\n');
}

async function writePlan(root, relativePath, { maxParallel = 4, tasks, extraPlanBlocks = [] }) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  const blocks = [
    '# Fixture Plan',
    '',
    jsonFence('loopx-parallel-plan', {
      schema: PARALLEL_SCHEMA_IDS.plan,
      max_parallel: maxParallel,
    }),
    ...extraPlanBlocks,
    '',
    ...tasks.map(taskSection),
    '',
  ];
  await writeFile(path, blocks.join('\n'));
  return path;
}

function task(anchor, { dependsOn = [], writeScope, parallelSafe = true, files = null } = {}) {
  const scope = writeScope || [`src/${anchor.toLowerCase()}.mjs`];
  return {
    anchor,
    files: files || scope.map((path) => ['Create', path]),
    metadata: {
      schema: PARALLEL_SCHEMA_IDS.task,
      task_anchor: anchor,
      depends_on: dependsOn,
      write_scope: scope,
      parallel_safe: parallelSafe,
    },
  };
}

async function fixtureRoot() {
  return realpath(await mkdtemp(join(tmpdir(), 'loopx-parallel-plan-')));
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('normalizes a strict single plan manifest', async () => {
  const root = await fixtureRoot();
  const inputPath = await writePlan(root, 'docs/loopx/plans/2026-07-14-example.md', {
    tasks: [
      task('T-001'),
      task('T-002', { dependsOn: ['T-001'] }),
    ],
  });

  const manifest = await inspectParallelInput({ inputPath, repoRoot: root });

  assert.equal(manifest.schema, PARALLEL_SCHEMA_IDS.manifest);
  assert.equal(manifest.scope, 'single-plan');
  assert.equal(manifest.max_parallel, 4);
  assert.equal(manifest.plans.length, 1);
  assert.deepEqual(manifest.plans[0].tasks.map(({ task_anchor }) => task_anchor), ['T-001', 'T-002']);
  assert.match(manifest.input.sha256, /^[a-f0-9]{64}$/);
  assert.equal(validateParallelManifest(manifest), manifest);
});

test('revalidates task DAGs and concurrent overlap in a normalized manifest', async () => {
  const root = await fixtureRoot();
  const inputPath = await writePlan(root, 'docs/loopx/plans/example.md', {
    tasks: [
      task('T-001'),
      task('T-002', { dependsOn: ['T-001'] }),
    ],
  });
  const manifest = await inspectParallelInput({ inputPath, repoRoot: root });

  const missingDependency = structuredClone(manifest);
  missingDependency.plans[0].tasks[1].depends_on = ['T-999'];
  assert.throws(
    () => validateParallelManifest(missingDependency),
    (error) => error.code === 'parallel_dependency_missing',
  );

  const overlap = structuredClone(manifest);
  overlap.plans[0].tasks[1].depends_on = [];
  overlap.plans[0].tasks[1].write_scope = [...overlap.plans[0].tasks[0].write_scope];
  assert.throws(
    () => validateParallelManifest(overlap),
    (error) => error.code === 'parallel_write_scope_overlap',
  );

  const invalidPlanDependencies = structuredClone(manifest);
  invalidPlanDependencies.plans[0].depends_on = 'docs/loopx/plans/other.md';
  assert.throws(
    () => validateParallelManifest(invalidPlanDependencies),
    (error) => error.code === 'parallel_dependency_invalid',
  );
});

test('returns a stable contract error for a non-array dependency declaration', async () => {
  const root = await fixtureRoot();
  const example = task('T-001');
  example.metadata.depends_on = 'T-1';
  const inputPath = await writePlan(root, 'docs/loopx/plans/example.md', { tasks: [example] });

  await expectCode(inspectParallelInput({ inputPath, repoRoot: root }), 'parallel_dependency_invalid');
});

test('normalizes a package DAG and honors the invocation max override', async () => {
  const root = await fixtureRoot();
  const packageDir = 'docs/loopx/plans/2026-07-14-package';
  const first = `${packageDir}/01-core.md`;
  const second = `${packageDir}/02-state.md`;
  await writePlan(root, first, { tasks: [task('T-001', { writeScope: ['src/core.mjs'] })] });
  await writePlan(root, second, { tasks: [task('T-001', { writeScope: ['src/state.mjs'] })] });
  const overviewPath = join(root, packageDir, '00-overview.md');
  await writeFile(overviewPath, [
    '# Package',
    '',
    jsonFence('loopx-parallel-package', {
      schema: PARALLEL_SCHEMA_IDS.package,
      max_parallel: 4,
      plans: [
        { path: first, depends_on: [], can_run_in_parallel: true },
        { path: second, depends_on: [first], can_run_in_parallel: true },
      ],
    }),
    '',
  ].join('\n'));

  const manifest = await inspectParallelInput({ inputPath: overviewPath, repoRoot: root, maxParallelOverride: 2 });

  assert.equal(manifest.scope, 'package');
  assert.equal(manifest.max_parallel, 2);
  assert.deepEqual(manifest.plans.map(({ path }) => path), [first, second]);
  assert.deepEqual(manifest.plans[1].depends_on, [first]);
});

test('rejects strict schema, dependency, path, and fence violations', async (t) => {
  const cases = [
    ['unsupported schema', (value) => { value.schema = 'loopx.parallel-task.v2'; }, 'parallel_schema_unsupported'],
    ['unknown field', (value) => { value.extra = true; }, 'parallel_unknown_field'],
    ['absolute path', (value) => { value.write_scope = ['/tmp/app.mjs']; }, 'parallel_write_scope_invalid'],
    ['parent traversal', (value) => { value.write_scope = ['../app.mjs']; }, 'parallel_write_scope_invalid'],
    ['glob path', (value) => { value.write_scope = ['src/**/*.mjs']; }, 'parallel_write_scope_invalid'],
    ['missing dependency', (value) => { value.depends_on = ['T-999']; }, 'parallel_dependency_missing'],
    ['anchor mismatch', (value) => { value.task_anchor = 'T-999'; }, 'parallel_task_anchor_mismatch'],
  ];

  for (const [name, mutate, code] of cases) {
    await t.test(name, async () => {
      const root = await fixtureRoot();
      const example = task('T-001');
      mutate(example.metadata);
      const inputPath = await writePlan(root, 'docs/loopx/plans/example.md', { tasks: [example] });
      await expectCode(inspectParallelInput({ inputPath, repoRoot: root }), code);
    });
  }

  await t.test('cycle', async () => {
    const root = await fixtureRoot();
    const inputPath = await writePlan(root, 'docs/loopx/plans/example.md', {
      tasks: [
        task('T-001', { dependsOn: ['T-002'] }),
        task('T-002', { dependsOn: ['T-001'] }),
      ],
    });
    await expectCode(inspectParallelInput({ inputPath, repoRoot: root }), 'parallel_dependency_cycle');
  });

  await t.test('duplicate plan fence', async () => {
    const root = await fixtureRoot();
    const duplicate = jsonFence('loopx-parallel-plan', { schema: PARALLEL_SCHEMA_IDS.plan, max_parallel: 4 });
    const inputPath = await writePlan(root, 'docs/loopx/plans/example.md', {
      tasks: [task('T-001')],
      extraPlanBlocks: [duplicate],
    });
    await expectCode(inspectParallelInput({ inputPath, repoRoot: root }), 'parallel_fence_duplicate');
  });
});

test('requires write_scope to equal Create and Modify files while excluding Test files', async () => {
  const root = await fixtureRoot();
  const inputPath = await writePlan(root, 'docs/loopx/plans/example.md', {
    tasks: [task('T-001', {
      writeScope: ['src/app.mjs', 'test/app.test.mjs'],
      files: [
        ['Create', 'src/app.mjs'],
        ['Test', 'test/app.test.mjs'],
      ],
    })],
  });

  await expectCode(inspectParallelInput({ inputPath, repoRoot: root }), 'parallel_write_scope_files_mismatch');
});

test('rejects unordered concurrent task and child write overlap', async (t) => {
  await t.test('task overlap', async () => {
    const root = await fixtureRoot();
    const inputPath = await writePlan(root, 'docs/loopx/plans/example.md', {
      tasks: [
        task('T-001', { writeScope: ['src/shared.mjs'] }),
        task('T-002', { writeScope: ['src/shared.mjs'] }),
      ],
    });
    await expectCode(inspectParallelInput({ inputPath, repoRoot: root }), 'parallel_write_scope_overlap');
  });

  await t.test('package overlap', async () => {
    const root = await fixtureRoot();
    const packageDir = 'docs/loopx/plans/package';
    const first = `${packageDir}/01-a.md`;
    const second = `${packageDir}/02-b.md`;
    await writePlan(root, first, { tasks: [task('T-001', { writeScope: ['src/shared.mjs'] })] });
    await writePlan(root, second, { tasks: [task('T-001', { writeScope: ['src/shared.mjs'] })] });
    const overviewPath = join(root, packageDir, '00-overview.md');
    await writeFile(overviewPath, jsonFence('loopx-parallel-package', {
      schema: PARALLEL_SCHEMA_IDS.package,
      max_parallel: 4,
      plans: [
        { path: first, depends_on: [], can_run_in_parallel: true },
        { path: second, depends_on: [], can_run_in_parallel: true },
      ],
    }));
    await expectCode(inspectParallelInput({ inputPath: overviewPath, repoRoot: root }), 'parallel_write_scope_overlap');
  });
});

test('rejects a direct numbered child input with the conservative handoff code', async () => {
  const root = await fixtureRoot();
  const inputPath = await writePlan(root, 'docs/loopx/plans/package/01-core.md', { tasks: [task('T-001')] });
  await expectCode(inspectParallelInput({ inputPath, repoRoot: root }), 'parallel_direct_child_unsupported');
});

test('CLI writes the immutable manifest and prints only its JSON summary', async () => {
  const root = await fixtureRoot();
  const inputPath = await writePlan(root, 'docs/loopx/plans/example.md', { tasks: [task('T-001')] });
  const outputPath = join(root, 'run', 'manifest.json');

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    cliPath,
    'manifest',
    'inspect',
    '--input',
    inputPath,
    '--output',
    outputPath,
  ], { cwd: root });

  assert.equal(stderr, '');
  const summary = JSON.parse(stdout);
  const manifest = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.deepEqual(summary, {
    ok: true,
    schema: PARALLEL_SCHEMA_IDS.manifest,
    scope: 'single-plan',
    output: outputPath,
    plans: 1,
    tasks: 1,
    max_parallel: 4,
  });
  assert.equal(manifest.schema, PARALLEL_SCHEMA_IDS.manifest);
});

test('validates the repository parallel-subagent-exec package through the shared owner', async () => {
  const inputPath = join(repoRoot, 'docs', 'loopx', 'plans', '2026-07-14-parallel-subagent-exec', '00-overview.md');
  const manifest = await inspectParallelInput({ inputPath, repoRoot });

  assert.equal(manifest.scope, 'package');
  assert.equal(manifest.plans.length, 5);
  assert.equal(manifest.plans.reduce((sum, plan) => sum + plan.tasks.length, 0), 12);
});
