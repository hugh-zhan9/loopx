export class PaymentLedger {
  #payments = new Map();

  charge(orderId, amountCents) {
    if (this.#payments.has(orderId)) {
      throw new Error(`already charged: ${orderId}`);
    }
    this.#payments.set(orderId, { amountCents, refunded: false });
    return { orderId, amountCents };
  }

  refund(orderId) {
    const payment = this.#payments.get(orderId);
    if (!payment) {
      throw new Error(`no payment for order: ${orderId}`);
    }
    if (payment.refunded) {
      throw new Error(`already refunded: ${orderId}`);
    }
    payment.refunded = true;
    return { orderId, amountCents: payment.amountCents };
  }

  charged(orderId) {
    return this.#payments.has(orderId);
  }

  refunded(orderId) {
    return this.#payments.get(orderId)?.refunded === true;
  }
}
