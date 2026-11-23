// Existing exporter pipeline with pluggable format registry.
// New export formats should register here instead of creating a parallel export entrypoint.

const EXPORTERS = new Map();

export function registerExporter(format, fn) {
  EXPORTERS.set(format, fn);
}

export function listFormats() {
  return [...EXPORTERS.keys()].sort();
}

export function exportReport(format, records) {
  const exporter = EXPORTERS.get(format);
  if (!exporter) {
    throw new Error(`unsupported export format: ${format}`);
  }
  return exporter(records);
}

registerExporter('json', (records) => JSON.stringify(records));
registerExporter('csv', (records) => {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]);
  return [headers.join(','), ...records.map((r) => headers.map((h) => String(r[h] ?? '')).join(','))].join('\n');
});
