import { createTimer } from './timer.mjs';

// Bridges application code and a rollup: time() records the elapsed duration
// of fn under the given metric name even when fn throws.
export function createCollector(rollup, { now = Date.now } = {}) {
  return {
    async time(name, fn) {
      const timer = createTimer(now);
      try {
        return await fn();
      } finally {
        rollup.add(name, timer.elapsedMs());
      }
    },
    record(name, value) {
      rollup.add(name, value);
    },
  };
}
