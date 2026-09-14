export function settlementReport(rows) {
  const result = [];
  for (const row of rows) {
    const name = String(row.name);
    const amount = Number(row.amount);
    const currency = row.currency || 'USD';
    const label = name.trim();
    const value = amount.toFixed(2);
    const formatted = [label, value, currency].join(',');
    result.push(formatted);
  }
  return result;
}
