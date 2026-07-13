function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function percentDelta(baseline, candidate) {
  if (!Number.isFinite(baseline) || !Number.isFinite(candidate)) {
    return null;
  }
  if (baseline === 0) {
    return candidate === 0 ? 0 : null;
  }
  return ((candidate - baseline) / baseline) * 100;
}

export function summarizeAgentEvalRun(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('agent_eval_events_required');
  }

  const start = events.find((event) => event.event === 'run_start') ?? events[0];
  const end = [...events].reverse().find((event) => event.event === 'run_end') ?? {};
  const spawned = new Set();
  const active = new Set();
  const findingIds = new Set();
  let peakActiveAgents = 0;
  let nestedAgentCount = 0;
  let duplicateFindingCount = 0;

  for (const event of events) {
    if (event.event === 'agent_spawn') {
      spawned.add(event.actor_id);
      active.add(event.actor_id);
      peakActiveAgents = Math.max(peakActiveAgents, active.size);
      if (event.parent_actor_id && event.parent_actor_id !== 'controller') {
        nestedAgentCount += 1;
      }
    } else if (event.event === 'agent_release' || event.event === 'agent_end') {
      active.delete(event.actor_id);
    } else if (event.event === 'review_finding' && event.finding_id) {
      if (findingIds.has(event.finding_id)) {
        duplicateFindingCount += 1;
      }
      findingIds.add(event.finding_id);
    }
  }

  const count = (name) => events.filter((event) => event.event === name).length;
  const reviewFindings = events.filter((event) => event.event === 'review_finding');
  const inputTokens = numberOrNull(end.input_tokens);
  const outputTokens = numberOrNull(end.output_tokens);
  const totalTokens = inputTokens === null || outputTokens === null ? null : inputTokens + outputTokens;
  const hardInvariantsPassed = nestedAgentCount === 0;
  const outcomePassed = end.outcome === 'passed' && end.tests_passed !== false;

  return {
    run_id: start.run_id ?? null,
    case_id: start.case_id ?? null,
    variant: start.variant ?? null,
    outcome: end.outcome ?? 'unknown',
    tests_passed: end.tests_passed ?? null,
    quality_passed: outcomePassed && hardInvariantsPassed,
    hard_invariants_passed: hardInvariantsPassed,
    agent_count: spawned.size,
    peak_active_agents: peakActiveAgents,
    nested_agent_count: nestedAgentCount,
    tool_call_count: count('tool_call'),
    wait_count: count('agent_wait'),
    retry_count: count('retry'),
    replacement_count: count('agent_replacement'),
    review_finding_count: reviewFindings.length,
    review_false_positive_count: reviewFindings.filter((event) => event.finding_valid === false).length,
    review_duplicate_count: duplicateFindingCount,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    latency_ms: numberOrNull(end.latency_ms),
  };
}

export function applyAgentEvalPolicies(summaries, manifest) {
  const cases = new Map((manifest?.cases ?? []).map((item) => [item.id, item]));
  const defaults = manifest?.default_limits ?? {};
  return summaries.map((summary) => {
    const limits = { ...defaults, ...(cases.get(summary.case_id)?.limits ?? {}) };
    const violations = [];
    for (const [field, metric] of [
      ['max_agent_count', 'agent_count'],
      ['max_peak_active_agents', 'peak_active_agents'],
      ['max_nested_agents', 'nested_agent_count'],
      ['max_wait_count', 'wait_count'],
      ['max_retry_count', 'retry_count'],
      ['max_replacement_count', 'replacement_count'],
      ['max_review_false_positives', 'review_false_positive_count'],
      ['max_review_duplicates', 'review_duplicate_count'],
    ]) {
      if (Number.isFinite(limits[field]) && summary[metric] > limits[field]) {
        violations.push(`${metric}=${summary[metric]} exceeds ${field}=${limits[field]}`);
      }
    }
    return {
      ...summary,
      policy_passed: violations.length === 0,
      policy_violations: violations,
      quality_passed: summary.quality_passed && violations.length === 0,
    };
  });
}

