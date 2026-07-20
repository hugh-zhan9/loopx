import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { runInstalledProductEvaluation } from '../src/installed-product-eval.mjs';
import { createDarwinSimpleFakeAgent } from './fixtures/darwin-simple/fake-agent.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;
const execFileAsync = promisify(execFile);

async function createVersionProductRepository(t) {
  const root = await mkdtemp(join(tmpdir(), 'loopx-version-product-'));
  const installer = [
    "import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';",
    "import { join } from 'node:path';",
    'const root = process.env.LOOPX_PROJECT_ROOT;',
    'const home = process.env.LOOPX_HOME;',
    "const agentsPath = process.env.LOOPX_CODEX_AGENTS_PATH ?? join(home, '.codex', 'AGENTS.md');",
    "const skillsRoot = process.env.LOOPX_SKILLS_ROOT ?? join(home, '.agents', 'skills');",
    'await mkdir(join(agentsPath, \'..\'), { recursive: true });',
    'await mkdir(skillsRoot, { recursive: true });',
    "await writeFile(agentsPath, await readFile(join(root, 'AGENTS.md')));",
    "await cp(join(root, 'skills', 'exec'), join(skillsRoot, 'exec'), { recursive: true });",
    "console.log(JSON.stringify({ ok: true }));",
    '',
  ].join('\n');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'skills', 'exec'), { recursive: true });
  await writeFile(join(root, 'scripts', 'install-skills.mjs'), installer);
  await writeFile(join(root, 'AGENTS.md'), '# baseline product\n');
  await writeFile(join(root, 'skills', 'exec', 'SKILL.md'), 'installed-product: baseline\n');
  await writeFile(join(root, 'package.json'), `${JSON.stringify({
    name: 'loopx-version-fixture',
    version: '1.0.0',
    type: 'module',
    files: ['AGENTS.md', 'scripts/', 'skills/'],
  }, null, 2)}\n`);
  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'loopx eval'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'eval@loopx.invalid'], { cwd: root });
  await execFileAsync('git', ['add', '-A'], { cwd: root });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'baseline product'], { cwd: root });
  await execFileAsync('git', ['tag', 'baseline-product'], { cwd: root });

  await writeFile(join(root, 'AGENTS.md'), '# candidate product\n');
  await writeFile(join(root, 'skills', 'exec', 'SKILL.md'), 'installed-product: candidate\n');
  await writeFile(join(root, 'package.json'), `${JSON.stringify({
    name: 'loopx-version-fixture',
    version: '2.0.0',
    type: 'module',
    files: ['AGENTS.md', 'scripts/', 'skills/'],
  }, null, 2)}\n`);
  await execFileAsync('git', ['add', '-A'], { cwd: root });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'candidate product'], { cwd: root });
  await execFileAsync('git', ['tag', 'candidate-product'], { cwd: root });
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('evaluates fresh bare and installed product fixtures with deterministic agent evidence', async () => {
  const manifest = JSON.parse(await readFile(join(repoRoot, 'evals', 'darwin-simple', 'cases.json'), 'utf8'));
  const agent = createDarwinSimpleFakeAgent();
  const result = await runInstalledProductEvaluation({
    manifest,
    projectRoot: repoRoot,
    fixtureRoot: join(repoRoot, 'test', 'fixtures', 'darwin-simple'),
    runAgent: agent.run,
    selectedCaseIds: ['direct-small-fix', 'independent-modules', 'strongly-coupled-change'],
    replicates: 1,
  });

  assert.equal(result.runs.length, 7);
  assert.equal(result.comparison.overall.compared_cases, 3);
  assert.equal(result.comparison.cases.every((item) => item.configuration_parity), true);
  assert.equal(result.comparison.cases.every((item) => item.quality_passed), true);

  const requests = agent.requests();
  assert.equal(new Set(requests.map((request) => request.workspace)).size, requests.length, 'every variant gets a fresh fixture');
  assert.equal(requests.every((request) => request.prompt === manifest.cases.find((item) => item.id === request.case_id).task), true);
  assert.equal(requests.every((request) => request.has_resolver === false), true, 'candidate receives no resolver injection');
  assert.equal(requests.every((request) => request.loopx_env_keys.length === 0), true, 'installer environment is not exposed to agents');
  assert.equal(requests.filter((request) => request.installed).length, 4);
  assert.equal(requests.filter((request) => !request.installed).length, 3);

  const concurrent = result.runs.find((run) => run.case_id === 'independent-modules' && run.variant === 'installed');
  assert.equal(concurrent.execution_selection, 'concurrent');
  assert.equal(concurrent.worker_activity.peak_workers, 2);
  assert.ok(concurrent.worker_activity.overlap_ms > 0);
  assert.deepEqual(concurrent.worker_activity.integration_order, ['alpha', 'beta']);
  assert.equal(concurrent.worker_activity.bounded, true);
  assert.equal(concurrent.worker_activity.isolated, true);
  assert.deepEqual(concurrent.temporary_worktrees, []);
  assert.equal(result.comparison.cases.find((item) => item.case_id === 'independent-modules').resource_favorable, true);
  assert.equal(result.comparison.overall.criteria_passed, true);

  const direct = result.runs.find((run) => run.case_id === 'direct-small-fix' && run.variant === 'installed');
  assert.deepEqual(direct.changed_paths, ['src/message.mjs']);
  assert.deepEqual(direct.verification.commands, ['npm test']);
  assert.equal(direct.verification.external_passed, true);
  assert.deepEqual(direct.workflow_artifacts, []);
  assert.equal(direct.installation.actual_installed_surface, true);
  assert.equal(direct.installation.candidate_prompt_injected, false);
  assert.equal(direct.isolation.source_fixture_unchanged, true);
  assert.equal(direct.cleanup.workspace_removed, true);
  assert.equal(direct.cleanup.host_home_removed, true);
  await assert.rejects(access(requests[0].workspace));
  await assert.rejects(access(requests[0].home));
});

