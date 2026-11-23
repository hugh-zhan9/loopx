import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await mkdir(join(repoDir, 'docs/loopx/plans'), { recursive: true });
  await writeFile(join(repoDir, 'docs/loopx/plans/2026-11-23-invoice-currency.md'), '# Plan\nExpand-contract.\n');
  await writeFile(join(repoDir, 'src/billing.mjs'), `const ALLOWED_CURRENCIES = new Set(['USD', 'EUR', 'HKD']);

export function createInvoice(input) {
  const { amountCents, currency = 'USD' } = typeof input === 'number'
    ? { amountCents: input, currency: 'USD' }
    : (input ?? {});
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('invalid amountCents');
  }
  if (!ALLOWED_CURRENCIES.has(currency)) {
    throw new Error(\`unsupported currency: \${currency}\`);
  }
  return { amountCents, currency };
}
`);
  await writeFile(join(repoDir, 'src/callers-a.mjs'), `import { createInvoice } from './billing.mjs';

export function billSubscription() { return createInvoice({ amountCents: 1900 }); }
export function billAddon() { return createInvoice({ amountCents: 500 }); }
export function billOverage(units) { return createInvoice({ amountCents: units * 100 }); }
`);
  await writeFile(join(repoDir, 'src/callers-b.mjs'), `import { createInvoice } from './billing.mjs';

export function billOneTime(cents) { return createInvoice({ amountCents: cents }); }
export function billRenewal() { return createInvoice({ amountCents: 2900 }); }
export function billCreditNote() { return createInvoice({ amountCents: 0 }); }
`);
}
