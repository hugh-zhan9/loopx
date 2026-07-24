// Order lifecycle: created -> paid -> shipped -> delivered, with cancellation
// allowed from created and paid. Cancelling must always return the order's
// reserved stock to inventory; cancelling a paid order additionally refunds
// the payment (and only a paid order is ever refunded).
const TRANSITIONS = Object.freeze({
  created: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
});

export class OrderBook {
  #orders = new Map();

  create({ id, reserved = [], totalCents = 0 }) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('order id must be a non-empty string');
    }
    if (this.#orders.has(id)) {
      throw new Error(`duplicate order id: ${id}`);
    }
    const order = { id, status: 'created', reserved, totalCents };
    this.#orders.set(id, order);
    return order;
  }

  get(id) {
    const order = this.#orders.get(id);
    if (!order) {
      throw new RangeError(`unknown order: ${id}`);
    }
    return order;
  }

  #assertTransition(order, next) {
    if (!TRANSITIONS[order.status].includes(next)) {
      throw new Error(`invalid transition: ${order.status} -> ${next}`);
    }
  }

  pay(id, payments) {
    const order = this.get(id);
    this.#assertTransition(order, 'paid');
    payments.charge(order.id, order.totalCents);
    order.status = 'paid';
    return order;
  }

  ship(id) {
    const order = this.get(id);
    this.#assertTransition(order, 'shipped');
    order.status = 'shipped';
    return order;
  }

  deliver(id) {
    const order = this.get(id);
    this.#assertTransition(order, 'delivered');
    order.status = 'delivered';
    return order;
  }

  cancel(id, { inventory, payments }) {
    const order = this.get(id);
    if (order.status !== 'created') {
      payments.refund(order.id);
    }
    this.#assertTransition(order, 'cancelled');
    if (order.status === 'created') {
      inventory.release(order.reserved);
    }
    order.status = 'cancelled';
    return order;
  }
}
