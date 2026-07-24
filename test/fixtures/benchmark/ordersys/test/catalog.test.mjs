import assert from 'node:assert/strict';
import test from 'node:test';

import { Catalog } from '../src/catalog.mjs';

test('stores and returns products by id', () => {
  const catalog = new Catalog();
  catalog.add({ id: 'widget', name: 'Widget', unitCents: 1000, weightGrams: 500 });
  assert.equal(catalog.get('widget').name, 'Widget');
  assert.equal(catalog.get('widget').tiers.length, 0);
  assert.ok(catalog.has('widget'));
  assert.ok(!catalog.has('gadget'));
});

test('rejects invalid ids and unknown lookups', () => {
  const catalog = new Catalog();
  assert.throws(() => catalog.add({ id: '' }), TypeError);
  assert.throws(() => catalog.get('missing'), RangeError);
});
