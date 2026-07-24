import { dayKeyUtc, parseIsoUtc } from './clock.mjs';

// Daily revenue rollup over settled order records:
// [{ placedAt: ISO string, totalCents, status }]. Cancelled orders are
// excluded. Returns { 'YYYY-MM-DD': totalCents } with sorted day keys.
export function dailyRevenue(orderRecords) {
  const days = new Map();
  for (const record of orderRecords) {
    if (record.status === 'cancelled') {
      continue;
    }
    const key = dayKeyUtc(parseIsoUtc(record.placedAt));
    days.set(key, (days.get(key) ?? 0) + record.totalCents);
  }
  return Object.fromEntries([...days.entries()].sort(([left], [right]) => (left < right ? -1 : 1)));
}
