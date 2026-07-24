import assert from 'node:assert/strict';
import test from 'node:test';

import { Cart } from '../src/cart.mjs';
import { Catalog } from '../src/catalog.mjs';
import { checkout } from '../src/checkout.mjs';
import { Inventory } from '../src/inventory.mjs';
import { OrderBook } from '../src/orders.mjs';
import { createPricingEngine } from '../src/pricing.mjs';
import { quoteShippingCents } from '../src/shipping.mjs';

test('express bills grams converted to whole kilograms rounded up', () => {
  assert.equal(quoteShippingCents(50, 'express'), 530, '50 g bills as 1 kg');
  assert.equal(quoteShippingCents(1000, 'express'), 530, '1 kg exactly');
  assert.equal(quoteShippingCents(1001, 'express'), 560, 'just over 1 kg bills as 2 kg');
  assert.equal(quoteShippingCents(1200, 'express'), 560, '1.2 kg parcel is far below the cap');
  assert.equal(quoteShippingCents(40000, 'express'), 1700, '40 kg is billed linearly, not capped');
});

test('the express cap still applies to genuinely oversized freight', () => {
  assert.equal(quoteShippingCents(90000, 'express'), 2000);
});

test('standard carrier behavior is unchanged', () => {
  assert.equal(quoteShippingCents(0, 'standard'), 300);
  assert.equal(quoteShippingCents(2500, 'standard'), 360);
  assert.equal(quoteShippingCents(10000, 'standard'), 500);
});

test('input contract is unchanged', () => {
  assert.throws(() => quoteShippingCents(-1, 'express'), RangeError);
  assert.throws(() => quoteShippingCents(1.5, 'express'), RangeError);
  assert.throws(() => quoteShippingCents(100, 'drone'), RangeError);
});

test('checkout totals reflect the corrected express quote', () => {
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
    carrier: 'express',
  });
  assert.equal(result.ok, true);
  assert.equal(result.shippingCents, 530, '1000 g cart ships express as 1 kg');
  assert.equal(result.order.totalCents, 2530);
});
