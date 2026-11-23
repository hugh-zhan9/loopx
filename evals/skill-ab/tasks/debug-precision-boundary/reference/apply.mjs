import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await writeFile(join(repoDir, 'src/allocator.mjs'), `export function formatCents(cents) {
  return \`$\${(cents / 100).toFixed(2)}\`;
}

export function allocateDiscountCents(items, totalDiscountCents) {
  if (!Number.isInteger(totalDiscountCents) || totalDiscountCents < 0) {
    throw new Error('totalDiscountCents must be a non-negative integer');
  }
  const subtotal = items.reduce((sum, item) => sum + item.amountCents, 0);
  if (totalDiscountCents > subtotal) {
    throw new Error('discount exceeds subtotal');
  }
  if (items.length === 0 || subtotal === 0) {
    return items.map((item) => ({
      sku: item.sku,
      discountCents: 0,
      netCents: item.amountCents,
    }));
  }

  const base = items.map((item, index) => {
    const numerator = BigInt(item.amountCents) * BigInt(totalDiscountCents);
    const denom = BigInt(subtotal);
    const floor = Number(numerator / denom);
    const rem = numerator % denom;
    return { index, item, floor, rem };
  });

  let remainder = totalDiscountCents - base.reduce((sum, row) => sum + row.floor, 0);
  const byRemainder = [...base].sort((a, b) => {
    if (b.rem !== a.rem) return b.rem > a.rem ? 1 : -1;
    return a.index - b.index;
  });

  const allocations = new Array(items.length);
  for (const row of base) {
    allocations[row.index] = row.floor;
  }
  for (const row of byRemainder) {
    if (remainder <= 0) break;
    if (allocations[row.index] < row.item.amountCents) {
      allocations[row.index] += 1;
      remainder -= 1;
    }
  }

  return items.map((item, index) => ({
    sku: item.sku,
    discountCents: allocations[index],
    netCents: item.amountCents - allocations[index],
  }));
}
`);
}
