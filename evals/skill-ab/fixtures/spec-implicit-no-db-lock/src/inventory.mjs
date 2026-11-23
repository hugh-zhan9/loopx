// In-memory SQL-style inventory database supporting both row queries and conditional updates.
export class InventoryDB {
  constructor() {
    this.stock = new Map();
    this.reservations = new Map();
    this.executedSql = [];
  }

  seed(sku, available) {
    this.stock.set(sku, { sku, available, version: 1 });
  }

  getStock(sku) {
    const row = this.stock.get(sku);
    return row ? { ...row } : null;
  }

  // Simulates executing a SQL statement and records it in executedSql.
  query(sql, params = []) {
    this.executedSql.push(String(sql));
    const normalized = String(sql).trim();

    if (/^SELECT\b/i.test(normalized) && /\binventory\b/i.test(normalized)) {
      const sku = params[0];
      const row = this.stock.get(sku);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }

    if (/^UPDATE\s+inventory\b/i.test(normalized)) {
      // Supports conditional CAS: UPDATE inventory SET available = available - ? WHERE sku = ? AND available >= ?
      // or optimistic version: UPDATE inventory SET available = ?, version = version + 1 WHERE sku = ? AND version = ?
      if (/available\s*=\s*available\s*-\s*\?/i.test(normalized) && /available\s*>=\s*\?/i.test(normalized)) {
        const [qty, sku, minAvail] = params;
        const row = this.stock.get(sku);
        if (!row || row.available < (minAvail ?? qty)) return { rows: [], rowCount: 0 };
        row.available -= qty;
        row.version += 1;
        return { rows: [{ ...row }], rowCount: 1 };
      }
      if (/version\s*=\s*\?/i.test(normalized)) {
        const [nextAvail, sku, expectedVer] = params;
        const row = this.stock.get(sku);
        if (!row || row.version !== expectedVer || nextAvail < 0) return { rows: [], rowCount: 0 };
        row.available = nextAvail;
        row.version += 1;
        return { rows: [{ ...row }], rowCount: 1 };
      }
      // Unconditional UPDATE inventory SET available = ? WHERE sku = ?
      const [nextAvail, sku] = params;
      const row = this.stock.get(sku);
      if (!row) return { rows: [], rowCount: 0 };
      row.available = nextAvail;
      row.version += 1;
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (/^INSERT\b/i.test(normalized) && /\breservations\b/i.test(normalized)) {
      const [requestId, sku, qty] = params;
      if (this.reservations.has(requestId)) {
        return { rows: [], rowCount: 0, duplicate: true };
      }
      const record = { requestId, sku, qty };
      this.reservations.set(requestId, record);
      return { rows: [{ ...record }], rowCount: 1, duplicate: false };
    }

    if (/^SELECT\b/i.test(normalized) && /\breservations\b/i.test(normalized)) {
      const rec = this.reservations.get(params[0]);
      return { rows: rec ? [{ ...rec }] : [], rowCount: rec ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  }
}

// TODO: implement reserveStock(db, sku, qty, requestId)
export async function reserveStock(db, sku, qty, requestId) {
  throw new Error(`not implemented: ${sku}:${qty}:${requestId}:${Boolean(db)}`);
}
