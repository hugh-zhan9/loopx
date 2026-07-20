import { parseReviewResult, validateReviewResult } from './review-result.mjs';

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

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
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
      && cannotVerifyRecall === 1,
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
  const outcomePassed = end.outcome === 'passed' && end.tests_passed !== false && integrationPassed !== false;

  return {
    run_id: start.run_id ?? null,
    case_id: start.case_id ?? null,
    variant: start.variant ?? null,
    outcome: end.outcome ?? 'unknown',
    tests_passed: end.tests_passed ?? null,
    quality_passed: outcomePassed && hardInvariantsPassed,
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

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
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
      tests_passed: runs.every((run) => run.tests_passed !== false),
      quality_passed: runs.every((run) => run.quality_passed === true),
      hard_invariants_passed: runs.every((run) => run.hard_invariants_passed === true),
      integration_passed: runs.every((run) => run.integration_passed !== false),
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
    cases.push({
      case_id: caseId,
      baseline_variant: baselineVariant,
      candidate_variant: candidateVariant,
      baseline_quality_passed: baseline.quality_passed,
      candidate_quality_passed: candidateQualityPassed,
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
      controller_integration_evaluated_cases: cases.filter((item) => item.candidate_integration_passed !== null && item.candidate_integration_passed !== undefined).length,
      controller_integration_passed_cases: cases.filter((item) => item.candidate_integration_passed === true).length,
    },
  };
}

