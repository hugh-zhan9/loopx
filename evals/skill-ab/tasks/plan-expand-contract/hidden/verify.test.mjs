import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createInvoice } from '../src/billing.mjs';
import { billAddon, billOverage, billSubscription } from '../src/callers-a.mjs';
import { billCreditNote, billOneTime, billRenewal } from '../src/callers-b.mjs';

test('object signature and currency validation work, and legacy numeric callers still work', () => {
  assert.deepEqual(createInvoice({ amountCents: 1200, currency: 'HKD' }), { amountCents: 1200, currency: 'HKD' });
  assert.deepEqual(createInvoice({ amountCents: 500 }), { amountCents: 500, currency: 'USD' });
  assert.deepEqual(createInvoice(800), { amountCents: 800, currency: 'USD' });
  assert.throws(() => createInvoice({ amountCents: 100, currency: 'BTC' }));
  assert.throws(() => createInvoice({ amountCents: -1, currency: 'USD' }));
});

test('all internal callers migrated to object signature and remain functional', async () => {
  assert.deepEqual(billSubscription(), { amountCents: 1900, currency: 'USD' });
  assert.deepEqual(billAddon(), { amountCents: 500, currency: 'USD' });
  assert.deepEqual(billOverage(3), { amountCents: 300, currency: 'USD' });
  assert.deepEqual(billOneTime(450), { amountCents: 450, currency: 'USD' });
  assert.deepEqual(billRenewal(), { amountCents: 2900, currency: 'USD' });
  assert.deepEqual(billCreditNote(), { amountCents: 0, currency: 'USD' });

  const [a, b] = await Promise.all([
    readFile('src/callers-a.mjs', 'utf8'),
    readFile('src/callers-b.mjs', 'utf8'),
  ]);
  assert.match(a, /createInvoice\(\{\s*amountCents/);
  assert.match(b, /createInvoice\(\{\s*amountCents/);
});
