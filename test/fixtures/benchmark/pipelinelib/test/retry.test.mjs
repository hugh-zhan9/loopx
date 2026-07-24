import assert from 'node:assert/strict';
import test from 'node:test';

import { withRetry } from '../src/retry.mjs';

test('retries until success within the attempt budget', async () => {
  let calls = 0;
  const value = await withRetry(async () => {
    calls += 1;
    if (calls < 3) {
      throw new Error('flaky');
    }
    return 'ok';
  }, { attempts: 5 });
  assert.equal(value, 'ok');
  assert.equal(calls, 3);
});

test('throws the last error when attempts are exhausted', async () => {
  await assert.rejects(withRetry(async () => {
    throw new Error('always');
  }, { attempts: 2 }), /always/);
  await assert.rejects(withRetry(async () => 'x', { attempts: 0 }), RangeError);
});
