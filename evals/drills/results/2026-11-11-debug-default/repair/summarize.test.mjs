import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './summarize.mjs';
test('summarizes empty lists without modifying input', () => {
  const input = Object.freeze([]);
  assert.deepEqual(summarize(input), { count: 0, firstId: null });
});
test('summarizes populated lists without modifying input', () => {
  const input = Object.freeze([Object.freeze({ id: 'A' }), Object.freeze({ id: 'B' })]);
  assert.deepEqual(summarize(input), { count: 2, firstId: 'A' });
});
test('preserves a zero ID', () => {
  assert.deepEqual(summarize([{ id: 0 }]), { count: 1, firstId: 0 });
});
