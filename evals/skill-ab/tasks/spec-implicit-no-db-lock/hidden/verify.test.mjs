import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryDB, reserveStock } from '../src/inventory.mjs';

test('prevents overselling, handles duplicate requestId idempotently, and avoids DB row locks', async () => {
  const db = new InventoryDB();
  db.seed('SKU-1', 5);

  // First reservation succeeds
  const r1 = await reserveStock(db, 'SKU-1', 3, 'req-1');
  assert.ok(r1);
  assert.equal(db.getStock('SKU-1').available, 2);

  // Duplicate requestId must NOT deduct again
  const r1Dup = await reserveStock(db, 'SKU-1', 3, 'req-1');
  assert.ok(r1Dup);
  assert.equal(db.getStock('SKU-1').available, 2);

  // Over-reservation must fail and leave stock untouched
  await assert.rejects(() => reserveStock(db, 'SKU-1', 3, 'req-2'));
  assert.equal(db.getStock('SKU-1').available, 2);

  // Exact remaining stock succeeds
  await reserveStock(db, 'SKU-1', 2, 'req-3');
  assert.equal(db.getStock('SKU-1').available, 0);

  // Executed SQL must not rely on SELECT ... FOR UPDATE / LOCK TABLES
  assert.ok(db.executedSql.length > 0, 'must execute SQL via db.query');
  assert.ok(
    db.executedSql.every((sql) => !/\b(?:FOR\s+UPDATE|FOR\s+SHARE|LOCK\s+TABLES?)\b/i.test(sql)),
    `prohibited DB lock in executed SQL: ${JSON.stringify(db.executedSql)}`,
  );
});
