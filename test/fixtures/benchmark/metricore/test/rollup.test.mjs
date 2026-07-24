import assert from 'node:assert/strict';
import test from 'node:test';

import { createRollup } from '../src/rollup.mjs';

test('aggregates samples per metric', () => {
  const rollup = createRollup();
  rollup.add('web.latency', 120);
  rollup.add('web.latency', 80);
  const { summary, errors } = rollup.flush();
  assert.deepEqual(summary['web.latency'], { count: 2, total: 200, mean: 100, min: 80, max: 120 });
  assert.deepEqual(errors, []);
});

test('rejects invalid samples', () => {
  const rollup = createRollup();
  assert.throws(() => rollup.add('', 1), TypeError);
  assert.throws(() => rollup.add('m', NaN), RangeError);
});
