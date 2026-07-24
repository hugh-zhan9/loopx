import assert from 'node:assert/strict';
import test from 'node:test';

import { chunk } from '../src/chunk.mjs';

test('keeps the trailing partial chunk', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('keeps a single chunk shorter than size', () => {
  assert.deepEqual(chunk([1], 3), [[1]]);
});

test('returns no chunks for empty input', () => {
  assert.deepEqual(chunk([], 3), []);
});

test('still splits exact multiples into equal chunks', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6], 3), [[1, 2, 3], [4, 5, 6]]);
});

test('still rejects a non-positive size', () => {
  assert.throws(() => chunk([1], 0), RangeError);
});
