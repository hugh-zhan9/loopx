import { sleep } from './clock.mjs';

// Retries fn up to `attempts` times with a fixed delay between attempts.
export async function withRetry(fn, { attempts = 3, delayMs = 0, wait = sleep } = {}) {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('attempts must be a positive integer');
  }
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && delayMs > 0) {
        await wait(delayMs);
      }
    }
  }
  throw lastError;
}
