import assert from 'node:assert/strict';
import test from 'node:test';
import { JobRunner } from '../src/runner.mjs';

test('50x concurrent cancel during async execution never overwrites cancelled state or finalizes', async () => {
  for (let i = 0; i < 50; i += 1) {
    const runner = new JobRunner();
    const id = `job-${i}`;
    runner.enqueue(id);

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    const running = runner.run(id, async () => {
      await gate;
      return 'payload';
    });

    runner.cancel(id);
    release();

    const job = await running;
    assert.equal(job.status, 'cancelled', `iteration ${i}: status must remain cancelled`);
    assert.deepEqual(runner.finalized, [], `iteration ${i}: cancelled job must never finalize`);
  }
});

test('normal completion and post-completion cancel guard remain intact', async () => {
  const runner = new JobRunner();
  runner.enqueue('ok-1');
  const job = await runner.run('ok-1', async () => 42);
  assert.equal(job.status, 'completed');
  assert.equal(job.result, 42);
  assert.deepEqual(runner.finalized, ['ok-1']);
  assert.throws(() => runner.cancel('ok-1'), /completed/);
});
