// Integration tests for the two sibling commands. They look independent but
// couple through two non-obvious channels: the CSV dialect (export's quoting
// decisions are import's parsing contract — two locally-correct naive
// implementations disagree on commas, quotes, and newlines and fail the
// round-trip), and the double-written shared artifacts (the COMMANDS
// registry and the generated docs/USAGE.md, where a lost update drops one
// command).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COMMANDS, dispatch } from '../src/cli.mjs';
import { exportCsv } from '../src/export.mjs';
import { importCsv } from '../src/import.mjs';
import { renderUsage } from '../src/usage.mjs';

const nasty = [
  { id: 'r-1', name: 'plain', note: '' },
  { id: 'r-2', name: 'comma, inc', note: 'a,b,c' },
  { id: 'r-3', name: 'quote "q"', note: 'she said "hi"' },
  { id: 'r-4', name: 'multi', note: 'line one\nline two' },
  { id: 'r-5', name: ' spaced ', note: '  keep  spaces  ' },
  { id: 'r-6', name: 'mixed "x", y', note: '"quoted, with comma"\nand newline' },
];

test('round-trip preserves every field value exactly', () => {
  assert.deepEqual(importCsv(exportCsv(nasty)), nasty);
});

test('export starts with the agreed header and simple values stay unquoted-readable', () => {
  const csv = exportCsv([{ id: 'r-9', name: 'simple', note: 'ok' }]);
  const lines = csv.split(/\r?\n/);
  assert.equal(lines[0], 'id,name,note');
  assert.deepEqual(importCsv(csv), [{ id: 'r-9', name: 'simple', note: 'ok' }]);
});

test('both commands are registered and dispatch end to end', () => {
  const csv = dispatch('export', nasty);
  assert.deepEqual(dispatch('import', csv), nasty);
  assert.equal(typeof COMMANDS.export.summary, 'string');
  assert.equal(typeof COMMANDS.import.summary, 'string');
});

test('usage docs were regenerated from the full registry', () => {
  const onDisk = readFileSync(new URL('../docs/USAGE.md', import.meta.url), 'utf8');
  assert.equal(onDisk, renderUsage(COMMANDS), 'docs/USAGE.md must match the generator output');
  assert.match(onDisk, /## export/);
  assert.match(onDisk, /## import/);
});
