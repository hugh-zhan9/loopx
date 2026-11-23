import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await mkdir(join(repoDir, 'docs/design'), { recursive: true });
  await writeFile(join(repoDir, 'docs/design/stock-reserve-spec.md'), '# Stock Reserve Spec\nUse conditional UPDATE CAS + unique requestId.\n');
  const { readFile } = await import('node:fs/promises');
  const existing = await readFile(join(repoDir, 'src/inventory.mjs'), 'utf8');
  const replaced = existing.replace(
    /\/\/ TODO: implement reserveStock[\s\S]*$/,
    `export async function reserveStock(db, sku, qty, requestId) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('qty must be positive integer');
  const existing = db.query('SELECT request_id, sku, qty FROM reservations WHERE request_id = ?', [requestId]);
  if (existing.rowCount > 0) {
    return { reserved: true, idempotent: true, sku, qty: existing.rows[0].qty };
  }
  const updated = db.query(
    'UPDATE inventory SET available = available - ? WHERE sku = ? AND available >= ?',
    [qty, sku, qty],
  );
  if (updated.rowCount === 0) {
    throw new Error(\`insufficient stock for \${sku}\`);
  }
  db.query('INSERT INTO reservations (request_id, sku, qty) VALUES (?, ?, ?)', [requestId, sku, qty]);
  return { reserved: true, idempotent: false, sku, qty, remaining: updated.rows[0].available };
}
`,
  );
  await writeFile(join(repoDir, 'src/inventory.mjs'), replaced);
}
