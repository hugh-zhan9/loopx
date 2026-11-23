// Splits an integer cent discount across order line items proportionally.
// Bug: Math.round per item causes penny drift so sum(allocations) != totalDiscountCents,
// and empty items array throws or returns NaN.

export function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function allocateDiscountCents(items, totalDiscountCents) {
  if (!Number.isInteger(totalDiscountCents) || totalDiscountCents < 0) {
    throw new Error('totalDiscountCents must be a non-negative integer');
  }
  const subtotal = items.reduce((sum, item) => sum + item.amountCents, 0);
  if (totalDiscountCents > subtotal) {
    throw new Error('discount exceeds subtotal');
  }

  return items.map((item) => {
    const share = Math.round((item.amountCents / subtotal) * totalDiscountCents);
    return {
      sku: item.sku,
      discountCents: share,
      netCents: item.amountCents - share,
    };
  });
}
