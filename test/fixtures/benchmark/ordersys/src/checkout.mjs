import { quoteShippingCents } from './shipping.mjs';

// Places an order from a cart: reserves stock, prices the cart, quotes
// shipping, and records the order. Reservation failures abort the checkout
// without side effects.
export function checkout({ cart, catalog, pricing, inventory, orders, orderId, carrier = 'standard' }) {
  const result = inventory.reserve(cart.lines());
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  const subtotalCents = cart.subtotalCents(pricing);
  const shippingCents = quoteShippingCents(cart.totalWeightGrams(catalog), carrier);
  const order = orders.create({
    id: orderId,
    reserved: result.reserved,
    totalCents: subtotalCents + shippingCents,
  });
  return { ok: true, order, subtotalCents, shippingCents };
}
