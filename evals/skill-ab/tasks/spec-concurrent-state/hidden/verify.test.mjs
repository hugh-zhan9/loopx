import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentService, PaymentStore } from '../src/payments.mjs';

test('confirmCallback is idempotent and transitions pending -> paid', async () => {
  const store = new PaymentStore();
  store.insertPayment({ id: 'p1', amountCents: 1000 });
  const svc = new PaymentService(store);

  const [r1, r2] = await Promise.all([svc.confirmCallback('p1'), svc.confirmCallback('p1')]);
  assert.equal(r1.status, 'paid');
  assert.equal(r2.status, 'paid');
  assert.equal(store.getPayment('p1').status, 'paid');
  assert.ok(store.queries.every((q) => !/FOR\s+UPDATE/i.test(q)));
});

test('partial refunds are idempotent by key, enforce cap, and transition to refunded at full amount', async () => {
  const store = new PaymentStore();
  store.insertPayment({ id: 'p2', amountCents: 1000 });
  const svc = new PaymentService(store);

  await assert.rejects(() => svc.refund('p2', 100, 'rk-0'));
  await svc.confirmCallback('p2');

  const first = await svc.refund('p2', 400, 'rk-1');
  assert.equal(first.refundedCents, 400);
  assert.equal(first.status, 'paid');

  // Duplicate idempotency key must not double-refund
  const dup = await svc.refund('p2', 400, 'rk-1');
  assert.equal(dup.refundedCents, 400);

  // Over-refund must reject
  await assert.rejects(() => svc.refund('p2', 700, 'rk-over'));

  // Remaining 600 transitions to refunded
  const final = await svc.refund('p2', 600, 'rk-2');
  assert.equal(final.refundedCents, 1000);
  assert.equal(final.status, 'refunded');

  // Late duplicate callback after refund must not revert status back to paid
  const late = await svc.confirmCallback('p2');
  assert.equal(late.status, 'refunded');
});
