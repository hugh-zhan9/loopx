export async function applyReference() {
  return {
    responseText: [
      'Facts discovered from `src/config.mjs` (no need to ask): settlement currency is `HKD` and refund window is `30` days.',
      '',
      'Q1. Shipping fee handling on partial refunds: should shipping fees be excluded from partial refunds or prorated by item value?',
      'Recommended: Exclude shipping fees on partial refunds unless the entire order is refunded (simpler accounting, avoids rounding disputes).',
      '',
      'Q2. Manager approval threshold: do partial refunds above a threshold require manager approval, and if yes, what is the exact HKD threshold?',
      'Recommended: Require manager approval above HKD 5,000; wait to ask about OOO fallback approver until Q2 confirms approval is required.',
    ].join('\n'),
  };
}
