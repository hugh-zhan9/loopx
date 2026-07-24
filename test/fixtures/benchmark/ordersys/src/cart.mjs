import { multiplyCents } from './money.mjs';

export class Cart {
  #lines = new Map();

  add(productId, quantity) {
    if (typeof productId !== 'string' || productId.length === 0) {
      throw new TypeError('productId must be a non-empty string');
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new RangeError('quantity must be a positive integer');
    }
    this.#lines.set(productId, (this.#lines.get(productId) ?? 0) + quantity);
    return this;
  }

  get lineCount() {
    return this.#lines.size;
  }

  // Lazily yields { productId, quantity } lines in insertion order.
  *lines() {
    for (const [productId, quantity] of this.#lines) {
      yield { productId, quantity };
    }
  }

  subtotalCents(pricing) {
    let total = 0;
    for (const line of this.lines()) {
      total += multiplyCents(pricing.unitPriceCents(line.productId, line.quantity), line.quantity);
    }
    return total;
  }

  totalWeightGrams(catalog) {
    let grams = 0;
    for (const line of this.lines()) {
      grams += catalog.get(line.productId).weightGrams * line.quantity;
    }
    return grams;
  }
}
