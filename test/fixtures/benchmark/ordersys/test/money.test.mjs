import assert from 'node:assert/strict';
import test from 'node:test';

import { addCents, applyDiscount, multiplyCents } from '../src/money.mjs';

test('adds and multiplies integer cents', () => {
  assert.equal(addCents(150, 250), 400);
  assert.equal(multiplyCents(199, 3), 597);
});

test('applies discount fractions with rounding', () => {
  assert.equal(applyDiscount(1000, 0.2), 800);
  assert.equal(applyDiscount(999, 0.5), 500);
  assert.equal(applyDiscount(1000, 0), 1000);
});

test('rejects invalid amounts and fractions', () => {
  assert.throws(() => addCents(1.5, 1), RangeError);
  assert.throws(() => multiplyCents(100, 0), RangeError);
  assert.throws(() => applyDiscount(100, 1.5), RangeError);
});
