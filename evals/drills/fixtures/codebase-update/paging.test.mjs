import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePage } from './paging.mjs';
test('missing page uses the first page', () => {
  for (const value of [undefined, null, '']) assert.equal(parsePage(value), 1);
});
test('decimal digit strings identify a page', () => {
  assert.equal(parsePage('12'), 12);
  assert.equal(parsePage('0012'), 12);
});
test('invalid representations and out-of-range pages are rejected', () => {
  for (const value of [2, '1.5', ' 2', '-1', 'abc']) assert.throws(() => parsePage(value), TypeError);
  for (const value of ['0', '9007199254740992']) assert.throws(() => parsePage(value), RangeError);
});
