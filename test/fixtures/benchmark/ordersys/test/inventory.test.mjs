import assert from 'node:assert/strict';
import test from 'node:test';

import { Inventory } from '../src/inventory.mjs';

test('reserves available stock and reports the reserved lines', () => {
  const inventory = new Inventory();
  inventory.setStock('widget', 5);
  const result = inventory.reserve([{ productId: 'widget', quantity: 3 }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.reserved, [{ productId: 'widget', quantity: 3 }]);
  assert.equal(inventory.available('widget'), 2);
});

test('refuses to reserve more than is available', () => {
  const inventory = new Inventory();
  inventory.setStock('widget', 2);
  const result = inventory.reserve([{ productId: 'widget', quantity: 3 }]);
  assert.deepEqual(result, { ok: false, reason: 'insufficient:widget' });
  assert.equal(inventory.available('widget'), 2);
});

test('a failing line aborts the whole reservation without side effects', () => {
  const inventory = new Inventory();
  inventory.setStock('widget', 5);
  inventory.setStock('bolt', 1);
  const result = inventory.reserve([
    { productId: 'widget', quantity: 2 },
    { productId: 'bolt', quantity: 10 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(inventory.available('widget'), 5);
  assert.equal(inventory.available('bolt'), 1);
});

test('release returns reserved lines to stock', () => {
  const inventory = new Inventory();
  inventory.setStock('widget', 5);
  const { reserved } = inventory.reserve([{ productId: 'widget', quantity: 4 }]);
  inventory.release(reserved);
  assert.equal(inventory.available('widget'), 5);
});

test('rejects invalid stock values', () => {
  const inventory = new Inventory();
  assert.throws(() => inventory.setStock('widget', -1), RangeError);
});
