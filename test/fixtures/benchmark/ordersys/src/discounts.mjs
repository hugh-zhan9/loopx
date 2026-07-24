// A tier is { minQuantity, fraction }. The applicable tier for a quantity is
// the tier with the highest minQuantity that is <= quantity; quantities below
// every tier get the zero tier.
export const ZERO_TIER = Object.freeze({ minQuantity: 0, fraction: 0 });

export function discountTierFor(product, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError('quantity must be a positive integer');
  }
  let selected = ZERO_TIER;
  for (const tier of product.tiers ?? []) {
    if (quantity >= tier.minQuantity && tier.minQuantity >= selected.minQuantity) {
      selected = tier;
    }
  }
  return selected;
}
