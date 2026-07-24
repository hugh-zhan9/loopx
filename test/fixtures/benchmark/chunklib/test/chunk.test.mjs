import assert from 'node:assert/strict';
import test from 'node:test';

import { chunk } from '../src/chunk.mjs';

test('splits an exact multiple into equal chunks', () => {
  assert.deepEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
});

test('rejects a non-positive size', () => {
  assert.throws(() => chunk([1], 0), RangeError);
});