export function compareAgentEvalRuns(summaries, options = {}) {
  const baselineVariant = options.baselineVariant ?? 'baseline';
  const candidateVariant = options.candidateVariant ?? 'v2';
  const byCase = new Map();

  for (const summary of summaries) {
    if (!byCase.has(summary.case_id)) {
      byCase.set(summary.case_id, {});
    }
    byCase.get(summary.case_id)[summary.variant] = summary;
  }

  const cases = [];
  for (const [caseId, variants] of byCase) {
    const baseline = variants[baselineVariant];
    const candidate = variants[candidateVariant];
    if (!baseline || !candidate) {
      continue;
    }
    const comparableTokens = Number.isFinite(candidate.total_tokens) && Number.isFinite(baseline.total_tokens);
    const comparableLatency = Number.isFinite(candidate.latency_ms) && Number.isFinite(baseline.latency_ms);
    const resourceImproved = candidate.agent_count <= baseline.agent_count
      && comparableTokens && candidate.total_tokens <= baseline.total_tokens
      && comparableLatency && candidate.latency_ms <= baseline.latency_ms;
    const candidateQualityPassed = candidate.quality_passed === true;
    cases.push({
      case_id: caseId,
      baseline_variant: baselineVariant,
      candidate_variant: candidateVariant,
      baseline_quality_passed: baseline.quality_passed,
      candidate_quality_passed: candidateQualityPassed,
      agent_count_delta: candidate.agent_count - baseline.agent_count,
      nested_agent_count_delta: candidate.nested_agent_count - baseline.nested_agent_count,
      tool_call_count_delta: candidate.tool_call_count - baseline.tool_call_count,
      wait_count_delta: candidate.wait_count - baseline.wait_count,
      review_false_positive_delta: candidate.review_false_positive_count - baseline.review_false_positive_count,
      total_tokens_delta: comparableTokens ? candidate.total_tokens - baseline.total_tokens : null,
      total_tokens_percent_delta: percentDelta(baseline.total_tokens, candidate.total_tokens),
      latency_ms_delta: comparableLatency ? candidate.latency_ms - baseline.latency_ms : null,
      latency_percent_delta: percentDelta(baseline.latency_ms, candidate.latency_ms),
      improved: candidateQualityPassed && resourceImproved,
    });
  }

  return {
    baseline_variant: baselineVariant,
    candidate_variant: candidateVariant,
    cases,
    overall: {
      compared_cases: cases.length,
      improved_cases: cases.filter((item) => item.improved).length,
      candidate_quality_passed_cases: cases.filter((item) => item.candidate_quality_passed).length,
      nested_agent_free_cases: cases.filter((item) => item.nested_agent_count_delta <= 0).length,
    },
  };
}

function formatPercent(value) {
  return value === null ? 'n/a' : `${value.toFixed(1)}%`;
}

function formatDelta(value, suffix = '') {
  return value === null ? 'n/a' : `${value}${suffix}`;
}

export function renderAgentEvalMarkdown(comparison) {
  const lines = [
    '# Agent Eval Report',
    '',
    `- Baseline: \`${comparison.baseline_variant}\``,
    `- Candidate: \`${comparison.candidate_variant}\``,
    `- Compared cases: ${comparison.overall.compared_cases}`,
    `- Improved cases: ${comparison.overall.improved_cases}`,
    `- Candidate quality passed: ${comparison.overall.candidate_quality_passed_cases}`,
    '',
    '| Case | Quality | Agent delta | Nested agent delta | Tool delta | Wait delta | False-positive delta | Token delta | Latency delta | Improved |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
  ];

  for (const item of comparison.cases) {
    lines.push(`| ${item.case_id} | ${item.candidate_quality_passed ? 'pass' : 'fail'} | ${item.agent_count_delta} | ${item.nested_agent_count_delta} | ${item.tool_call_count_delta} | ${item.wait_count_delta} | ${item.review_false_positive_delta} | ${formatDelta(item.total_tokens_delta)} (${formatPercent(item.total_tokens_percent_delta)}) | ${formatDelta(item.latency_ms_delta, ' ms')} (${formatPercent(item.latency_percent_delta)}) | ${item.improved ? 'yes' : 'no'} |`);
  }

  lines.push(
    '',
    '## Interpretation',
    '',
    '- Lower agent, tool, token, or latency counts are improvements only when candidate quality and hard invariants pass.',
    '- Any nested agent created by a non-controller actor fails the hard topology invariant.',
    '- Investigate per-case traces before changing another prompt group.',
    '',
  );
  return lines.join('\n');
}
