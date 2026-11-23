// Existing reconciliation API + DB repository.
// DB rows contain internal diagnostic columns that callers must NOT receive.

export const REPO_ROWS = [
  {
    id: 'ex-1',
    symbol: 'AAPL',
    status: 'open',
    expected_json: '{"qty":100,"priceCents":15000}',
    confirmed_json: '{"qty":90,"priceCents":15000}',
    difference_json: '{"field":"qty","expected":100,"actual":90}',
    internal_trace_id: 'trc_secret_991',
    raw_snapshot_blob: 'INTERNAL_AUDIT_ONLY',
  },
];

// Existing v1 caller relies on listExceptionsV1 returning { id, symbol, status }.
export function listExceptionsV1(rows = REPO_ROWS) {
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    status: row.status,
  }));
}

// TODO: add getExceptionDiffView(id, rows) returning only caller-needed structured fields.
export function getExceptionDiffView() {
  throw new Error('not implemented');
}
