import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateReviewPrompt } from '../skills/parallel-subagent-exec/scripts/review-prompt.mjs';
import { runParallelExecCommand } from '../skills/parallel-subagent-exec/scripts/parallel-exec.mjs';

test('accepts the canonical task reviewer prompt schema example', async () => {
  const prompt = await readFile(new URL('../skills/subagent-exec/task-reviewer-prompt.md', import.meta.url), 'utf8');
  assert.deepEqual(validateReviewPrompt(prompt), { ok: true });
});

test('rejects a reviewer prompt that omits the exact finding field contract', () => {
  const prompt = [
    'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.',
    '```loopx-review-result',
    '{',
    '  "schema": "loopx.review-result.v1",',
    '  "status": "ISSUES_FOUND",',
    '  "task_quality": "Needs fixes",',
    '  "task_anchor": "T-001",',
    '  "cannot_verify": [],',
    '  "findings": []',
    '}',
    '```',
  ].join('\n');
  assert.throws(() => validateReviewPrompt(prompt), (error) => error.code === 'parallel_review_prompt_schema_invalid');
});

test('parallel exec CLI verifies a reviewer prompt before dispatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loopx-review-prompt-'));
  const input = join(root, 'prompt.md');
  await writeFile(input, await readFile(new URL('../skills/subagent-exec/task-reviewer-prompt.md', import.meta.url)));

  const result = await runParallelExecCommand({
    argv: ['review', 'prompt-verify', '--input', input],
    cwd: root,
    stdout: { write() {} },
    stderr: { write() {} },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.result.result.ok, true);
});
