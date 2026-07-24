import assert from 'node:assert/strict';
import test from 'node:test';

import { normalize } from '../src/steps/normalize.mjs';
import { runPipeline } from '../src/pipeline.mjs';

test('trims and normalizes incoming records', () => {
  const result = runPipeline([
    { sku: ' a1 ', qty: '3', unit: ' box ' },
    { sku: 'b2', qty: 2 },
  ]);
  assert.deepEqual(result.records, [
    { sku: 'a1', qty: 3, unit: 'box' },
    { sku: 'b2', qty: 2, unit: 'each' },
  ]);
  assert.deepEqual(result.rejected, []);
});

test('normalize step keeps the legacy defaults: bad quantities become 1, missing units become each', () => {
  const state = normalize.run({
    records: [
      { sku: 'c3', qty: '-2' },
      { sku: 'd4', qty: 'abc', unit: 'kg' },
    ],
    rejected: [],
  });
  assert.deepEqual(state.records, [
    { sku: 'c3', qty: 1, unit: 'each' },
    { sku: 'd4', qty: 1, unit: 'kg' },
  ]);
});
