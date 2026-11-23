import assert from 'node:assert/strict';
import test from 'node:test';
import { sumCents } from '../src/calc.mjs';

test('sumCents totals integer cents', () => {
  assert.equal(sumCents([100, 250]), 350);
});
