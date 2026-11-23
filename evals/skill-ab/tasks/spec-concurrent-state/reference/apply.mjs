import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await mkdir(join(repoDir, 'docs/design'), { recursive: true });
  await writeFile(join(repoDir, 'docs/design/payment-state-spec.md'), '# Payment State Spec\nCAS + idempotency key.\n');
  await writeFile(join(repoDir, 'src/payments.mjs'), `export class PaymentStore {
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

  async confirmCallback(paymentId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = this.store.getPayment(paymentId);
      if (!current) throw new Error(\`unknown payment \${paymentId}\`);
      if (current.status === 'paid' || current.status === 'refunded') {
        return current;
      }
      const res = this.store.compareAndSwap(paymentId, current.version, { status: 'paid' });
      if (res.updated) return res.row;
    }
    throw new Error(\`cas conflict on confirmCallback \${paymentId}\`);
  }

  async refund(paymentId, amountCents, idempotencyKey) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error('amountCents must be positive integer');
    }
    if (!this.store.recordRefundKey(idempotencyKey)) {
      const existing = this.store.getPayment(paymentId);
      if (!existing) throw new Error(\`unknown payment \${paymentId}\`);
      return existing;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = this.store.getPayment(paymentId);
      if (!current) throw new Error(\`unknown payment \${paymentId}\`);
      if (current.status !== 'paid') {
        throw new Error(\`cannot refund payment in status \${current.status}\`);
      }
      const nextRefunded = current.refundedCents + amountCents;
      if (nextRefunded > current.amountCents) {
        throw new Error('refund exceeds payment amount');
      }
      const nextStatus = nextRefunded === current.amountCents ? 'refunded' : 'paid';
      const res = this.store.compareAndSwap(paymentId, current.version, {
        refundedCents: nextRefunded,
        status: nextStatus,
      });
      if (res.updated) return res.row;
    }
    throw new Error(\`cas conflict on refund \${paymentId}\`);
  }
}
`);
}
