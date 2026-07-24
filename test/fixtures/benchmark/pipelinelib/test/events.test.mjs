import assert from 'node:assert/strict';
import test from 'node:test';

import { Emitter } from '../src/events.mjs';

test('delivers payloads to registered handlers', () => {
  const emitter = new Emitter();
  const seen = [];
  emitter.on('job', (payload) => seen.push(payload));
  assert.equal(emitter.emit('job', 'a'), 1);
  assert.equal(emitter.emit('job', 'b'), 1);
  assert.deepEqual(seen, ['a', 'b']);
});

test('off removes a handler; unknown events emit to nobody', () => {
  const emitter = new Emitter();
  const handler = () => {
    throw new Error('should not run');
  };
  emitter.on('job', handler);
  emitter.off('job', handler);
  assert.equal(emitter.emit('job', 'x'), 0);
  assert.equal(emitter.emit('unknown', 'x'), 0);
  assert.equal(emitter.listenerCount('job'), 0);
});

test('rejects non-function handlers', () => {
  const emitter = new Emitter();
  assert.throws(() => emitter.on('job', 'nope'), TypeError);
});
