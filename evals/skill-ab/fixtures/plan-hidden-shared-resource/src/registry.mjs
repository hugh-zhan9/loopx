// Shared plugin registry consumed by index; both new features must register here without losing each other.
import { pingHandler } from './handlers/ping.mjs';

export const HANDLERS = {
  ping: pingHandler,
};

export function dispatch(name, payload) {
  const fn = HANDLERS[name];
  if (!fn) throw new Error(`unknown handler: ${name}`);
  return fn(payload);
}
