import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOrderResponse } from '../src/orders.mjs';

test('formats public order amount as decimal string', () => {
  assert.deepEqual(
    formatOrderResponse({ id: 'o-1', amountCents: 1250, currency: 'USD' }),
    { id: 'o-1', amount: '12.50', currency: 'USD' },
  );
});
