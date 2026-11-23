import assert from 'node:assert/strict';
import test from 'node:test';
import { getExceptionDiffView, listExceptionsV1, REPO_ROWS } from '../src/api.mjs';

test('listExceptionsV1 keeps exact backward-compatible shape', () => {
  assert.deepEqual(listExceptionsV1(REPO_ROWS), [
    { id: 'ex-1', symbol: 'AAPL', status: 'open' },
  ]);
});

test('getExceptionDiffView returns only caller-needed structured fields without internal columns', () => {
  const view = getExceptionDiffView('ex-1', REPO_ROWS);
  assert.deepEqual(Object.keys(view).sort(), ['diff', 'id', 'status', 'symbol']);
  assert.equal(typeof view.diff, 'object');
  assert.deepEqual(view.diff, { field: 'qty', expected: 100, actual: 90 });
  assert.equal(getExceptionDiffView('missing', REPO_ROWS), null);
});

test('malformed difference_json throws explicitly instead of silent empty-object fallback', () => {
  const broken = [{ ...REPO_ROWS[0], id: 'ex-bad', difference_json: '{bad-json' }];
  assert.throws(() => getExceptionDiffView('ex-bad', broken));
});
