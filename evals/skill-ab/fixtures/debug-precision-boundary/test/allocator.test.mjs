import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateDiscountCents, formatCents } from '../src/allocator.mjs';

test('allocates an evenly divisible discount', () => {
  const result = allocateDiscountCents(
    [{ sku: 'A', amountCents: 500 }, { sku: 'B', amountCents: 500 }],
    200,
  );
  assert.deepEqual(result, [
    { sku: 'A', discountCents: 100, netCents: 400 },
    { sku: 'B', discountCents: 100, netCents: 400 },
  ]);
});

test('formats cents cleanly', () => {
  assert.equal(formatCents(1250), '$12.50');
});
