import { parseReviewResult, validateReviewResult } from './review-result.mjs';
import { stableJson } from './stable-json.mjs';

export { parseReviewResult };

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

function configurationParityPayload(configuration) {
  if (!configuration || typeof configuration !== 'object') return configuration ?? null;
  // Variant-specific prompts (for example bare vs installed product demos) are
  // intentional. Per-run fixture tree hashes are identity evidence, not shared
  // matrix config. Parity keeps model/effort/tools/timeout/adapter/constraints.
  const { task, fixture_tree, ...shared } = configuration;
  return shared;
}

function configurationsHaveParity(left, right) {
  return stableJson(configurationParityPayload(left)) === stableJson(configurationParityPayload(right));
}

function ratio(numerator, denominator) {
  // An empty denominator means the metric was never exercised. Report null
  // (not measured) instead of a vacuous 1 so no-finding runs cannot look like
  // perfect-recall evidence in aggregates.
  return denominator === 0 ? null : numerator / denominator;
}

function stringSet(values) {
  return new Set((values ?? []).filter((value) => typeof value === 'string' && value));
}

function reviewAnchors(result) {
  return stringSet((result?.findings ?? []).flatMap((finding) => finding.anchor_ids ?? []));
}

export function evaluateControllerIntegration(leaf, controller) {
  validateReviewResult(leaf);
  const controllerValid = Boolean(controller);
  if (controllerValid) {
    validateReviewResult(controller);
  }
  const leafFindings = new Map(leaf.findings.map((finding) => [finding.id, finding]));
  const controllerFindings = new Map((controller?.findings ?? []).map((finding) => [finding.id, finding]));
  const matchedIds = [...leafFindings.keys()].filter((id) => controllerFindings.has(id));
  const exactSeverity = matchedIds.filter((id) => leafFindings.get(id).severity === controllerFindings.get(id).severity);
  const leafAnchors = reviewAnchors(leaf);
  const controllerAnchors = reviewAnchors(controller);
  const preservedAnchors = [...leafAnchors].filter((anchor) => controllerAnchors.has(anchor));
  const cannotVerify = stringSet(leaf.cannot_verify);
  const controllerCannotVerify = stringSet(controller?.cannot_verify);
  const blocking = new Set(leaf.findings.filter((finding) => ['Critical', 'Important'].includes(finding.severity)).map((finding) => finding.id));
  const blockingFindingLoss = [...blocking].some((id) => {
    const candidate = controllerFindings.get(id);
    return !candidate || candidate.severity !== leafFindings.get(id).severity;
  });
  const inventedBlocking = [...controllerFindings.values()].filter((finding) =>
    !leafFindings.has(finding.id) && ['Critical', 'Important'].includes(finding.severity)).length;
  const statusPreserved = controller?.status === leaf.status;
  const taskQualityPreserved = controller?.task_quality === leaf.task_quality;
  const unsafeContextPromotion = leaf.status === 'NEEDS_CONTEXT' && controller?.status !== 'NEEDS_CONTEXT';
  const taskAnchorPreserved = controller?.task_anchor === leaf.task_anchor;
  const cannotVerifyRecall = ratio(
    [...cannotVerify].filter((item) => controllerCannotVerify.has(item)).length,
    cannotVerify.size,
  );
  // With no cannot-verify items there is nothing to lose; the preservation
  // obligation is satisfied by absence, while the recall metric stays null.
  const cannotVerifyPreserved = cannotVerify.size === 0 || cannotVerifyRecall === 1;
  return {
    controller_result_present: controllerValid,
    status_preserved: statusPreserved,
    task_quality_preserved: taskQualityPreserved,
    task_anchor_preserved: taskAnchorPreserved,
    finding_recall: ratio(matchedIds.length, leafFindings.size),
    finding_precision: ratio(matchedIds.length, controllerFindings.size),
    severity_fidelity: ratio(exactSeverity.length, matchedIds.length),
    anchor_recall: ratio(preservedAnchors.length, leafAnchors.size),
    cannot_verify_recall: cannotVerifyRecall,
    unsafe_context_promotion: unsafeContextPromotion,
    blocking_finding_loss: blockingFindingLoss,
    controller_invented_blocking_findings: inventedBlocking,
    integration_passed: controllerValid
      && statusPreserved
      && taskQualityPreserved
      && taskAnchorPreserved
      && !unsafeContextPromotion
      && !blockingFindingLoss
      && inventedBlocking === 0
      && cannotVerifyPreserved,
  };
}

