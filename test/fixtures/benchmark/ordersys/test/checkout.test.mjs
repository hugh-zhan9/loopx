import assert from 'node:assert/strict';
import test from 'node:test';

import { Cart } from '../src/cart.mjs';
import { Catalog } from '../src/catalog.mjs';
import { checkout } from '../src/checkout.mjs';
import { Inventory } from '../src/inventory.mjs';
import { OrderBook } from '../src/orders.mjs';
import { createPricingEngine } from '../src/pricing.mjs';

function world() {
  const catalog = new Catalog();
  catalog.add({ id: 'widget', name: 'Widget', unitCents: 1000, weightGrams: 500 });
  const inventory = new Inventory();
  inventory.setStock('widget', 10);
  return {
    catalog,
    inventory,
    pricing: createPricingEngine(catalog),
    orders: new OrderBook(),
  };
}

test('prices the cart and records the order', () => {
  const { catalog, inventory, pricing, orders } = world();
  const cart = new Cart();
  cart.add('widget', 2);
  const result = checkout({ cart, catalog, pricing, inventory, orders, orderId: 'o1' });
  assert.equal(result.ok, true);
  assert.equal(result.subtotalCents, 2000);
  assert.equal(result.shippingCents, 320);
  assert.equal(result.order.totalCents, 2320);
  assert.equal(orders.get('o1').status, 'created');
});

test('aborts when stock is insufficient', () => {
  const { catalog, inventory, pricing, orders } = world();
  const cart = new Cart();
  cart.add('widget', 20);
  const result = checkout({ cart, catalog, pricing, inventory, orders, orderId: 'o1' });
  assert.deepEqual(result, { ok: false, reason: 'insufficient:widget' });
  assert.equal(inventory.available('widget'), 10);
  assert.throws(() => orders.get('o1'), RangeError);
});
