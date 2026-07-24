import assert from 'node:assert/strict';
import test from 'node:test';

import { createCollector } from '../src/collect.mjs';
import { createRollup } from '../src/rollup.mjs';
import { createTimer } from '../src/timer.mjs';

test('timer measures with an injectable clock', () => {
  let tick = 100;
  const timer = createTimer(() => tick);
  tick = 350;
  assert.equal(timer.elapsedMs(), 250);
});

test('collector records elapsed time even when fn throws', async () => {
  let tick = 0;
  const rollup = createRollup();
  const collector = createCollector(rollup, { now: () => (tick += 50) });
  await assert.rejects(collector.time('job', async () => {
    throw new Error('boom');
  }), /boom/);
  collector.record('job', 5);
  const { summary } = rollup.flush();
  assert.equal(summary.job.count, 2);
});
