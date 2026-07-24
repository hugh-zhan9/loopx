import assert from 'node:assert/strict';
import test from 'node:test';

import { createHookRegistry } from '../src/registry.mjs';

test('registers hooks in order and unsubscribes', () => {
  const registry = createHookRegistry();
  const first = () => {};
  const second = () => {};
  registry.register(first);
  const unsubscribe = registry.register(second);
  assert.deepEqual(registry.list(), [first, second]);
  unsubscribe();
  assert.deepEqual(registry.list(), [first]);
  assert.throws(() => registry.register('nope'), TypeError);
});
