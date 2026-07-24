export function createTimer(now = Date.now) {
  const startedAt = now();
  return {
    elapsedMs() {
      return now() - startedAt;
    },
  };
}
