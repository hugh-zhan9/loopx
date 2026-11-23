import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOrderResponse } from '../src/orders.mjs';

test('existing public contract remains untouched until compatibility decision is settled', () => {
  assert.deepEqual(
    formatOrderResponse({ id: 'o-1', amountCents: 1250, currency: 'USD' }),
    { id: 'o-1', amount: '12.50', currency: 'USD' },
  );
});
