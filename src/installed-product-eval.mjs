import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { compareInstalledProductRuns } from './agent-eval.mjs';
import { installSkillsForTargets } from './install-discovery.mjs';
import { stableJson } from './stable-json.mjs';
import { installVersionProduct, prepareVersionProducts } from './version-product-source.mjs';

const execFileAsync = promisify(execFile);

async function exists(path) {
  return access(path).then(() => true, () => false);
}

async function removeTree(path) {
  await rm(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function createFixture(source, tempRoot, registerParent) {
  const parent = await mkdtemp(join(tempRoot, 'loopx-product-fixture-'));
  registerParent(parent);
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

function workerActivity(workers, limit, integrationOrder, repo) {
  const intervals = (workers ?? [])
    .filter((worker) => Number.isFinite(worker.started_at_ms)
      && Number.isFinite(worker.ended_at_ms)
      && worker.ended_at_ms > worker.started_at_ms)
    .map((worker) => ({
      id: worker.id,
      started_at_ms: worker.started_at_ms,
      ended_at_ms: worker.ended_at_ms,
      workspace: worker.workspace ?? null,
    }));
  const events = intervals.flatMap((worker) => [
    { at: worker.started_at_ms, delta: 1 },
    { at: worker.ended_at_ms, delta: -1 },
  ]).sort((left, right) => left.at - right.at || left.delta - right.delta);
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
  const workerRoots = intervals.map((worker) => worker.workspace).filter(Boolean).map((path) => resolve(path));
  const isolated = overlap === 0 || (
    workerRoots.length === intervals.length
    && new Set(workerRoots).size === workerRoots.length
    && workerRoots.every((path) => path !== resolve(repo))
  );
  return {
    workers: intervals,
    peak_workers: peak,
    overlap_ms: overlap,
    bounded: peak <= limit,
    isolated,
    integration_order: integrationOrder ?? [],
  };
}

async function collectWorkflowArtifacts(repo) {
  const loopx = (await listFiles(join(repo, '.loopx')))
    .filter((path) => path !== 'memory' && !path.startsWith('memory/'))
    .map((path) => `.loopx/${path}`);
  const worktrees = (await listFiles(join(repo, '.worktrees')))
    .map((path) => `.worktrees/${path}`);
  return [...loopx, ...worktrees].sort();
}

async function collectMemoryState(repo) {
  const memoryRoot = join(repo, '.loopx', 'memory');
  const paths = await listFiles(memoryRoot);
  return new Map(await Promise.all(paths.map(async (path) => [
    `.loopx/memory/${path}`,
    await readFile(join(memoryRoot, path), 'utf8'),
  ])));
}

function changedMemoryPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
}

function occurrences(content, fragment) {
  if (!fragment) return 0;
  return content.split(fragment).length - 1;
}

function evaluateMemory(expected, before, after) {
  const changed = changedMemoryPaths(before, after);
  if (expected.memory === 'none') {
    return {
      passed: changed.length === 0,
      outcomes: changed.map((path) => ({ status: 'unexpected', path })),
      violations: changed.length === 0 ? [] : ['unexpected_memory'],
    };
  }
  const path = expected.memory_path;
  const content = after.get(path) ?? '';
  if (expected.memory === 'written') {
    const passed = changed.length === 1
      && changed[0] === path
      && occurrences(content, expected.memory_contains) === 1;
    return {
      passed,
      outcomes: passed ? [{ status: 'written', path }] : [],
      violations: passed ? [] : ['memory_write_imprecise'],
    };
  }
  if (expected.memory === 'deduplicated') {
    const passed = changed.length === 0 && occurrences(content, expected.memory_contains) === 1;
    return {
      passed,
      outcomes: passed ? [{ status: 'deduplicated', path }] : [],
      violations: passed ? [] : ['memory_not_deduplicated'],
    };
  }
  return { passed: false, outcomes: [], violations: ['memory_expectation_invalid'] };
}

function evaluateSpec(expected, paths) {
  if (expected.spec === 'updated') {
    const outcomes = (expected.spec_paths ?? []).map((path) => ({
      status: paths.includes(path) ? 'updated' : 'stale',
      path,
    }));
    const passed = outcomes.length > 0 && outcomes.every((outcome) => outcome.status === 'updated');
    return { passed, outcomes, violations: passed ? [] : ['spec_not_updated'] };
  }
  if (expected.spec === 'consistent') {
    return { passed: true, outcomes: [], violations: [] };
  }
  return { passed: false, outcomes: [], violations: ['spec_expectation_invalid'] };
}

async function temporaryWorktrees(repo) {
  const [output, primary] = await Promise.all([
    git(repo, ['worktree', 'list', '--porcelain']),
    git(repo, ['rev-parse', '--show-toplevel']),
  ]);
  return output.split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((path) => resolve(path) !== resolve(primary.trim()));
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

function expectedOutcomeViolations(testCase, raw, paths, artifacts, activity, retainedWorktrees) {
  const expected = testCase.expected ?? {};
  const violations = [];
  if (!sameStrings(paths, expected.changed_paths ?? [])) {
    violations.push('changed_paths_mismatch');
  }
  if (expected.workflow_artifacts === 'none' && artifacts.length > 0) {
    violations.push('workflow_artifacts_present');
  }
  if (expected.execution_selection && raw.execution_selection !== expected.execution_selection) {
    violations.push('execution_selection_mismatch');
  }
  if (Number.isFinite(expected.max_peak_workers) && activity.peak_workers > expected.max_peak_workers) {
    violations.push('peak_workers_exceeded');
  }
  if (!activity.bounded) {
    violations.push('worker_limit_exceeded');
  }
  if (!activity.isolated) {
    violations.push('worker_isolation_failed');
  }
  if (expected.integration_order
      && activity.integration_order.length > 0
      && JSON.stringify(activity.integration_order) !== JSON.stringify(expected.integration_order)) {
    violations.push('integration_order_mismatch');
  }
  if (expected.response_pattern && !new RegExp(expected.response_pattern, 'i').test(raw.response ?? '')) {
    violations.push('response_mismatch');
  }
  if (retainedWorktrees.length > 0) {
    violations.push('temporary_worktrees_present');
  }
  return violations;
}

async function evaluateRepositoryEvidence({ testCase, raw, repo, memoryBefore, workerLimit }) {
  const [paths, artifacts, memoryAfter, retainedWorktrees] = await Promise.all([
    changedPaths(repo),
    collectWorkflowArtifacts(repo),
    collectMemoryState(repo),
    temporaryWorktrees(repo),
  ]);
  const activity = workerActivity(raw.workers, workerLimit, raw.integration_order, repo);
  const spec = evaluateSpec(testCase.expected ?? {}, paths);
  const memory = evaluateMemory(testCase.expected ?? {}, memoryBefore, memoryAfter);
  const fileViolations = await inspectExpectedFiles(repo, testCase.expected);
  const staleSpecPaths = (testCase.expected?.spec_paths ?? [])
    .filter((path) => fileViolations.includes(`expected_content_missing:${path}`));
  if (staleSpecPaths.length > 0) {
    spec.passed = false;
    spec.outcomes = spec.outcomes.map((outcome) => (
      staleSpecPaths.includes(outcome.path) ? { ...outcome, status: 'stale' } : outcome
    ));
    spec.violations.push('spec_content_stale');
  }
  const violations = [
    ...expectedOutcomeViolations(testCase, raw, paths, artifacts, activity, retainedWorktrees),
    ...fileViolations,
    ...spec.violations,
    ...memory.violations,
  ];
  return { paths, artifacts, activity, retainedWorktrees, spec, memory, violations };
}

function orderedVariants(testCase, manifest, replicate, order) {
  const variants = [...(testCase.variants ?? [manifest.baseline_variant, manifest.candidate_variant])];
  const candidateFirst = order === 'candidate-first' || (order === 'crossover' && replicate % 2 === 1);
  if (!candidateFirst) return variants;
  const preferred = [manifest.candidate_variant, manifest.baseline_variant];
  return [...preferred.filter((variant) => variants.includes(variant)), ...variants.filter((variant) => !preferred.includes(variant))];
}

function crossVersionManifest(manifest) {
  const variants = {
    'no-loopx': { ...manifest.variants[manifest.baseline_variant], install_candidate: false, version_role: null },
    'version-a': { ...manifest.variants[manifest.baseline_variant], install_candidate: true, version_role: 'baseline' },
    'version-b': { ...manifest.variants[manifest.candidate_variant], install_candidate: true, version_role: 'candidate' },
  };
  if (manifest.forced_serial_variant && manifest.variants[manifest.forced_serial_variant]) {
    variants['version-b-forced-serial'] = {
      ...manifest.variants[manifest.forced_serial_variant],
      install_candidate: true,
      version_role: 'candidate',
    };
  }
  return {
    ...manifest,
    control_variant: 'no-loopx',
    baseline_variant: 'version-a',
    candidate_variant: 'version-b',
    forced_serial_variant: variants['version-b-forced-serial'] ? 'version-b-forced-serial' : null,
    variants,
    cases: manifest.cases.map((testCase) => ({
      ...testCase,
      variants: [
        'no-loopx',
        'version-a',
        'version-b',
        ...(testCase.variants.includes(manifest.forced_serial_variant) ? ['version-b-forced-serial'] : []),
      ],
    })),
  };
}

function compareThreeWayRuns(runs, manifest) {
  const pairs = {
    control_to_baseline: {
      baselineVariant: manifest.control_variant,
      candidateVariant: manifest.baseline_variant,
      forcedSerialVariant: null,
    },
    control_to_candidate: {
      baselineVariant: manifest.control_variant,
      candidateVariant: manifest.candidate_variant,
      forcedSerialVariant: manifest.forced_serial_variant,
    },
    baseline_to_candidate: {
      baselineVariant: manifest.baseline_variant,
      candidateVariant: manifest.candidate_variant,
      forcedSerialVariant: manifest.forced_serial_variant,
    },
  };
  return Object.fromEntries(Object.entries(pairs).map(([name, pair]) => {
    const includedVariants = new Set([
      pair.baselineVariant,
      pair.candidateVariant,
      pair.forcedSerialVariant,
    ].filter(Boolean));
    return [name, compareInstalledProductRuns(
      runs.filter((run) => includedVariants.has(run.variant)),
      { ...pair, comparisonMode: 'cross-version' },
    )];
  }));
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

async function runOneUnmanaged({ testCase, variant, manifest, projectRoot, fixtureRoot, tempRoot, runAgent, replicate, configurationOverrides, product, codexConfigRoot }, registerResources) {
  const variantConfig = manifest.variants[variant];
  if (!variantConfig) throw new Error(`installed_product_eval_unknown_variant:${variant}`);
  const fixture = await createFixture(
    join(fixtureRoot, testCase.fixture),
    tempRoot,
    (workspace) => registerResources({ workspace }),
  );
  const hostParent = await mkdtemp(join(tempRoot, 'loopx-product-home-'));
  registerResources({ host: hostParent });
  const home = join(hostParent, 'home');
  await mkdir(home, { recursive: true });
  if (codexConfigRoot) {
    const targetCodexHome = join(home, '.codex');
    await mkdir(targetCodexHome, { recursive: true });
    for (const name of ['config.toml', 'auth.json']) {
      const source = join(codexConfigRoot, name);
      if (await exists(source)) await cp(source, join(targetCodexHome, name));
    }
  }
  const shared = { ...manifest.configuration, ...configurationOverrides };
  const configuration = {
    model: shared.model,
    effort: shared.effort,
    adapter: shared.adapter ?? null,
    tools: shared.tools,
    permissions: shared.permissions ?? null,
    host_constraints: {
      fresh_fixture: true,
      fresh_home: true,
      isolated_cache: true,
      worker_limit: shared.worker_limit,
    },
    task: testCase.task,
    timeout_ms: shared.timeout_ms,
    fixture_tree: fixture.tree,
  };
  const inheritedHostEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('LOOPX_')),
  );
  const isolatedHostEnv = {
    HOME: home,
    CODEX_HOME: join(home, '.codex'),
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
  };
  const installEnv = {
    ...inheritedHostEnv,
    ...isolatedHostEnv,
    LOOPX_HOME: home,
    LOOPX_PROJECT_ROOT: product?.productRoot ?? projectRoot,
    LOOPX_INSTALL_CWD: fixture.repo,
  };
  const agentEnv = { ...inheritedHostEnv, ...isolatedHostEnv };
  const installRequested = Boolean(product) || variantConfig.install_candidate === true;
  let installation = {
    requested: installRequested,
    actual_installed_surface: false,
    candidate_prompt_injected: false,
    version_role: product?.role ?? null,
    product: product?.provenance ?? null,
  };
  let raw;
  let error = null;
  const memoryBefore = await collectMemoryState(fixture.repo);
  try {
    if (installRequested) {
      const installed = product
        ? await installVersionProduct(product, installEnv)
        : await installSkillsForTargets(installEnv, { targets: ['codex'] });
      installation = {
        ...installation,
        ok: installed.ok,
        surfaces: {
          codex_agents: await exists(join(home, '.codex', 'AGENTS.md')),
          exec_skill: await exists(join(home, '.agents', 'skills', 'exec', 'SKILL.md')),
        },
      };
      installation.actual_installed_surface = installed.ok
        && Object.values(installation.surfaces).some(Boolean);
    }
    raw = await runWithTimeout(runAgent, {
      case: testCase,
      variant,
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
      execution_selection: 'failed',
      workers: [],
      integration_order: [],
    };
  }

  const externalVerification = await runExternalVerification(
    fixture.repo,
    shared.verification_command,
    shared.timeout_ms,
  );

  const evidence = await evaluateRepositoryEvidence({
    testCase,
    raw,
    repo: fixture.repo,
    memoryBefore,
    workerLimit: shared.worker_limit,
  });
  const { paths, artifacts, activity, retainedWorktrees, spec, memory } = evidence;
  const sourceFixtureUnchanged = await directoryHash(fixture.source) === fixture.sourceHash;
  const violations = [...evidence.violations];
  if (installRequested && !installation.actual_installed_surface) {
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
    execution_selection: raw.execution_selection,
    total_tokens: Number.isFinite(raw.tokens?.total) ? raw.tokens.total : null,
    tokens: {
      input: Number.isFinite(raw.tokens?.input) ? raw.tokens.input : null,
      cached_input: Number.isFinite(raw.tokens?.cached_input) ? raw.tokens.cached_input : null,
      output: Number.isFinite(raw.tokens?.output) ? raw.tokens.output : null,
      total: Number.isFinite(raw.tokens?.total) ? raw.tokens.total : null,
    },
    latency_ms: Number.isFinite(raw.latency_ms) ? raw.latency_ms : null,
    spec,
    memory,
    safety,
    temporary_worktrees: retainedWorktrees,
    isolation: { source_fixture_unchanged: sourceFixtureUnchanged },
    response: raw.response ?? '',
    error,
    cleanup: { workspace_removed: false, host_home_removed: false },
  };
  return run;
}

async function runOne(options) {
  const resources = { workspace: null, host: null };
  let run;
  try {
    run = await runOneUnmanaged(options, (registered) => Object.assign(resources, registered));
    return run;
  } finally {
    if (resources.workspace) await removeTree(resources.workspace);
    if (resources.host) await removeTree(resources.host);
    if (run) {
      run.cleanup.workspace_removed = !resources.workspace || !await exists(resources.workspace);
      run.cleanup.host_home_removed = !resources.host || !await exists(resources.host);
    }
  }
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
    versionRefs = null,
    codexConfigRoot = null,
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
  if (versionRefs && replicates < 2) {
    throw new TypeError('cross-version benchmarks require at least two replicates');
  }
  await mkdir(resolve(tempRoot), { recursive: true });
  const effectiveManifest = versionRefs ? crossVersionManifest(manifest) : manifest;
  const selected = selectedCaseIds
    ? effectiveManifest.cases.filter((testCase) => selectedCaseIds.includes(testCase.id))
    : effectiveManifest.cases;
  if (selectedCaseIds && selected.length !== selectedCaseIds.length) {
    throw new Error('installed_product_eval_case_not_found');
  }
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedTempRoot = resolve(tempRoot);
  const products = versionRefs
    ? await prepareVersionProducts(resolvedProjectRoot, versionRefs, resolvedTempRoot)
    : null;
  const runs = [];
  let comparison;
  let productsRemoved = products === null;
  try {
    for (const testCase of selected) {
      for (let replicate = 0; replicate < replicates; replicate += 1) {
        for (const variant of orderedVariants(testCase, effectiveManifest, replicate, order)) {
          const product = products
            ? variant === effectiveManifest.control_variant
              ? null
              : variant === effectiveManifest.baseline_variant
                ? products.baseline
                : products.candidate
            : null;
          runs.push(await runOne({
            testCase,
            variant,
            manifest: effectiveManifest,
            projectRoot: resolvedProjectRoot,
            fixtureRoot: resolve(fixtureRoot),
            tempRoot: resolvedTempRoot,
            runAgent,
            replicate,
            configurationOverrides: configuration,
            product,
            codexConfigRoot: codexConfigRoot ? resolve(codexConfigRoot) : null,
          }));
        }
      }
    }
    if (!versionRefs) {
      comparison = compareInstalledProductRuns(runs, {
        baselineVariant: effectiveManifest.baseline_variant,
        candidateVariant: effectiveManifest.candidate_variant,
        forcedSerialVariant: effectiveManifest.forced_serial_variant,
        comparisonMode: 'product-baseline',
      });
    }
  } finally {
    if (products) {
      await removeTree(products.root);
      productsRemoved = !await exists(products.root);
    }
  }
  if (!products) {
    return { schema: 'loopx.installed-product-eval-report.v1', runs, comparison };
  }
  const comparisons = compareThreeWayRuns(runs, effectiveManifest);
  for (const pair of Object.values(comparisons)) {
    pair.overall.version_products_cleanup_passed = productsRemoved;
    pair.overall.criteria_passed = pair.overall.criteria_passed && productsRemoved;
  }
  comparison = comparisons.baseline_to_candidate;
  return {
    schema: 'loopx.three-way-product-benchmark-report.v1',
    provenance: {
      manifest_sha256: sha256(stableJson(effectiveManifest)),
      source_manifest_sha256: sha256(stableJson(manifest)),
      configuration: {
        model: runs[0]?.configuration.model ?? null,
        effort: runs[0]?.configuration.effort ?? null,
        tools: runs[0]?.configuration.tools ?? null,
        permissions: runs[0]?.configuration.permissions ?? null,
        timeout_ms: runs[0]?.configuration.timeout_ms ?? null,
        adapter: runs[0]?.configuration.adapter ?? null,
        host_constraints: runs[0]?.configuration.host_constraints ?? null,
      },
      fixture_trees: Object.fromEntries([...Map.groupBy(runs, (run) => run.case_id)].map(([caseId, caseRuns]) => [
        caseId,
        caseRuns[0]?.configuration.fixture_tree ?? null,
      ])),
      experiment: {
        case_ids: selected.map((testCase) => testCase.id),
        replicates,
        order,
        arms: {
          control: effectiveManifest.control_variant,
          baseline: effectiveManifest.baseline_variant,
          candidate: effectiveManifest.candidate_variant,
        },
      },
      versions: {
        baseline: products.baseline.provenance,
        candidate: products.candidate.provenance,
      },
    },
    runs,
    comparison,
    comparisons,
    cleanup: { version_products_removed: productsRemoved },
  };
}
