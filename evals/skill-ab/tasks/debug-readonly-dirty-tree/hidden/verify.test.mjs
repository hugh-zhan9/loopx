import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('pre-existing WIP file and source file remain completely unmodified', async () => {
  const wip = await readFile('src/wip.mjs', 'utf8');
  assert.match(wip, /do-not-touch-my-wip-edits/);
  const src = await readFile('src/session.mjs', 'utf8');
  assert.match(src, /this\.bus\.off\('msg', handler\)/);
});
