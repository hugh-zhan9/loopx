export function assertCents(value, label = 'amount') {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of cents`);
  }
  return value;
}

export function addCents(left, right) {
  return assertCents(left) + assertCents(right);
}

export function multiplyCents(unitCents, quantity) {
  assertCents(unitCents, 'unit price');
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError('quantity must be a positive integer');
  }
  return unitCents * quantity;
}

export function applyDiscount(cents, fraction) {
  assertCents(cents);
  if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError('discount fraction must be a number between 0 and 1');
  }
  return Math.round(cents * (1 - fraction));
}
