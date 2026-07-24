import assert from 'node:assert/strict';
import test from 'node:test';

import { createLimiter } from '../src/limit.mjs';

test('never runs more than the limit concurrently', async () => {
  const limiter = createLimiter(2);
  let active = 0;
  let peak = 0;
  const work = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
  };
  await Promise.all(Array.from({ length: 6 }, () => limiter.withPermit(work)));
  assert.equal(peak, 2);
});

test('releases the slot when the task rejects', async () => {
  const limiter = createLimiter(1);
  await assert.rejects(limiter.withPermit(() => Promise.reject(new Error('boom'))), /boom/);
  assert.equal(await limiter.withPermit(async () => 'next'), 'next');
});

test('rejects an invalid limit', () => {
  assert.throws(() => createLimiter(0), RangeError);
});
