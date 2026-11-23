// Simulated SQL store with optimistic-version CAS helper and query logger.
// Team policy: DO NOT use SELECT ... FOR UPDATE or table locks; use CAS + idempotency keys.

export class PaymentStore {
  constructor() {
    this.rows = new Map();
    this.refundKeys = new Set();
    this.queries = [];
  }

  insertPayment({ id, amountCents }) {
    this.rows.set(id, {
      id,
      status: 'pending',
      amountCents,
      refundedCents: 0,
      version: 1,
    });
  }

  getPayment(id) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  // Records SQL string for audit/guardrail inspection; executes CAS predicate.
  compareAndSwap(id, expectedVersion, patch, sqlNote = 'UPDATE payments SET ... WHERE id=? AND version=?') {
    this.queries.push(sqlNote);
    const row = this.rows.get(id);
    if (!row || row.version !== expectedVersion) {
      return { updated: false, row: row ? { ...row } : null };
    }
    Object.assign(row, patch, { version: row.version + 1 });
    return { updated: true, row: { ...row } };
  }

  recordRefundKey(idempotencyKey) {
    if (this.refundKeys.has(idempotencyKey)) return false;
    this.refundKeys.add(idempotencyKey);
    return true;
  }
}

export class PaymentService {
  constructor(store) {
    this.store = store;
  }

  // TODO: implement confirmCallback(paymentId) and refund(paymentId, amountCents, idempotencyKey)
  async confirmCallback(paymentId) {
    throw new Error(`not implemented: ${paymentId}`);
  }

  async refund(paymentId, amountCents, idempotencyKey) {
    throw new Error(`not implemented: ${paymentId}:${amountCents}:${idempotencyKey}`);
  }
}
