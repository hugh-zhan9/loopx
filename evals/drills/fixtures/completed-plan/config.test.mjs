import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config.mjs';
test('custom names survive initial load and reload', () => {
  const initial = loadConfig({ exportName: 'orders.csv' });
  assert.equal(initial.exportName, 'orders.csv');
  assert.equal(loadConfig(initial).exportName, 'orders.csv');
});
test('the default name survives reload', () => {
  assert.equal(loadConfig({}).exportName, 'export.csv');
  assert.equal(loadConfig(loadConfig({})).exportName, 'export.csv');
});
