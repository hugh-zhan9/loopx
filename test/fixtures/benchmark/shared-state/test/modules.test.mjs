import assert from 'node:assert/strict';
import test from 'node:test';

import { farewell } from '../src/farewell.mjs';
import { greet } from '../src/greet.mjs';

test('greets with the configured greeting', () => {
  assert.equal(greet('Ada'), 'hello, Ada');
});

test('parts with the configured farewell', () => {
  assert.equal(farewell('Ada'), 'bye, Ada');
});
