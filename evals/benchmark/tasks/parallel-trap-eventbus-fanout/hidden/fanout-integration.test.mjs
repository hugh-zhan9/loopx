// Integration tests for the single-slot bus fan-out. All three observers
// (fulfillment history, audit trail, metrics) listen to 'order:placed'; the
// bus keeps exactly one handler per event, so naive per-module bus.on calls
// silently drop every observer registered before the last one. Only a
// composed wiring in src/app.mjs keeps all three alive at once.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.mjs';
import { registerAuditTrail } from '../src/audit.mjs';
import { createBus } from '../src/bus.mjs';
import { registerOrderMetrics } from '../src/metrics.mjs';

test('registerAuditTrail subscribes on the bus it is given', () => {
  const bus = createBus();
  const trail = registerAuditTrail(bus);
  bus.emit('order:placed', { id: 'X-1', total: 9 });
  assert.deepEqual(trail, [{ event: 'order:placed', id: 'X-1' }]);
});

test('registerOrderMetrics subscribes on the bus it is given', () => {
  const bus = createBus();
  const counters = registerOrderMetrics(bus);
  bus.emit('order:placed', { id: 'X-2', total: 5 });
  bus.emit('order:placed', { id: 'X-3', total: 6 });
  assert.deepEqual(counters, { placed: 2 });
});

test('a single emit fans out to history, audit trail, and metrics together', () => {
  const app = createApp();
  app.bus.emit('order:placed', { id: 'A-1', total: 42 });
  app.bus.emit('order:placed', { id: 'A-2', total: 7 });
  assert.deepEqual(app.orders, [
    { id: 'A-1', total: 42 },
    { id: 'A-2', total: 7 },
  ], 'fulfillment history must keep receiving placed orders');
  assert.deepEqual(app.audit, [
    { event: 'order:placed', id: 'A-1' },
    { event: 'order:placed', id: 'A-2' },
  ], 'audit trail must receive every placed order');
  assert.deepEqual(app.metrics, { placed: 2 }, 'metrics must count every placed order');
});

test('unrelated events do not disturb the fan-out', () => {
  const app = createApp();
  app.bus.emit('order:cancelled', { id: 'A-9' });
  app.bus.emit('order:placed', { id: 'A-3', total: 3 });
  assert.equal(app.orders.length, 1);
  assert.equal(app.audit.length, 1);
  assert.equal(app.metrics.placed, 1);
});

test('each app instance observes independently', () => {
  const first = createApp();
  const second = createApp();
  first.bus.emit('order:placed', { id: 'B-1', total: 1 });
  assert.equal(first.metrics.placed, 1);
  assert.equal(second.metrics.placed, 0);
  assert.equal(second.audit.length, 0);
});
