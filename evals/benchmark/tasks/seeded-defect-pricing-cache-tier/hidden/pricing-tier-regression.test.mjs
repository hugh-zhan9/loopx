import assert from 'node:assert/strict';
import test from 'node:test';

import { Catalog } from '../src/catalog.mjs';
import { createPricingEngine } from '../src/pricing.mjs';

function widget(unitCents) {
  return {
    id: 'widget',
    name: 'Widget',
    unitCents,
    weightGrams: 500,
    tiers: [{ minQuantity: 10, fraction: 0.2 }],
  };
}

function bolt(unitCents) {
  return { id: 'bolt', name: 'Bolt', unitCents, weightGrams: 10, tiers: [] };
}

function countingWorld() {
  const catalog = new Catalog();
  catalog.add(widget(1000));
  catalog.add(bolt(50));
  let lookups = 0;
  return {
    catalog,
    counting: {
      get(productId) {
        lookups += 1;
        return catalog.get(productId);
      },
    },
    lookups: () => lookups,
  };
}

test('invalidate flushes every cached quantity of the edited product', () => {
  const catalog = new Catalog();
  catalog.add(widget(1000));
  const pricing = createPricingEngine(catalog);
  assert.equal(pricing.unitPriceCents('widget', 1), 1000);
  assert.equal(pricing.unitPriceCents('widget', 20), 800);
  catalog.add(widget(500));
  pricing.invalidate('widget');
  assert.equal(pricing.unitPriceCents('widget', 1), 500, 'list price picks up the catalog edit');
  assert.equal(pricing.unitPriceCents('widget', 20), 400, 'tiered price picks up the catalog edit');
});

test('invalidate is scoped: other products stay cached', () => {
  const world = countingWorld();
  const pricing = createPricingEngine(world.counting);
  pricing.unitPriceCents('widget', 2);
  pricing.unitPriceCents('bolt', 3);
  const beforeInvalidate = world.lookups();
  pricing.invalidate('widget');
  pricing.unitPriceCents('bolt', 3);
  assert.equal(world.lookups(), beforeInvalidate, 'bolt must still be served from the cache after invalidate(widget)');
  pricing.unitPriceCents('widget', 2);
  assert.equal(world.lookups(), beforeInvalidate + 1, 'widget is recomputed exactly once after invalidation');
});

test('repeated identical requests never re-read the catalog', () => {
  const world = countingWorld();
  const pricing = createPricingEngine(world.counting);
  pricing.unitPriceCents('widget', 12);
  const afterFirst = world.lookups();
  pricing.unitPriceCents('widget', 12);
  pricing.unitPriceCents('widget', 12);
  assert.equal(world.lookups(), afterFirst, 'identical requests are memoized');
});

test('tier discounts keep working across boundaries in both directions', () => {
  const catalog = new Catalog();
  catalog.add(widget(1000));
  const pricing = createPricingEngine(catalog);
  assert.equal(pricing.unitPriceCents('widget', 1), 1000);
  assert.equal(pricing.unitPriceCents('widget', 10), 800);
  assert.equal(pricing.unitPriceCents('widget', 9), 1000);
  assert.equal(pricing.unitPriceCents('widget', 10), 800);
});
