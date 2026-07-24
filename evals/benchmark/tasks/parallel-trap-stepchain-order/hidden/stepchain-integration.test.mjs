// Integration tests for the ordered step registry. Both features write to
// src/steps/index.mjs, and the array position decides what each step
// observes: validate appended after normalize can no longer see the
// submitted quantities (normalize clamps them to 1), and dedupe running
// before validate lets an invalid record shadow its valid twin. A lost
// update on the barrel or a naive append-at-the-end fails here even though
// each step looks correct in isolation.
import assert from 'node:assert/strict';
import test from 'node:test';

import { runPipeline } from '../src/pipeline.mjs';

test('validation, dedupe, and normalization compose over the same intake batch', () => {
  const result = runPipeline([
    { sku: ' a1 ', qty: '-2' },
    { sku: 'a1', qty: '2', unit: 'box' },
    { sku: 'b2', qty: 0 },
    { sku: 'c3', qty: '3' },
    { sku: 'c3', qty: 5 },
    { sku: 'd4 ', qty: 1 },
    { sku: 'd4', qty: 2 },
  ]);
  assert.deepEqual(result.records, [
    { sku: 'a1', qty: 2, unit: 'box' },
    { sku: 'c3', qty: 3, unit: 'each' },
    { sku: 'd4', qty: 1, unit: 'each' },
  ], 'valid records survive: invalid twins must not shadow them, duplicates collapse on trimmed sku, quantities stay as submitted');
  assert.equal(result.rejected.length, 2, 'exactly the two invalid records are rejected');
  assert.deepEqual(
    new Set(result.rejected.map((record) => String(record.qty))),
    new Set(['-2', '0']),
    'rejected records keep their submitted quantities (normalize must not rewrite them first)',
  );
  assert.deepEqual(
    new Set(result.rejected.map((record) => record.sku.trim())),
    new Set(['a1', 'b2']),
  );
});

test('clean input still flows through unchanged', () => {
  const result = runPipeline([
    { sku: ' e5 ', qty: '4', unit: ' bag ' },
    { sku: 'f6', qty: 2 },
  ]);
  assert.deepEqual(result.records, [
    { sku: 'e5', qty: 4, unit: 'bag' },
    { sku: 'f6', qty: 2, unit: 'each' },
  ]);
  assert.deepEqual(result.rejected, []);
});
