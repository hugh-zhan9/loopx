import assert from 'node:assert/strict';
import test from 'node:test';

import { createQueue } from '../src/queue.mjs';

test('dequeues in FIFO order', () => {
  const queue = createQueue();
  queue.enqueue('a');
  queue.enqueue('b');
  assert.equal(queue.peek(), 'a');
  assert.equal(queue.dequeue(), 'a');
  assert.equal(queue.dequeue(), 'b');
  assert.equal(queue.size, 0);
  assert.throws(() => queue.dequeue(), RangeError);
});
