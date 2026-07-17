#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TOP_LEVEL_FIELDS = ['cannot_verify', 'findings', 'schema', 'status', 'task_anchor', 'task_quality'];
const FINDING_FIELDS = ['anchor_ids', 'id', 'severity', 'summary'];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function exactFields(value, expected, code, label) {
  const actual = Object.keys(value || {}).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((field, index) => field !== sorted[index])) {
    fail(code, `${label} must use the exact machine-readable field contract`);
  }
}

export function validateReviewPrompt(prompt) {
  const text = String(prompt || '');
  if (!text.includes('You are a leaf worker. Do not spawn, delegate to, or wait for other agents.')) {
    fail('parallel_review_prompt_leaf_clause_missing', 'review prompt is missing the exact leaf-worker clause');
  }
  const lines = text.split(/\r?\n/);
  const starts = lines.flatMap((line, index) => line.trim() === '```loopx-review-result' ? [index] : []);
  if (starts.length !== 1) {
    fail('parallel_review_prompt_schema_invalid', 'review prompt must contain exactly one machine-readable review-result example');
  }
  const end = lines.findIndex((line, index) => index > starts[0] && line.trim() === '```');
  if (end < 0) fail('parallel_review_prompt_schema_invalid', 'review prompt machine-readable example is not closed');
  let example;
  try {
    example = JSON.parse(lines.slice(starts[0] + 1, end).join('\n'));
  } catch {
    fail('parallel_review_prompt_schema_invalid', 'review prompt machine-readable example is not valid JSON');
  }
  exactFields(example, TOP_LEVEL_FIELDS, 'parallel_review_prompt_schema_invalid', 'review result');
  if (example.schema !== 'loopx.review-result.v1') {
    fail('parallel_review_prompt_schema_invalid', 'review prompt must name loopx.review-result.v1');
  }
  if (!Array.isArray(example.findings) || example.findings.length === 0) {
    fail('parallel_review_prompt_schema_invalid', 'review prompt must show one exact finding object');
  }
  exactFields(example.findings[0], FINDING_FIELDS, 'parallel_review_prompt_schema_invalid', 'finding');
  for (const field of FINDING_FIELDS) {
    if (example.findings[0][field] === undefined || example.findings[0][field] === null) {
      fail('parallel_review_prompt_schema_invalid', `finding example is missing ${field}`);
    }
  }
  return { ok: true };
}

async function main() {
  const inputIndex = process.argv.indexOf('--input');
  const input = inputIndex >= 0 ? process.argv[inputIndex + 1] : null;
  if (!input) fail('parallel_review_prompt_usage', 'missing --input <prompt-path>');
  const result = validateReviewPrompt(await readFile(input, 'utf8'));
  process.stdout.write(`${JSON.stringify({ ...result, input })}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || 'parallel_review_prompt_invalid', message: error.message })}\n`);
    process.exitCode = 2;
  });
}
