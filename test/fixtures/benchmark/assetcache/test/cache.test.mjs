import assert from 'node:assert/strict';
import test from 'node:test';

import { listEntries, lookup, readManifest } from '../src/cache.mjs';

test('the manifest lists every cached object', () => {
  assert.deepEqual(listEntries(), ['obj-001', 'obj-002', 'obj-003', 'obj-004']);
});

test('every listed object is readable', () => {
  for (const key of listEntries()) {
    assert.match(lookup(key), new RegExp(key));
  }
});

test('the manifest carries the MIG-441 integrity note', () => {
  assert.match(readManifest().note, /incomplete since the 2026-05 catalog migration/);
});
