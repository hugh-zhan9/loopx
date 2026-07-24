import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDuration } from '../src/units.mjs';

test('output strings are byte-identical across every range and boundary', () => {
  const cases = [
    [0, '0ms'],
    [999, '999ms'],
    [999.4, '999ms'],
    [999.5, '1000ms'],
    [1000, '1s'],
    [1049, '1s'],
    [1050, '1.1s'],
    [1500, '1.5s'],
    [2000, '2s'],
    [59949, '59.9s'],
    [59950, '60s'],
    [60000, '1m0s'],
    [61000, '1m1s'],
    [90999, '1m30s'],
    [119999, '1m59s'],
    [3599999, '59m59s'],
    [3600000, '1h0m'],
    [5370000, '1h30m'],
    [7199999, '1h60m'],
    [7200000, '2h0m'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(formatDuration(input), expected, `formatDuration(${input})`);
  }
});

test('negative durations mirror positive formatting with a leading minus', () => {
  assert.equal(formatDuration(-1500), '-1.5s');
  assert.equal(formatDuration(-999.5), '-1000ms');
  assert.equal(formatDuration(-3600000), '-1h0m');
});

test('the error contract is unchanged', () => {
  for (const bad of [NaN, Infinity, -Infinity, '5', null]) {
    assert.throws(
      () => formatDuration(bad),
      { name: 'RangeError', message: 'duration must be a finite number of milliseconds' },
      `formatDuration(${String(bad)})`,
    );
  }
});
