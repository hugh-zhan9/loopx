import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import { aggregateAgentEvalReplicates, applyAgentEvalPolicies, compareAgentEvalRuns, evaluateControllerIntegration, evaluateLeafReviewResult, parseReviewResult, renderAgentEvalMarkdown, summarizeAgentEvalRun } from '../src/agent-eval.mjs';
import { extractCodexLeafFinalMessage, findCodexRollouts, normalizeCodexRollouts } from '../src/codex-agent-trace.mjs';

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
});