function installedProductQuality(run) {
  const gates = {
    outcome: run.outcome === 'passed',
    verification: run.verification?.passed === true,
    safety: run.safety?.passed === true,
    spec_consistency: run.spec?.passed === true,
    memory_precision: run.memory?.passed === true,
  };
  return {
    gates,
    failed: Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name),
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function aggregateInstalledProductRuns(runs) {
  const first = runs[0];
  const qualities = runs.map(installedProductQuality);
  return {
    case_id: first.case_id,
    case_kind: first.case_kind,
    variant: first.variant,
    configuration: first.configuration,
    configuration_consistent: runs.every((run) => stableJson(run.configuration) === stableJson(first.configuration)),
    replicate_count: runs.length,
    outcome: runs.every((run) => run.outcome === 'passed') ? 'passed' : 'failed',
    verification: { passed: runs.every((run) => run.verification?.passed === true) },
    safety: { passed: runs.every((run) => run.safety?.passed === true) },
    spec: { passed: runs.every((run) => run.spec?.passed === true) },
    memory: { passed: runs.every((run) => run.memory?.passed === true) },
    quality_passed: qualities.every((quality) => quality.failed.length === 0),
    failed_quality_gates: [...new Set(qualities.flatMap((quality) => quality.failed))],
    changed_paths: [...new Set(runs.flatMap((run) => run.changed_paths ?? []))].sort(),
    workflow_artifacts: [...new Set(runs.flatMap((run) => run.workflow_artifacts ?? []))].sort(),
    total_tokens: median(runs.map((run) => run.total_tokens)),
    latency_ms: median(runs.map((run) => run.latency_ms)),
    execution_mode: runs.every((run) => run.execution_mode === first.execution_mode) ? first.execution_mode : 'mixed',
    worker_activity: {
      peak_workers: Math.max(...runs.map((run) => run.worker_activity?.peak_workers ?? 0)),
      overlap_ms: median(runs.map((run) => run.worker_activity?.overlap_ms)),
      all_overlapped: runs.every((run) => (run.worker_activity?.overlap_ms ?? 0) > 0),
      integration_order: first.worker_activity?.integration_order ?? [],
    },
  };
}

export function compareInstalledProductRuns(runs, options = {}) {
  const baselineVariant = options.baselineVariant ?? 'bare';
  const candidateVariant = options.candidateVariant ?? 'installed';
  const forcedSerialVariant = options.forcedSerialVariant ?? 'forced-serial';
  const aggregates = [...Map.groupBy(runs, (run) => `${run.case_id}\u0000${run.variant}`).values()]
    .map(aggregateInstalledProductRuns);
  const byCase = Map.groupBy(aggregates, (run) => run.case_id);
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
      && stableJson(baseline.configuration) === stableJson(candidate.configuration);
    const baselineQuality = installedProductQuality(baseline);
    const candidateQuality = installedProductQuality(candidate);
    const forcedSerialQuality = forcedSerial ? installedProductQuality(forcedSerial) : null;
    const failedQualityGates = [
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
    let resourceFavorable = false;
    let resourceAssessment = 'not-applicable';

    if (candidate.case_kind === 'direct') {
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
        && candidate.execution_mode === 'serial'
        && candidate.worker_activity.peak_workers <= 1;
    }

    cases.push({
      case_id: caseId,
      case_kind: candidate.case_kind,
      baseline_variant: baselineVariant,
      candidate_variant: candidateVariant,
      configuration_parity: configurationParity,
      quality_gates: candidateQuality.gates,
      quality_passed: qualityPassed,
      failed_quality_gates: failedQualityGates,
      changed_paths: candidate.changed_paths,
      workflow_artifacts: candidate.workflow_artifacts,
      worker_activity: candidate.worker_activity,
      total_tokens_delta: comparableTokens ? candidate.total_tokens - baseline.total_tokens : null,
      total_tokens_percent_delta: percentDelta(baseline.total_tokens, candidate.total_tokens),
      latency_ms_delta: comparableLatency ? candidate.latency_ms - baseline.latency_ms : null,
      latency_percent_delta: percentDelta(baseline.latency_ms, candidate.latency_ms),
      forced_serial_latency_ms: forcedSerial?.latency_ms ?? null,
      resource_assessment: resourceAssessment,
      resource_favorable: resourceFavorable,
    });
  }

  return {
    baseline_variant: baselineVariant,
    candidate_variant: candidateVariant,
    forced_serial_variant: forcedSerialVariant,
    runs: aggregates,
    cases,
    overall: {
      compared_cases: cases.length,
      quality_passed_cases: cases.filter((item) => item.quality_passed).length,
      favorable_cases: cases.filter((item) => item.resource_favorable).length,
      configuration_parity_cases: cases.filter((item) => item.configuration_parity).length,
    },
  };
}

function markdownCell(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('<br>') : 'none';
  }
  return String(value ?? 'n/a').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

export function renderInstalledProductMarkdown(comparison) {
  const lines = [
    '# Installed Product Baseline Evaluation',
    '',
    `- Bare baseline: \`${comparison.baseline_variant}\``,
    `- Installed candidate: \`${comparison.candidate_variant}\``,
    `- Compared cases: ${comparison.overall.compared_cases}`,
    `- Quality passed: ${comparison.overall.quality_passed_cases}`,
    `- Favorable after quality gates: ${comparison.overall.favorable_cases}`,
    '',
    '## Case Comparisons',
    '',
    '| Case | Kind | Configuration parity | Quality | Tokens delta | Latency delta | Resource favorable |',
    '|---|---|---|---|---:|---:|---|',
  ];
  for (const item of comparison.cases) {
    lines.push(`| ${markdownCell(item.case_id)} | ${markdownCell(item.case_kind)} | ${item.configuration_parity ? 'pass' : 'fail'} | ${item.quality_passed ? 'pass' : `fail: ${markdownCell(item.failed_quality_gates)}`} | ${formatDelta(item.total_tokens_delta)} (${formatPercent(item.total_tokens_percent_delta)}) | ${formatDelta(item.latency_ms_delta, ' ms')} (${formatPercent(item.latency_percent_delta)}) | ${item.resource_favorable ? 'yes' : 'no'} |`);
  }
  lines.push(
    '',
    '## Run Evidence',
    '',
    '| Case / variant | Outcome | Verification | Safety | Changed paths | Workflow artifacts | Workers | Tokens | Latency | Spec | Memory |',
    '|---|---|---|---|---|---|---|---:|---:|---|---|',
  );
  for (const run of comparison.runs) {
    const workers = `peak ${run.worker_activity.peak_workers}; overlap ${formatDelta(run.worker_activity.overlap_ms, ' ms')}; order ${markdownCell(run.worker_activity.integration_order)}`;
    lines.push(`| ${markdownCell(`${run.case_id} / ${run.variant}`)} | ${run.outcome} | ${run.verification.passed ? 'pass' : 'fail'} | ${run.safety.passed ? 'pass' : 'fail'} | ${markdownCell(run.changed_paths)} | ${markdownCell(run.workflow_artifacts)} | ${workers} | ${formatDelta(run.total_tokens)} | ${formatDelta(run.latency_ms, ' ms')} | ${run.spec.passed ? 'pass' : 'fail'} | ${run.memory.passed ? 'pass' : 'fail'} |`);
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
    `- Controller integration passed: ${comparison.overall.controller_integration_passed_cases}/${comparison.overall.controller_integration_evaluated_cases}`,
    '',
    '| Case | Quality | Integration | Finding recall | Severity fidelity | Agent delta | Nested agent delta | Token delta | Latency delta | Improved |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---|',
  ];

  for (const item of comparison.cases) {
    lines.push(`| ${item.case_id} | ${item.candidate_quality_passed ? 'pass' : 'fail'} | ${item.candidate_integration_passed === null || item.candidate_integration_passed === undefined ? 'n/a' : item.candidate_integration_passed ? 'pass' : 'fail'} | ${formatPercent(item.finding_recall === null ? null : item.finding_recall * 100)} | ${formatPercent(item.severity_fidelity === null ? null : item.severity_fidelity * 100)} | ${item.agent_count_delta} | ${item.nested_agent_count_delta} | ${formatDelta(item.total_tokens_delta)} (${formatPercent(item.total_tokens_percent_delta)}) | ${formatDelta(item.latency_ms_delta, ' ms')} (${formatPercent(item.latency_percent_delta)}) | ${item.improved ? 'yes' : 'no'} |`);
  }

  lines.push(
    '',
    '## Interpretation',
    '',
    '- Lower agent, tool, token, or latency counts are improvements only when candidate quality and hard invariants pass.',
    '- Any nested agent created by a non-controller actor fails the hard topology invariant.',
    '- A structured reviewer run fails quality when the controller loses status, task quality, task anchor, blocking severity, cannot-verify context, or invents a blocking finding.',
    '- Investigate per-case traces before changing another prompt group.',
    '',
  );
  return lines.join('\n');
}
