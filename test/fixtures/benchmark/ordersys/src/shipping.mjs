// Shipping quotes. Weights everywhere in this library are integer grams (see
// catalog.mjs). Carriers bill by billable weight: the parcel weight rounded
// UP to the next whole kilogram. Express has a price cap; standard does not.
const STANDARD_BASE_CENTS = 300;
const STANDARD_PER_KG_CENTS = 20;
const EXPRESS_BASE_CENTS = 500;
const EXPRESS_PER_KG_CENTS = 30;
const EXPRESS_CAP_CENTS = 2000;

function billableKg(weightGrams) {
  return Math.ceil(weightGrams / 1000);
}

export function quoteShippingCents(weightGrams, carrier) {
  if (!Number.isInteger(weightGrams) || weightGrams < 0) {
    throw new RangeError('weight must be a non-negative integer number of grams');
  }
  if (carrier === 'standard') {
    return STANDARD_BASE_CENTS + STANDARD_PER_KG_CENTS * billableKg(weightGrams);
  }
  if (carrier === 'express') {
    const billable = Math.ceil(weightGrams);
    return Math.min(EXPRESS_CAP_CENTS, EXPRESS_BASE_CENTS + EXPRESS_PER_KG_CENTS * billable);
  }
  throw new RangeError(`unknown carrier: ${carrier}`);
}
