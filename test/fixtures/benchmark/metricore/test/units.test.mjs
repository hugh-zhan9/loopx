import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDuration } from '../src/units.mjs';

test('formats representative durations', () => {
  assert.equal(formatDuration(500), '500ms');
  assert.equal(formatDuration(1500), '1.5s');
  assert.equal(formatDuration(90000), '1m30s');
  assert.equal(formatDuration(3600000), '1h0m');
});

test('rejects non-finite durations', () => {
  assert.throws(() => formatDuration(NaN), RangeError);
  assert.throws(() => formatDuration('5'), RangeError);
});
