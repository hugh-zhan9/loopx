// Core billing primitive called across multiple modules.
export function createInvoice(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('invalid amountCents');
  }
  return { amountCents, currency: 'USD' };
}
