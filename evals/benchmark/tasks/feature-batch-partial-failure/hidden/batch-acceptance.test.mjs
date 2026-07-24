import assert from 'node:assert/strict';
import test from 'node:test';

import { runBatch } from '../src/batch.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('failure stops new starts; in-flight tasks finish and are recorded', async () => {
  const gates = [deferred(), deferred()];
  const started = [];
  const tasks = [
    () => { started.push(0); return gates[0].promise; },
    () => { started.push(1); return gates[1].promise; },
    () => { started.push(2); return Promise.resolve('never started'); },
    () => { started.push(3); return Promise.resolve('never started'); },
  ];
  const reportPromise = runBatch(tasks, { concurrency: 2 });
  await tick();
  assert.deepEqual(started, [0, 1], 'concurrency 2 starts exactly two tasks');
  gates[0].reject(new Error('t0 failed'));
  await tick();
  await tick();
  assert.deepEqual(started, [0, 1], 'no new task starts after a failure');
  gates[1].resolve('t1 value');
  const report = await reportPromise;
  assert.deepEqual(report.completed, [{ index: 1, value: 't1 value' }], 'in-flight success is recorded');
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].index, 0);
  assert.match(report.failed[0].error.message, /t0 failed/);
  assert.deepEqual(report.skipped, [2, 3]);
});

test('respects the concurrency window and records everything on success', async () => {
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 6 }, (_, index) => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await tick();
    await tick();
    active -= 1;
    return index * 10;
  });
  const report = await runBatch(tasks, { concurrency: 2 });
  assert.equal(peak, 2, 'never more than `concurrency` in flight');
  assert.deepEqual(report.completed.map((entry) => entry.index), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(report.completed.map((entry) => entry.value), [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(report.failed, []);
  assert.deepEqual(report.skipped, []);
});

test('outcomes are ordered by index even when settlement order differs', async () => {
  const slow = deferred();
  const tasks = [
    () => slow.promise,
    async () => 'fast',
  ];
  const reportPromise = runBatch(tasks, { concurrency: 2 });
  await tick();
  slow.resolve('slow');
  const report = await reportPromise;
  assert.deepEqual(report.completed, [
    { index: 0, value: 'slow' },
    { index: 1, value: 'fast' },
  ]);
});

test('a synchronous throw inside a task is that task failing, not the batch call', async () => {
  const report = await runBatch([
    () => { throw new Error('sync boom'); },
    () => 'unreached',
  ], { concurrency: 1 });
  assert.equal(report.completed.length, 0);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].index, 0);
  assert.match(report.failed[0].error.message, /sync boom/);
  assert.deepEqual(report.skipped, [1]);
});

test('multiple in-flight failures are all recorded', async () => {
  const gates = [deferred(), deferred()];
  const tasks = [
    () => gates[0].promise,
    () => gates[1].promise,
    () => 'unreached',
  ];
  const reportPromise = runBatch(tasks, { concurrency: 2 });
  await tick();
  gates[0].reject(new Error('first'));
  gates[1].reject(new Error('second'));
  const report = await reportPromise;
  assert.deepEqual(report.failed.map((entry) => entry.index), [0, 1]);
  assert.deepEqual(report.skipped, [2]);
});

test('validation throws synchronously before starting anything', () => {
  assert.throws(() => runBatch('nope'), TypeError);
  assert.throws(() => runBatch([() => 1, 'not a function']), TypeError);
  assert.throws(() => runBatch([() => 1], { concurrency: 0 }), RangeError);
  assert.throws(() => runBatch([() => 1], { concurrency: 1.5 }), RangeError);
});

test('an empty batch resolves with an empty report', async () => {
  assert.deepEqual(await runBatch([], { concurrency: 3 }), { completed: [], failed: [], skipped: [] });
});
