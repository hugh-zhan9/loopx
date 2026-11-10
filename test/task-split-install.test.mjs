import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { installSkillsForTargets, LOOPX_CANONICAL_WORKFLOW_SKILLS } from '../src/install-discovery.mjs';

const root = resolve(import.meta.dirname, '..');
const exec = promisify(execFile);

test('task split installs with its scope/handoff references on both hosts and preserves local edits', async (t) => {
  assert.ok(LOOPX_CANONICAL_WORKFLOW_SKILLS.includes('task-split'));
  const home = await mkdtemp(join(tmpdir(), 'loopx-task-split-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const env = { ...process.env, LOOPX_HOME: home,
    LOOPX_AGENTS_ROOT: join(home, '.agents'), LOOPX_SKILLS_ROOT: join(home, '.agents/skills'),
    LOOPX_CLAUDE_SKILLS_ROOT: join(home, '.claude/skills'),
    LOOPX_SKILL_LOCK_PATH: join(home, '.agents/.skill-lock.json'),
    LOOPX_TEMPLATE_BASELINE_PATH: join(home, '.loopx/template-hashes.json'), LOOPX_PROJECT_ROOT: root };
  const installed = await installSkillsForTargets(env, { targets: ['codex', 'claude'] });
  assert.equal(installed.ok, true);
  for (const host of ['.agents', '.claude']) {
    for (const file of ['task-split/SKILL.md', 'task-split/references/task-documents.md', 'shared/task-scope.md']) {
      assert.equal(await readFile(join(home, host, 'skills', file), 'utf8'),
        await readFile(join(root, 'skills', file), 'utf8'));
    }
    const custom = join(home, host, 'skills/task-split/SKILL.md');
    await writeFile(custom, `${await readFile(custom, 'utf8')}\nUser-specific task boundaries.\n`);
  }
  await installSkillsForTargets(env, { targets: ['codex', 'claude'] });
  for (const host of ['.agents', '.claude']) {
    assert.match(await readFile(join(home, host, 'skills/task-split/SKILL.md'), 'utf8'), /User-specific task boundaries/);
  }
});

test('published package includes task splitting and every shared scope consumer dependency', async () => {
  const { stdout } = await exec('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root });
  const paths = new Set(JSON.parse(stdout)[0].files.map(({ path }) => path));
  for (const path of ['skills/task-split/SKILL.md', 'skills/task-split/references/task-documents.md',
    'skills/shared/task-scope.md', 'skills/exec/references/recovery.md']) {
    assert.ok(paths.has(path), `Missing packaged dependency: ${path}`);
  }
});
