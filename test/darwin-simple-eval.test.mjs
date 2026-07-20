import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { runInstalledProductEvaluation } from '../src/installed-product-eval.mjs';
import { createDarwinSimpleFakeAgent } from './fixtures/darwin-simple/fake-agent.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;
const execFileAsync = promisify(execFile);

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
  assert.match(stdout, /--order <crossover\|baseline-first\|candidate-first>/);
});
