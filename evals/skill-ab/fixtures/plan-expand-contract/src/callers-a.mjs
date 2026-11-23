import { createInvoice } from './billing.mjs';

export function billSubscription() { return createInvoice(1900); }
export function billAddon() { return createInvoice(500); }
export function billOverage(units) { return createInvoice(units * 100); }
