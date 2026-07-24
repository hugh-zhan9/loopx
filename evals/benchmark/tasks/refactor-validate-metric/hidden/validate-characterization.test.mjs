import assert from 'node:assert/strict';
import test from 'node:test';

import { validateMetric } from '../src/validate.mjs';

test('error precedence: name, then type, then value, then tags', () => {
  assert.throws(
    () => validateMetric({ name: 42, type: 'bogus', value: NaN, tags: [] }),
    { name: 'TypeError', message: 'metric name must be a string' },
  );
  assert.throws(
    () => validateMetric({ name: ' cpu ', type: 9, value: NaN, tags: [] }),
    { name: 'TypeError', message: 'metric type must be a string' },
  );
  assert.throws(
    () => validateMetric({ name: 'cpu', type: 'GAUGE', value: undefined, tags: [] }),
    { name: 'RangeError', message: 'metric value must be a finite number' },
  );
  assert.throws(
    () => validateMetric({ name: 'cpu', type: 'gauge', value: 1, tags: [] }),
    { name: 'TypeError', message: 'metric tags must be a plain object' },
  );
});

test('name is trimmed and type is case-normalized', () => {
  const record = validateMetric({ name: '  http.requests  ', type: 'Counter', value: 3 });
  assert.deepEqual(record, { name: 'http.requests', type: 'counter', value: 3, tags: {} });
  assert.deepEqual(Object.keys(record), ['name', 'type', 'value', 'tags']);
});

test('value coercion quirks are preserved exactly', () => {
  assert.equal(validateMetric({ name: 'n', type: 'gauge', value: '42.5' }).value, 42.5);
  assert.equal(validateMetric({ name: 'n', type: 'gauge', value: null }).value, 0);
  assert.equal(validateMetric({ name: 'n', type: 'gauge', value: true }).value, 1);
  assert.equal(validateMetric({ name: 'n', type: 'gauge', value: '' }).value, 0);
  assert.equal(validateMetric({ name: 'n', type: 'gauge', value: -5 }).value, -5);
  assert.throws(
    () => validateMetric({ name: 'n', type: 'counter', value: '-3' }),
    { name: 'RangeError', message: 'counter value must not be negative' },
    'coercion happens before the counter sign check',
  );
  assert.throws(
    () => validateMetric({ name: 'n', type: 'gauge', value: '12px' }),
    { name: 'RangeError', message: 'metric value must be a finite number' },
  );
});

test('input shape errors are unchanged', () => {
  assert.throws(() => validateMetric(null), { name: 'TypeError', message: 'metric must be an object' });
  assert.throws(() => validateMetric([]), { name: 'TypeError', message: 'metric must be an object' });
  assert.throws(
    () => validateMetric({ name: '   ', type: 'gauge', value: 1 }),
    { name: 'TypeError', message: 'metric name must not be blank' },
  );
  assert.throws(
    () => validateMetric({ name: 'n', type: 'meter', value: 1 }),
    { name: 'RangeError', message: 'metric type must be one of counter, gauge, timer' },
  );
});

test('tags are copied with String() coercion; null tags mean no tags', () => {
  const record = validateMetric({
    name: 'n',
    type: 'timer',
    value: 2,
    tags: { region: 'eu', shard: 7, flag: null },
  });
  assert.deepEqual(record.tags, { region: 'eu', shard: '7', flag: 'null' });
  assert.deepEqual(validateMetric({ name: 'n', type: 'timer', value: 2, tags: null }).tags, {});
  const tags = { a: 1 };
  validateMetric({ name: 'n', type: 'gauge', value: 1, tags });
  assert.deepEqual(tags, { a: 1 }, 'the input object is not mutated');
});
