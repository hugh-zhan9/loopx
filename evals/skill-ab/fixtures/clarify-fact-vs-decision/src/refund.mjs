import { SETTLEMENT_CONFIG } from './config.mjs';

export function fullRefund(order) {
  return {
    orderId: order.id,
    currency: SETTLEMENT_CONFIG.currency,
    refundCents: order.totalCents,
  };
}