test('reports governed escalation, synchronized specs, and quiet memory outcomes', async () => {
  const manifest = JSON.parse(await readFile(join(repoRoot, 'evals', 'darwin-simple', 'cases.json'), 'utf8'));
  const agent = createDarwinSimpleFakeAgent();
  const result = await runInstalledProductEvaluation({
    manifest,
    projectRoot: repoRoot,
    fixtureRoot: join(repoRoot, 'test', 'fixtures', 'darwin-simple'),
    runAgent: agent.run,
    selectedCaseIds: [
      'governed-compatibility-escalation',
      'spec-consistency',
      'memory-precision',
      'memory-qualifying-write',
      'memory-deduplication',
    ],
    replicates: 1,
  });

  assert.equal(result.comparison.overall.quality_passed_cases, 5);
  const escalation = result.runs.find((run) => run.case_id === 'governed-compatibility-escalation' && run.variant === 'installed');
  assert.equal(escalation.execution_selection, 'blocked');
  assert.deepEqual(escalation.changed_paths, []);
  assert.match(escalation.response, /compatibility decision/i);

  const spec = result.runs.find((run) => run.case_id === 'spec-consistency' && run.variant === 'installed');
  assert.equal(spec.spec.passed, true);
  assert.deepEqual(spec.spec.outcomes, [{ status: 'updated', path: 'docs/loopx/specs/behavior.md' }]);

  const memory = result.runs.find((run) => run.case_id === 'memory-precision' && run.variant === 'installed');
  assert.equal(memory.memory.passed, true);
  assert.deepEqual(memory.memory.outcomes, []);
  assert.deepEqual(memory.workflow_artifacts, []);

  const qualifying = result.runs.find((run) => run.case_id === 'memory-qualifying-write' && run.variant === 'installed');
  assert.equal(qualifying.memory.passed, true);
  assert.deepEqual(qualifying.memory.outcomes, [{ status: 'written', path: '.loopx/memory/MEMORY.md' }]);

  const deduplicated = result.runs.find((run) => run.case_id === 'memory-deduplication' && run.variant === 'installed');
  assert.equal(deduplicated.memory.passed, true);
  assert.deepEqual(deduplicated.memory.outcomes, [{ status: 'deduplicated', path: '.loopx/memory/MEMORY.md' }]);
});

test('exposes the live evaluator as an opt-in packaged diagnostic outside npm test', async () => {
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts['eval:darwin-simple'], 'node scripts/run-darwin-simple-evals.mjs');
  assert.equal(packageJson.files.includes('scripts/run-darwin-simple-evals.mjs'), true);
  assert.equal(packageJson.files.includes('evals/darwin-simple/'), true);
  assert.doesNotMatch(packageJson.scripts.test, /darwin-simple|eval:darwin-simple/);

  const { stdout } = await execFileAsync(process.execPath, ['scripts/run-darwin-simple-evals.mjs', '--help'], { cwd: repoRoot });
  assert.match(stdout, /opt-in installed-product diagnostic/i);
  assert.match(stdout, /--model <id>/);
  assert.match(stdout, /--baseline-ref <git-ref>/);
  assert.match(stdout, /--candidate-ref <git-ref>/);
  assert.match(stdout, /--order <crossover\|baseline-first\|candidate-first>/);
  await assert.rejects(
    execFileAsync(process.execPath, [
      'scripts/run-darwin-simple-evals.mjs', '--live', '--model', 'not-invoked', '--baseline-ref', 'HEAD',
    ], { cwd: repoRoot }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /must be provided together/);
      return true;
    },
  );
});

