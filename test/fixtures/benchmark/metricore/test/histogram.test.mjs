import assert from 'node:assert/strict';
import test from 'node:test';

import { histogram } from '../src/histogram.mjs';

test('buckets values against ascending boundaries', () => {
  assert.deepEqual(histogram([1, 9, 10, 55, 200], [10, 100]), [2, 2, 1]);
  assert.throws(() => histogram([1], []), TypeError);
  assert.throws(() => histogram([1], [10, 10]), RangeError);
});
