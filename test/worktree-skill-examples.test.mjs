import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const skill = await readFile(new URL('../skills/using-git-worktrees/SKILL.md', import.meta.url), 'utf8');
const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
function example(command) {
  const block = blocks.find((text) => text.includes(command));
  assert.ok(block, `missing runnable example: ${command}`);
  return block;
}

async function repository(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'loopx worktree examples '));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const args of [
    ['init', '-q'],
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  return cwd;
}

for (const shell of ['bash', 'zsh']) {
  const available = !spawnSync(shell, ['--version']).error;
  test(`${shell}: ignore check rejects an unignored chosen directory even if another is ignored`, { skip: !available }, async (t) => {
    const cwd = await repository(t);
    await writeFile(join(cwd, '.gitignore'), 'worktrees/\n');
    await mkdir(join(cwd, 'worktrees'));
    const result = spawnSync(shell, ['-c', example('git check-ignore')], {
      cwd, encoding: 'utf8', env: { ...process.env, LOCATION: '.worktrees' },
    });
    assert.notEqual(result.status, 0, 'the selected .worktrees directory must be rejected');
  });

  test(`${shell}: worktree examples create a usable checkout at an ignored path containing spaces`, { skip: !available }, async (t) => {
    const cwd = await repository(t);
    await writeFile(join(cwd, '.gitignore'), 'work trees/\n');
    const result = spawnSync(shell, ['-c', [
      example('git check-ignore'),
      example('git worktree add'),
      'git branch --show-current',
      'git rev-parse --show-toplevel',
    ].join('\n')], {
      cwd, encoding: 'utf8',
      env: { ...process.env, LOCATION: 'work trees', BRANCH_NAME: 'skill-example' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /skill-example/);
    assert.ok(result.stdout.includes('/work trees/skill-example'));
    const detected = spawnSync(shell, ['-c', example('git rev-parse --git-dir')], {
      cwd: join(cwd, 'work trees', 'skill-example'), encoding: 'utf8',
    });
    assert.equal(detected.status, 0, detected.stderr);
    assert.match(detected.stdout, /linked/);
  });
}
