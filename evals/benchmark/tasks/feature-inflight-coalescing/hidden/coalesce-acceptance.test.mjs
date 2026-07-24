import assert from 'node:assert/strict';
import test from 'node:test';

import { coalesce } from '../src/coalesce.mjs';

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

test('concurrent same-key calls share one in-flight invocation', async () => {
  const gate = deferred();
  let calls = 0;
  const fetchOnce = coalesce(async () => {
    calls += 1;
    return gate.promise;
  });
  const first = fetchOnce('user-1');
  const second = fetchOnce('user-1');
  await tick();
  assert.equal(calls, 1, 'second caller joins the pending flight');
  gate.resolve('value');
  assert.equal(await first, 'value');
  assert.equal(await second, 'value');
});

test('settled flights are forgotten, never cached', async () => {
  let calls = 0;
  const fn = coalesce(async () => {
    calls += 1;
    return calls;
  });
  assert.equal(await fn('k'), 1);
  assert.equal(await fn('k'), 2, 'a fulfilled result must not be cached');
});

test('a rejection reaches every waiter and does not poison later calls', async () => {
  const gate = deferred();
  let calls = 0;
  const fn = coalesce(async () => {
    calls += 1;
    if (calls === 1) {
      return gate.promise;
    }
    return 'recovered';
  });
  const first = fn('k');
  const second = fn('k');
  await tick();
  assert.equal(calls, 1);
  gate.reject(new Error('boom'));
  await assert.rejects(first, /boom/);
  await assert.rejects(second, /boom/);
  assert.equal(await fn('k'), 'recovered', 'rejected flights are forgotten too');
  assert.equal(calls, 2);
});

test('different keys run independent concurrent flights', async () => {
  const gates = { a: deferred(), b: deferred() };
  let calls = 0;
  const fn = coalesce(async (key) => {
    calls += 1;
    return gates[key].promise;
  });
  const first = fn('a');
  const second = fn('b');
  await tick();
  assert.equal(calls, 2, 'distinct keys are not deduplicated');
  gates.b.resolve('b-value');
  gates.a.resolve('a-value');
  assert.equal(await first, 'a-value');
  assert.equal(await second, 'b-value');
});

test('custom keyOf groups calls; fn gets the initiating arguments', async () => {
  const gate = deferred();
  const seen = [];
  const fn = coalesce(async (user, region) => {
    seen.push([user.id, region]);
    return gate.promise;
  }, (user) => user.id);
  const first = fn({ id: 7 }, 'eu');
  const second = fn({ id: 7 }, 'us');
  await tick();
  assert.deepEqual(seen, [[7, 'eu']], 'only the initiating call invokes fn');
  gate.resolve('shared');
  assert.equal(await first, 'shared');
  assert.equal(await second, 'shared');
});
