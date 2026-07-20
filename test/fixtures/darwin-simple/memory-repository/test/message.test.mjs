import assert from 'node:assert/strict';
import test from 'node:test';

import { message } from '../src/message.mjs';

test('exports a non-empty public message', () => {
  assert.equal(typeof message, 'string');
  assert.ok(message.length > 0);
});
