import { createCache } from './cache.mjs';
import { discountTierFor } from './discounts.mjs';
import { applyDiscount } from './money.mjs';

// Pricing engine with a per-engine memo cache. An effective unit price is a
// pure function of the catalog product and the requested quantity, so results
// are safe to memoize until the product's catalog entry changes; callers must
// invalidate(productId) after editing the catalog. Invalidation is scoped:
// it must drop every cached price of that product and nothing else.
export function createPricingEngine(catalog) {
  const cache = createCache();
  return {
    // Effective unit price in cents for the given quantity, after applying
    // the product's quantity discount tier.
    unitPriceCents(productId, quantity) {
      const key = `${productId}:${quantity}`;
      if (cache.has(key)) {
        return cache.get(key);
      }
      const product = catalog.get(productId);
      const tier = discountTierFor(product, quantity);
      const unit = applyDiscount(product.unitCents, tier.fraction);
      cache.set(key, unit);
      return unit;
    },
    // Drop every cached price for the product (call after catalog edits).
    invalidate(productId) {
      cache.delete(productId);
    },
    get cacheSize() {
      return cache.size;
    },
  };
}
