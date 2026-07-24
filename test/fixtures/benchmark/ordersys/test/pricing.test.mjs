import assert from 'node:assert/strict';
import test from 'node:test';

import { Catalog } from '../src/catalog.mjs';
import { createPricingEngine } from '../src/pricing.mjs';

function buildCatalog() {
  const catalog = new Catalog();
  catalog.add({ id: 'widget', name: 'Widget', unitCents: 1000, weightGrams: 500, tiers: [{ minQuantity: 10, fraction: 0.2 }] });
  catalog.add({ id: 'bolt', name: 'Bolt', unitCents: 50, weightGrams: 10, tiers: [{ minQuantity: 100, fraction: 0.5 }] });
  return catalog;
}

test('prices below the discount tier use the list price', () => {
  const pricing = createPricingEngine(buildCatalog());
  assert.equal(pricing.unitPriceCents('widget', 1), 1000);
});

test('bulk quantities get the tier discount', () => {
  const pricing = createPricingEngine(buildCatalog());
  assert.equal(pricing.unitPriceCents('bolt', 100), 25);
});

test('crossing a discount tier in the same session reprices', () => {
  const pricing = createPricingEngine(buildCatalog());
  assert.equal(pricing.unitPriceCents('widget', 1), 1000);
  assert.equal(pricing.unitPriceCents('widget', 10), 800);
  assert.equal(pricing.unitPriceCents('widget', 1), 1000);
});

test('memoizes catalog lookups for repeated identical requests', () => {
  const catalog = buildCatalog();
  let lookups = 0;
  const counting = {
    get(productId) {
      lookups += 1;
      return catalog.get(productId);
    },
  };
  const pricing = createPricingEngine(counting);
  pricing.unitPriceCents('widget', 3);
  const afterFirst = lookups;
  pricing.unitPriceCents('widget', 3);
  assert.equal(lookups, afterFirst, 'second identical request is served from the cache');
});

test('catalog edits published before pricing are reflected after invalidate', () => {
  const catalog = buildCatalog();
  const pricing = createPricingEngine(catalog);
  catalog.add({ id: 'widget', name: 'Widget', unitCents: 1200, weightGrams: 500, tiers: [{ minQuantity: 10, fraction: 0.2 }] });
  pricing.invalidate('widget');
  assert.equal(pricing.unitPriceCents('widget', 1), 1200);
});
