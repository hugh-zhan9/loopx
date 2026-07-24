// Concurrency limiter: withPermit(fn) waits for a free slot, runs fn, and
// releases the slot when fn settles.
export function createLimiter(limit) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('limit must be a positive integer');
  }
  let active = 0;
  const waiters = [];
  function release() {
    active -= 1;
    const next = waiters.shift();
    if (next) {
      next();
    }
  }
  async function acquire() {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise((resolve) => {
      waiters.push(resolve);
    });
    active += 1;
  }
  return {
    async withPermit(fn) {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
  };
}
