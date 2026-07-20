import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
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
      else if (entry.isFile() && entry.name !== '.DS_Store') {
        files.push(relative(repoRoot, child).split(sep).join('/'));
      }
    }
  }
  await visit(root);
  return files.sort();
}

test('release tarball contains the thin adaptive runtime and alias-only legacy skills', async () => {
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
    'skills/subagent-exec/SKILL.md',
    'skills/parallel-subagent-exec/SKILL.md',
  ]) {
    assert.equal(packaged.has(path), true, `tarball missing ${path}`);
  }
  for (const path of packaged) {
    if (path.startsWith('skills/subagent-exec/') || path.startsWith('skills/parallel-subagent-exec/')) {
      assert.match(path, /^skills\/(?:subagent-exec|parallel-subagent-exec)\/SKILL\.md$/);
    }
  }
});

test('source tree contains no legacy execution payload outside compatibility aliases', async () => {
  assert.deepEqual(await recursiveFiles(join(repoRoot, 'skills', 'subagent-exec')), [
    'skills/subagent-exec/SKILL.md',
  ]);
  assert.deepEqual(await recursiveFiles(join(repoRoot, 'skills', 'parallel-subagent-exec')), [
    'skills/parallel-subagent-exec/SKILL.md',
  ]);
});
