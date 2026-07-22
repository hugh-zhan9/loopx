import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const RESULT_FIELDS = [
  'cannot_verify',
  'code_quality',
  'findings',
  'schema',
  'spec_compliance',
  'task_id',
];
const FINDING_FIELDS = ['anchor_ids', 'axis', 'id', 'severity', 'summary'];
const AXES = ['spec_compliance', 'code_quality'];
const AXIS_VERDICTS = ['APPROVED', 'ISSUES_FOUND', 'NEEDS_CONTEXT'];
const SEVERITIES = ['Critical', 'Important', 'Minor'];
const INPUT_HASH_FIELDS = [
  'brief_sha256',
  'diff_package_sha256',
  'report_sha256',
  'verification_sha256',
];
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertExactFields(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    fail(code);
  }
}

function assertUniqueStrings(values, code) {
  if (!Array.isArray(values)
      || values.some((value) => typeof value !== 'string' || value.trim() === '')
      || new Set(values).size !== values.length) {
    fail(code);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function contentHash(value, field) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    fail(`review_input_${field}_required`);
  }
  return sha256(value);
}

function inputHashes(inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) fail('review_inputs_required');
  return {
    brief_sha256: contentHash(inputs.brief, 'brief'),
    report_sha256: contentHash(inputs.report, 'report'),
    diff_package_sha256: contentHash(inputs.diffPackage, 'diff_package'),
    verification_sha256: contentHash(inputs.verification, 'verification'),
  };
}

function validateReviewer(reviewer) {
  assertExactFields(reviewer, ['id', 'model', 'platform'], 'review_reviewer_fields_invalid');
  for (const field of ['id', 'model', 'platform']) {
    if (typeof reviewer[field] !== 'string' || reviewer[field].trim() === '') {
      fail(`review_reviewer_${field}_invalid`);
    }
  }
  return reviewer;
}

export function validateTaskReviewResult(result) {
  assertExactFields(result, RESULT_FIELDS, 'review_result_fields_invalid');
  if (result.schema !== 'loopx.task-review-result.v1') fail('review_result_schema_unsupported');
  if (typeof result.task_id !== 'string' || result.task_id.trim() === '') fail('review_result_task_id_invalid');
  for (const axis of AXES) {
    if (!AXIS_VERDICTS.includes(result[axis])) fail(`review_result_${axis}_invalid`);
  }
  assertUniqueStrings(result.cannot_verify, 'review_result_cannot_verify_invalid');
  if (!Array.isArray(result.findings)) fail('review_result_findings_required');
  result.findings.forEach((finding, index) => {
    assertExactFields(finding, FINDING_FIELDS, 'review_result_finding_fields_invalid');
    if (finding.id !== `F-${String(index + 1).padStart(3, '0')}`) fail('review_result_finding_id_invalid');
    if (!AXES.includes(finding.axis)) fail('review_result_finding_axis_invalid');
    if (!SEVERITIES.includes(finding.severity)) fail('review_result_finding_severity_invalid');
    assertUniqueStrings(finding.anchor_ids, 'review_result_finding_anchor_ids_invalid');
    if (typeof finding.summary !== 'string' || finding.summary.trim() === '') {
      fail('review_result_finding_summary_invalid');
    }
  });
  for (const axis of AXES) {
    const findings = result.findings.filter((finding) => finding.axis === axis);
    if (result[axis] === 'APPROVED' && findings.length !== 0) fail(`review_result_${axis}_combination_invalid`);
    if (result[axis] === 'ISSUES_FOUND' && findings.length === 0) fail(`review_result_${axis}_combination_invalid`);
  }
  const needsContext = AXES.some((axis) => result[axis] === 'NEEDS_CONTEXT');
  if (needsContext !== (result.cannot_verify.length > 0)) fail('review_result_context_combination_invalid');
  return structuredClone(result);
}

