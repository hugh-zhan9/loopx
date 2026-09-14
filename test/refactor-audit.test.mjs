import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const scanner = join(root, 'skills/refactor-plan/scripts/audit_codebase.py');

test('the relocated audit scanner includes ESM/CommonJS sources and excludes vendor output', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'loopx-audit-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const code = `function formatRows(rows) {
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
`;
  for (const path of ['first.mjs', 'second.cjs', 'vendor/copied.js', 'dist/generated.js']) {
    await mkdir(dirname(join(fixture, path)), { recursive: true });
    await writeFile(join(fixture, path), code);
  }
  const { stdout } = await exec('python3', [scanner, '--root', fixture, '--format', 'json']);
  const report = JSON.parse(stdout);
  assert.equal(report.inventory.source_files, 2);
  assert.deepEqual(report.inventory.languages, { JavaScript: 2 });
  assert.ok(report.duplicate_blocks.length > 0, 'identical source functions should be candidates');
  const paths = new Set(report.duplicate_blocks.flatMap((block) => block.occurrences.map((item) => item.path)));
  assert.deepEqual([...paths].sort(), ['first.mjs', 'second.cjs']);
  for (const path of ['first.mjs', 'second.cjs', 'vendor/copied.js', 'dist/generated.js']) {
    assert.equal(await readFile(join(fixture, path), 'utf8'), code, 'audit must not rewrite inputs');
  }
});
