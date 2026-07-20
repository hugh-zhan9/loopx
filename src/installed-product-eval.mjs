import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { compareInstalledProductRuns } from './agent-eval.mjs';
import { installSkillsForTargets } from './install-discovery.mjs';

const execFileAsync = promisify(execFile);

async function exists(path) {
  return access(path).then(() => true, () => false);
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

async function listFiles(root, current = root) {
  if (!await exists(current)) return [];
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, path));
    } else {
      files.push(normalizePath(relative(root, path)));
    }
  }
  return files.sort();
}

async function git(cwd, args) {
  return (await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 })).stdout;
}

async function directoryHash(root) {
  const hash = createHash('sha256');
  for (const path of await listFiles(root)) {
    hash.update(path);
    hash.update('\0');
    hash.update(await readFile(join(root, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function createFixture(source, tempRoot) {
  const parent = await mkdtemp(join(tempRoot, 'loopx-product-fixture-'));
  const repo = join(parent, 'repo');
  const sourceHash = await directoryHash(source);
  await cp(source, repo, { recursive: true });
  if (!await exists(join(repo, '.gitignore'))) {
    await writeFile(join(repo, '.gitignore'), '.loopx/runs/\n.loopx/evals/\n.worktrees/\n');
  }
  await git(repo, ['-c', 'init.defaultBranch=main', 'init', '--quiet']);
  await git(repo, ['config', 'user.name', 'loopx eval']);
  await git(repo, ['config', 'user.email', 'eval@loopx.invalid']);
  await git(repo, ['add', '-A']);
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture baseline'], {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
    },
  });
  return { parent, repo, source, sourceHash, tree: (await git(repo, ['rev-parse', 'HEAD^{tree}'])).trim() };
}

async function changedPaths(repo) {
  const [tracked, untracked] = await Promise.all([
    git(repo, ['diff', '--name-only', '-z', 'HEAD']),
    git(repo, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  return [...new Set(`${tracked}${untracked}`.split('\0').filter(Boolean))].sort();
}

function workerActivity(workers, limit, integrationOrder) {
  const intervals = (workers ?? [])
    .filter((worker) => Number.isFinite(worker.started_at_ms) && Number.isFinite(worker.ended_at_ms))
    .map((worker) => ({
      id: worker.id,
      started_at_ms: worker.started_at_ms,
      ended_at_ms: worker.ended_at_ms,
    }));
  const events = intervals.flatMap((worker) => [
    { at: worker.started_at_ms, delta: 1 },
    { at: worker.ended_at_ms, delta: -1 },
  ]).sort((left, right) => left.at - right.at || right.delta - left.delta);
  let active = 0;
  let peak = 0;
  let overlap = 0;
  let previous = events[0]?.at ?? 0;
  for (const event of events) {
    if (active >= 2) overlap += Math.max(0, event.at - previous);
    active += event.delta;
    peak = Math.max(peak, active);
    previous = event.at;
  }
  return {
    workers: intervals,
    peak_workers: peak,
    overlap_ms: overlap,
    bounded: peak <= limit,
    integration_order: integrationOrder ?? [],
  };
}

async function collectWorkflowArtifacts(repo) {
  const roots = ['.loopx/intake', '.loopx/workflows', '.loopx/runs', '.loopx/evals', '.worktrees'];
  const artifacts = [];
  for (const root of roots) {
    artifacts.push(...(await listFiles(repo, join(repo, root))).map((path) => `${root}/${path}`));
  }
  return artifacts.sort();
}

async function collectMemoryOutcomes(repo) {
  const paths = await listFiles(repo, join(repo, '.loopx', 'memory'));
  return paths.map((path) => ({ status: 'written', path: `.loopx/memory/${path}` }));
}

async function inspectExpectedFiles(repo, expected = {}) {
  const violations = [];
  for (const [path, fragment] of Object.entries(expected.file_contains ?? {})) {
    const content = await readFile(join(repo, path), 'utf8').catch(() => null);
    if (content === null || !content.includes(fragment)) {
      violations.push(`expected_content_missing:${path}`);
    }
  }
  return violations;
}

function sameStrings(left, right) {
  return JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...(right ?? [])].sort());
}

function expectedOutcomeViolations(testCase, raw, paths, artifacts, activity, memoryOutcomes) {
  const expected = testCase.expected ?? {};
  const violations = [];
  if (!sameStrings(paths, expected.changed_paths ?? [])) {
    violations.push('changed_paths_mismatch');
  }
  if (expected.workflow_artifacts === 'none' && artifacts.length > 0) {
    violations.push('workflow_artifacts_present');
  }
  if (expected.execution_mode && raw.execution_mode !== expected.execution_mode) {
    violations.push('execution_mode_mismatch');
  }
  if (Number.isFinite(expected.max_peak_workers) && activity.peak_workers > expected.max_peak_workers) {
    violations.push('peak_workers_exceeded');
  }
  if (!activity.bounded) {
    violations.push('worker_limit_exceeded');
  }
  if (expected.integration_order
      && activity.integration_order.length > 0
      && JSON.stringify(activity.integration_order) !== JSON.stringify(expected.integration_order)) {
    violations.push('integration_order_mismatch');
  }
  if (expected.response_pattern && !new RegExp(expected.response_pattern, 'i').test(raw.response ?? '')) {
    violations.push('response_mismatch');
  }
  if (expected.memory === 'none' && memoryOutcomes.length > 0) {
    violations.push('unexpected_memory');
  }
  if (expected.spec === 'updated' && !(raw.spec?.outcomes ?? []).some((outcome) => outcome.status === 'updated')) {
    violations.push('spec_not_updated');
  }
  return violations;
}

function orderedVariants(testCase, manifest, replicate, order) {
  const variants = [...(testCase.variants ?? [manifest.baseline_variant, manifest.candidate_variant])];
  const candidateFirst = order === 'candidate-first' || (order === 'crossover' && replicate % 2 === 1);
  if (!candidateFirst) return variants;
  const preferred = [manifest.candidate_variant, manifest.baseline_variant];
  return [...preferred.filter((variant) => variants.includes(variant)), ...variants.filter((variant) => !preferred.includes(variant))];
}

async function runWithTimeout(runAgent, request, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      runAgent({ ...request, signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`installed_product_eval_timeout:${timeoutMs}`));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runExternalVerification(repo, command, timeoutMs) {
  if (!Array.isArray(command) || command.length === 0) return null;
  const rendered = command.join(' ');
  try {
    await execFileAsync(command[0], command.slice(1), {
      cwd: repo,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { passed: true, command: rendered };
  } catch (error) {
    return {
      passed: false,
      command: rendered,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runOne({ testCase, variant, manifest, projectRoot, fixtureRoot, tempRoot, runAgent, replicate, configurationOverrides }) {
  const variantConfig = manifest.variants[variant];
  if (!variantConfig) throw new Error(`installed_product_eval_unknown_variant:${variant}`);
  const fixture = await createFixture(join(fixtureRoot, testCase.fixture), tempRoot);
  const hostParent = await mkdtemp(join(tempRoot, 'loopx-product-home-'));
  const home = join(hostParent, 'home');
  await mkdir(home, { recursive: true });
  const shared = { ...manifest.configuration, ...configurationOverrides };
  const configuration = {
    model: shared.model,
    effort: shared.effort,
    tools: shared.tools,
    task: testCase.task,
    timeout_ms: shared.timeout_ms,
    fixture_tree: fixture.tree,
  };
  const installEnv = {
    ...process.env,
    HOME: home,
    LOOPX_HOME: home,
    LOOPX_PROJECT_ROOT: projectRoot,
    LOOPX_INSTALL_CWD: fixture.repo,
  };
  const agentEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('LOOPX_')),
  );
  Object.assign(agentEnv, {
    HOME: home,
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
  });
  let installation = {
    requested: variantConfig.install_candidate === true,
    actual_installed_surface: false,
    candidate_prompt_injected: false,
  };
  let raw;
  let error = null;
  try {
    if (variantConfig.install_candidate === true) {
      const installed = await installSkillsForTargets(installEnv, { targets: ['codex'] });
      installation = {
        ...installation,
        ok: installed.ok,
        actual_installed_surface: installed.ok
          && await exists(join(home, '.codex', 'AGENTS.md'))
          && await exists(join(home, '.agents', 'skills', 'exec', 'SKILL.md')),
      };
    }
    raw = await runWithTimeout(runAgent, {
      case: testCase,
      prompt: testCase.task,
      configuration,
      execution_policy: { force_serial: variantConfig.force_serial === true, worker_limit: shared.worker_limit },
      repo: fixture.repo,
      home,
      env: agentEnv,
    }, shared.timeout_ms);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    raw = {
      outcome: 'failed',
      verification: { passed: false, commands: [] },
      execution_mode: 'failed',
      workers: [],
      integration_order: [],
      spec: { passed: false, outcomes: [] },
      memory: { passed: false, outcomes: [] },
    };
  }

  const externalVerification = await runExternalVerification(
    fixture.repo,
    shared.verification_command,
    shared.timeout_ms,
  );

  const paths = await changedPaths(fixture.repo);
  const artifacts = await collectWorkflowArtifacts(fixture.repo);
  const memoryOutcomes = await collectMemoryOutcomes(fixture.repo);
  const activity = workerActivity(raw.workers, shared.worker_limit, raw.integration_order);
  const sourceFixtureUnchanged = await directoryHash(fixture.source) === fixture.sourceHash;
  const violations = [
    ...expectedOutcomeViolations(testCase, raw, paths, artifacts, activity, memoryOutcomes),
    ...await inspectExpectedFiles(fixture.repo, testCase.expected),
  ];
  if (variantConfig.install_candidate === true && !installation.actual_installed_surface) {
    violations.push('candidate_install_missing');
  }
  if (!sourceFixtureUnchanged) {
    violations.push('source_fixture_mutated');
  }
  const verification = {
    agent_reported_passed: raw.verification?.passed === true,
    external_passed: externalVerification?.passed ?? null,
    passed: externalVerification
      ? externalVerification.passed
      : raw.verification?.passed === true
        && Array.isArray(raw.verification?.commands)
        && raw.verification.commands.length > 0,
    commands: externalVerification
      ? [externalVerification.command]
      : raw.verification?.commands ?? [],
  };
  if (externalVerification?.error) verification.error = externalVerification.error;
  const spec = {
    passed: raw.spec?.passed === true && !violations.some((item) => item.startsWith('spec_')),
    outcomes: raw.spec?.outcomes ?? [],
  };
  const memory = {
    passed: raw.memory?.passed === true && !violations.includes('unexpected_memory'),
    outcomes: memoryOutcomes.length > 0 ? memoryOutcomes : raw.memory?.outcomes ?? [],
  };
  const safety = { passed: violations.length === 0, violations };
  const run = {
    run_id: `${testCase.id}-${variant}-${replicate + 1}`,
    case_id: testCase.id,
    case_kind: testCase.kind,
    variant,
    replicate: replicate + 1,
    configuration,
    installation,
    execution_policy: { force_serial: variantConfig.force_serial === true, worker_limit: shared.worker_limit },
    outcome: raw.outcome === 'passed' && verification.passed && safety.passed ? 'passed' : 'failed',
    verification,
    changed_paths: paths,
    workflow_artifacts: artifacts,
    worker_activity: activity,
    execution_mode: raw.execution_mode,
    total_tokens: Number.isFinite(raw.tokens?.total) ? raw.tokens.total : null,
    tokens: raw.tokens ?? { input: null, output: null, total: null },
    latency_ms: Number.isFinite(raw.latency_ms) ? raw.latency_ms : null,
    spec,
    memory,
    safety,
    isolation: { source_fixture_unchanged: sourceFixtureUnchanged },
    response: raw.response ?? '',
    error,
    cleanup: { workspace_removed: false, host_home_removed: false },
  };
  await rm(fixture.parent, { recursive: true, force: true });
  await rm(hostParent, { recursive: true, force: true });
  run.cleanup.workspace_removed = !await exists(fixture.parent);
  run.cleanup.host_home_removed = !await exists(hostParent);
  return run;
}

export async function runInstalledProductEvaluation(options) {
  const {
    manifest,
    projectRoot,
    fixtureRoot,
    runAgent,
    selectedCaseIds = null,
    replicates = 2,
    order = 'crossover',
    tempRoot = tmpdir(),
    configuration = {},
  } = options;
  if (manifest?.schema !== 'loopx.installed-product-eval.v1') {
    throw new Error('installed_product_eval_manifest_invalid');
  }
  if (typeof runAgent !== 'function') {
    throw new TypeError('runAgent is required');
  }
  if (!Number.isInteger(replicates) || replicates < 1) {
    throw new TypeError('replicates must be a positive integer');
  }
  if (!['crossover', 'baseline-first', 'candidate-first'].includes(order)) {
    throw new TypeError('order must be crossover, baseline-first, or candidate-first');
  }
  await mkdir(resolve(tempRoot), { recursive: true });
  const selected = selectedCaseIds
    ? manifest.cases.filter((testCase) => selectedCaseIds.includes(testCase.id))
    : manifest.cases;
  if (selectedCaseIds && selected.length !== selectedCaseIds.length) {
    throw new Error('installed_product_eval_case_not_found');
  }
  const runs = [];
  for (const testCase of selected) {
    for (let replicate = 0; replicate < replicates; replicate += 1) {
      for (const variant of orderedVariants(testCase, manifest, replicate, order)) {
        runs.push(await runOne({
          testCase,
          variant,
          manifest,
          projectRoot: resolve(projectRoot),
          fixtureRoot: resolve(fixtureRoot),
          tempRoot: resolve(tempRoot),
          runAgent,
          replicate,
          configurationOverrides: configuration,
        }));
      }
    }
  }
  const comparison = compareInstalledProductRuns(runs, {
    baselineVariant: manifest.baseline_variant,
    candidateVariant: manifest.candidate_variant,
    forcedSerialVariant: manifest.forced_serial_variant,
  });
  return { schema: 'loopx.installed-product-eval-report.v1', runs, comparison };
}
