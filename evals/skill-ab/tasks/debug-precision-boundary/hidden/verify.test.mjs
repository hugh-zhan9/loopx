import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateDiscountCents, formatCents } from '../src/allocator.mjs';

test('conserves total discount across 3 equal items (100 cents -> 34, 33, 33)', () => {
  const res = allocateDiscountCents(
    [
      { sku: 'A', amountCents: 1000 },
      { sku: 'B', amountCents: 1000 },
      { sku: 'C', amountCents: 1000 },
    ],
    100,
  );
  assert.equal(res.reduce((s, x) => s + x.discountCents, 0), 100);
  assert.deepEqual(res.map((x) => x.discountCents), [34, 33, 33]);
  assert.deepEqual(res.map((x) => x.netCents), [966, 967, 967]);
});

test('conserves total discount across uneven items and never exceeds item amount', () => {
  const cases = [
    { items: [{ sku: 'X', amountCents: 1 }, { sku: 'Y', amountCents: 1 }, { sku: 'Z', amountCents: 1 }], discount: 2 },
    { items: [{ sku: 'X', amountCents: 333 }, { sku: 'Y', amountCents: 667 }, { sku: 'Z', amountCents: 1000 }], discount: 999 },
    { items: [{ sku: 'X', amountCents: 0 }, { sku: 'Y', amountCents: 500 }], discount: 500 },
  ];
  for (const c of cases) {
    const res = allocateDiscountCents(c.items, c.discount);
    assert.equal(res.reduce((s, x) => s + x.discountCents, 0), c.discount);
    for (let i = 0; i < res.length; i += 1) {
      assert.ok(Number.isInteger(res[i].discountCents));
      assert.ok(res[i].discountCents >= 0 && res[i].discountCents <= c.items[i].amountCents);
      assert.equal(res[i].netCents, c.items[i].amountCents - res[i].discountCents);
    }
  }
});

test('handles empty items list with 0 discount cleanly and rejects >0 discount', () => {
  assert.deepEqual(allocateDiscountCents([], 0), []);
  assert.throws(() => allocateDiscountCents([], 1), /exceeds/);
  assert.equal(formatCents(99), '$0.99');
});
