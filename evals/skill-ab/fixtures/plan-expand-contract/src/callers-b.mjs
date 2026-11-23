import { createInvoice } from './billing.mjs';

export function billOneTime(cents) { return createInvoice(cents); }
export function billRenewal() { return createInvoice(2900); }
export function billCreditNote() { return createInvoice(0); }
