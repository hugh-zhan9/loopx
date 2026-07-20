import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import { aggregateAgentEvalReplicates, applyAgentEvalPolicies, compareAgentEvalRuns, compareInstalledProductRuns, evaluateControllerIntegration, evaluateLeafReviewResult, parseReviewResult, renderAgentEvalMarkdown, renderCrossVersionProductMarkdown, renderInstalledProductMarkdown, summarizeAgentEvalRun } from '../src/agent-eval.mjs';
import { extractCodexLeafFinalMessage, findCodexRollouts, normalizeCodexRollouts } from '../src/codex-agent-trace.mjs';
import { findClaudeSession, normalizeClaudeSession, extractClaudeLeafFinalMessage } from '../src/claude-agent-trace.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = new URL('..', import.meta.url).pathname;

const baselineEvents = [
  { event: 'run_start', run_id: 'r1', case_id: 'case-1', variant: 'baseline', at_ms: 0 },
  { event: 'agent_spawn', actor_id: 'worker-1', parent_actor_id: 'controller', at_ms: 10 },
  { event: 'agent_spawn', actor_id: 'nested-1', parent_actor_id: 'worker-1', at_ms: 20 },
  { event: 'tool_call', actor_id: 'worker-1', tool: 'read_file', at_ms: 30 },
  { event: 'agent_wait', actor_id: 'controller', target_actor_id: 'worker-1', at_ms: 40 },
  { event: 'review_finding', actor_id: 'reviewer-1', finding_id: 'F-1', finding_valid: false, at_ms: 50 },
  { event: 'agent_release', actor_id: 'nested-1', at_ms: 60 },
  { event: 'agent_release', actor_id: 'worker-1', at_ms: 70 },
  { event: 'run_end', outcome: 'passed', tests_passed: true, input_tokens: 1200, output_tokens: 400, latency_ms: 900, at_ms: 900 },
];

const v2Events = [
  { event: 'run_start', run_id: 'r2', case_id: 'case-1', variant: 'v2', at_ms: 0 },
  { event: 'agent_spawn', actor_id: 'worker-1', parent_actor_id: 'controller', at_ms: 10 },
  { event: 'tool_call', actor_id: 'worker-1', tool: 'read_file', at_ms: 20 },
  { event: 'agent_release', actor_id: 'worker-1', at_ms: 40 },
  { event: 'run_end', outcome: 'passed', tests_passed: true, input_tokens: 700, output_tokens: 200, latency_ms: 500, at_ms: 500 },
];

