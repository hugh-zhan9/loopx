import assert from 'node:assert/strict';
import test from 'node:test';

import { createCache } from '../src/cache.mjs';

test('stores, reports, and deletes entries', () => {
  const cache = createCache();
  cache.set('a', 1);
  cache.set('b', 2);
  assert.ok(cache.has('a'));
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.size, 2);
  assert.deepEqual(cache.keys().sort(), ['a', 'b']);
  cache.delete('a');
  assert.ok(!cache.has('a'));
  cache.clear();
  assert.equal(cache.size, 0);
});
