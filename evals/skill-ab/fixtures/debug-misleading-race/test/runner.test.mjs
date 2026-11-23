import assert from 'node:assert/strict';
import test from 'node:test';
import { JobRunner } from '../src/runner.mjs';

test('runs a normal job to completion', async () => {
  const runner = new JobRunner();
  runner.enqueue('j1');
  const job = await runner.run('j1', async () => 'ok');
  assert.equal(job.status, 'completed');
  assert.deepEqual(runner.finalized, ['j1']);
});

test('cancels a pending job before run', () => {
  const runner = new JobRunner();
  runner.enqueue('j2');
  const job = runner.cancel('j2');
  assert.equal(job.status, 'cancelled');
});
