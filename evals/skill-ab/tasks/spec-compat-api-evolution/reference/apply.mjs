import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await mkdir(join(repoDir, 'docs/design'), { recursive: true });
  await writeFile(join(repoDir, 'docs/design/reconcile-api-spec.md'), '# Reconcile API Spec\nCaller-driven response.\n');
  await writeFile(join(repoDir, 'src/api.mjs'), `export const REPO_ROWS = [
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

export function listExceptionsV1(rows = REPO_ROWS) {
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    status: row.status,
  }));
}

export function getExceptionDiffView(id, rows = REPO_ROWS) {
  const row = rows.find((item) => item.id === id);
  if (!row) return null;
  let parsed;
  try {
    parsed = JSON.parse(row.difference_json);
  } catch (error) {
    throw new Error(\`invalid difference_json for \${id}: \${error.message}\`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(\`difference_json for \${id} must decode to an object\`);
  }
  return {
    id: row.id,
    symbol: row.symbol,
    status: row.status,
    diff: {
      field: parsed.field,
      expected: parsed.expected,
      actual: parsed.actual,
    },
  };
}
`);
}