export function evaluateLeafReviewResult(result, expected) {
  validateReviewResult(result);
  const violations = [];
  for (const field of ['status', 'task_quality', 'task_anchor']) {
    if (Object.hasOwn(expected, field) && result[field] !== expected[field]) {
      violations.push(`${field}_mismatch`);
    }
  }
  if (Number.isFinite(expected.cannot_verify_count) && result.cannot_verify.length !== expected.cannot_verify_count) {
    violations.push('cannot_verify_count_mismatch');
  }
  if (Number.isFinite(expected.min_cannot_verify) && result.cannot_verify.length < expected.min_cannot_verify) {
    violations.push('cannot_verify_missing');
  }
  if (Array.isArray(expected.findings)) {
    if (result.findings.length !== expected.findings.length) {
      violations.push('finding_count_mismatch');
    }
    expected.findings.forEach((finding, index) => {
      const actual = result.findings[index];
      if (!actual) {
        return;
      }
      if (finding.severity && actual.severity !== finding.severity) {
        violations.push(`finding_${index + 1}_severity_mismatch`);
      }
      if (Array.isArray(finding.anchor_ids)
          && JSON.stringify(actual.anchor_ids) !== JSON.stringify(finding.anchor_ids)) {
        violations.push(`finding_${index + 1}_anchors_mismatch`);
      }
      if (Array.isArray(finding.summary_must_contain)) {
        // Severity and anchors alone accept findings whose prose describes a
        // different defect; require the key evidence fragments in the summary.
        const summaryText = String(actual.summary ?? '').toLowerCase();
        const missing = finding.summary_must_contain
          .filter((fragment) => !summaryText.includes(String(fragment).toLowerCase()));
        if (missing.length > 0) {
          violations.push(`finding_${index + 1}_summary_missing_evidence`);
        }
      }
    });
  }
  return { passed: violations.length === 0, violations };
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
  const cachedInputTokens = inputTokens === null ? null : numberOrNull(end.cached_input_tokens) ?? 0;
  const uncachedInputTokens = inputTokens === null || cachedInputTokens === null ? null : inputTokens - cachedInputTokens;
  const totalTokens = inputTokens === null || outputTokens === null ? null : inputTokens + outputTokens;
  const hardInvariantsPassed = nestedAgentCount === 0;
  const integrationPassed = end.integration_passed ?? null;
  const testsPassed = end.tests_passed ?? null;
  // Correctness is tri-state. Completion alone is never correctness evidence:
  // a run whose tests_passed and integration_passed are both unevaluated is
  // unknown, and unknown never counts as quality-passed or improved.
  let correctness = 'unknown';
  if (end.outcome !== 'passed' || testsPassed === false || integrationPassed === false) {
    correctness = 'failed';
  } else if (testsPassed === true || integrationPassed === true) {
    correctness = 'passed';
  }

  return {
    run_id: start.run_id ?? null,
    case_id: start.case_id ?? null,
    variant: start.variant ?? null,
    outcome: end.outcome ?? 'unknown',
    tests_passed: testsPassed,
    correctness,
    quality_passed: correctness === 'passed' && hardInvariantsPassed,
    hard_invariants_passed: hardInvariantsPassed,
    integration_passed: integrationPassed,
    leaf_review_result_valid: end.leaf_review_result_valid ?? null,
    controller_review_result_valid: end.controller_review_result_valid ?? null,
    status_preserved: end.status_preserved ?? null,
    task_quality_preserved: end.task_quality_preserved ?? null,
    task_anchor_preserved: end.task_anchor_preserved ?? null,
    finding_recall: numberOrNull(end.finding_recall),
    finding_precision: numberOrNull(end.finding_precision),
    severity_fidelity: numberOrNull(end.severity_fidelity),
    anchor_recall: numberOrNull(end.anchor_recall),
    cannot_verify_recall: numberOrNull(end.cannot_verify_recall),
    unsafe_context_promotion: end.unsafe_context_promotion ?? null,
    blocking_finding_loss: end.blocking_finding_loss ?? null,
    controller_invented_blocking_findings: numberOrNull(end.controller_invented_blocking_findings),
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
    cached_input_tokens: cachedInputTokens,
    uncached_input_tokens: uncachedInputTokens,
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

function triState(values) {
  if (values.some((value) => value === false)) return false;
  return values.every((value) => value === true) ? true : null;
}

function summaryCorrectness(summary) {
  // Summaries written before the tri-state schema carry no correctness field;
  // treat them as unverified instead of trusting their fail-open quality flag.
  return summary.correctness ?? 'unknown';
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

const installedMetrics = Object.freeze([
  { field: 'input_tokens', label: 'Input tokens', value: (run) => run.tokens?.input ?? run.input_tokens ?? null },
  { field: 'cached_input_tokens', label: 'Cached input tokens', value: (run) => run.tokens?.cached_input ?? run.cached_input_tokens ?? null },
  { field: 'output_tokens', label: 'Output tokens', value: (run) => run.tokens?.output ?? run.output_tokens ?? null },
  { field: 'total_tokens', label: 'Total tokens', value: (run) => run.tokens?.total ?? run.total_tokens ?? null },
  { field: 'latency_ms', label: 'Latency (ms)', value: (run) => run.latency_ms ?? null },
]);

function percentile(sorted, percent) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (sorted.length - 1) * percent;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

function installedMetricDistribution(runs, metric) {
  const qualityPassedRuns = runs.filter((run) => installedProductQuality(run).failed.length === 0);
  const values = qualityPassedRuns.map(metric.value).filter(Number.isFinite).sort((left, right) => left - right);
  return {
    sample_count: runs.length,
    quality_passed_count: qualityPassedRuns.length,
    available_count: values.length,
    values,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function installedMetricDistributions(runs) {
  return Object.fromEntries(installedMetrics.map((metric) => [metric.field, installedMetricDistribution(runs, metric)]));
}

function installedMetricDeltas(baseline, candidate) {
  return Object.fromEntries(installedMetrics.map((metric) => {
    const baselineValue = baseline[metric.field]?.p50;
    const candidateValue = candidate[metric.field]?.p50;
    return [metric.field, Number.isFinite(baselineValue) && Number.isFinite(candidateValue)
      ? candidateValue - baselineValue
      : null];
  }));
}

function installedMetricPercentDeltas(baseline, candidate) {
  return Object.fromEntries(installedMetrics.map((metric) => [
    metric.field,
    percentDelta(baseline[metric.field]?.p50, candidate[metric.field]?.p50),
  ]));
}

export function aggregateAgentEvalReplicates(summaries) {
  const groups = Map.groupBy(summaries, (summary) => `${summary.case_id}\u0000${summary.variant}`);
  return [...groups.values()].map((runs) => {
    const first = runs[0];
    const numericFields = [
      'agent_count', 'peak_active_agents', 'nested_agent_count', 'tool_call_count',
      'wait_count', 'retry_count', 'replacement_count', 'review_finding_count',
      'review_false_positive_count', 'review_duplicate_count', 'input_tokens',
      'cached_input_tokens', 'uncached_input_tokens', 'output_tokens', 'total_tokens',
      'latency_ms',
      'finding_recall', 'finding_precision', 'severity_fidelity', 'anchor_recall',
      'cannot_verify_recall', 'controller_invented_blocking_findings',
    ];
    const aggregate = Object.fromEntries(numericFields.map((field) => [field, median(runs.map((run) => run[field]))]));
    return {
      ...aggregate,
      run_id: `${first.case_id}-${first.variant}-aggregate`,
      case_id: first.case_id,
      variant: first.variant,
      outcome: runs.every((run) => run.outcome === 'passed') ? 'passed' : 'failed',
      tests_passed: triState(runs.map((run) => run.tests_passed)),
      correctness: runs.some((run) => summaryCorrectness(run) === 'failed')
        ? 'failed'
        : runs.every((run) => summaryCorrectness(run) === 'passed') ? 'passed' : 'unknown',
      quality_passed: runs.every((run) => run.quality_passed === true),
      hard_invariants_passed: runs.every((run) => run.hard_invariants_passed === true),
      integration_passed: triState(runs.map((run) => run.integration_passed)),
      status_preserved: runs.every((run) => run.status_preserved !== false),
      task_quality_preserved: runs.every((run) => run.task_quality_preserved !== false),
      task_anchor_preserved: runs.every((run) => run.task_anchor_preserved !== false),
      unsafe_context_promotion: runs.some((run) => run.unsafe_context_promotion === true),
      blocking_finding_loss: runs.some((run) => run.blocking_finding_loss === true),
      policy_passed: runs.every((run) => run.policy_passed !== false),
      policy_violations: [...new Set(runs.flatMap((run) => run.policy_violations ?? []))],
      replicate_count: runs.length,
      quality_pass_rate: runs.filter((run) => run.quality_passed === true).length / runs.length,
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
    const comparableUncached = Number.isFinite(candidate.uncached_input_tokens) && Number.isFinite(baseline.uncached_input_tokens);
    const resourceImproved = candidate.agent_count <= baseline.agent_count
      && comparableTokens && candidate.total_tokens <= baseline.total_tokens
      && comparableLatency && candidate.latency_ms <= baseline.latency_ms;
    const candidateQualityPassed = candidate.quality_passed === true;
    const baselineCorrectness = summaryCorrectness(baseline);
    const candidateCorrectness = summaryCorrectness(candidate);
    cases.push({
      case_id: caseId,
      baseline_variant: baselineVariant,
      candidate_variant: candidateVariant,
      baseline_quality_passed: baseline.quality_passed,
      candidate_quality_passed: candidateQualityPassed,
      baseline_correctness: baselineCorrectness,
      candidate_correctness: candidateCorrectness,
      candidate_integration_passed: candidate.integration_passed,
      status_preserved: candidate.status_preserved,
      finding_recall: candidate.finding_recall,
      finding_precision: candidate.finding_precision,
      severity_fidelity: candidate.severity_fidelity,
      anchor_recall: candidate.anchor_recall,
      agent_count_delta: candidate.agent_count - baseline.agent_count,
      nested_agent_count_delta: candidate.nested_agent_count - baseline.nested_agent_count,
      tool_call_count_delta: candidate.tool_call_count - baseline.tool_call_count,
      wait_count_delta: candidate.wait_count - baseline.wait_count,
      review_false_positive_delta: candidate.review_false_positive_count - baseline.review_false_positive_count,
      total_tokens_delta: comparableTokens ? candidate.total_tokens - baseline.total_tokens : null,
      total_tokens_percent_delta: percentDelta(baseline.total_tokens, candidate.total_tokens),
      uncached_input_tokens_delta: comparableUncached ? candidate.uncached_input_tokens - baseline.uncached_input_tokens : null,
      uncached_input_tokens_percent_delta: percentDelta(baseline.uncached_input_tokens, candidate.uncached_input_tokens),
      latency_ms_delta: comparableLatency ? candidate.latency_ms - baseline.latency_ms : null,
      latency_percent_delta: percentDelta(baseline.latency_ms, candidate.latency_ms),
      // A resource win only counts as improvement when correctness was
      // actually verified on both sides; unknown correctness never improves.
      improved: candidateQualityPassed && baselineCorrectness === 'passed' && resourceImproved,
    });
  }

  return {
    schema: 'loopx.agent-eval-comparison.v2',
    baseline_variant: baselineVariant,
    candidate_variant: candidateVariant,
    cases,
    overall: {
      compared_cases: cases.length,
      improved_cases: cases.filter((item) => item.improved).length,
      candidate_quality_passed_cases: cases.filter((item) => item.candidate_quality_passed).length,
      unknown_correctness_cases: cases.filter((item) => item.baseline_correctness === 'unknown' || item.candidate_correctness === 'unknown').length,
      nested_agent_free_cases: cases.filter((item) => item.nested_agent_count_delta <= 0).length,
      controller_integration_evaluated_cases: cases.filter((item) => item.candidate_integration_passed !== null && item.candidate_integration_passed !== undefined).length,
      controller_integration_passed_cases: cases.filter((item) => item.candidate_integration_passed === true).length,
    },
  };
}

function installedProductQuality(run) {
  const cleanupPassed = !run.cleanup
    || run.cleanup.passed === true
    || (run.cleanup.workspace_removed === true && run.cleanup.host_home_removed === true);
  const gates = {
    outcome: run.outcome === 'passed',
    verification: run.verification?.passed === true,
    safety: run.safety?.passed === true,
    spec_consistency: run.spec?.passed === true,
    memory_precision: run.memory?.passed === true,
    cleanup: cleanupPassed,
  };
  return {
    gates,
    failed: Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name),
  };
}

function aggregateInstalledProductRuns(runs) {
  const first = runs[0];
  const qualities = runs.map(installedProductQuality);
  const metrics = installedMetricDistributions(runs);
  return {
    case_id: first.case_id,
    case_kind: first.case_kind,
    variant: first.variant,
    configuration: first.configuration,
    configuration_consistent: runs.every((run) => stableJson(run.configuration) === stableJson(first.configuration)),
    replicate_count: runs.length,
    outcome: runs.every((run) => run.outcome === 'passed') ? 'passed' : 'failed',
    success_rate: runs.filter((run) => run.outcome === 'passed').length / runs.length,
    verification: { passed: runs.every((run) => run.verification?.passed === true) },
    safety: { passed: runs.every((run) => run.safety?.passed === true) },
    spec: { passed: runs.every((run) => run.spec?.passed === true) },
    memory: { passed: runs.every((run) => run.memory?.passed === true) },
    cleanup: { passed: runs.every((run) => installedProductQuality(run).gates.cleanup) },
    quality_passed: qualities.every((quality) => quality.failed.length === 0),
    quality_pass_rate: qualities.filter((quality) => quality.failed.length === 0).length / runs.length,
    failed_quality_gates: [...new Set(qualities.flatMap((quality) => quality.failed))],
    changed_paths: [...new Set(runs.flatMap((run) => run.changed_paths ?? []))].sort(),
    workflow_artifacts: [...new Set(runs.flatMap((run) => run.workflow_artifacts ?? []))].sort(),
    metrics,
    input_tokens: metrics.input_tokens.p50,
    cached_input_tokens: metrics.cached_input_tokens.p50,
    output_tokens: metrics.output_tokens.p50,
    total_tokens: metrics.total_tokens.p50,
    latency_ms: metrics.latency_ms.p50,
    execution_selection: runs.every((run) => run.execution_selection === first.execution_selection) ? first.execution_selection : 'mixed',
    worker_activity: {
      peak_workers: Math.max(...runs.map((run) => run.worker_activity?.peak_workers ?? 0)),
      overlap_ms: median(runs.map((run) => run.worker_activity?.overlap_ms)),
      all_overlapped: runs.every((run) => (run.worker_activity?.overlap_ms ?? 0) > 0),
      bounded: runs.every((run) => run.worker_activity?.bounded !== false),
      isolated: runs.every((run) => run.worker_activity?.isolated !== false),
      integration_order: first.worker_activity?.integration_order ?? [],
    },
  };
}

function pairedInstalledProductRuns(runs, baselineVariant, candidateVariant) {
  const byReplicate = Map.groupBy(runs, (run) => run.replicate ?? 1);
  return [...byReplicate.entries()].sort(([left], [right]) => left - right).flatMap(([replicate, replicateRuns]) => {
    const baseline = replicateRuns.find((run) => run.variant === baselineVariant);
    const candidate = replicateRuns.find((run) => run.variant === candidateVariant);
    if (!baseline || !candidate) return [];
    const baselineMetrics = installedMetricDistributions([baseline]);
    const candidateMetrics = installedMetricDistributions([candidate]);
    const baselineQuality = installedProductQuality(baseline).failed.length === 0;
    const candidateQuality = installedProductQuality(candidate).failed.length === 0;
    const configurationParity = configurationsHaveParity(baseline.configuration, candidate.configuration);
    return [{
      replicate,
      baseline_run_id: baseline.run_id ?? null,
      candidate_run_id: candidate.run_id ?? null,
      baseline_quality_passed: baselineQuality,
      candidate_quality_passed: candidateQuality,
      configuration_parity: configurationParity,
      quality_passed: baselineQuality && candidateQuality && configurationParity,
      metric_deltas: installedMetricDeltas(baselineMetrics, candidateMetrics),
      metric_percent_deltas: installedMetricPercentDeltas(baselineMetrics, candidateMetrics),
    }];
  });
}

function rate(runs, predicate) {
  return runs.length > 0 ? runs.filter(predicate).length / runs.length : null;
}

function crossVersionVerdict({ baseline, candidate, configurationParity, resourceFavorable, metricPercentDeltas }) {
  if (!configurationParity) return 'inconclusive';
  if (candidate.quality_pass_rate === 0 && baseline.quality_pass_rate === 0) return 'inconclusive';
  const tokenDelta = metricPercentDeltas.total_tokens;
  const latencyDelta = metricPercentDeltas.latency_ms;
  const resourcesComparable = Number.isFinite(tokenDelta) && Number.isFinite(latencyDelta);
  const resourceRegression = resourcesComparable && (tokenDelta > 10 || latencyDelta > 10);
  if (candidate.quality_pass_rate > baseline.quality_pass_rate) {
    return resourceRegression ? 'mixed' : 'B_wins_quality';
  }
  if (candidate.quality_pass_rate < baseline.quality_pass_rate) return 'A_wins_quality';
  if (resourceFavorable) return 'B_wins_resource';
  if (!resourcesComparable) return 'inconclusive';
  if (resourceRegression) return 'mixed';
  return 'quality_tie';
}

const crossVersionVerdictMetadata = Object.freeze({
  B_wins_quality: { summary: 'quality_improvement_cases', favorable: true, comparable: true },
  A_wins_quality: { summary: 'quality_regression_cases', favorable: false, comparable: true },
  B_wins_resource: { summary: 'resource_improvement_cases', favorable: true, comparable: true },
  quality_tie: { summary: null, favorable: false, comparable: true },
  mixed: { summary: 'mixed_cases', favorable: false, comparable: true },
  inconclusive: { summary: 'inconclusive_cases', favorable: false, comparable: false },
});

function crossVersionSuiteSummary(cases) {
  const summary = {
    quality_regression_cases: [],
    quality_improvement_cases: [],
    resource_improvement_cases: [],
    mixed_cases: [],
    inconclusive_cases: [],
  };
  for (const item of cases) {
    const bucket = crossVersionVerdictMetadata[item.verdict]?.summary;
    if (bucket) summary[bucket].push(item.case_id);
  }
  let suiteVerdict = 'quality_tie';
  if (cases.length === 0 || summary.inconclusive_cases.length === cases.length) suiteVerdict = 'inconclusive';
  else if (summary.quality_regression_cases.length > 0) suiteVerdict = 'release_risk';
  else if (summary.mixed_cases.length > 0 || summary.inconclusive_cases.length > 0) suiteVerdict = 'mixed';
  else if (summary.quality_improvement_cases.length > 0) suiteVerdict = 'B_wins_quality';
  else if (summary.resource_improvement_cases.length > 0) suiteVerdict = 'B_wins_resource';
  return { suite_verdict: suiteVerdict, ...summary };
}

export function compareInstalledProductRuns(runs, options = {}) {
  const baselineVariant = options.baselineVariant ?? 'bare';
  const candidateVariant = options.candidateVariant ?? 'installed';
  const forcedSerialVariant = options.forcedSerialVariant ?? 'forced-serial';
  const comparisonMode = options.comparisonMode ?? 'product-baseline';
  const aggregates = [...Map.groupBy(runs, (run) => `${run.case_id}\u0000${run.variant}`).values()]
    .map(aggregateInstalledProductRuns);
  const byCase = Map.groupBy(aggregates, (run) => run.case_id);
  const rawByCase = Map.groupBy(runs, (run) => run.case_id);
  const cases = [];

  for (const [caseId, caseRuns] of byCase) {
    const variants = Object.fromEntries(caseRuns.map((run) => [run.variant, run]));
    const baseline = variants[baselineVariant];
    const candidate = variants[candidateVariant];
    if (!baseline || !candidate) {
      continue;
    }
    const forcedSerial = variants[forcedSerialVariant] ?? null;
    const configurationParity = baseline.configuration_consistent
      && candidate.configuration_consistent
      && (!forcedSerial || forcedSerial.configuration_consistent)
      && configurationsHaveParity(baseline.configuration, candidate.configuration);
    const baselineQuality = installedProductQuality(baseline);
    const candidateQuality = installedProductQuality(candidate);
    const forcedSerialQuality = forcedSerial ? installedProductQuality(forcedSerial) : null;
    const failedQualityGates = comparisonMode === 'cross-version'
      ? [...candidateQuality.failed]
      : [
          ...candidateQuality.failed,
          ...baselineQuality.failed.map((gate) => `baseline:${gate}`),
          ...(forcedSerialQuality?.failed ?? []).map((gate) => `forced-serial:${gate}`),
        ];
    if (!configurationParity) {
      failedQualityGates.push('configuration_parity');
      candidateQuality.gates.configuration_parity = false;
    } else {
      candidateQuality.gates.configuration_parity = true;
    }
    const qualityPassed = failedQualityGates.length === 0;
    const comparableTokens = Number.isFinite(baseline.total_tokens) && Number.isFinite(candidate.total_tokens);
    const comparableLatency = Number.isFinite(baseline.latency_ms) && Number.isFinite(candidate.latency_ms);
    const metricDeltas = installedMetricDeltas(baseline.metrics, candidate.metrics);
    const metricPercentDeltas = installedMetricPercentDeltas(baseline.metrics, candidate.metrics);
    let resourceFavorable = false;
    let resourceAssessment = 'not-applicable';
    let withinVersionSerialFavorable = null;

    if (comparisonMode === 'cross-version') {
      const tokenDelta = metricPercentDeltas.total_tokens;
      const latencyDelta = metricPercentDeltas.latency_ms;
      const comparable = Number.isFinite(tokenDelta) && Number.isFinite(latencyDelta);
      const qualityNonRegressed = candidate.quality_pass_rate >= baseline.quality_pass_rate;
      const qualitySamplesAvailable = candidate.quality_pass_rate > 0 && baseline.quality_pass_rate > 0;
      const improved = comparable && (tokenDelta < 0 || latencyDelta < 0);
      const withinTolerance = comparable && tokenDelta <= 10 && latencyDelta <= 10;
      const concurrencyValid = candidate.case_kind !== 'independent'
        || (candidate.worker_activity.all_overlapped
          && candidate.worker_activity.bounded
          && candidate.worker_activity.isolated);
      resourceAssessment = comparable ? 'available' : 'unavailable';
      resourceFavorable = configurationParity && qualityNonRegressed && qualitySamplesAvailable
        && improved && withinTolerance && concurrencyValid;
      if (candidate.case_kind === 'independent') {
        const serialComparable = Number.isFinite(candidate.latency_ms) && Number.isFinite(forcedSerial?.latency_ms);
        withinVersionSerialFavorable = serialComparable
          && forcedSerialQuality?.failed.length === 0
          && candidate.worker_activity.all_overlapped
          && candidate.latency_ms < forcedSerial.latency_ms;
      }
    } else if (candidate.case_kind === 'direct') {
      resourceAssessment = comparableTokens && comparableLatency ? 'available' : 'unavailable';
      resourceFavorable = qualityPassed
        && comparableTokens
        && comparableLatency
        && percentDelta(baseline.total_tokens, candidate.total_tokens) <= 10
        && percentDelta(baseline.latency_ms, candidate.latency_ms) <= 10;
    } else if (candidate.case_kind === 'independent') {
      const serialComparable = Number.isFinite(candidate.latency_ms) && Number.isFinite(forcedSerial?.latency_ms);
      resourceAssessment = serialComparable ? 'available' : 'unavailable';
      resourceFavorable = qualityPassed
        && candidate.worker_activity.all_overlapped
        && serialComparable
        && candidate.latency_ms < forcedSerial.latency_ms;
    } else if (candidate.case_kind === 'strongly-coupled') {
      resourceAssessment = 'selection';
      resourceFavorable = qualityPassed
        && candidate.execution_selection === 'serial'
        && candidate.worker_activity.peak_workers <= 1;
    }

    const verdict = comparisonMode === 'cross-version'
      ? crossVersionVerdict({ baseline, candidate, configurationParity, resourceFavorable, metricPercentDeltas })
      : null;
    cases.push({
      case_id: caseId,
      case_kind: candidate.case_kind,
      baseline_variant: baselineVariant,
      candidate_variant: candidateVariant,
      configuration_parity: configurationParity,
      baseline_success_rate: baseline.success_rate,
      candidate_success_rate: candidate.success_rate,
      baseline_quality_pass_rate: baseline.quality_pass_rate,
      candidate_quality_pass_rate: candidate.quality_pass_rate,
      quality_gates: candidateQuality.gates,
      quality_passed: qualityPassed,
      failed_quality_gates: failedQualityGates,
      changed_paths: candidate.changed_paths,
      workflow_artifacts: candidate.workflow_artifacts,
      worker_activity: candidate.worker_activity,
      metrics: {
        baseline: baseline.metrics,
        candidate: candidate.metrics,
        forced_serial: forcedSerial?.metrics ?? null,
      },
      metric_deltas: metricDeltas,
      metric_percent_deltas: metricPercentDeltas,
      pairs: pairedInstalledProductRuns(rawByCase.get(caseId) ?? [], baselineVariant, candidateVariant),
      total_tokens_delta: comparableTokens ? candidate.total_tokens - baseline.total_tokens : null,
      total_tokens_percent_delta: percentDelta(baseline.total_tokens, candidate.total_tokens),
      latency_ms_delta: comparableLatency ? candidate.latency_ms - baseline.latency_ms : null,
      latency_percent_delta: percentDelta(baseline.latency_ms, candidate.latency_ms),
      forced_serial_latency_ms: forcedSerial?.latency_ms ?? null,
      resource_assessment: resourceAssessment,
      resource_favorable: resourceFavorable,
      within_version_serial_favorable: withinVersionSerialFavorable,
      verdict,
    });
  }

  const criteriaCases = cases.filter((item) => ['direct', 'independent', 'strongly-coupled'].includes(item.case_kind));
  const allQualityPassed = cases.length > 0 && cases.every((item) => item.quality_passed);
  const criteriaPassed = comparisonMode === 'cross-version'
    ? cases.length > 0 && cases.every((item) => item.configuration_parity
      && crossVersionVerdictMetadata[item.verdict]?.comparable === true
      && item.candidate_quality_pass_rate >= item.baseline_quality_pass_rate)
    : allQualityPassed
      && (criteriaCases.length === 0 || criteriaCases.every((item) => item.resource_favorable));
  const baselineRuns = runs.filter((run) => run.variant === baselineVariant);
  const candidateRuns = runs.filter((run) => run.variant === candidateVariant);
  const suiteSummary = comparisonMode === 'cross-version' ? crossVersionSuiteSummary(cases) : {};
  return {
    baseline_variant: baselineVariant,
    candidate_variant: candidateVariant,
    forced_serial_variant: forcedSerialVariant,
    comparison_mode: comparisonMode,
    runs: aggregates,
    cases,
    overall: {
      compared_cases: cases.length,
      quality_passed_cases: cases.filter((item) => item.quality_passed).length,
      favorable_cases: cases.filter((item) => comparisonMode === 'cross-version'
        ? crossVersionVerdictMetadata[item.verdict]?.favorable === true
        : item.resource_favorable).length,
      configuration_parity_cases: cases.filter((item) => item.configuration_parity).length,
      required_favorable_cases: criteriaCases.length,
      baseline_success_rate: rate(baselineRuns, (run) => run.outcome === 'passed'),
      candidate_success_rate: rate(candidateRuns, (run) => run.outcome === 'passed'),
      baseline_quality_pass_rate: rate(baselineRuns, (run) => installedProductQuality(run).failed.length === 0),
      candidate_quality_pass_rate: rate(candidateRuns, (run) => installedProductQuality(run).failed.length === 0),
      criteria_passed: criteriaPassed,
      ...suiteSummary,
    },
  };
}

function markdownCell(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('<br>') : 'none';
  }
  return String(value ?? 'n/a').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function formatDistribution(distribution) {
  if (!distribution || distribution.available_count === 0) return 'n/a';
  return `${formatDelta(distribution.p50)} / ${formatDelta(distribution.p95)} (${distribution.available_count}/${distribution.sample_count})`;
}

function renderVersionProvenance(lines, provenance) {
  if (!provenance?.versions) return;
  lines.push(
    '## Experiment Matrix',
    '',
    `- Model: ${markdownCell(provenance.configuration?.model)}`,
    `- Effort: ${markdownCell(provenance.configuration?.effort)}`,
    `- Replicates: ${markdownCell(provenance.experiment?.replicates)}`,
    `- Order: ${markdownCell(provenance.experiment?.order)}`,
    `- Cases: ${markdownCell(provenance.experiment?.case_ids)}`,
    '',
    '| Role | Requested ref | Commit | Package version | Package SHA-256 |',
    '|---|---|---|---|---|',
  );
  for (const role of ['baseline', 'candidate']) {
    const version = provenance.versions[role];
    lines.push(`| ${role} | ${markdownCell(version?.requested_ref)} | ${markdownCell(version?.commit)} | ${markdownCell(version?.package_version)} | ${markdownCell(version?.package_sha256)} |`);
  }
  lines.push('');
}

export function renderInstalledProductMarkdown(comparison, options = {}) {
  const lines = [
    options.title ?? '# Installed Product Baseline Evaluation',
    '',
    `- Baseline: \`${comparison.baseline_variant}\``,
    `- Candidate: \`${comparison.candidate_variant}\``,
    `- Compared cases: ${comparison.overall.compared_cases}`,
    `- Quality passed: ${comparison.overall.quality_passed_cases}`,
    `- Baseline success rate: ${formatPercent(comparison.overall.baseline_success_rate === null ? null : comparison.overall.baseline_success_rate * 100)}`,
    `- Candidate success rate: ${formatPercent(comparison.overall.candidate_success_rate === null ? null : comparison.overall.candidate_success_rate * 100)}`,
    `- Baseline quality pass rate: ${formatPercent(comparison.overall.baseline_quality_pass_rate === null ? null : comparison.overall.baseline_quality_pass_rate * 100)}`,
    `- Candidate quality pass rate: ${formatPercent(comparison.overall.candidate_quality_pass_rate === null ? null : comparison.overall.candidate_quality_pass_rate * 100)}`,
    `- Favorable after quality gates: ${comparison.overall.favorable_cases}`,
    `- Diagnostic criteria: ${comparison.overall.criteria_passed ? 'pass' : 'fail'}`,
    '',
  ];
  renderVersionProvenance(lines, options.provenance);
  if (options.crossVersion) {
    lines.push(
      '## Suite Verdict Summary',
      '',
      `- Suite verdict: ${markdownCell(comparison.overall.suite_verdict)}`,
      `- Quality regressions: ${markdownCell(comparison.overall.quality_regression_cases)}`,
      `- Quality improvements: ${markdownCell(comparison.overall.quality_improvement_cases)}`,
      `- Resource improvements: ${markdownCell(comparison.overall.resource_improvement_cases)}`,
      `- Mixed cases: ${markdownCell(comparison.overall.mixed_cases)}`,
      `- Inconclusive cases: ${markdownCell(comparison.overall.inconclusive_cases)}`,
      '',
    );
  }
  lines.push(
    '## Case Comparisons',
    '',
    '| Case | Kind | Configuration parity | A quality | B quality | Quality gates | Tokens delta | Latency delta | Resource favorable | Verdict |',
    '|---|---|---|---:|---:|---|---:|---:|---|---|',
  );
  for (const item of comparison.cases) {
    lines.push(`| ${markdownCell(item.case_id)} | ${markdownCell(item.case_kind)} | ${item.configuration_parity ? 'pass' : 'fail'} | ${formatPercent(item.baseline_quality_pass_rate * 100)} | ${formatPercent(item.candidate_quality_pass_rate * 100)} | ${item.quality_passed ? 'pass' : `fail: ${markdownCell(item.failed_quality_gates)}`} | ${formatDelta(item.total_tokens_delta)} (${formatPercent(item.total_tokens_percent_delta)}) | ${formatDelta(item.latency_ms_delta, ' ms')} (${formatPercent(item.latency_percent_delta)}) | ${item.resource_favorable ? 'yes' : 'no'} | ${markdownCell(item.verdict)} |`);
  }
  lines.push(
    '',
    '## Metric Distributions',
    '',
    '| Case | Metric | Baseline p50 / p95 | Candidate p50 / p95 | Candidate p50 delta |',
    '|---|---|---:|---:|---:|',
  );
  for (const item of comparison.cases) {
    for (const metric of installedMetrics) {
      lines.push(`| ${markdownCell(item.case_id)} | ${metric.label} | ${formatDistribution(item.metrics?.baseline?.[metric.field])} | ${formatDistribution(item.metrics?.candidate?.[metric.field])} | ${formatDelta(item.metric_deltas?.[metric.field])} (${formatPercent(item.metric_percent_deltas?.[metric.field] ?? null)}) |`);
    }
  }
  lines.push(
    '',
    '## Paired Samples',
    '',
    `| Case | Replicate | Quality | ${installedMetrics.map((metric) => `${metric.label} delta`).join(' | ')} |`,
    `|---|---:|---|${installedMetrics.map(() => '---:').join('|')}|`,
  );
  for (const item of comparison.cases) {
    for (const pair of item.pairs ?? []) {
      const deltas = installedMetrics.map((metric) => formatDelta(
        pair.metric_deltas[metric.field],
        metric.field === 'latency_ms' ? ' ms' : '',
      ));
      lines.push(`| ${markdownCell(item.case_id)} | ${pair.replicate} | ${pair.quality_passed ? 'pass' : 'fail'} | ${deltas.join(' | ')} |`);
    }
  }
  lines.push(
    '',
    '## Run Evidence',
    '',
    '| Case / variant | Outcome | Verification | Safety | Cleanup | Changed paths | Workflow artifacts | Workers | Tokens | Latency | Spec | Memory |',
    '|---|---|---|---|---|---|---|---|---:|---:|---|---|',
  );
  for (const run of comparison.runs) {
    const workers = `peak ${run.worker_activity.peak_workers}; overlap ${formatDelta(run.worker_activity.overlap_ms, ' ms')}; order ${markdownCell(run.worker_activity.integration_order)}`;
    lines.push(`| ${markdownCell(`${run.case_id} / ${run.variant}`)} | ${run.outcome} | ${run.verification.passed ? 'pass' : 'fail'} | ${run.safety.passed ? 'pass' : 'fail'} | ${run.cleanup?.passed === false ? 'fail' : 'pass'} | ${markdownCell(run.changed_paths)} | ${markdownCell(run.workflow_artifacts)} | ${workers} | ${formatDelta(run.total_tokens)} | ${formatDelta(run.latency_ms, ' ms')} | ${run.spec.passed ? 'pass' : 'fail'} | ${run.memory.passed ? 'pass' : 'fail'} |`);
  }
  if (options.crossVersion) {
    const failedRuns = comparison.runs.filter((run) => (
      run.outcome !== 'passed' || run.quality_passed === false || run.cleanup?.passed === false
    ));
    const inconclusiveCases = comparison.cases.filter((item) => item.verdict === 'inconclusive');
    lines.push('', '## Failures And Inconclusive Evidence', '');
    if (failedRuns.length === 0 && inconclusiveCases.length === 0) {
      lines.push('None.', '');
    } else {
      lines.push('| Scope | Status | Evidence |', '|---|---|---|');
      for (const run of failedRuns) {
        lines.push(`| ${markdownCell(`${run.case_id} / ${run.variant}`)} | failed quality | ${markdownCell(run.failed_quality_gates)} |`);
      }
      for (const item of inconclusiveCases) {
        lines.push(`| ${markdownCell(item.case_id)} | inconclusive | resource ${markdownCell(item.resource_assessment)}; gates ${markdownCell(item.failed_quality_gates)} |`);
      }
      lines.push('');
    }
  }
  lines.push(
    '',
    '## Interpretation',
    '',
    '- Evaluate outcome, verification, safety, spec consistency, and memory precision quality gates before resource comparisons.',
    '- Missing live token or latency metrics are unavailable evidence, never zero-cost improvement.',
    '- Independent work is favorable only with measured worker overlap and a lower median latency than the installed forced-serial variant.',
    '- Live results are maintainer diagnostics, not an automated release or completion gate.',
    '',
  );
  return lines.join('\n');
}

export function renderCrossVersionProductMarkdown(report) {
  return renderInstalledProductMarkdown(report.comparison, {
    title: '# Cross-Version Product Benchmark',
    provenance: report.provenance,
    crossVersion: true,
  });
}

const threeWayPairLabels = Object.freeze({
  control_to_baseline: 'A no-loopx -> B baseline',
  control_to_candidate: 'A no-loopx -> C candidate',
  baseline_to_candidate: 'B baseline -> C candidate',
});

function demonstratedProductAdvantages(item) {
  if (item.candidate_quality_pass_rate < item.baseline_quality_pass_rate) {
    return 'not demonstrated: quality regressed';
  }
  const advantages = [];
  if (item.candidate_quality_pass_rate > item.baseline_quality_pass_rate) {
    advantages.push('higher quality pass rate');
  }
  if (Number.isFinite(item.total_tokens_percent_delta) && item.total_tokens_percent_delta < 0) {
    advantages.push('fewer total tokens');
  }
  if (Number.isFinite(item.latency_percent_delta) && item.latency_percent_delta < 0) {
    advantages.push('lower latency');
  }
  return advantages.length > 0 ? advantages.join('; ') : 'not demonstrated';
}

export function renderThreeWayProductMarkdown(report) {
  const armDefinitions = [
    { label: 'A no-loopx', variant: 'no-loopx' },
    { label: 'B baseline', variant: 'version-a' },
    { label: 'C candidate', variant: 'version-b' },
  ];
  const lines = [
    '# Three-Way Product Benchmark',
    '',
    '- A: `no-loopx`',
    '- B: `version-a` (baseline ref)',
    '- C: `version-b` (candidate ref)',
    '',
  ];
  renderVersionProvenance(lines, report.provenance);
  lines.push(
    '## Arm Summary',
    '',
    '| Arm | Samples | Success rate | Quality pass rate |',
    '|---|---:|---:|---:|',
  );
  for (const arm of armDefinitions) {
    const runs = report.runs.filter((run) => run.variant === arm.variant);
    const successes = runs.filter((run) => run.outcome === 'passed').length;
    const qualityPasses = runs.filter((run) => installedProductQuality(run).failed.length === 0).length;
    lines.push(`| ${arm.label} | ${runs.length} | ${formatPercent(runs.length > 0 ? successes / runs.length * 100 : null)} | ${formatPercent(runs.length > 0 ? qualityPasses / runs.length * 100 : null)} |`);
  }
  lines.push(
    '',
    '## Product Benefit Summary',
    '',
    '| Pair | Case | Quality pass delta | Token delta | Latency delta | Demonstrated advantage |',
    '|---|---|---:|---:|---:|---|',
  );
  for (const [name, comparison] of Object.entries(report.comparisons)) {
    for (const item of comparison.cases) {
      const qualityDelta = (item.candidate_quality_pass_rate - item.baseline_quality_pass_rate) * 100;
      lines.push(`| ${threeWayPairLabels[name]} | ${markdownCell(item.case_id)} | ${formatDelta(Number(qualityDelta.toFixed(1)), ' pp')} | ${formatPercent(item.total_tokens_percent_delta)} | ${formatPercent(item.latency_percent_delta)} | ${demonstratedProductAdvantages(item)} |`);
    }
  }
  lines.push('');
  lines.push(
    '## Pairwise Summary',
    '',
    '| Pair | Case | Baseline quality | Candidate quality | Total tokens delta | Latency delta | Verdict |',
    '|---|---|---:|---:|---:|---:|---|',
  );
  for (const [name, comparison] of Object.entries(report.comparisons)) {
    for (const item of comparison.cases) {
      lines.push(`| ${threeWayPairLabels[name]} | ${markdownCell(item.case_id)} | ${formatPercent(item.baseline_quality_pass_rate * 100)} | ${formatPercent(item.candidate_quality_pass_rate * 100)} | ${formatDelta(item.total_tokens_delta)} (${formatPercent(item.total_tokens_percent_delta)}) | ${formatDelta(item.latency_ms_delta, ' ms')} (${formatPercent(item.latency_percent_delta)}) | ${markdownCell(item.verdict)} |`);
    }
  }
  lines.push(
    '',
    '## Metric Distributions',
    '',
    '| Pair | Case | Metric | Baseline p50 / p95 | Candidate p50 / p95 | Candidate p50 delta |',
    '|---|---|---|---:|---:|---:|',
  );
  for (const [name, comparison] of Object.entries(report.comparisons)) {
    for (const item of comparison.cases) {
      for (const metric of installedMetrics) {
        lines.push(`| ${threeWayPairLabels[name]} | ${markdownCell(item.case_id)} | ${metric.label} | ${formatDistribution(item.metrics?.baseline?.[metric.field])} | ${formatDistribution(item.metrics?.candidate?.[metric.field])} | ${formatDelta(item.metric_deltas?.[metric.field])} (${formatPercent(item.metric_percent_deltas?.[metric.field] ?? null)}) |`);
      }
    }
  }
  lines.push(
    '',
    '## Run Evidence',
    '',
    '| Case / variant / replicate | Outcome | Quality | Failed gates | Tokens | Latency | Cleanup |',
    '|---|---|---|---|---:|---:|---|',
  );
  for (const run of report.runs) {
    const quality = installedProductQuality(run);
    const cleanupPassed = quality.gates.cleanup;
    lines.push(`| ${markdownCell(`${run.case_id} / ${run.variant} / ${run.replicate}`)} | ${run.outcome} | ${quality.failed.length === 0 ? 'pass' : 'fail'} | ${markdownCell(quality.failed)} | ${formatDelta(run.total_tokens)} | ${formatDelta(run.latency_ms, ' ms')} | ${cleanupPassed ? 'pass' : 'fail'} |`);
  }
  lines.push(
    '',
    '## Interpretation',
    '',
    '- Read A to B and A to C as product uplift over the no-loopx control; read B to C as version-to-version change.',
    '- Quality pass rate is evaluated before token and latency deltas, and unavailable metrics remain unavailable.',
    '- This live benchmark is diagnostic evidence, not an automatic release gate.',
    '',
  );
  return lines.join('\n');
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
    `- Unknown correctness: ${comparison.overall.unknown_correctness_cases ?? 'n/a'}`,
    `- Controller integration passed: ${comparison.overall.controller_integration_passed_cases}/${comparison.overall.controller_integration_evaluated_cases}`,
    '',
    '| Case | Quality | Correctness | Integration | Finding recall | Severity fidelity | Agent delta | Nested agent delta | Token delta | Latency delta | Improved |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---|',
  ];

  for (const item of comparison.cases) {
    lines.push(`| ${item.case_id} | ${item.candidate_quality_passed ? 'pass' : item.candidate_correctness === 'unknown' ? 'unknown' : 'fail'} | ${item.candidate_correctness ?? 'unknown'} | ${item.candidate_integration_passed === null || item.candidate_integration_passed === undefined ? 'n/a' : item.candidate_integration_passed ? 'pass' : 'fail'} | ${formatPercent(item.finding_recall === null ? null : item.finding_recall * 100)} | ${formatPercent(item.severity_fidelity === null ? null : item.severity_fidelity * 100)} | ${item.agent_count_delta} | ${item.nested_agent_count_delta} | ${formatDelta(item.total_tokens_delta)} (${formatPercent(item.total_tokens_percent_delta)}) | ${formatDelta(item.latency_ms_delta, ' ms')} (${formatPercent(item.latency_percent_delta)}) | ${item.improved ? 'yes' : 'no'} |`);
  }

  lines.push(
    '',
    '## Interpretation',
    '',
    '- Lower agent, tool, token, or latency counts are improvements only when candidate quality and hard invariants pass.',
    '- Unknown correctness means the run finished without machine-checkable correctness evidence; it is never a pass and never an improvement.',
    '- Any nested agent created by a non-controller actor fails the hard topology invariant.',
    '- A structured reviewer run fails quality when the controller loses status, task quality, task anchor, blocking severity, cannot-verify context, or invents a blocking finding.',
    '- Investigate per-case traces before changing another prompt group.',
    '',
  );
  return lines.join('\n');
}
