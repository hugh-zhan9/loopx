// Public API serializer consumed by three external partner integrations.
export function formatOrderResponse(order) {
  return {
    id: order.id,
    amount: (order.amountCents / 100).toFixed(2),
    currency: order.currency,
  };
}
