import assert from 'node:assert/strict';
import test from 'node:test';

import { Inventory } from '../src/inventory.mjs';
import { OrderBook } from '../src/orders.mjs';
import { PaymentLedger } from '../src/payments.mjs';

function world() {
  const orders = new OrderBook();
  const inventory = new Inventory();
  const payments = new PaymentLedger();
  inventory.setStock('widget', 5);
  const { reserved } = inventory.reserve([{ productId: 'widget', quantity: 2 }]);
  orders.create({ id: 'o1', reserved, totalCents: 2000 });
  return { orders, inventory, payments };
}

test('cancelling a paid order refunds AND returns the reservation to stock', () => {
  const { orders, inventory, payments } = world();
  orders.pay('o1', payments);
  assert.equal(inventory.available('widget'), 3);
  orders.cancel('o1', { inventory, payments });
  assert.equal(orders.get('o1').status, 'cancelled');
  assert.ok(payments.refunded('o1'), 'paid cancellation refunds');
  assert.equal(inventory.available('widget'), 5, 'paid cancellation restocks');
});

test('cancelling an unpaid order restocks and never touches payments', () => {
  const { orders, inventory, payments } = world();
  orders.cancel('o1', { inventory, payments });
  assert.equal(inventory.available('widget'), 5);
  assert.equal(payments.charged('o1'), false, 'no refund/charge for an unpaid order');
});

test('invalid transitions keep throwing', () => {
  const { orders, inventory, payments } = world();
  orders.pay('o1', payments);
  orders.cancel('o1', { inventory, payments });
  assert.throws(() => orders.cancel('o1', { inventory, payments }), /invalid transition/);
  assert.throws(() => orders.pay('o1', payments), /invalid transition/);
  assert.equal(inventory.available('widget'), 5, 'failed transitions do not double-release');
});

test('shipped orders cannot be cancelled', () => {
  const { orders, inventory, payments } = world();
  orders.pay('o1', payments);
  orders.ship('o1');
  assert.throws(() => orders.cancel('o1', { inventory, payments }), /invalid transition/);
  assert.equal(inventory.available('widget'), 3, 'stock stays reserved for shipped orders');
});
