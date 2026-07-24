// Characterization tests: they pass against the pre-refactor implementation
// and must still pass afterwards, pinning "behavior did not change".
import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPrice } from '../src/format.mjs';

test('formats zero cents', () => {
  assert.equal(formatPrice(0), '$0.00');
});

test('pads a single-digit remainder', () => {
  assert.equal(formatPrice(5), '$0.05');
});

test('formats cents just below a dollar', () => {
  assert.equal(formatPrice(99), '$0.99');
});

test('formats an exact dollar amount', () => {
  assert.equal(formatPrice(100), '$1.00');
});

test('formats a mixed amount', () => {
  assert.equal(formatPrice(1234), '$12.34');
});

test('formats a large amount', () => {
  assert.equal(formatPrice(99999), '$999.99');
});