test('compares isolated package installs from two immutable Git refs in crossover order', async (t) => {
  const productRoot = await createVersionProductRepository(t);
  const leakedAgentsPath = join(productRoot, 'leaked', 'AGENTS.md');
  const leakedSkillsRoot = join(productRoot, 'leaked', 'skills');
  const previousAgentsPath = process.env.LOOPX_CODEX_AGENTS_PATH;
  const previousSkillsRoot = process.env.LOOPX_SKILLS_ROOT;
  process.env.LOOPX_CODEX_AGENTS_PATH = leakedAgentsPath;
  process.env.LOOPX_SKILLS_ROOT = leakedSkillsRoot;
  t.after(() => {
    if (previousAgentsPath === undefined) delete process.env.LOOPX_CODEX_AGENTS_PATH;
    else process.env.LOOPX_CODEX_AGENTS_PATH = previousAgentsPath;
    if (previousSkillsRoot === undefined) delete process.env.LOOPX_SKILLS_ROOT;
    else process.env.LOOPX_SKILLS_ROOT = previousSkillsRoot;
  });
  const manifest = JSON.parse(await readFile(join(repoRoot, 'evals', 'darwin-simple', 'cases.json'), 'utf8'));
  const agent = createDarwinSimpleFakeAgent();
  const result = await runInstalledProductEvaluation({
    manifest,
    projectRoot: productRoot,
    fixtureRoot: join(repoRoot, 'test', 'fixtures', 'darwin-simple'),
    runAgent: agent.run,
    selectedCaseIds: ['direct-small-fix'],
    replicates: 2,
    order: 'crossover',
    versionRefs: {
      baseline: 'baseline-product',
      candidate: 'candidate-product',
    },
    configuration: {
      adapter: { name: 'fake-agent', version: '1.0.0' },
    },
  });

  assert.equal(result.schema, 'loopx.cross-version-product-benchmark-report.v1');
  assert.equal(result.provenance.versions.baseline.requested_ref, 'baseline-product');
  assert.equal(result.provenance.versions.candidate.requested_ref, 'candidate-product');
  assert.match(result.provenance.versions.baseline.commit, /^[a-f0-9]{40}$/);
  assert.match(result.provenance.versions.candidate.commit, /^[a-f0-9]{40}$/);
  assert.match(result.provenance.versions.baseline.package_sha256, /^[a-f0-9]{64}$/);
  assert.match(result.provenance.versions.candidate.package_sha256, /^[a-f0-9]{64}$/);
  assert.match(result.provenance.versions.baseline.package_manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.provenance.versions.baseline.package_version, '1.0.0');
  assert.equal(result.provenance.versions.candidate.package_version, '2.0.0');
  assert.notEqual(result.provenance.versions.baseline.package_sha256, result.provenance.versions.candidate.package_sha256);
  assert.match(result.provenance.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.provenance.configuration, {
    model: 'configured-by-runner',
    effort: 'high',
    tools: ['shell', 'filesystem', 'git'],
    permissions: { sandbox: 'workspace-write' },
    timeout_ms: 600000,
    adapter: { name: 'fake-agent', version: '1.0.0' },
    host_constraints: {
      fresh_fixture: true,
      fresh_home: true,
      isolated_cache: true,
      worker_limit: 4,
    },
  });
  assert.match(result.provenance.fixture_trees['direct-small-fix'], /^[a-f0-9]{40}$/);
  assert.deepEqual(result.provenance.experiment, {
    case_ids: ['direct-small-fix'],
    replicates: 2,
    order: 'crossover',
  });
  assert.equal(result.runs.every((run) => run.installation.actual_installed_surface), true);
  const requests = agent.requests();
  assert.equal(new Set(requests.map((request) => request.home)).size, requests.length);
  assert.equal(requests.every((request) => request.loopx_env_keys.length === 0), true);
  assert.deepEqual(requests.map((request) => [request.variant, request.installed_marker]), [
    ['version-a', 'installed-product: baseline'],
    ['version-b', 'installed-product: candidate'],
    ['version-b', 'installed-product: candidate'],
    ['version-a', 'installed-product: baseline'],
  ]);
  assert.equal(result.comparison.baseline_variant, 'version-a');
  assert.equal(result.comparison.candidate_variant, 'version-b');
  assert.equal(result.comparison.cases[0].pairs.length, 2);
  assert.equal(result.comparison.cases[0].verdict, 'quality_tie');
  assert.equal(result.comparison.cases[0].metrics.baseline.total_tokens.sample_count, 2);
  assert.equal(result.comparison.overall.version_products_cleanup_passed, true);
  assert.equal(result.cleanup.version_products_removed, true);
  await assert.rejects(access(leakedAgentsPath));
  await assert.rejects(access(leakedSkillsRoot));
});
