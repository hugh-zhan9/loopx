import assert from 'node:assert/strict';
import test from 'node:test';

import { Cart } from '../src/cart.mjs';
import { Catalog } from '../src/catalog.mjs';
import { checkout } from '../src/checkout.mjs';
import { Inventory } from '../src/inventory.mjs';
import { OrderBook } from '../src/orders.mjs';
import { createPricingEngine } from '../src/pricing.mjs';

test('checkout applies reservations supplied by the cart line generator', () => {
  const catalog = new Catalog();
  catalog.add({ id: 'widget', name: 'Widget', unitCents: 1000, weightGrams: 500 });
  const inventory = new Inventory();
  inventory.setStock('widget', 10);
  const cart = new Cart();
  cart.add('widget', 2);
  const result = checkout({
    cart,
    catalog,
    pricing: createPricingEngine(catalog),
    inventory,
    orders: new OrderBook(),
    orderId: 'o1',
  });
  assert.equal(result.ok, true);
  assert.equal(inventory.available('widget'), 8, 'stock decreases after checkout');
  assert.deepEqual(result.order.reserved, [{ productId: 'widget', quantity: 2 }]);
});

test('reserve consumes a one-shot generator correctly', () => {
  const inventory = new Inventory();
  inventory.setStock('a', 5);
  inventory.setStock('b', 5);
  function* lines() {
    yield { productId: 'a', quantity: 2 };
    yield { productId: 'b', quantity: 1 };
  }
  const result = inventory.reserve(lines());
  assert.equal(result.ok, true);
  assert.deepEqual(result.reserved, [
    { productId: 'a', quantity: 2 },
    { productId: 'b', quantity: 1 },
  ]);
  assert.equal(inventory.available('a'), 3);
  assert.equal(inventory.available('b'), 4);
});

test('a failed reservation from a one-shot generator leaves stock untouched', () => {
  const inventory = new Inventory();
  inventory.setStock('a', 5);
  inventory.setStock('b', 5);
  function* lines() {
    yield { productId: 'a', quantity: 2 };
    yield { productId: 'b', quantity: 99 };
  }
  const result = inventory.reserve(lines());
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient:b');
  assert.equal(inventory.available('a'), 5, 'no partial deduction');
  assert.equal(inventory.available('b'), 5);
});

test('array input keeps working end to end', () => {
  const inventory = new Inventory();
  inventory.setStock('a', 3);
  const result = inventory.reserve([{ productId: 'a', quantity: 3 }]);
  assert.equal(result.ok, true);
  assert.equal(inventory.available('a'), 0);
  inventory.release(result.reserved);
  assert.equal(inventory.available('a'), 3);
});
