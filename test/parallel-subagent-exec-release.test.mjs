import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');
const compatibilityAliases = [
  'final-review',
  'fix-review',
];
const executionProfiles = ['subagent-exec', 'parallel-subagent-exec'];

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

test('release tarball contains the reviewed execution kernel, profiles, and compatibility aliases', async () => {
  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    maxBuffer: 16 * 1024 * 1024,
  });
  const packaged = new Set(JSON.parse(stdout)[0].files.map(({ path }) => path));
  for (const path of [
    'skills/plan2exec/SKILL.md',
    'skills/plan2exec/references/plan-schema.md',
    'skills/exec/SKILL.md',
    'skills/exec/references/concurrent-execution.md',
    'skills/exec/scripts/adaptive-exec.mjs',
    'skills/exec/scripts/execution-graph.mjs',
    'skills/exec/scripts/execution-profiles.mjs',
    'skills/exec/scripts/git-isolation.mjs',
    'skills/exec/scripts/review-gate.mjs',
    'skills/exec/scripts/reviewed-task-runner.mjs',
    'skills/exec/scripts/run-manifest.mjs',
    'skills/exec/scripts/scheduler.mjs',
    'skills/exec/scripts/worktree-integration.mjs',
    ...executionProfiles.map((profile) => `skills/${profile}/SKILL.md`),
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
    'skills/plan/SKILL.md',
    'skills/plan-to-exec/SKILL.md',
  ]) {
    assert.equal(packaged.has(path), false, `tarball must exclude ${path}`);
  }
});

test('source compatibility aliases stay forwarding-only while execution profiles own bounded payloads', async () => {
  for (const alias of compatibilityAliases) {
    assert.deepEqual(await recursiveFiles(join(repoRoot, 'skills', alias)), [
      `skills/${alias}/SKILL.md`,
    ]);
  }
  const subagentPayload = await recursiveFiles(join(repoRoot, 'skills', 'subagent-exec'));
  assert.equal(subagentPayload.includes('skills/subagent-exec/implementer-prompt.md'), true);
  assert.equal(subagentPayload.includes('skills/subagent-exec/task-reviewer-prompt.md'), true);
  assert.deepEqual(await recursiveFiles(join(repoRoot, 'skills', 'parallel-subagent-exec')), [
    'skills/parallel-subagent-exec/SKILL.md',
  ]);
});
