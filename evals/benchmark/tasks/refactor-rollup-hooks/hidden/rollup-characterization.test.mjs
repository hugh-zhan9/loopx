import assert from 'node:assert/strict';
import test from 'node:test';

import { createRollup } from '../src/rollup.mjs';

test('hooks fire metric-major in registration order; summary keeps first-seen order', () => {
  const rollup = createRollup();
  rollup.add('web.latency', 120);
  rollup.add('db.calls', 3);
  rollup.add('web.latency', 80);
  const log = [];
  const { summary, errors } = rollup.flush([
    (name, entry) => log.push(`h1:${name}:${entry.count}`),
    (name, entry) => log.push(`h2:${name}:${entry.total}`),
  ]);
  assert.deepEqual(log, [
    'h1:web.latency:2',
    'h2:web.latency:200',
    'h1:db.calls:1',
    'h2:db.calls:3',
  ], 'per metric, every hook runs before moving to the next metric');
  assert.deepEqual(Object.keys(summary), ['web.latency', 'db.calls']);
  assert.deepEqual(Object.keys(summary['web.latency']), ['count', 'total', 'mean', 'min', 'max']);
  assert.deepEqual(summary['web.latency'], { count: 2, total: 200, mean: 100, min: 80, max: 120 });
  assert.deepEqual(errors, []);
});

test('a throwing hook is recorded as name:message and later hooks still run', () => {
  const rollup = createRollup();
  rollup.add('m1', 1);
  rollup.add('m2', 2);
  const log = [];
  const { errors } = rollup.flush([
    (name) => {
      if (name === 'm1') {
        throw new Error('h1 broke');
      }
      log.push(`h1:${name}`);
    },
    (name) => log.push(`h2:${name}`),
  ]);
  assert.deepEqual(errors, ['m1:h1 broke']);
  assert.deepEqual(log, ['h2:m1', 'h1:m2', 'h2:m2'], 'the failure never skips other hooks or metrics');
});

test('hooks receive the same entry object exposed in the summary', () => {
  const rollup = createRollup();
  rollup.add('m', 1);
  let captured;
  const { summary } = rollup.flush([(name, entry) => {
    captured = entry;
  }]);
  assert.equal(summary.m, captured);
});

test('flush resets the accumulator and works without arguments', () => {
  const rollup = createRollup();
  rollup.add('m', 5);
  const first = rollup.flush();
  assert.deepEqual(first.summary.m, { count: 1, total: 5, mean: 5, min: 5, max: 5 });
  const second = rollup.flush();
  assert.deepEqual(second, { summary: {}, errors: [] });
});

test('add validation is unchanged', () => {
  const rollup = createRollup();
  assert.throws(() => rollup.add('', 1), { name: 'TypeError', message: 'metric name must be a non-empty string' });
  assert.throws(() => rollup.add(7, 1), { name: 'TypeError', message: 'metric name must be a non-empty string' });
  assert.throws(() => rollup.add('m', NaN), { name: 'RangeError', message: 'sample value must be a finite number' });
  assert.throws(() => rollup.add('m', '3'), { name: 'RangeError', message: 'sample value must be a finite number' });
});
