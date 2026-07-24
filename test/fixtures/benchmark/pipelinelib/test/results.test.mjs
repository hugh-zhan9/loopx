import assert from 'node:assert/strict';
import test from 'node:test';

import { partitionSettled } from '../src/results.mjs';

test('partitions settled outcomes into values and errors', async () => {
  const settled = await Promise.allSettled([
    Promise.resolve(1),
    Promise.reject(new Error('nope')),
    Promise.resolve(3),
  ]);
  const { values, errors } = partitionSettled(settled);
  assert.deepEqual(values, [1, 3]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'nope');
});
