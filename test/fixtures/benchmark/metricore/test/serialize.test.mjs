import assert from 'node:assert/strict';
import test from 'node:test';

import { toCsv } from '../src/serialize.mjs';

test('renders rows with quoting where needed', () => {
  const csv = toCsv([{ name: 'alpha', note: 'a,b' }], ['name', 'note']);
  assert.equal(csv, 'name,note\r\nalpha,"a,b"\r\n');
});

test('validates inputs', () => {
  assert.throws(() => toCsv('nope', ['a']), TypeError);
  assert.throws(() => toCsv([], []), TypeError);
});
