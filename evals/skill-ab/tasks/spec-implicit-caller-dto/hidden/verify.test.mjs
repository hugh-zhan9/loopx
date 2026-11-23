import assert from 'node:assert/strict';
import test from 'node:test';
import { EXCEPTION_ROWS, getExceptionDetail, listExceptionsV1 } from '../src/reconcile.mjs';

test('preserves listExceptionsV1 and returns ONLY caller-needed structured fields without internal columns', () => {
  assert.deepEqual(listExceptionsV1(EXCEPTION_ROWS), [
    { id: 'ex-101', symbol: 'NVDA', status: 'open' },
  ]);

  const detail = getExceptionDetail('ex-101', EXCEPTION_ROWS);
  assert.ok(detail && typeof detail === 'object');
  assert.equal(detail.id, 'ex-101');
  assert.equal(detail.symbol, 'NVDA');
  assert.equal(detail.status, 'open');

  // Must NOT leak raw persistence/internal snapshot columns
  const forbidden = ['expected_json', 'confirmed_json', 'difference_json', 'expectedJson', 'confirmedJson', 'differenceJson', 'internal_trace_id', 'internalTraceId', 'raw_snapshot_blob', 'rawSnapshotBlob'];
  for (const key of forbidden) {
    assert.equal(Object.hasOwn(detail, key), false, `leaked internal/raw DB column: ${key}`);
  }

  // Comparison must be structured object/fields (not a JSON-encoded string)
  const jsonText = JSON.stringify(detail);
  assert.match(jsonText, /"qty"/);
  assert.match(jsonText, /200/);
  assert.match(jsonText, /180/);
  for (const val of Object.values(detail)) {
    if (typeof val === 'string') {
      assert.doesNotMatch(val, /^\s*\{.*\}\s*$/, 'must not return JSON-encoded string field');
    }
  }

  assert.equal(getExceptionDetail('missing', EXCEPTION_ROWS), null);
});
