import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const INSTALLER = [
  "import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';",
  "import { dirname, join } from 'node:path';",
  'const root = process.env.LOOPX_PROJECT_ROOT;',
  'const home = process.env.LOOPX_HOME;',
  "const agentsPath = process.env.LOOPX_CODEX_AGENTS_PATH ?? join(home, '.codex', 'AGENTS.md');",
  "const skillsRoot = process.env.LOOPX_SKILLS_ROOT ?? join(home, '.agents', 'skills');",
  'await mkdir(dirname(agentsPath), { recursive: true });',
  'await mkdir(skillsRoot, { recursive: true });',
  "await writeFile(agentsPath, await readFile(join(root, 'AGENTS.md')));",
  "await cp(join(root, 'skills', 'exec'), join(skillsRoot, 'exec'), { recursive: true });",
  'console.log(JSON.stringify({ ok: true }));',
  '',
].join('\n');

async function git(cwd, args) {
  await execFileAsync('git', args, { cwd });
}

async function writeProductVersion(root, role, version) {
  await writeFile(join(root, 'AGENTS.md'), `# loopx dry-run product (${role})\n`);
  await writeFile(join(root, 'skills', 'exec', 'SKILL.md'), `installed-product: ${role}\n`);
  await writeFile(join(root, 'package.json'), `${JSON.stringify({
    name: 'loopx-benchmark-dry-run-product',
    version,
    type: 'module',
    files: ['AGENTS.md', 'scripts/', 'skills/'],
  }, null, 2)}\n`);
}

// Builds a tiny installable product repository with immutable baseline and
// candidate refs, so `--dry-run` exercises the full ref-packaging install
// path without touching the real loopx working tree.
export async function createBenchmarkVersionProductRepository(root) {
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'skills', 'exec'), { recursive: true });
  await writeFile(join(root, 'scripts', 'install-skills.mjs'), INSTALLER);
  await git(root, ['-c', 'init.defaultBranch=main', 'init', '--quiet']);
  await git(root, ['config', 'user.name', 'loopx eval']);
  await git(root, ['config', 'user.email', 'eval@loopx.invalid']);

  await writeProductVersion(root, 'baseline', '1.0.0');
  await git(root, ['add', '-A']);
  await git(root, ['commit', '--quiet', '-m', 'baseline product']);
  await git(root, ['tag', 'benchmark-baseline']);

  await writeProductVersion(root, 'candidate', '2.0.0');
  await git(root, ['add', '-A']);
  await git(root, ['commit', '--quiet', '-m', 'candidate product']);
  await git(root, ['tag', 'benchmark-candidate']);

  return {
    root,
    versionRefs: { baseline: 'benchmark-baseline', candidate: 'benchmark-candidate' },
  };
}
