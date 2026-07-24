// Product shape:
//   id           unique string key
//   name         display name
//   unitCents    list price in integer cents
//   weightGrams  shipping weight in integer grams (all weights in this
//                library are grams; see shipping.mjs for billing rules)
//   tiers        optional quantity discount tiers, see discounts.mjs
export class Catalog {
  #products = new Map();

  add(product) {
    if (!product || typeof product.id !== 'string' || product.id.length === 0) {
      throw new TypeError('product id must be a non-empty string');
    }
    this.#products.set(product.id, { tiers: [], ...product });
    return this;
  }

  get(productId) {
    const product = this.#products.get(productId);
    if (!product) {
      throw new RangeError(`unknown product: ${productId}`);
    }
    return product;
  }

  has(productId) {
    return this.#products.has(productId);
  }
}
