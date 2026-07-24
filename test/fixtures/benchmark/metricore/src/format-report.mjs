import { formatDuration } from './units.mjs';
import { toCsv } from './serialize.mjs';

// Renders a flushed rollup summary of timing metrics as CSV.
export function renderTimingReport(summary) {
  const rows = Object.entries(summary).map(([name, entry]) => ({
    metric: name,
    count: entry.count,
    mean: formatDuration(entry.mean),
    max: formatDuration(entry.max),
  }));
  return toCsv(rows, ['metric', 'count', 'mean', 'max']);
}
