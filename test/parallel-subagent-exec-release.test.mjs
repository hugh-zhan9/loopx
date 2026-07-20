import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');
const compatibilityAliases = [
  'plan-to-exec',
  'subagent-exec',
  'parallel-subagent-exec',
  'final-review',
  'fix-review',
];

async function recursiveFiles(root) {
  const files = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name !== '.DS_Store') {
        files.push(relative(repoRoot, child).split(sep).join('/'));
      }
    }
  }
  await visit(root);
  return files.sort();
}

test('release tarball contains the adaptive runtime and alias-only compatibility skills', async () => {
  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    maxBuffer: 16 * 1024 * 1024,
  });
  const packaged = new Set(JSON.parse(stdout)[0].files.map(({ path }) => path));
  for (const path of [
    'skills/exec/SKILL.md',
    'skills/exec/references/concurrent-execution.md',
    'skills/exec/scripts/adaptive-exec.mjs',
    'skills/exec/scripts/git-isolation.mjs',
    'skills/exec/scripts/run-manifest.mjs',
    'skills/exec/scripts/worktree-integration.mjs',
    ...compatibilityAliases.map((alias) => `skills/${alias}/SKILL.md`),
  ]) {
    assert.equal(packaged.has(path), true, `tarball missing ${path}`);
  }
  for (const path of packaged) {
    if (compatibilityAliases.some((alias) => path.startsWith(`skills/${alias}/`))) {
      assert.match(path, new RegExp(`^skills/(?:${compatibilityAliases.join('|')})/SKILL\\.md$`));
    }
  }
  for (const path of [
    'src/codex-exec-runtime.mjs',
    'src/finish-runtime.mjs',
    'skills/shared/parallel-plan-contract.md',
    'skills/shared/scripts/parallel-plan-contract.mjs',
  ]) {
    assert.equal(packaged.has(path), false, `tarball must exclude ${path}`);
  }
});

test('source compatibility aliases contain only forwarding skills', async () => {
  for (const alias of compatibilityAliases) {
    assert.deepEqual(await recursiveFiles(join(repoRoot, 'skills', alias)), [
      `skills/${alias}/SKILL.md`,
    ]);
  }
});
