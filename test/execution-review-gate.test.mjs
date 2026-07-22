import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  captureTaskReviewArtifact,
  createTaskReviewArtifact,
  decideReviewerReplacement,
  evaluateTaskReviewGate,
  parseTaskReviewResult,
  verifyTaskReviewArtifact,
} from '../skills/exec/scripts/review-gate.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = new URL('..', import.meta.url).pathname;

function inputs(suffix = 'one') {
  return {
    brief: `brief-${suffix}`,
    report: `report-${suffix}`,
    diffPackage: `diff-${suffix}`,
    verification: `verification-${suffix}`,
  };
}

function reviewer(id = 'reviewer-1') {
  return { id, model: 'gpt-5.6-sol', platform: 'codex' };
}

function message(result) {
  return `Reviewer prose.\n\n\`\`\`loopx-review-result\n${JSON.stringify(result)}\n\`\`\``;
}

test('Critical or Important findings in either review axis require a fix', () => {
  const result = parseTaskReviewResult(message({
    schema: 'loopx.task-review-result.v1',
    task_id: 'T-002',
    spec_compliance: 'APPROVED',
    code_quality: 'ISSUES_FOUND',
    cannot_verify: [],
    findings: [{
      id: 'F-001',
      axis: 'code_quality',
      severity: 'Important',
      anchor_ids: [],
      summary: 'The result can accept stale evidence.',
    }],
  }));
  const artifact = createTaskReviewArtifact({
    result,
    rawMessage: message(result),
    taskId: 'T-002',
    reviewer: reviewer(),
    attempt: 1,
    inputs: inputs(),
    generatedAt: '2026-07-22T00:00:00.000Z',
  });

  const decision = evaluateTaskReviewGate({
    artifact,
    expected: { taskId: 'T-002', reviewer: reviewer(), attempt: 1, inputs: inputs() },
  });

  assert.equal(decision.status, 'needs_fix');
  assert.deepEqual(decision.blocking_finding_ids, ['F-001']);
});

test('persists a provenance-bound artifact and rejects stale task inputs', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'loopx-review-gate-'));
  const taskInputs = inputs();
  const result = {
    schema: 'loopx.task-review-result.v1',
    task_id: 'T-002',
    spec_compliance: 'APPROVED',
    code_quality: 'APPROVED',
    cannot_verify: [],
    findings: [],
  };
  const rawMessage = message(result);

  const captured = await captureTaskReviewArtifact({
    cwd,
    runId: 'review-run',
    taskId: 'T-002',
    reviewer: reviewer(),
    attempt: 1,
    inputs: taskInputs,
    rawMessage,
    generatedAt: '2026-07-22T00:00:00.000Z',
  });

  assert.equal(
    captured.path,
    join(cwd, '.loopx', 'exec', 'review-run', 'tasks', 'T-002', 'reviews', 'attempt-1', 'review-artifact.json'),
  );
  assert.deepEqual(JSON.parse(await readFile(captured.path, 'utf8')), captured.artifact);
  assert.equal(evaluateTaskReviewGate({
    artifact: captured.artifact,
    expected: { taskId: 'T-002', reviewer: reviewer(), attempt: 1, inputs: taskInputs },
  }).status, 'reviewed');

  assert.throws(() => verifyTaskReviewArtifact({
    artifact: captured.artifact,
    taskId: 'T-002',
    reviewer: reviewer(),
    attempt: 1,
    inputs: { ...taskInputs, report: 'changed-report' },
  }), /review_artifact_report_sha256_mismatch/);
});

test('fails closed on malformed combined verdicts', () => {
  const clean = {
    schema: 'loopx.task-review-result.v1',
    task_id: 'T-002',
    spec_compliance: 'APPROVED',
    code_quality: 'APPROVED',
    cannot_verify: [],
    findings: [],
  };
  assert.throws(
    () => parseTaskReviewResult(message({ ...clean, extra: true })),
    /review_result_fields_invalid/,
  );
  assert.throws(
    () => parseTaskReviewResult(message({ ...clean, code_quality: 'ISSUES_FOUND' })),
    /review_result_code_quality_combination_invalid/,
  );
  assert.throws(
    () => parseTaskReviewResult(`${message(clean)}\n${message(clean)}`),
    /review_result_block_count_invalid/,
  );
});