describe('agent eval metrics', () => {
  it('detects nested agents and computes orchestration and quality metrics', () => {
    const summary = summarizeAgentEvalRun(baselineEvents);

    assert.equal(summary.case_id, 'case-1');
    assert.equal(summary.agent_count, 2);
    assert.equal(summary.peak_active_agents, 2);
    assert.equal(summary.nested_agent_count, 1);
    assert.equal(summary.tool_call_count, 1);
    assert.equal(summary.wait_count, 1);
    assert.equal(summary.review_finding_count, 1);
    assert.equal(summary.review_false_positive_count, 1);
    assert.equal(summary.total_tokens, 1600);
    assert.equal(summary.hard_invariants_passed, false);
  });

  it('compares matched baseline and candidate runs without treating lower usage as a win when quality regresses', () => {
    const comparison = compareAgentEvalRuns([
      summarizeAgentEvalRun(baselineEvents),
      summarizeAgentEvalRun(v2Events),
    ]);

    assert.equal(comparison.cases.length, 1);
    assert.equal(comparison.cases[0].agent_count_delta, -1);
    assert.equal(comparison.cases[0].nested_agent_count_delta, -1);
    assert.equal(comparison.cases[0].total_tokens_delta, -700);
    assert.equal(comparison.cases[0].candidate_quality_passed, true);
    assert.equal(comparison.cases[0].improved, true);
    assert.equal(comparison.overall.improved_cases, 1);
    const markdown = renderAgentEvalMarkdown(comparison);
    assert.match(markdown, /# Agent Eval Report/);
    assert.match(markdown, /case-1/);
    assert.match(markdown, /Nested agent delta/);
  });

  it('writes reproducible JSON and Markdown reports from NDJSON traces', async () => {
    const out = join(tmpdir(), `loopx-agent-eval-${process.pid}-${Date.now()}`);
    const trace = join(repoRoot, 'test', 'fixtures', 'agent-eval-sample.jsonl');
    const { stdout } = await execFileAsync(process.execPath, [
      join(repoRoot, 'scripts', 'run-agent-evals.mjs'),
      '--trace', trace,
      '--out', out,
    ]);
    const result = JSON.parse(stdout);
    const comparison = JSON.parse(await readFile(result.comparison, 'utf8'));
    const report = await readFile(result.report, 'utf8');

    assert.equal(comparison.overall.compared_cases, 1);
    assert.equal(comparison.overall.improved_cases, 1);
    assert.match(report, /leaf-worker-control/);
  });

  it('enforces manifest agent budgets independently from outcome success', () => {
    const [summary] = applyAgentEvalPolicies([summarizeAgentEvalRun(v2Events)], {
      default_limits: { max_nested_agents: 0, max_agent_count: 0 },
      cases: [{ id: 'case-1', limits: { max_agent_count: 1 } }],
    });

    assert.equal(summary.policy_passed, true);
    assert.deepEqual(summary.policy_violations, []);

    const [failed] = applyAgentEvalPolicies([summarizeAgentEvalRun(v2Events)], {
      default_limits: { max_nested_agents: 0, max_agent_count: 0 },
      cases: [{ id: 'case-1' }],
    });
    assert.equal(failed.policy_passed, false);
    assert.match(failed.policy_violations[0], /agent_count/);
  });

  it('does not treat missing usage or latency as zero-cost improvement evidence', () => {
    const missing = summarizeAgentEvalRun([
      { event: 'run_start', run_id: 'r3', case_id: 'case-1', variant: 'v2', at_ms: 0 },
      { event: 'run_end', run_id: 'r3', outcome: 'passed', tests_passed: true, at_ms: 10 },
    ]);
    const comparison = compareAgentEvalRuns([summarizeAgentEvalRun(baselineEvents), missing]);

    assert.equal(missing.total_tokens, null);
    assert.equal(missing.latency_ms, null);
    assert.equal(comparison.cases[0].total_tokens_delta, null);
    assert.equal(comparison.cases[0].improved, false);
  });

  it('normalizes native Codex parent and child rollout traces', async () => {
    const rollouts = await findCodexRollouts(join(repoRoot, 'test', 'fixtures', 'codex-rollouts'), 'root-thread');
    const events = normalizeCodexRollouts(rollouts, {
      rootThreadId: 'root-thread',
      caseId: 'leaf-worker-control',
      variant: 'v2',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'high',
    });
    const summary = summarizeAgentEvalRun(events);

    assert.equal(rollouts.length, 2);
    assert.equal(summary.agent_count, 1);
    assert.equal(summary.nested_agent_count, 0);
    assert.equal(summary.wait_count, 1);
    assert.equal(summary.tool_call_count, 1);
    assert.equal(summary.total_tokens, 190);
    assert.equal(summary.cached_input_tokens, 0);
    assert.equal(summary.uncached_input_tokens, 160);
    assert.equal(summary.outcome, 'passed');
  });

  it('extracts the leaf worker final message without using the controller paraphrase', async () => {
    const rollouts = await findCodexRollouts(join(repoRoot, 'test', 'fixtures', 'codex-rollouts'), 'root-thread');
    const result = extractCodexLeafFinalMessage(rollouts, 'root-thread');

    assert.equal(result.threadId, '/root/task_reviewer');
    assert.equal(result.message, 'ISSUES_FOUND\nImportant\nNeeds fixes');
  });

  it('aggregates crossover replicates by median and requires every replicate to pass quality', () => {
    const first = summarizeAgentEvalRun(v2Events);
    const second = { ...first, run_id: 'r4', total_tokens: 1100, latency_ms: 700, quality_passed: false };
    const [aggregate] = aggregateAgentEvalReplicates([first, second]);

    assert.equal(aggregate.replicate_count, 2);
    assert.equal(aggregate.total_tokens, 1000);
    assert.equal(aggregate.latency_ms, 600);
    assert.equal(aggregate.quality_passed, false);
    assert.equal(aggregate.quality_pass_rate, 0.5);
  });

  it('parses the canonical review result block independently from reviewer prose', () => {
    const result = parseReviewResult(`Review prose.\n\n\`\`\`loopx-review-result\n{
      "schema": "loopx.review-result.v1",
      "status": "ISSUES_FOUND",
      "task_quality": "Needs fixes",
      "task_anchor": "T-003",
      "cannot_verify": [],
      "findings": [{"id":"F-001","severity":"Important","anchor_ids":["AC-002"],"summary":"Routing mismatch"}]
    }\n\`\`\``);

    assert.equal(result.status, 'ISSUES_FOUND');
    assert.equal(result.findings[0].id, 'F-001');
    assert.deepEqual(result.findings[0].anchor_ids, ['AC-002']);
  });

  it('measures controller integration fidelity and rejects unsafe semantic loss', () => {
    const leaf = {
      schema: 'loopx.review-result.v1', status: 'ISSUES_FOUND', task_quality: 'Needs fixes', task_anchor: 'T-003', cannot_verify: [],
      findings: [
        { id: 'F-001', severity: 'Critical', anchor_ids: ['AC-001'], summary: 'Critical defect' },
      ],
    };
    const controller = {
      ...leaf,
      findings: [
        { ...leaf.findings[0], severity: 'Important' },
        { id: 'F-002', severity: 'Important', anchor_ids: [], summary: 'Invented defect' },
      ],
    };
    const fidelity = evaluateControllerIntegration(leaf, controller);

    assert.equal(fidelity.status_preserved, true);
    assert.equal(fidelity.finding_recall, 1);
    assert.equal(fidelity.finding_precision, 0.5);
    assert.equal(fidelity.severity_fidelity, 0);
    assert.equal(fidelity.anchor_recall, 1);
    assert.equal(fidelity.blocking_finding_loss, true);
    assert.equal(fidelity.controller_invented_blocking_findings, 1);
    assert.equal(fidelity.integration_passed, false);
  });

  it('treats NEEDS_CONTEXT promotion as a hard integration failure', () => {
    const leaf = {
      schema: 'loopx.review-result.v1', status: 'NEEDS_CONTEXT', task_quality: 'Needs fixes', task_anchor: 'T-004',
      cannot_verify: ['API contract'], findings: [],
    };
    const controller = { ...leaf, status: 'SPEC_COMPLIANT', task_quality: 'Approved', cannot_verify: [] };
    const fidelity = evaluateControllerIntegration(leaf, controller);

    assert.equal(fidelity.unsafe_context_promotion, true);
    assert.equal(fidelity.integration_passed, false);
  });

  it('rejects invalid review-result state combinations and unknown schema versions', () => {
    for (const result of [
      { schema: 'loopx.review-result.v2', status: 'SPEC_COMPLIANT', task_quality: 'Approved', task_anchor: 'T-001', cannot_verify: [], findings: [] },
      { schema: 'loopx.review-result.v1', status: 'SPEC_COMPLIANT', task_quality: 'Needs fixes', task_anchor: 'T-001', cannot_verify: [], findings: [] },
      { schema: 'loopx.review-result.v1', status: 'ISSUES_FOUND', task_quality: 'Needs fixes', task_anchor: 'T-001', cannot_verify: [], findings: [] },
      { schema: 'loopx.review-result.v1', status: 'NEEDS_CONTEXT', task_quality: 'Needs fixes', task_anchor: 'T-001', cannot_verify: [], findings: [] },
      { schema: 'loopx.review-result.v1', status: 'SPEC_COMPLIANT', task_quality: 'Approved', task_anchor: 'T-001', cannot_verify: [], findings: [], extra: true },
      { schema: 'loopx.review-result.v1', status: 'ISSUES_FOUND', task_quality: 'Needs fixes', task_anchor: 'T-001', cannot_verify: [], findings: [
        { id: 'F-002', severity: 'Important', anchor_ids: [], summary: 'Non-sequential ID' },
      ] },
    ]) {
      const message = `\`\`\`loopx-review-result\n${JSON.stringify(result)}\n\`\`\``;
      assert.throws(() => parseReviewResult(message), /review_result_/);
    }
    const valid = JSON.stringify({ schema: 'loopx.review-result.v1', status: 'SPEC_COMPLIANT', task_quality: 'Approved', task_anchor: 'T-001', cannot_verify: [], findings: [] });
    assert.throws(
      () => parseReviewResult(`\`\`\`loopx-review-result\n${valid}\n\`\`\`\n\`\`\`loopx-review-result\n${valid}\n\`\`\``),
      /review_result_block_count_invalid/,
    );
  });

  it('scores reviewer quality from structured semantics rather than Markdown order', () => {
    const result = {
      schema: 'loopx.review-result.v1', status: 'ISSUES_FOUND', task_quality: 'Needs fixes', task_anchor: 'T-004', cannot_verify: [],
      findings: [
        { id: 'F-001', severity: 'Critical', anchor_ids: ['AC-001'], summary: 'First' },
        { id: 'F-002', severity: 'Important', anchor_ids: ['AC-002'], summary: 'Second' },
        { id: 'F-003', severity: 'Minor', anchor_ids: [], summary: 'Third' },
      ],
    };
    const evaluation = evaluateLeafReviewResult(result, {
      status: 'ISSUES_FOUND', task_quality: 'Needs fixes', task_anchor: 'T-004',
      findings: [
        { severity: 'Critical', anchor_ids: ['AC-001'] },
        { severity: 'Important', anchor_ids: ['AC-002'] },
        { severity: 'Minor', anchor_ids: [] },
      ],
    });

    assert.deepEqual(evaluation, { passed: true, violations: [] });
  });

  it('includes controller integration failure in run quality', () => {
    const summary = summarizeAgentEvalRun([
      { event: 'run_start', run_id: 'integration', case_id: 'review', variant: 'v2', at_ms: 0 },
      { event: 'run_end', outcome: 'passed', tests_passed: true, integration_passed: false, at_ms: 10 },
    ]);

    assert.equal(summary.integration_passed, false);
    assert.equal(summary.quality_passed, false);
  });

  it('gates installed-product resource claims on outcome, verification, safety, spec, and memory quality', () => {
    const base = {
      case_id: 'direct-small-fix',
      case_kind: 'direct',
      configuration: {
        model: 'fake-model',
        effort: 'high',
        tools: ['shell'],
        task: 'Fix the greeting.',
        timeout_ms: 30_000,
        fixture_tree: 'fixture-tree',
      },
      outcome: 'passed',
      verification: { passed: true, commands: ['npm test'] },
      safety: { passed: true, violations: [] },
      spec: { passed: true, outcomes: [] },
      memory: { passed: true, outcomes: [] },
      changed_paths: ['src/greeting.mjs'],
      workflow_artifacts: [],
      worker_activity: { peak_workers: 0, overlap_ms: 0, integration_order: [] },
    };
    const baseline = { ...base, variant: 'bare', total_tokens: 1000, latency_ms: 1000 };
    const candidate = {
      ...base,
      variant: 'installed',
      total_tokens: 500,
      latency_ms: 500,
      spec: { passed: false, outcomes: [{ status: 'stale', path: 'docs/spec.md' }] },
    };

    const comparison = compareInstalledProductRuns([baseline, candidate], {
      baselineVariant: 'bare',
      candidateVariant: 'installed',
    });

    assert.equal(comparison.cases[0].configuration_parity, true);
    assert.equal(comparison.cases[0].quality_passed, false);
    assert.equal(comparison.cases[0].resource_favorable, false);
    assert.deepEqual(comparison.cases[0].failed_quality_gates, ['spec_consistency']);
    assert.deepEqual(comparison.cases[0].metrics.candidate.total_tokens, {
      sample_count: 1, quality_passed_count: 0, available_count: 0, values: [], p50: null, p95: null,
    });
    assert.equal(comparison.cases[0].metric_deltas.total_tokens, null);
    assert.equal(comparison.overall.favorable_cases, 0);
    assert.equal(comparison.overall.criteria_passed, false);

    const unsafeBaseline = compareInstalledProductRuns([
      { ...baseline, safety: { passed: false, violations: ['source_mutated'] } },
      { ...candidate, spec: { passed: true, outcomes: [] } },
    ], { baselineVariant: 'bare', candidateVariant: 'installed' });
    assert.equal(unsafeBaseline.cases[0].quality_passed, false);
    assert.equal(unsafeBaseline.cases[0].resource_favorable, false);
    assert.deepEqual(unsafeBaseline.cases[0].failed_quality_gates, ['baseline:safety']);
  });

  it('reports paired quality rates and token and latency distributions without inventing missing values', () => {
    const run = (variant, replicate, values) => ({
      case_id: 'direct-small-fix',
      case_kind: 'direct',
      variant,
      replicate,
      configuration: { model: 'same-model', effort: 'high', task: 'fix', fixture_tree: 'tree' },
      outcome: 'passed',
      verification: { passed: true },
      safety: { passed: true },
      spec: { passed: true },
      memory: { passed: true },
      changed_paths: ['src/a.mjs'],
      workflow_artifacts: [],
      worker_activity: { peak_workers: 0, overlap_ms: 0, integration_order: [] },
      tokens: values.tokens,
      total_tokens: values.tokens.total,
      latency_ms: values.latency,
    });
    const comparison = compareInstalledProductRuns([
      run('bare', 1, { tokens: { input: 100, cached_input: 20, output: 30, total: 130 }, latency: 100 }),
      run('installed', 1, { tokens: { input: 90, cached_input: 10, output: 25, total: 115 }, latency: 80 }),
      run('bare', 2, { tokens: { input: 120, cached_input: 40, output: 20, total: 140 }, latency: 120 }),
      run('installed', 2, { tokens: { input: 100, cached_input: null, output: 20, total: 120 }, latency: 90 }),
    ]);

    const item = comparison.cases[0];
    assert.deepEqual(item.metrics.baseline.input_tokens, {
      sample_count: 2, quality_passed_count: 2, available_count: 2, values: [100, 120], p50: 110, p95: 119,
    });
    assert.deepEqual(item.metrics.candidate.cached_input_tokens, {
      sample_count: 2, quality_passed_count: 2, available_count: 1, values: [10], p50: 10, p95: 10,
    });
    assert.equal(item.metric_deltas.input_tokens, -15);
    assert.equal(item.metric_deltas.cached_input_tokens, -20);
    assert.deepEqual(item.pairs.map((pair) => ({
      replicate: pair.replicate,
      quality_passed: pair.quality_passed,
      total_tokens_delta: pair.metric_deltas.total_tokens,
      cached_input_tokens_delta: pair.metric_deltas.cached_input_tokens,
      latency_ms_delta: pair.metric_deltas.latency_ms,
    })), [
      { replicate: 1, quality_passed: true, total_tokens_delta: -15, cached_input_tokens_delta: -10, latency_ms_delta: -20 },
      { replicate: 2, quality_passed: true, total_tokens_delta: -20, cached_input_tokens_delta: null, latency_ms_delta: -30 },
    ]);
    assert.equal(comparison.overall.baseline_success_rate, 1);
    assert.equal(comparison.overall.candidate_success_rate, 1);
    assert.equal(comparison.overall.baseline_quality_pass_rate, 1);
    assert.equal(comparison.overall.candidate_quality_pass_rate, 1);
  });

  it('uses quality-first cross-version verdicts instead of bare-product favorability rules', () => {
    const run = (variant, values = {}) => ({
      case_id: values.case_id ?? 'direct-small-fix',
      case_kind: values.case_kind ?? 'direct',
      variant,
      replicate: 1,
      configuration: { model: 'same-model', effort: 'high', task: 'fix', fixture_tree: 'tree' },
      outcome: values.outcome ?? 'passed',
      verification: { passed: values.outcome !== 'failed' },
      safety: { passed: true },
      spec: { passed: true },
      memory: { passed: true },
      cleanup: values.cleanup ?? { workspace_removed: true, host_home_removed: true },
      changed_paths: ['src/a.mjs'],
      workflow_artifacts: [],
      worker_activity: { peak_workers: 0, overlap_ms: 0, bounded: true, isolated: true, integration_order: [] },
      tokens: { input: values.tokens, cached_input: 0, output: 0, total: values.tokens },
      total_tokens: values.tokens,
      latency_ms: values.latency,
    });
    const options = {
      baselineVariant: 'version-a',
      candidateVariant: 'version-b',
      comparisonMode: 'cross-version',
    };

    const qualityWin = compareInstalledProductRuns([
      run('version-a', { outcome: 'failed', tokens: 80, latency: 80 }),
      run('version-b', { tokens: 100, latency: 100 }),
    ], options);
    assert.equal(qualityWin.cases[0].verdict, 'B_wins_quality');
    assert.equal(qualityWin.cases[0].quality_passed, true);
    assert.equal(qualityWin.cases[0].resource_favorable, false);
    assert.equal(qualityWin.overall.criteria_passed, true);

    const closeRegression = compareInstalledProductRuns([
      run('version-a', { tokens: 100, latency: 100 }),
      run('version-b', { tokens: 105, latency: 105 }),
    ], options);
    assert.equal(closeRegression.cases[0].verdict, 'quality_tie');
    assert.equal(closeRegression.cases[0].resource_favorable, false);

    const resourceWin = compareInstalledProductRuns([
      run('version-a', { tokens: 100, latency: 100 }),
      run('version-b', { tokens: 90, latency: 105 }),
    ], options);
    assert.equal(resourceWin.cases[0].verdict, 'B_wins_resource');
    assert.equal(resourceWin.cases[0].resource_favorable, true);

    const cleanupRegression = compareInstalledProductRuns([
      run('version-a', { tokens: 100, latency: 100 }),
      run('version-b', { tokens: 90, latency: 90, cleanup: { workspace_removed: false, host_home_removed: true } }),
    ], options);
    assert.equal(cleanupRegression.cases[0].verdict, 'A_wins_quality');
    assert.deepEqual(cleanupRegression.cases[0].failed_quality_gates, ['cleanup']);
  });

  it('renders installed-product outcome, repository, worker, resource, spec, and memory evidence', () => {
    const comparison = compareInstalledProductRuns([
      {
        case_id: 'direct-small-fix', case_kind: 'direct', variant: 'bare', configuration: { task: 'fix', fixture_tree: 'tree' },
        outcome: 'passed', verification: { passed: true }, safety: { passed: true }, spec: { passed: true }, memory: { passed: true },
        changed_paths: ['src/a.mjs'], workflow_artifacts: [], worker_activity: { peak_workers: 0, overlap_ms: 0, integration_order: [] },
        total_tokens: 100, latency_ms: 100,
      },
      {
        case_id: 'direct-small-fix', case_kind: 'direct', variant: 'installed', configuration: { task: 'fix', fixture_tree: 'tree' },
        outcome: 'passed', verification: { passed: true }, safety: { passed: true }, spec: { passed: true }, memory: { passed: true },
        changed_paths: ['src/a.mjs'], workflow_artifacts: [], worker_activity: { peak_workers: 0, overlap_ms: 0, integration_order: [] },
        total_tokens: 105, latency_ms: 105,
      },
    ]);

    const markdown = renderInstalledProductMarkdown(comparison);
    for (const heading of ['Outcome', 'Verification', 'Changed paths', 'Workflow artifacts', 'Workers', 'Tokens', 'Latency', 'Spec', 'Memory']) {
      assert.match(markdown, new RegExp(heading, 'i'));
    }
    assert.match(markdown, /direct-small-fix/);
    assert.match(markdown, /quality gates before resource comparisons/i);
    assert.match(markdown, /Metric Distributions/);
    assert.match(markdown, /Paired Samples/);
    assert.match(markdown, /Input tokens/);

    const versionMarkdown = renderCrossVersionProductMarkdown({
      schema: 'loopx.cross-version-product-benchmark-report.v1',
      provenance: {
        versions: {
          baseline: { requested_ref: 'v0.5.2', commit: 'a'.repeat(40), package_version: '0.5.2', package_sha256: 'b'.repeat(64) },
          candidate: { requested_ref: 'main', commit: 'c'.repeat(40), package_version: '0.6.0', package_sha256: 'd'.repeat(64) },
        },
      },
      comparison,
    });
    assert.match(versionMarkdown, /Cross-Version Product Benchmark/);
    assert.match(versionMarkdown, /v0\.5\.2/);
    assert.match(versionMarkdown, /0\.6\.0/);
    assert.match(versionMarkdown, new RegExp('a{40}'));
    assert.match(versionMarkdown, /Verdict/);
  });

  it('normalizes a Claude session with subagents and detects nested agent constraint', async () => {
    const repoRoot = new URL('..', import.meta.url).pathname;
    const fixtures = join(repoRoot, 'test', 'fixtures', 'claude-sessions');
    const session = await findClaudeSession(fixtures, 'claude-fixture-001');
    const events = normalizeClaudeSession(session, {
      caseId: 'review-real-defect',
      variant: 'claude',
      model: 'claude-sonnet-5',
    });
    const summary = summarizeAgentEvalRun(events);

    assert.equal(summary.case_id, 'review-real-defect');
    assert.equal(summary.variant, 'claude');
    // The fixture has two agent spawns: first failed (400 error), second succeeded
    assert.equal(summary.agent_count, 2);
    assert.equal(summary.nested_agent_count, 0);
    assert.equal(summary.peak_active_agents, 1);
    assert.equal(summary.hard_invariants_passed, true);
    // Should have detected wait operations
    assert.ok(summary.wait_count > 0);
  });

  it('extracts the leaf worker final message from a Claude session', async () => {
    const repoRoot = new URL('..', import.meta.url).pathname;
    const fixtures = join(repoRoot, 'test', 'fixtures', 'claude-sessions');
    const session = await findClaudeSession(fixtures, 'claude-fixture-001');
    const leaf = extractClaudeLeafFinalMessage(session);

    // Should pick the last successful subagent (a045594f9d3c7dada)
    assert.ok(leaf.threadId);
    assert.ok(leaf.message.length > 0);
  });
});
