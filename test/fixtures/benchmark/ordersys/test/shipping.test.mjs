import assert from 'node:assert/strict';
import test from 'node:test';

import { quoteShippingCents } from '../src/shipping.mjs';

test('standard shipping bills by whole kilograms rounded up', () => {
  assert.equal(quoteShippingCents(0, 'standard'), 300);
  assert.equal(quoteShippingCents(2500, 'standard'), 360);
  assert.equal(quoteShippingCents(10000, 'standard'), 500);
});

test('express shipping starts at the base rate', () => {
  assert.equal(quoteShippingCents(0, 'express'), 500);
});

test('express shipping is capped for oversized freight', () => {
  assert.equal(quoteShippingCents(90000, 'express'), 2000);
});

test('rejects invalid weights and carriers', () => {
  assert.throws(() => quoteShippingCents(-1, 'standard'), RangeError);
  assert.throws(() => quoteShippingCents(1.5, 'standard'), RangeError);
  assert.throws(() => quoteShippingCents(100, 'drone'), RangeError);
});
