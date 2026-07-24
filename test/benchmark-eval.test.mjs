import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import {
  BENCHMARK_ARMS,
  EFFECT_SIZE_PAIRS,
  benchmarkEffectSize,
  bootstrapRateDelta,
  hiddenVerificationEnv,
  loadBenchmarkTasks,
  renderBenchmarkMarkdown,
  runBenchmarkEvaluation,
} from '../src/benchmark-eval.mjs';
import { deriveExecutionSelection } from '../src/codex-agent-trace.mjs';
import { createBenchmarkFakeAgent } from './fixtures/benchmark/fake-agent.mjs';
import { createBenchmarkVersionProductRepository } from './fixtures/benchmark/version-product.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;
const tasksRoot = join(repoRoot, 'evals', 'benchmark', 'tasks');
const fixtureRoot = join(repoRoot, 'test', 'fixtures', 'benchmark');
const docsOnlyAgentsPath = join(repoRoot, 'evals', 'benchmark', 'docs-only', 'AGENTS.md');
const execFileAsync = promisify(execFile);

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !~ ${expected}`);
}

async function listFilesRecursively(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursively(root, path));
    else files.push(path.slice(root.length + 1));
  }
  return files.sort();
}

test('bootstrapRateDelta is deterministic under a fixed seed with known outputs', () => {
  const baseline = [true, false, false, true, false, false, true, false];
  const candidate = [true, true, false, true, true, true, false, true];
  const first = bootstrapRateDelta(baseline, candidate, { iterations: 2000, seed: 42 });
  assert.deepEqual(first, {
    delta: 0.375,
    ci_low: -0.125,
    ci_high: 0.875,
    baseline_rate: 0.375,
    candidate_rate: 0.75,
    iterations: 2000,
    seed: 42,
    samples: { baseline: 8, candidate: 8 },
  });
  const second = bootstrapRateDelta(baseline, candidate, { iterations: 2000, seed: 42 });
  assert.deepEqual(second, first, 'same seed must reproduce the identical interval');
  const reseeded = bootstrapRateDelta(baseline, candidate, { iterations: 2000, seed: 7 });
  assert.equal(reseeded.delta, first.delta, 'observed delta does not depend on the seed');
  assert.notDeepEqual([reseeded.ci_low, reseeded.ci_high], [first.ci_low, first.ci_high]);
  assert.ok(first.ci_low <= first.delta && first.delta <= first.ci_high);
});

test('bootstrapRateDelta handles degenerate and empty samples fail-closed', () => {
  const degenerate = bootstrapRateDelta([false, false, false], [true, true, true], { iterations: 200, seed: 1 });
  assert.equal(degenerate.delta, 1);
  assert.equal(degenerate.ci_low, 1);
  assert.equal(degenerate.ci_high, 1);
  const empty = bootstrapRateDelta([], [true], { iterations: 200, seed: 1 });
  assert.equal(empty.delta, null);
  assert.equal(empty.ci_low, null);
  assert.equal(empty.ci_high, null);
  assert.throws(() => bootstrapRateDelta([true], [true], { iterations: 0 }), TypeError);
  assert.throws(() => bootstrapRateDelta('nope', [true]), TypeError);
});

test('benchmarkEffectSize reports pre-registered pairs with paired win rates', () => {
  const runs = [];
  for (const [arm, outcomes] of [
    ['bare', [false, false, true, true]],
    ['candidate', [true, true, true, false]],
  ]) {
    outcomes.forEach((passed, index) => {
      runs.push({
        arm,
        case_id: `task-${Math.floor(index / 2) + 1}`,
        replicate: (index % 2) + 1,
        benchmark_passed: passed,
      });
    });
  }
  const effect = benchmarkEffectSize(runs, { iterations: 500, seed: 3 });
  assert.equal(effect.method, 'seeded-bootstrap');
  assert.equal(effect.confidence, 0.95);
  assert.deepEqual(effect.pairs.map((pair) => pair.name), ['candidate_vs_bare']);
  const pair = effect.pairs[0];
  closeTo(pair.delta, 0.25, 'delta');
  assert.equal(pair.wins, 2);
  assert.equal(pair.losses, 1);
  assert.equal(pair.ties, 1);
  closeTo(pair.win_rate, 0.5, 'win_rate');
  assert.ok(pair.ci_low <= pair.delta && pair.delta <= pair.ci_high);
  assert.deepEqual(
    EFFECT_SIZE_PAIRS.map((entry) => entry.name),
    ['baseline_vs_bare', 'candidate_vs_bare', 'candidate_vs_baseline', 'docs_only_vs_bare', 'candidate_vs_docs_only'],
    'comparisons are pre-registered',
  );
});

test('loads the five seed tasks and enforces the hidden-test layout contract', async () => {
  const tasks = await loadBenchmarkTasks(tasksRoot);
  assert.deepEqual(tasks.map((task) => task.id), [
    'escalation-trap-message-format',
    'feature-slugify',
    'parallel-trap-shared-settings',
    'refactor-format-price',
    'seeded-defect-chunk-boundary',
  ]);
  assert.deepEqual(new Set(tasks.map((task) => task.kind)), new Set([
    'escalation-trap', 'feature', 'parallel-trap', 'refactor', 'seeded-defect',
  ]));
  const escalation = tasks.find((task) => task.kind === 'escalation-trap');
  assert.equal(escalation.hidden_verification, null, 'escalation trap is judged without hidden tests');
  assert.equal(escalation.hidden_root, null);
  assert.equal(escalation.trace_kind, 'governed-escalation');
  assert.equal(escalation.expected.execution_selection, 'blocked');
  assert.deepEqual(escalation.expected.changed_paths, []);
  for (const task of tasks.filter((item) => item.kind !== 'escalation-trap')) {
    assert.deepEqual(task.hidden_verification.command, ['node', '--test', '.benchmark-hidden/**/*.test.mjs']);
    const hiddenFiles = await listFilesRecursively(task.hidden_root);
    assert.ok(hiddenFiles.some((file) => file.endsWith('.test.mjs')), `${task.id} hidden judge tests exist`);
  }

  // TC-09 static half: no fixture the agent receives contains hidden material.
  for (const task of tasks) {
    const fixtureFiles = await listFilesRecursively(join(fixtureRoot, task.fixture));
    assert.deepEqual(
      fixtureFiles.filter((file) => file.toLowerCase().includes('hidden')),
      [],
      `${task.fixture} fixture must not contain hidden judge files`,
    );
  }
});

test('rejects hidden directories that are not declared by the task contract', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-benchmark-tasks-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'stray-task', 'hidden'), { recursive: true });
  await writeFile(join(root, 'stray-task', 'hidden', 'x.test.mjs'), 'export {};\n');
  await writeFile(join(root, 'stray-task', 'task.json'), `${JSON.stringify({
    schema: 'loopx.benchmark-task.v1',
    id: 'stray-task',
    kind: 'feature',
    fixture: 'textlib',
    task: 'noop',
    expected: { spec: 'consistent', memory: 'none' },
    hidden_verification: null,
  }, null, 2)}\n`);
  await assert.rejects(loadBenchmarkTasks(root), /benchmark_task_hidden_undeclared:stray-task/);
});

test('hidden suites discriminate: seeded defect fails and characterization passes on pristine fixtures', async (t) => {
  const tasks = await loadBenchmarkTasks(tasksRoot);
  const expectations = {
    'seeded-defect-chunk-boundary': false,
    'feature-slugify': false,
    'parallel-trap-shared-settings': false,
    'refactor-format-price': true,
  };
  const root = await mkdtemp(join(tmpdir(), 'loopx-benchmark-pristine-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [taskId, shouldPass] of Object.entries(expectations)) {
    const task = tasks.find((item) => item.id === taskId);
    const workdir = join(root, taskId);
    await execFileAsync('cp', ['-R', join(fixtureRoot, task.fixture), workdir]);
    await execFileAsync('cp', ['-R', task.hidden_root, join(workdir, '.benchmark-hidden')]);
    // Like the harness, the judge process must not inherit nested test-runner
    // state (NODE_TEST_CONTEXT makes a nested `node --test` a silent no-op).
    const passed = await execFileAsync(
      task.hidden_verification.command[0],
      task.hidden_verification.command.slice(1),
      { cwd: workdir, env: hiddenVerificationEnv() },
    ).then(() => true, () => false);
    assert.equal(passed, shouldPass, `${taskId} hidden suite on the pristine fixture`);
  }
});

test('judge processes never inherit nested test-runner state', () => {
  const env = hiddenVerificationEnv({
    PATH: '/usr/bin',
    NODE_TEST_CONTEXT: 'child-v8',
    NODE_TEST_WORKER_ID: '1',
    HOME: '/tmp/home',
  });
  assert.deepEqual(env, { PATH: '/usr/bin', HOME: '/tmp/home' });
});

test('escalation-trap scoring inherits the fail-closed trace derivation', () => {
  assert.equal(deriveExecutionSelection('governed-escalation', { agent_count: 0 }, []), 'unknown', 'no trace evidence stays unknown, never blocked');
  assert.equal(deriveExecutionSelection('governed-escalation', { agent_count: 1 }, [{ event: 'run_start' }]), 'proceeded');
  assert.equal(
    deriveExecutionSelection('governed-escalation', { agent_count: 0 }, [
      { event: 'tool_call', tool: 'apply_patch' },
    ]),
    'proceeded',
  );
  assert.equal(deriveExecutionSelection('governed-escalation', { agent_count: 0 }, [{ event: 'run_start' }]), 'blocked');
});

test('four-arm dry run produces a v1 report with effect sizes and keeps hidden tests invisible to agents', async (t) => {
  const productRoot = await mkdtemp(join(tmpdir(), 'loopx-benchmark-product-'));
  t.after(() => rm(productRoot, { recursive: true, force: true }));
  const product = await createBenchmarkVersionProductRepository(productRoot);
  const agent = createBenchmarkFakeAgent();
  const report = await runBenchmarkEvaluation({
    tasksRoot,
    fixtureRoot,
    projectRoot: product.root,
    runAgent: agent.run,
    arms: [...BENCHMARK_ARMS],
    replicates: 2,
    order: 'crossover',
    versionRefs: product.versionRefs,
    docsOnlyAgentsPath,
    configuration: {
      timeout_ms: 60000,
      adapter: { name: 'benchmark-fake-agent', version: '1.0.0' },
    },
    bootstrap: { iterations: 2000, seed: 11 },
  });

  // TC-08: schema, arms, and effect-size section.
  assert.equal(report.schema, 'loopx.benchmark-report.v1');
  assert.deepEqual(report.arms, ['bare', 'docs-only', 'baseline', 'candidate']);
  assert.equal(report.runs.length, 40, '5 tasks x 2 replicates x (3 crossover arms + docs-only)');
  assert.equal(report.provenance.versions.baseline.requested_ref, 'benchmark-baseline');
  assert.equal(report.provenance.versions.candidate.requested_ref, 'benchmark-candidate');
  assert.match(report.provenance.docs_only.agents_sha256, /^[a-f0-9]{64}$/);
  closeTo(report.arm_summary.bare.pass_rate, 0.4, 'bare pass rate');
  closeTo(report.arm_summary['docs-only'].pass_rate, 0.8, 'docs-only pass rate');
  closeTo(report.arm_summary.baseline.pass_rate, 0.8, 'baseline pass rate');
  closeTo(report.arm_summary.candidate.pass_rate, 1, 'candidate pass rate');
  const pairByName = Object.fromEntries(report.effect_size.pairs.map((pair) => [pair.name, pair]));
  closeTo(pairByName.baseline_vs_bare.delta, 0.4, 'C vs A delta');
  closeTo(pairByName.candidate_vs_bare.delta, 0.6, 'D vs A delta');
  closeTo(pairByName.candidate_vs_baseline.delta, 0.2, 'D vs C delta');
  closeTo(pairByName.docs_only_vs_bare.delta, 0.4, 'B vs A delta');
  closeTo(pairByName.candidate_vs_docs_only.delta, 0.2, 'D vs B delta');
  assert.equal(pairByName.candidate_vs_bare.wins, 6);
  assert.equal(pairByName.candidate_vs_bare.losses, 0);
  assert.equal(pairByName.candidate_vs_bare.ties, 4);
  closeTo(pairByName.candidate_vs_bare.win_rate, 0.6, 'D vs A win rate');
  for (const pair of report.effect_size.pairs) {
    assert.ok(pair.ci_low <= pair.delta && pair.delta <= pair.ci_high, `${pair.name} CI contains the observed delta`);
  }
  assert.equal(report.effect_size.seed, 11);
  const markdown = renderBenchmarkMarkdown(report);
  assert.match(markdown, /## Effect Size/);
  assert.match(markdown, /seed 11, 95% percentile confidence intervals/);
  assert.match(markdown, /\| bare -> candidate \|/);
  assert.match(markdown, /## Arm Summary/);

  // TC-09 runtime half: agents never observed hidden material.
  const requests = agent.requests();
  assert.equal(requests.length, 40);
  for (const request of requests) {
    assert.deepEqual(request.hidden_paths_during_run, [], `${request.case_id}/${request.arm} saw no hidden paths`);
    assert.equal(request.hidden_injection_dir_present, false);
    assert.equal(request.loopx_env_keys.length, 0);
  }
  assert.equal(new Set(requests.map((request) => request.workspace)).size, 40, 'fresh fixture per run');
  const hiddenRuns = report.runs.filter((run) => run.case_id !== 'escalation-trap-message-format');
  for (const run of hiddenRuns) {
    assert.equal(run.hidden.injected_after_agent, true, 'hidden tests are injected only after the agent finished');
    assert.ok(['passed', 'failed'].includes(run.hidden.status));
    assert.equal(run.isolation.source_fixture_unchanged, true);
  }
  for (const run of report.runs.filter((item) => item.case_id === 'escalation-trap-message-format')) {
    assert.equal(run.hidden, null);
  }

  // Hidden tests discriminate beyond the visible suite: the bare arm's fake
  // "fix" keeps the visible suite green but fails the hidden regression.
  const bareDefect = report.runs.find((run) => run.arm === 'bare' && run.case_id === 'seeded-defect-chunk-boundary');
  assert.equal(bareDefect.outcome, 'passed', 'visible verification alone would have accepted the non-fix');
  assert.equal(bareDefect.hidden.passed, false);
  assert.equal(bareDefect.benchmark_passed, false);
  const candidateDefect = report.runs.find((run) => run.arm === 'candidate' && run.case_id === 'seeded-defect-chunk-boundary');
  assert.equal(candidateDefect.hidden.passed, true);
  assert.equal(candidateDefect.benchmark_passed, true);

  // Parallel trap: the shared-state lost update fails integration on the
  // baseline arm and passes on the candidate arm.
  const baselineParallel = report.runs.find((run) => run.arm === 'baseline' && run.case_id === 'parallel-trap-shared-settings');
  assert.equal(baselineParallel.hidden.passed, false);
  assert.equal(baselineParallel.benchmark_passed, false);
  const candidateParallel = report.runs.find((run) => run.arm === 'candidate' && run.case_id === 'parallel-trap-shared-settings');
  assert.equal(candidateParallel.benchmark_passed, true);

  // Escalation trap: proceeding mutates the repo and fails; stopping passes.
  const bareEscalation = report.runs.find((run) => run.arm === 'bare' && run.case_id === 'escalation-trap-message-format');
  assert.equal(bareEscalation.benchmark_passed, false);
  assert.ok(bareEscalation.safety.violations.includes('changed_paths_mismatch'));
  assert.ok(bareEscalation.safety.violations.includes('execution_selection_mismatch'));
  const candidateEscalation = report.runs.find((run) => run.arm === 'candidate' && run.case_id === 'escalation-trap-message-format');
  assert.equal(candidateEscalation.benchmark_passed, true);
  // Canonical loopx escalation writes an intake package; the raw evidence
  // records it while the allowed-prefix rule keeps the verdict unbiased.
  assert.deepEqual(candidateEscalation.changed_paths, ['.loopx/intake/2026-07-24-versioned-public-message/clarification.md']);
  assert.equal(candidateEscalation.safety.violations.includes('changed_paths_mismatch'), false);
  assert.equal(candidateEscalation.safety.violations.includes('workflow_artifacts_present'), false);
  assert.match(candidateEscalation.response, /compatibility decision/i);

  // The docs-only overlay is part of the committed fixture baseline, not a diff.
  const docsOnlyRuns = report.runs.filter((run) => run.arm === 'docs-only');
  assert.equal(docsOnlyRuns.length, 10);
  assert.ok(requests.filter((request) => request.arm === 'docs-only').every((request) => request.repo_agents_md));
  assert.ok(docsOnlyRuns.every((run) => !run.changed_paths.includes('AGENTS.md')));
});

test('benchmark runner is an opt-in packaged diagnostic with a deterministic dry run', async (t) => {
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['eval:benchmark'], 'node scripts/run-benchmark-evals.mjs');
  assert.equal(packageJson.files.includes('scripts/run-benchmark-evals.mjs'), true);
  assert.equal(packageJson.files.includes('evals/benchmark/'), true);
  assert.equal(packageJson.files.includes('test/fixtures/benchmark/'), true);
  assert.doesNotMatch(packageJson.scripts.test, /benchmark/);

  const { stdout } = await execFileAsync(process.execPath, ['scripts/run-benchmark-evals.mjs', '--help'], { cwd: repoRoot });
  assert.match(stdout, /opt-in four-arm product benchmark/i);
  assert.match(stdout, /bare \(A\), docs-only \(B\), baseline \(C\), candidate \(D\)/);
  assert.match(stdout, /--dry-run/);
  assert.match(stdout, /hidden tests are never visible to the agent/i);
  await assert.rejects(
    execFileAsync(process.execPath, ['scripts/run-benchmark-evals.mjs'], { cwd: repoRoot }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /Refusing to invoke live models without --live/);
      return true;
    },
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      'scripts/run-benchmark-evals.mjs', '--live', '--model', 'not-invoked',
      '--arms', 'baseline,candidate',
    ], { cwd: repoRoot }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /require --baseline-ref and --candidate-ref/);
      return true;
    },
  );

  const outDir = await mkdtemp(join(tmpdir(), 'loopx-benchmark-out-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await execFileAsync(process.execPath, [
    'scripts/run-benchmark-evals.mjs', '--dry-run',
    '--task', 'seeded-defect-chunk-boundary',
    '--replicates', '2', '--iterations', '400', '--seed', '5',
    '--out', outDir,
  ], { cwd: repoRoot });
  const report = JSON.parse(await readFile(join(outDir, 'report.json'), 'utf8'));
  assert.equal(report.schema, 'loopx.benchmark-report.v1');
  assert.deepEqual(report.arms, ['bare', 'docs-only', 'baseline', 'candidate']);
  assert.equal(report.runs.length, 8);
  assert.equal(report.effect_size.seed, 5);
  assert.ok(report.effect_size.pairs.length > 0);
  const markdown = await readFile(join(outDir, 'report.md'), 'utf8');
  assert.match(markdown, /## Effect Size/);
  const evidence = JSON.parse(await readFile(join(outDir, 'dry-run-requests.json'), 'utf8'));
  assert.equal(evidence.length, 8);
  assert.ok(evidence.every((request) => request.hidden_paths_during_run.length === 0
    && request.hidden_injection_dir_present === false));
});
