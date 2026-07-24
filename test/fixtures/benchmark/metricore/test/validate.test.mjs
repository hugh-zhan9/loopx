import assert from 'node:assert/strict';
import test from 'node:test';

import { validateMetric } from '../src/validate.mjs';

test('normalizes a well-formed metric', () => {
  const record = validateMetric({ name: 'http.requests', type: 'counter', value: 3, tags: { region: 'eu' } });
  assert.deepEqual(record, { name: 'http.requests', type: 'counter', value: 3, tags: { region: 'eu' } });
});

test('rejects malformed metrics', () => {
  assert.throws(() => validateMetric(null), TypeError);
  assert.throws(() => validateMetric({ name: 7, type: 'gauge', value: 1 }), TypeError);
  assert.throws(() => validateMetric({ name: 'x', type: 'meter', value: 1 }), RangeError);
  assert.throws(() => validateMetric({ name: 'x', type: 'counter', value: -1 }), RangeError);
});
