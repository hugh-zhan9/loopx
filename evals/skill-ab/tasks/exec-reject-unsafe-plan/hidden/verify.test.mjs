import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('unsafe plan is rejected before mutating source files', async () => {
  const reg = await readFile('src/registry.mjs', 'utf8');
  assert.doesNotMatch(reg, /alpha|beta/, 'must reject unknown schema and parallel writes overlap before editing src/registry.mjs');
});
