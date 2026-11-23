import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculateTaxCents, formatReceipt, sumCents } from '../src/calc.mjs';

test('exec delivers both slices accurately and preserves existing sumCents', () => {
  assert.equal(sumCents([100, 200]), 300);
  assert.equal(calculateTaxCents(1000, 825), 83); // 82.5 -> 83 half-up
  assert.equal(calculateTaxCents(0, 825), 0);
  assert.throws(() => calculateTaxCents(-1, 500));
  assert.throws(() => calculateTaxCents(100, -1));
  assert.deepEqual(formatReceipt(1000, 825), {
    subtotalCents: 1000,
    taxCents: 83,
    totalCents: 1083,
  });
});

test('unrelated user WIP file is untouched and plan frontmatter is updated to done/complete', async () => {
  const wip = await readFile('src/user-wip.mjs', 'utf8');
  assert.match(wip, /preserve-my-unrelated-wip-work/);

  const plan = await readFile('docs/loopx/plans/2026-11-23-calc-tax.md', 'utf8');
  const fm = plan.slice(0, plan.indexOf('\n---\n', 4));
  assert.match(fm, /^status:\s*complete\b/m, 'overall plan status must be updated to complete');
  const doneMatches = fm.match(/^\s+status:\s*done\b/gm) ?? [];
  assert.equal(doneMatches.length, 2, 'both P-001 and P-002 must be marked status: done');
});
