import assert from 'node:assert/strict';
import test from 'node:test';

import { mean, median } from '../src/stats.mjs';

test('mean and median over samples', () => {
  assert.equal(mean([80, 120]), 100);
  assert.equal(mean([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});
