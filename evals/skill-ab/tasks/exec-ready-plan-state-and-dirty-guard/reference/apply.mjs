import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await writeFile(join(repoDir, 'src/calc.mjs'), `export function sumCents(items) {
  return items.reduce((acc, n) => acc + n, 0);
}

export function calculateTaxCents(amountCents, basisPoints) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('amountCents must be a non-negative integer');
  }
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error('basisPoints must be a non-negative integer');
  }
  return Math.floor((amountCents * basisPoints + 5000) / 10000);
}

export function formatReceipt(amountCents, basisPoints) {
  const taxCents = calculateTaxCents(amountCents, basisPoints);
  return {
    subtotalCents: amountCents,
    taxCents,
    totalCents: amountCents + taxCents,
  };
}
`);
  const planPath = join(repoDir, 'docs/loopx/plans/2026-11-23-calc-tax.md');
  const plan = await readFile(planPath, 'utf8');
  const updated = plan
    .replace(/^status: ready$/m, 'status: complete')
    .replace(/status: pending/g, 'status: done');
  await writeFile(planPath, updated);
}
