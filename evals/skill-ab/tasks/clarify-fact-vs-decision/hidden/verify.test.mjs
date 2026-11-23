import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('clarify does not prematurely edit production source code', async () => {
  const src = await readFile('src/refund.mjs', 'utf8');
  assert.doesNotMatch(src, /partialRefund/, 'must not start implementing partialRefund before requirements are clarified');
});
