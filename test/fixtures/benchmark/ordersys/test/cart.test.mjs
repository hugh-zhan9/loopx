import assert from 'node:assert/strict';
import test from 'node:test';

import { Cart } from '../src/cart.mjs';
import { Catalog } from '../src/catalog.mjs';

test('merges repeated adds of the same product', () => {
  const cart = new Cart();
  cart.add('widget', 2).add('widget', 3).add('bolt', 1);
  assert.equal(cart.lineCount, 2);
  assert.deepEqual([...cart.lines()], [
    { productId: 'widget', quantity: 5 },
    { productId: 'bolt', quantity: 1 },
  ]);
});

test('computes the subtotal through a pricing engine', () => {
  const cart = new Cart();
  cart.add('widget', 2).add('bolt', 3);
  const flatPricing = { unitPriceCents: () => 100 };
  assert.equal(cart.subtotalCents(flatPricing), 500);
});

test('computes total weight from the catalog', () => {
  const catalog = new Catalog();
  catalog.add({ id: 'widget', unitCents: 1000, weightGrams: 500 });
  const cart = new Cart();
  cart.add('widget', 3);
  assert.equal(cart.totalWeightGrams(catalog), 1500);
});

test('rejects invalid lines', () => {
  const cart = new Cart();
  assert.throws(() => cart.add('', 1), TypeError);
  assert.throws(() => cart.add('widget', 0), RangeError);
});
