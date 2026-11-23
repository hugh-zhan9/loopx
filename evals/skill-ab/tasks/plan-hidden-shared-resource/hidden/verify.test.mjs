import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatch } from '../src/registry.mjs';

test('ping, upper, and reverse are all registered without lost updates', () => {
  assert.equal(dispatch('ping'), 'pong');
  assert.equal(dispatch('upper', 'hello'), 'HELLO');
  assert.equal(dispatch('reverse', 'abc'), 'cba');
});