export function parseTaskReviewResult(message) {
  const matches = [...String(message ?? '').matchAll(/```loopx-review-result\s*\n([\s\S]*?)\n```/gi)];
  if (matches.length !== 1) fail(matches.length === 0
    ? 'review_result_block_missing'
    : 'review_result_block_count_invalid');
  let result;
  try {
    result = JSON.parse(matches[0][1]);
  } catch {
    fail('review_result_json_invalid');
  }
  return validateTaskReviewResult(result);
}

export function createTaskReviewArtifact({
  result,
  rawMessage,
  taskId,
  reviewer,
  attempt,
  inputs,
  generatedAt = new Date().toISOString(),
}) {
  const reviewResult = validateTaskReviewResult(result);
  if (reviewResult.task_id !== taskId) fail('review_result_task_id_mismatch');
  validateReviewer(reviewer);
  if (!Number.isInteger(attempt) || attempt < 1) fail('review_attempt_invalid');
  if (typeof rawMessage !== 'string' || rawMessage.trim() === '') fail('review_raw_message_required');
  if (Number.isNaN(Date.parse(generatedAt))) fail('review_generated_at_invalid');
  return {
    schema: 'loopx.task-review-artifact.v1',
    review_result: reviewResult,
    provenance: {
      task_id: taskId,
      reviewer: structuredClone(reviewer),
      attempt,
      generated_at: generatedAt,
      raw_message_sha256: sha256(rawMessage),
      inputs: inputHashes(inputs),
    },
  };
}

export async function captureTaskReviewArtifact({
  cwd,
  runId,
  taskId,
  reviewer,
  attempt,
  inputs,
  rawMessage,
  generatedAt,
}) {
  if (!RUN_ID_PATTERN.test(runId)) fail('review_run_id_invalid');
  if (!TASK_ID_PATTERN.test(taskId)) fail('review_task_id_invalid');
  const result = parseTaskReviewResult(rawMessage);
  const artifact = createTaskReviewArtifact({
    result,
    rawMessage,
    taskId,
    reviewer,
    attempt,
    inputs,
    generatedAt,
  });
  const path = join(
    resolve(cwd),
    '.loopx',
    'exec',
    runId,
    'tasks',
    taskId,
    'reviews',
    `attempt-${attempt}`,
    'review-artifact.json',
  );
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
  return { path, artifact };
}

export function verifyTaskReviewArtifact({ artifact, taskId, reviewer, attempt, inputs }) {
  assertExactFields(artifact, ['provenance', 'review_result', 'schema'], 'review_artifact_fields_invalid');
  if (artifact.schema !== 'loopx.task-review-artifact.v1') fail('review_artifact_schema_unsupported');
  validateTaskReviewResult(artifact.review_result);
  assertExactFields(
    artifact.provenance,
    ['attempt', 'generated_at', 'inputs', 'raw_message_sha256', 'reviewer', 'task_id'],
    'review_artifact_provenance_fields_invalid',
  );
  if (artifact.review_result.task_id !== taskId || artifact.provenance.task_id !== taskId) {
    fail('review_artifact_task_id_mismatch');
  }
  validateReviewer(reviewer);
  validateReviewer(artifact.provenance.reviewer);
  for (const field of ['id', 'model', 'platform']) {
    if (artifact.provenance.reviewer[field] !== reviewer[field]) fail('review_artifact_reviewer_mismatch');
  }
  if (artifact.provenance.attempt !== attempt) fail('review_artifact_attempt_mismatch');
  if (!Number.isInteger(artifact.provenance.attempt) || artifact.provenance.attempt < 1) {
    fail('review_artifact_attempt_invalid');
  }
  if (Number.isNaN(Date.parse(artifact.provenance.generated_at))) fail('review_artifact_generated_at_invalid');
  if (!/^[a-f0-9]{64}$/.test(artifact.provenance.raw_message_sha256)) {
    fail('review_artifact_raw_message_sha256_invalid');
  }
  const expectedHashes = inputHashes(inputs);
  assertExactFields(
    artifact.provenance.inputs,
    INPUT_HASH_FIELDS,
    'review_artifact_input_fields_invalid',
  );
  for (const [field, expected] of Object.entries(expectedHashes)) {
    if (artifact.provenance.inputs[field] !== expected) fail(`review_artifact_${field}_mismatch`);
  }
  return structuredClone(artifact);
}