test('accepts a fix only after fresh verification and a fresh re-review', () => {
  const firstInputs = inputs('before-fix');
  const blockingResult = {
    schema: 'loopx.task-review-result.v1',
    task_id: 'T-002',
    spec_compliance: 'ISSUES_FOUND',
    code_quality: 'APPROVED',
    cannot_verify: [],
    findings: [{
      id: 'F-001',
      axis: 'spec_compliance',
      severity: 'Critical',
      anchor_ids: ['AC-001'],
      summary: 'The required failure path is missing.',
    }],
  };
  const firstArtifact = createTaskReviewArtifact({
    result: blockingResult,
    rawMessage: message(blockingResult),
    taskId: 'T-002',
    reviewer: reviewer('reviewer-1'),
    attempt: 1,
    inputs: firstInputs,
  });
  const previousReview = {
    artifact: firstArtifact,
    expected: {
      taskId: 'T-002',
      reviewer: reviewer('reviewer-1'),
      attempt: 1,
      inputs: firstInputs,
    },
  };
  const cleanResult = {
    schema: 'loopx.task-review-result.v1',
    task_id: 'T-002',
    spec_compliance: 'APPROVED',
    code_quality: 'APPROVED',
    cannot_verify: [],
    findings: [],
  };
  const fixedInputs = inputs('after-fix');
  const freshArtifact = createTaskReviewArtifact({
    result: cleanResult,
    rawMessage: message(cleanResult),
    taskId: 'T-002',
    reviewer: reviewer('reviewer-2'),
    attempt: 2,
    inputs: fixedInputs,
  });

  assert.equal(evaluateTaskReviewGate({
    artifact: freshArtifact,
    expected: {
      taskId: 'T-002',
      reviewer: reviewer('reviewer-2'),
      attempt: 2,
      inputs: fixedInputs,
    },
    previousReview,
  }).status, 'reviewed');

  const staleVerificationInputs = { ...fixedInputs, verification: firstInputs.verification };
  const staleVerificationArtifact = createTaskReviewArtifact({
    result: cleanResult,
    rawMessage: message(cleanResult),
    taskId: 'T-002',
    reviewer: reviewer('reviewer-2'),
    attempt: 2,
    inputs: staleVerificationInputs,
  });
  assert.throws(() => evaluateTaskReviewGate({
    artifact: staleVerificationArtifact,
    expected: {
      taskId: 'T-002', reviewer: reviewer('reviewer-2'), attempt: 2, inputs: staleVerificationInputs,
    },
    previousReview,
  }), /review_fix_verification_not_fresh/);
});

test('allows one replacement reviewer only for failed byte-identical review inputs', () => {
  const first = decideReviewerReplacement({
    failure: 'invalid_artifact',
    attemptsUsed: 1,
    reviewerActive: false,
    originalReviewTerminal: true,
    candidateHashes: {
      brief_sha256: 'a', report_sha256: 'b', diff_package_sha256: 'c', verification_sha256: 'd',
    },
    originalCandidateHashes: {
      brief_sha256: 'a', report_sha256: 'b', diff_package_sha256: 'c', verification_sha256: 'd',
    },
  });
  assert.deepEqual(first, { action: 'replace_reviewer', next_attempt: 2, reason: 'bounded_review_replacement' });

  assert.equal(decideReviewerReplacement({
    failure: 'transport_failure',
    attemptsUsed: 2,
    reviewerActive: false,
    originalReviewTerminal: true,
    candidateHashes: {
      brief_sha256: 'a', report_sha256: 'b', diff_package_sha256: 'c', verification_sha256: 'd',
    },
    originalCandidateHashes: {
      brief_sha256: 'a', report_sha256: 'b', diff_package_sha256: 'c', verification_sha256: 'd',
    },
  }).action, 'block');
  assert.equal(decideReviewerReplacement({
    failure: 'invalid_artifact',
    attemptsUsed: 1,
    reviewerActive: false,
    originalReviewTerminal: true,
    candidateHashes: {
      brief_sha256: 'changed', report_sha256: 'b', diff_package_sha256: 'c', verification_sha256: 'd',
    },
    originalCandidateHashes: {
      brief_sha256: 'a', report_sha256: 'b', diff_package_sha256: 'c', verification_sha256: 'd',
    },
  }).reason, 'review_candidate_changed');
});

test('captures and verifies file handoff evidence through executable helpers', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'loopx-review-cli-'));
  const paths = Object.fromEntries(
    ['brief', 'report', 'diff-package', 'verification', 'review-message']
      .map((name) => [name, join(cwd, `${name}.txt`)]),
  );
  const cleanResult = {
    schema: 'loopx.task-review-result.v1',
    task_id: 'T-002',
    spec_compliance: 'APPROVED',
    code_quality: 'APPROVED',
    cannot_verify: [],
    findings: [],
  };
  await Promise.all([
    writeFile(paths.brief, 'brief'),
    writeFile(paths.report, 'report'),
    writeFile(paths['diff-package'], 'diff'),
    writeFile(paths.verification, 'verification'),
    writeFile(paths['review-message'], message(cleanResult)),
  ]);
  const scripts = join(repoRoot, 'skills', 'subagent-exec', 'scripts');
  const commonArgs = [
    '--cwd', cwd, '--run-id', 'cli-run', '--task', 'T-002',
    '--reviewer-id', 'reviewer-1', '--model', 'gpt-5.6-sol', '--platform', 'codex', '--attempt', '1',
    '--brief', paths.brief, '--report', paths.report, '--diff-package', paths['diff-package'],
    '--verification', paths.verification,
  ];

  const captured = await execFileAsync(join(scripts, 'review-result'), [
    ...commonArgs, '--input', paths['review-message'],
  ]);
  const artifactPath = captured.stdout.trim();
  assert.equal(artifactPath, join(
    cwd, '.loopx', 'exec', 'cli-run', 'tasks', 'T-002', 'reviews', 'attempt-1', 'review-artifact.json',
  ));
  const verified = await execFileAsync(join(scripts, 'review-artifact-verify'), [
    '--artifact', artifactPath, ...commonArgs,
  ]);
  assert.equal(verified.stdout.trim(), artifactPath);

  await writeFile(paths.report, 'stale change');
  await assert.rejects(
    execFileAsync(join(scripts, 'review-artifact-verify'), ['--artifact', artifactPath, ...commonArgs]),
    /review_artifact_report_sha256_mismatch/,
  );
});
