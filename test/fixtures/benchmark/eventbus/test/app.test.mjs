import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.mjs';
import { createBus } from '../src/bus.mjs';

test('placed orders land in the fulfillment history', () => {
  const app = createApp();
  app.bus.emit('order:placed', { id: 'A-1', total: 42 });
  assert.deepEqual(app.orders, [{ id: 'A-1', total: 42 }]);
});

test('unknown events are ignored', () => {
  const app = createApp();
  app.bus.emit('order:cancelled', { id: 'A-9' });
  assert.deepEqual(app.orders, []);
});

test('re-registering an event replaces the previous handler', () => {
  const bus = createBus();
  const calls = [];
  bus.on('ping', () => calls.push('first'));
  bus.on('ping', () => calls.push('second'));
  bus.emit('ping', {});
  assert.deepEqual(calls, ['second']);
});
