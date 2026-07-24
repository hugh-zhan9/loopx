import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { renderThreeWayProductMarkdown } from '../src/agent-eval.mjs';
import { runInstalledProductEvaluation } from '../src/installed-product-eval.mjs';
import { createReqDemoFakeAgent } from './fixtures/req-demo/fake-agent.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;
const execFileAsync = promisify(execFile);

async function createVersionProductRepository(t) {
  const root = await mkdtemp(join(tmpdir(), 'loopx-req-demo-version-'));
  const installer = [
    "import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';",
    "import { join } from 'node:path';",
    'const root = process.env.LOOPX_PROJECT_ROOT;',
    'const home = process.env.LOOPX_HOME;',
    "const agentsPath = process.env.LOOPX_CODEX_AGENTS_PATH ?? join(home, '.codex', 'AGENTS.md');",
    "const skillsRoot = process.env.LOOPX_SKILLS_ROOT ?? join(home, '.agents', 'skills');",
    'await mkdir(join(agentsPath, \'..\'), { recursive: true });',
    'await mkdir(skillsRoot, { recursive: true });',
    "const agents = await readFile(join(root, 'AGENTS.md'));",
    "if (agents.includes('candidate product')) await writeFile(agentsPath, agents);",
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

test('req-demo keeps FitPulse sources separate from the agent harness', async () => {
  const root = join(repoRoot, 'test', 'fixtures', 'req-demo');
  const brief = await readFile(join(root, 'sources', 'fitpulse', 'REQUIREMENTS.md'), 'utf8');
  assert.match(brief, /FitPulse/);
  await access(join(root, 'sources', 'fitpulse', 'intake', '2026-07-22-fitpulse-v1', 'requirements.md'));
  await access(join(root, 'harness', 'package.json'));
  await assert.rejects(access(join(root, 'harness', 'REQUIREMENTS.md')));
  await assert.rejects(access(join(root, 'harness', 'test', 'taskcli.test.mjs')));
  await assert.rejects(access(join(root, 'starter')));
});

test('evaluates bare and installed req-demo arms with deterministic agent evidence', async () => {
  const manifest = JSON.parse(await readFile(join(repoRoot, 'evals', 'req-demo', 'cases.json'), 'utf8'));
  const agent = createReqDemoFakeAgent();
  const result = await runInstalledProductEvaluation({
    manifest,
    projectRoot: repoRoot,
    fixtureRoot: join(repoRoot, 'test', 'fixtures', 'req-demo'),
    runAgent: agent.run,
    selectedCaseIds: ['workflow-from-clarify-intake'],
    replicates: 1,
  });

  assert.equal(result.runs.length, 2);
  assert.equal(result.comparison.overall.compared_cases, 1);
  assert.equal(
    result.comparison.cases[0].quality_passed,
    true,
    `failed gates: ${JSON.stringify(result.comparison.cases[0].failed_quality_gates)}`,
  );
  assert.equal(result.comparison.overall.criteria_passed, true);

  const requests = agent.requests();
  assert.equal(new Set(requests.map((request) => request.workspace)).size, requests.length);
  const bareRequest = requests.find((request) => request.variant === 'bare');
  const installedRequest = requests.find((request) => request.variant === 'installed');
  assert.equal(bareRequest.prompt, manifest.cases[0].bare_task);
  assert.equal(installedRequest.prompt, manifest.cases[0].task);
  assert.match(bareRequest.prompt, /PLAN\.md/);
  assert.doesNotMatch(bareRequest.prompt, /plan2exec|final-review/);
  assert.match(installedRequest.prompt, /spec.*plan2exec.*exec.*final-review/s);
  assert.equal(requests.every((request) => request.product_brief_is_fitpulse), true);
  assert.equal(requests.every((request) => request.intake_is_fitpulse_v1), true);
  assert.equal(requests.every((request) => request.has_taskcli_contract), false);
  assert.equal(requests.every((request) => request.has_resolver === false), true);
  assert.equal(requests.every((request) => request.loopx_env_keys.length === 0), true);

  const bare = result.runs.find((run) => run.variant === 'bare');
  assert.ok(bare.changed_paths.includes('PLAN.md'));
  const installed = result.runs.find((run) => run.variant === 'installed');
  assert.ok(installed.changed_paths.includes('docs/loopx/design/2026-07-22-fitpulse-v1/需求设计文档.md'));
  assert.ok(installed.changed_paths.includes('docs/loopx/plans/2026-07-22-fitpulse-v1.md'));
  assert.equal(installed.verification.external_passed, true);
  assert.deepEqual(installed.verification.commands, ['npm test']);
  assert.equal(installed.isolation.source_fixture_unchanged, true);
  await assert.rejects(access(requests[0].workspace));
  await assert.rejects(access(requests[0].home));
});

test('compares no-loopx, baseline, and candidate req-demo arms from immutable refs', async (t) => {
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

  const manifest = JSON.parse(await readFile(join(repoRoot, 'evals', 'req-demo', 'cases.json'), 'utf8'));
  const agent = createReqDemoFakeAgent();
  const result = await runInstalledProductEvaluation({
    manifest,
    projectRoot: productRoot,
    fixtureRoot: join(repoRoot, 'test', 'fixtures', 'req-demo'),
    runAgent: agent.run,
    selectedCaseIds: ['workflow-from-clarify-intake'],
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

  assert.equal(result.schema, 'loopx.three-way-product-benchmark-report.v1');
  assert.deepEqual(result.provenance.experiment.case_ids, ['workflow-from-clarify-intake']);
  assert.equal(result.runs.length, 6);
  assert.equal(result.comparison.cases[0].verdict, 'quality_tie');
  assert.equal(result.cleanup.version_products_removed, true);

  const markdown = renderThreeWayProductMarkdown(result);
  assert.match(markdown, /A: `no-loopx`/);

  const requests = agent.requests();
  assert.equal(requests.filter((request) => request.variant === 'no-loopx')
    .every((request) => request.prompt === manifest.cases[0].bare_task), true);
  assert.equal(requests.filter((request) => request.variant !== 'no-loopx')
    .every((request) => request.prompt === manifest.cases[0].task), true);
  assert.ok(result.runs.find((run) => run.variant === 'no-loopx').changed_paths.includes('PLAN.md'));
  await assert.rejects(access(leakedAgentsPath));
  await assert.rejects(access(leakedSkillsRoot));
});

test('exposes the req-demo evaluator as an opt-in packaged diagnostic outside npm test', async () => {
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts['eval:req-demo'], 'node scripts/run-req-demo-evals.mjs');
  assert.equal(packageJson.files.includes('scripts/run-req-demo-evals.mjs'), true);
  assert.equal(packageJson.files.includes('evals/req-demo/'), true);
  assert.equal(packageJson.files.includes('test/fixtures/req-demo/harness/'), true);
  assert.equal(packageJson.files.includes('test/fixtures/req-demo/sources/fitpulse/'), true);
  assert.equal(packageJson.files.includes('test/fixtures/req-demo/starter/'), false);
  assert.doesNotMatch(packageJson.scripts.test, /req-demo|eval:req-demo/);

  const { stdout } = await execFileAsync(process.execPath, ['scripts/run-req-demo-evals.mjs', '--help'], {
    cwd: repoRoot,
  });
  assert.match(stdout, /requirements-driven workflow demo/i);
  assert.match(stdout, /--runtime <codex\|claude>/);
  assert.match(stdout, /FitPulse|REQUIREMENTS\.md → PLAN\.md|spec → plan2exec/i);
});
