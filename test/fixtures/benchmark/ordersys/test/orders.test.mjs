import assert from 'node:assert/strict';
import test from 'node:test';

import { Inventory } from '../src/inventory.mjs';
import { OrderBook } from '../src/orders.mjs';
import { PaymentLedger } from '../src/payments.mjs';

function reservedOrder(orders, inventory, id) {
  inventory.setStock('widget', 5);
  const { reserved } = inventory.reserve([{ productId: 'widget', quantity: 2 }]);
  return orders.create({ id, reserved, totalCents: 2000 });
}

test('walks the happy path to delivered', () => {
  const orders = new OrderBook();
  const inventory = new Inventory();
  const payments = new PaymentLedger();
  reservedOrder(orders, inventory, 'o1');
  orders.pay('o1', payments);
  orders.ship('o1');
  orders.deliver('o1');
  assert.equal(orders.get('o1').status, 'delivered');
  assert.ok(payments.charged('o1'));
});

test('cancelling an unpaid order returns its reservation to stock', () => {
  const orders = new OrderBook();
  const inventory = new Inventory();
  const payments = new PaymentLedger();
  reservedOrder(orders, inventory, 'o1');
  assert.equal(inventory.available('widget'), 3);
  orders.cancel('o1', { inventory, payments });
  assert.equal(orders.get('o1').status, 'cancelled');
  assert.equal(inventory.available('widget'), 5);
});

test('cancelling a paid order refunds the payment', () => {
  const orders = new OrderBook();
  const inventory = new Inventory();
  const payments = new PaymentLedger();
  reservedOrder(orders, inventory, 'o1');
  orders.pay('o1', payments);
  orders.cancel('o1', { inventory, payments });
  assert.equal(orders.get('o1').status, 'cancelled');
  assert.ok(payments.refunded('o1'));
});

test('rejects invalid transitions', () => {
  const orders = new OrderBook();
  const inventory = new Inventory();
  const payments = new PaymentLedger();
  reservedOrder(orders, inventory, 'o1');
  assert.throws(() => orders.ship('o1'), /invalid transition/);
  orders.pay('o1', payments);
  orders.ship('o1');
  assert.throws(() => orders.cancel('o1', { inventory, payments }), /invalid transition/);
});

test('rejects duplicate and unknown order ids', () => {
  const orders = new OrderBook();
  orders.create({ id: 'o1' });
  assert.throws(() => orders.create({ id: 'o1' }), /duplicate order id/);
  assert.throws(() => orders.get('nope'), RangeError);
});
