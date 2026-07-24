import assert from 'node:assert/strict';
import test from 'node:test';

import { renderTimingReport } from '../src/format-report.mjs';

test('renders a timing summary as CSV', () => {
  const csv = renderTimingReport({
    'db.query': { count: 2, total: 3000, mean: 1500, min: 1000, max: 2000 },
  });
  assert.equal(csv, 'metric,count,mean,max\r\ndb.query,2,1.5s,2s\r\n');
});
