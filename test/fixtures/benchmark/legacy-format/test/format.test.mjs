import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPrice } from '../src/format.mjs';

test('formats a whole-dollar price', () => {
  assert.equal(formatPrice(1200), '$12.00');
});
