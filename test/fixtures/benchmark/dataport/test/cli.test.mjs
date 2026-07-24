import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COMMANDS, dispatch } from '../src/cli.mjs';
import { sampleRecords } from '../src/store.mjs';
import { renderUsage } from '../src/usage.mjs';

test('list prints one line per record', () => {
  assert.equal(dispatch('list', sampleRecords), 'r-1 alpha\nr-2 beta');
});

test('unknown commands are rejected', () => {
  assert.throws(() => dispatch('nope', []), /unknown_command:nope/);
});

test('docs/USAGE.md is generated from the command registry and in sync', () => {
  const onDisk = readFileSync(new URL('../docs/USAGE.md', import.meta.url), 'utf8');
  assert.equal(onDisk, renderUsage(COMMANDS));
});
