// Order tracking: keeps the fulfillment history consumed by the ops tooling.
export function registerOrderTracking(bus, history = []) {
  bus.on('order:placed', (order) => {
    history.push({ id: order.id, total: order.total });
  });
  return history;
}
