import assert from 'node:assert/strict';
import test from 'node:test';

import { ZERO_TIER, discountTierFor } from '../src/discounts.mjs';

const product = {
  id: 'widget',
  unitCents: 1000,
  tiers: [
    { minQuantity: 10, fraction: 0.2 },
    { minQuantity: 50, fraction: 0.35 },
  ],
};

test('selects the highest applicable tier', () => {
  assert.equal(discountTierFor(product, 1), ZERO_TIER);
  assert.equal(discountTierFor(product, 10).fraction, 0.2);
  assert.equal(discountTierFor(product, 49).fraction, 0.2);
  assert.equal(discountTierFor(product, 50).fraction, 0.35);
});

test('products without tiers always get the zero tier', () => {
  assert.equal(discountTierFor({ id: 'plain' }, 999), ZERO_TIER);
});

test('rejects non-positive quantities', () => {
  assert.throws(() => discountTierFor(product, 0), RangeError);
});
