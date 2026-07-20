const TOP_LEVEL_FIELDS = ['cannot_verify', 'findings', 'schema', 'status', 'task_anchor', 'task_quality'];
const FINDING_FIELDS = ['anchor_ids', 'id', 'severity', 'summary'];

function assertExactFields(value, expected, error) {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(error);
  }
}

function assertUniqueStrings(values, error) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.trim() === '')) {
    throw new Error(error);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(error);
  }
}

export function validateReviewResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('review_result_object_required');
  }
  if (result.schema !== 'loopx.review-result.v1') {
    throw new Error('review_result_schema_unsupported');
  }
  assertExactFields(result, TOP_LEVEL_FIELDS, 'review_result_fields_invalid');
  if (!['SPEC_COMPLIANT', 'ISSUES_FOUND', 'NEEDS_CONTEXT'].includes(result.status)) {
    throw new Error('review_result_status_invalid');
  }
  if (!['Approved', 'Needs fixes'].includes(result.task_quality)) {
    throw new Error('review_result_task_quality_invalid');
  }
  if (result.task_anchor !== null && (typeof result.task_anchor !== 'string' || result.task_anchor.trim() === '')) {
    throw new Error('review_result_task_anchor_invalid');
  }
  assertUniqueStrings(result.cannot_verify, 'review_result_cannot_verify_invalid');
  if (!Array.isArray(result.findings)) {
    throw new Error('review_result_findings_required');
  }
  result.findings.forEach((finding, index) => {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
      throw new Error('review_result_finding_shape_invalid');
    }
    assertExactFields(finding, FINDING_FIELDS, 'review_result_finding_fields_invalid');
    if (finding.id !== `F-${String(index + 1).padStart(3, '0')}`) {
      throw new Error('review_result_finding_id_invalid');
    }
    if (!['Critical', 'Important', 'Minor'].includes(finding.severity)) {
      throw new Error('review_result_finding_severity_invalid');
    }
    assertUniqueStrings(finding.anchor_ids, 'review_result_finding_anchors_invalid');
    if (typeof finding.summary !== 'string' || finding.summary.trim() === '') {
      throw new Error('review_result_finding_summary_invalid');
    }
  });

  if (result.status === 'SPEC_COMPLIANT'
      && (result.task_quality !== 'Approved' || result.findings.length !== 0 || result.cannot_verify.length !== 0)) {
    throw new Error('review_result_spec_compliant_combination_invalid');
  }
  if (result.status === 'ISSUES_FOUND'
      && (result.task_quality !== 'Needs fixes' || result.findings.length === 0)) {
    throw new Error('review_result_issues_found_combination_invalid');
  }
  if (result.status === 'NEEDS_CONTEXT'
      && (result.task_quality !== 'Needs fixes' || result.cannot_verify.length === 0)) {
    throw new Error('review_result_needs_context_combination_invalid');
  }
  return result;
}

export function parseReviewResult(message) {
  const matches = [...String(message ?? '').matchAll(/```loopx-review-result\s*\n([\s\S]*?)\n```/gi)];
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error('review_result_block_count_invalid');
  let result;
  try {
    result = JSON.parse(matches[0][1]);
  } catch {
    throw new Error('review_result_json_invalid');
  }
  return validateReviewResult(result);
}
