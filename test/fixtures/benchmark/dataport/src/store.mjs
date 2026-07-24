// Canonical record shape used across the CLI: { id, name, note } with
// string values.
export const sampleRecords = [
  { id: 'r-1', name: 'alpha', note: 'first' },
  { id: 'r-2', name: 'beta', note: 'second' },
];

export function listRecords(records) {
  return records.map((record) => `${record.id} ${record.name}`).join('\n');
}
