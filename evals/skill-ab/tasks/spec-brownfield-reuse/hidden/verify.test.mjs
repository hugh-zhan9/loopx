import assert from 'node:assert/strict';
import test from 'node:test';
import { exportReport, listFormats } from '../src/exporters.mjs';

test('ndjson format is registered in the owning exporter pipeline rather than a parallel bypass', () => {
  assert.ok(listFormats().includes('ndjson'), 'ndjson must be registered via registerExporter');
  assert.equal(exportReport('ndjson', []), '');
  assert.equal(
    exportReport('ndjson', [{ id: 1 }, { id: 2 }]),
    '{"id":1}\n{"id":2}',
  );
  // Existing formats remain unaffected
  assert.equal(exportReport('json', [{ id: 1 }]), '[{"id":1}]');
});
