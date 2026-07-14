import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');

async function recursiveFiles(root) {
  const files = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files.push(relative(repoRoot, child).split(sep).join('/'));
    }
  }
  await visit(root);
  return files.sort();
}

function numberedIds(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, '0')}`);
}

function coveredIds(text, prefix) {
  const covered = new Set();
  const pattern = new RegExp(`${prefix}-(\\d{3})(?:\`?\\s*-\\s*\`?${prefix}-(\\d{3}))?`, 'g');
  for (const match of text.matchAll(pattern)) {
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    for (let value = start; value <= end; value += 1) {
      covered.add(`${prefix}-${String(value).padStart(3, '0')}`);
    }
  }
  return covered;
}

test('release tarball contains the recursively derived parallel executor surface', async () => {
  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    maxBuffer: 16 * 1024 * 1024,
  });
  const payload = JSON.parse(stdout)[0];
  const packaged = new Set(payload.files.map(({ path }) => path));
  const skillRoot = join(repoRoot, 'skills', 'parallel-subagent-exec');
  const expectedSkillFiles = await recursiveFiles(skillRoot);

  assert.ok(expectedSkillFiles.length >= 15);
  for (const path of expectedSkillFiles) {
    assert.equal(packaged.has(path), true, `tarball missing ${path}`);
  }
  for (const path of [
    'skills/shared/parallel-plan-contract.md',
    'skills/shared/scripts/parallel-plan-contract.mjs',
    'skills/RESOLVER.md',
    'test/fixtures/skill-contract-matrix.json',
  ]) {
    assert.equal(packaged.has(path), true, `tarball missing ${path}`);
  }
});

test('release keeps public CLI and automatic workflow routing unchanged', async () => {
  for (const path of ['src/cli.mjs', 'src/workflow.mjs', 'src/next-skill.mjs']) {
    const text = await readFile(join(repoRoot, path), 'utf8');
    assert.doesNotMatch(text, /parallel-subagent-exec/, `${path} must not route the experimental executor`);
  }
  const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
  const planSchema = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'references', 'plan-schema.md'), 'utf8');
  assert.doesNotMatch(planSkill, /\$parallel-subagent-exec|recommendation:\s*parallel-subagent-exec/i);
  assert.doesNotMatch(planSchema, /\$parallel-subagent-exec|recommendation:\s*parallel-subagent-exec/i);

  const { stdout: runtimeFiles } = await execFileAsync('git', ['ls-files', '.loopx/parallel-subagent-exec/**'], { cwd: repoRoot });
  const { stdout: conservativeDiff } = await execFileAsync('git', ['diff', '--name-only', '--', 'skills/subagent-exec'], { cwd: repoRoot });
  assert.equal(runtimeFiles.trim(), '');
  assert.equal(conservativeDiff.trim(), '');
});

test('release package preserves complete AC D and TC traceability identifiers', async () => {
  const design = await readFile(
    join(repoRoot, 'docs', 'loopx', 'design', '2026-07-14-parallel-subagent-exec', '需求设计文档.md'),
    'utf8',
  );
  const planDir = join(repoRoot, 'docs', 'loopx', 'plans', '2026-07-14-parallel-subagent-exec');
  const planText = (await Promise.all((await readdir(planDir))
    .filter((name) => name.endsWith('.md'))
    .map((name) => readFile(join(planDir, name), 'utf8')))).join('\n');
  const groups = [
    ['AC', numberedIds('AC', 34)],
    ['D', numberedIds('D', 17)],
    ['TC', numberedIds('TC', 29)],
  ];

  for (const [label, ids] of groups) {
    const designCoverage = coveredIds(design, label);
    const planCoverage = coveredIds(planText, label);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.equal(designCoverage.has(id), true, `design missing ${id}`);
      assert.equal(planCoverage.has(id), true, `plans missing ${id}`);
    }
    assert.equal(ids.length, { AC: 34, D: 17, TC: 29 }[label]);
  }
});
