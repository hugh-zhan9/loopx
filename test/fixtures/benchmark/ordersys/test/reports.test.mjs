import assert from 'node:assert/strict';
import test from 'node:test';

import { dayKeyUtc, parseIsoUtc } from '../src/clock.mjs';
import { dailyRevenue } from '../src/reports.mjs';

test('groups revenue by UTC day and skips cancelled orders', () => {
  const revenue = dailyRevenue([
    { placedAt: '2026-07-01T09:00:00Z', totalCents: 1000, status: 'delivered' },
    { placedAt: '2026-07-01T22:30:00Z', totalCents: 500, status: 'paid' },
    { placedAt: '2026-07-02T01:00:00Z', totalCents: 700, status: 'created' },
    { placedAt: '2026-07-02T02:00:00Z', totalCents: 9999, status: 'cancelled' },
  ]);
  assert.deepEqual(revenue, { '2026-07-01': 1500, '2026-07-02': 700 });
});

test('clock helpers parse and bucket UTC timestamps', () => {
  assert.equal(dayKeyUtc(parseIsoUtc('2026-07-24T23:59:59Z')), '2026-07-24');
  assert.throws(() => parseIsoUtc('not-a-date'), RangeError);
});
