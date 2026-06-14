import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function pathKind(path) {
  if (!existsSync(path)) {
    return null;
  }
  const info = await stat(path);
  return info.isDirectory() ? 'directory' : 'file';
}

async function candidate(path, label) {
  const kind = await pathKind(path);
  if (!kind) {
    return null;
  }
  return { path: label, kind };
}

async function directoryChildren(root, label) {
  if (!existsSync(root)) {
    return [];
  }
  const info = await stat(root);
  if (!info.isDirectory()) {
    return [];
  }
  const entries = await readdir(root);
  return entries
    .filter((entry) => /\.(md|mdc|txt)$/i.test(entry))
    .sort()
    .map((entry) => ({ path: `${label}/${entry}`, kind: 'file' }));
}

async function discoverAiRules(cwd) {
  const direct = await Promise.all([
    candidate(join(cwd, 'AGENTS.md'), 'AGENTS.md'),
    candidate(join(cwd, 'CLAUDE.md'), 'CLAUDE.md'),
    candidate(join(cwd, '.cursor', 'rules'), '.cursor/rules'),
    candidate(join(cwd, '.github', 'copilot-instructions.md'), '.github/copilot-instructions.md'),
  ]);
  return [
    ...direct.filter(Boolean),
    ...await directoryChildren(join(cwd, '.cursor', 'rules'), '.cursor/rules'),
  ].filter((item, index, items) => items.findIndex((other) => other.path === item.path) === index);
}

async function discoverSpecSources(cwd) {
  const direct = await Promise.all([
    candidate(join(cwd, 'openspec.yaml'), 'openspec.yaml'),
    candidate(join(cwd, 'openspec.yml'), 'openspec.yml'),
    candidate(join(cwd, 'openspec.json'), 'openspec.json'),
    candidate(join(cwd, 'open-spec.yaml'), 'open-spec.yaml'),
    candidate(join(cwd, '.specify'), '.specify'),
    candidate(join(cwd, 'specs'), 'specs'),
    candidate(join(cwd, 'docs', 'changes'), 'docs/changes'),
    candidate(join(cwd, 'docs', 'specs'), 'docs/specs'),
    candidate(join(cwd, 'docs', 'loopx', 'specs'), 'docs/loopx/specs'),
    candidate(join(cwd, 'docs', 'adr'), 'docs/adr'),
    candidate(join(cwd, 'docs', 'rfcs'), 'docs/rfcs'),
  ]);
  return direct.filter(Boolean);
}

function packageRunner(cwd, packageJson) {
  const packageManager = String(packageJson?.packageManager || '');
  if (packageManager.startsWith('pnpm@') || existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (packageManager.startsWith('yarn@') || existsSync(join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  if (packageManager.startsWith('bun@') || existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) {
    return 'bun';
  }
  return 'npm';
}

function runScriptCommand(runner, scriptName) {
  if (runner === 'npm') {
    return scriptName === 'test' ? 'npm test' : `npm run ${scriptName}`;
  }
  return `${runner} ${scriptName}`;
}

function firstScript(scripts, names) {
  return names.find((name) => Object.prototype.hasOwnProperty.call(scripts, name));
}

async function discoverPackageCommands(cwd) {
  const packageJson = await readJsonIfExists(join(cwd, 'package.json'));
  if (!packageJson) {
    return {};
  }
  const runner = packageRunner(cwd, packageJson);
  const scripts = packageJson.scripts || {};
  const install = runner === 'npm' && existsSync(join(cwd, 'package-lock.json'))
    ? 'npm ci'
    : `${runner} install`;
  return {
    install,
    test: scripts.test ? runScriptCommand(runner, 'test') : null,
    lint: scripts.lint ? runScriptCommand(runner, 'lint') : null,
    typecheck: scripts.typecheck ? runScriptCommand(runner, 'typecheck') : null,
    build: scripts.build ? runScriptCommand(runner, 'build') : null,
    e2e: (() => {
      const script = firstScript(scripts, ['test:e2e', 'e2e', 'test:browser', 'playwright']);
      return script ? runScriptCommand(runner, script) : null;
    })(),
  };
}

function compactCommands(commands) {
  return Object.fromEntries(
    ['install', 'test', 'lint', 'typecheck', 'build', 'e2e']
      .map((key) => [key, commands[key] || null]),
  );
}

export async function discoverVerificationCommands(cwd) {
  const packageCommands = await discoverPackageCommands(cwd);
  if (Object.keys(packageCommands).length > 0) {
    return compactCommands(packageCommands);
  }
  if (existsSync(join(cwd, 'go.mod'))) {
    return compactCommands({
      test: 'go test ./...',
      build: 'go build ./...',
    });
  }
  if (existsSync(join(cwd, 'pyproject.toml'))) {
    return compactCommands({
      install: 'pip install -e .',
      test: 'pytest',
    });
  }
  return compactCommands({});
}

export async function inspectProjectConventions(cwd) {
  const [existingAiRules, existingSpecSources, verificationCommands] = await Promise.all([
    discoverAiRules(cwd),
    discoverSpecSources(cwd),
    discoverVerificationCommands(cwd),
  ]);
  return {
    existing_ai_rules: existingAiRules,
    existing_spec_sources: existingSpecSources,
    verification_commands: verificationCommands,
    source_of_truth_policy: 'preserve-existing-project-rules-and-use-loopx-artifacts-only-after-init',
  };
}
