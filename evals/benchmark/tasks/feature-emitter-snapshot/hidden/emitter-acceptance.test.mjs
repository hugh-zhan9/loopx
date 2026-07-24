import assert from 'node:assert/strict';
import test from 'node:test';

import { Emitter } from '../src/events.mjs';

test('once fires exactly once, even under reentrant emits', () => {
  const emitter = new Emitter();
  const calls = [];
  emitter.once('ping', (payload) => {
    calls.push(payload);
    emitter.emit('ping', 'reentrant');
  });
  emitter.emit('ping', 'first');
  emitter.emit('ping', 'second');
  assert.deepEqual(calls, ['first'], 'the once handler is removed before it runs');
});

test('off with the original handler cancels a pending once', () => {
  const emitter = new Emitter();
  const calls = [];
  const handler = () => calls.push('never');
  emitter.once('tick', handler);
  emitter.off('tick', handler);
  emitter.emit('tick');
  assert.deepEqual(calls, []);
});

test('handlers added during an emit run only on later emits', () => {
  const emitter = new Emitter();
  const calls = [];
  const late = () => calls.push('late');
  emitter.on('tick', () => {
    calls.push('early');
    emitter.on('tick', late);
  });
  emitter.emit('tick');
  assert.deepEqual(calls, ['early'], 'the handler added mid-emit does not run this emit');
  emitter.emit('tick');
  assert.deepEqual(calls, ['early', 'early', 'late']);
});

test('handlers removed during an emit still run for that emit', () => {
  const emitter = new Emitter();
  const calls = [];
  const second = () => calls.push('second');
  emitter.on('tick', () => {
    calls.push('first');
    emitter.off('tick', second);
  });
  emitter.on('tick', second);
  assert.equal(emitter.emit('tick'), 2, 'both snapshotted handlers are invoked');
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(emitter.emit('tick'), 1, 'the removal takes effect on the next emit');
  assert.deepEqual(calls, ['first', 'second', 'first']);
});

test('emit keeps returning the invoked count and the base API is intact', () => {
  const emitter = new Emitter();
  const seen = [];
  emitter.on('job', (payload) => seen.push(payload));
  emitter.once('job', (payload) => seen.push(`once:${payload}`));
  assert.equal(emitter.emit('job', 'a'), 2);
  assert.equal(emitter.emit('job', 'b'), 1);
  assert.deepEqual(seen, ['a', 'once:a', 'b']);
  assert.equal(emitter.emit('unknown'), 0);
  assert.throws(() => emitter.on('job', 'nope'), TypeError);
});
