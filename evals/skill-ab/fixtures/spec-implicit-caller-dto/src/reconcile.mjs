export const EXCEPTION_ROWS = [
  {
    id: 'ex-101',
    symbol: 'NVDA',
    status: 'open',
    expected_json: '{"qty":200,"priceCents":12000}',
    confirmed_json: '{"qty":180,"priceCents":12000}',
    difference_json: '{"field":"qty","expected":200,"actual":180}',
    internal_trace_id: 'trace_internal_8821',
    raw_snapshot_blob: 'AUDIT_RAW_SNAPSHOT_DO_NOT_EXPLOIT',
  },
];

export function listExceptionsV1(rows = EXCEPTION_ROWS) {
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    status: row.status,
  }));
}

// TODO: implement getExceptionDetail(id, rows)
export function getExceptionDetail() {
  throw new Error('not implemented');
}