export function evaluateTaskReviewGate({ artifact, expected, previousReview = null }) {
  const verified = verifyTaskReviewArtifact({ artifact, ...expected });
  if (previousReview) {
    if (!previousReview.expected) fail('review_previous_expected_required');
    const previousArtifact = verifyTaskReviewArtifact({
      artifact: previousReview.artifact,
      ...previousReview.expected,
    });
    const previousBlocking = previousArtifact.review_result.findings
      .some((finding) => ['Critical', 'Important'].includes(finding.severity));
    if (!previousBlocking) fail('review_previous_result_not_needs_fix');
    if (verified.provenance.attempt !== previousArtifact.provenance.attempt + 1) {
      fail('review_rereview_attempt_invalid');
    }
    if (verified.provenance.reviewer.id === previousArtifact.provenance.reviewer.id) {
      fail('review_reviewer_not_fresh');
    }
    if (verified.provenance.inputs.verification_sha256
        === previousArtifact.provenance.inputs.verification_sha256) {
      fail('review_fix_verification_not_fresh');
    }
  }
  const result = verified.review_result;
  const blocking = result.findings.filter((finding) => ['Critical', 'Important'].includes(finding.severity));
  const needsContext = AXES.some((axis) => result[axis] === 'NEEDS_CONTEXT');
  return {
    status: needsContext ? 'needs_context' : blocking.length > 0 ? 'needs_fix' : 'reviewed',
    task_id: result.task_id,
    attempt: verified.provenance.attempt,
    spec_compliance: result.spec_compliance,
    code_quality: result.code_quality,
    blocking_finding_ids: blocking.map((finding) => finding.id),
    minor_finding_ids: result.findings
      .filter((finding) => finding.severity === 'Minor')
      .map((finding) => finding.id),
  };
}

export function decideReviewerReplacement({
  failure,
  attemptsUsed,
  reviewerActive,
  originalReviewTerminal,
  candidateHashes,
  originalCandidateHashes,
}) {
  if (!['invalid_artifact', 'transport_failure'].includes(failure)) {
    return { action: 'block', reason: 'review_failure_not_replaceable' };
  }
  if (reviewerActive) return { action: 'block', reason: 'reviewer_still_active' };
  if (!originalReviewTerminal) return { action: 'block', reason: 'original_review_not_terminal' };
  if (!Number.isInteger(attemptsUsed) || attemptsUsed < 1) fail('review_replacement_attempts_invalid');
  if (attemptsUsed >= 2) return { action: 'block', reason: 'review_replacement_exhausted' };
  if (!candidateHashes || !originalCandidateHashes
      || typeof candidateHashes !== 'object' || typeof originalCandidateHashes !== 'object'
      || Array.isArray(candidateHashes) || Array.isArray(originalCandidateHashes)) {
    fail('review_candidate_hashes_required');
  }
  assertExactFields(candidateHashes, INPUT_HASH_FIELDS, 'review_candidate_hash_fields_invalid');
  assertExactFields(originalCandidateHashes, INPUT_HASH_FIELDS, 'review_candidate_hash_fields_invalid');
  for (const field of INPUT_HASH_FIELDS) {
    if (typeof candidateHashes[field] !== 'string' || candidateHashes[field] === ''
        || typeof originalCandidateHashes[field] !== 'string' || originalCandidateHashes[field] === '') {
      fail('review_candidate_hash_invalid');
    }
  }
  const current = Object.entries(candidateHashes).sort(([left], [right]) => left.localeCompare(right));
  const original = Object.entries(originalCandidateHashes).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(current) !== JSON.stringify(original)) {
    return { action: 'block', reason: 'review_candidate_changed' };
  }
  return {
    action: 'replace_reviewer',
    next_attempt: attemptsUsed + 1,
    reason: 'bounded_review_replacement',
  };
}
