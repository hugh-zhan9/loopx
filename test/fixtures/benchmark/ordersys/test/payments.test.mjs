import assert from 'node:assert/strict';
import test from 'node:test';

import { PaymentLedger } from '../src/payments.mjs';

test('charges once per order and refunds once', () => {
  const payments = new PaymentLedger();
  payments.charge('o1', 1500);
  assert.ok(payments.charged('o1'));
  assert.ok(!payments.refunded('o1'));
  const refund = payments.refund('o1');
  assert.deepEqual(refund, { orderId: 'o1', amountCents: 1500 });
  assert.ok(payments.refunded('o1'));
});

test('rejects duplicate charges and refunds', () => {
  const payments = new PaymentLedger();
  payments.charge('o1', 100);
  assert.throws(() => payments.charge('o1', 100), /already charged/);
  payments.refund('o1');
  assert.throws(() => payments.refund('o1'), /already refunded/);
  assert.throws(() => payments.refund('o2'), /no payment/);
});
