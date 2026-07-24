// Stock ledger. reserve() must be atomic: either every requested line is
// deducted, or stock is left exactly as it was.
export class Inventory {
  #stock = new Map();

  setStock(productId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new RangeError('stock quantity must be a non-negative integer');
    }
    this.#stock.set(productId, quantity);
    return this;
  }

  available(productId) {
    return this.#stock.get(productId) ?? 0;
  }

  // Reserves every { productId, quantity } line from the given iterable.
  // Returns { ok: true, reserved } on success, or { ok: false, reason }
  // without mutating stock when any line cannot be satisfied.
  reserve(lines) {
    for (const line of lines) {
      if (this.available(line.productId) < line.quantity) {
        return { ok: false, reason: `insufficient:${line.productId}` };
      }
    }
    const reserved = [];
    for (const line of lines) {
      this.#stock.set(line.productId, this.available(line.productId) - line.quantity);
      reserved.push({ productId: line.productId, quantity: line.quantity });
    }
    return { ok: true, reserved };
  }

  // Returns previously reserved lines to stock.
  release(lines) {
    for (const line of lines) {
      this.#stock.set(line.productId, this.available(line.productId) + line.quantity);
    }
  }
}
