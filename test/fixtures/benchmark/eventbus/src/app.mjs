import { createBus } from './bus.mjs';
import { registerOrderTracking } from './orders.mjs';

// Application wiring: every module that reacts to bus events is composed here.
export function createApp() {
  const bus = createBus();
  const orders = registerOrderTracking(bus);
  return { bus, orders };
}
