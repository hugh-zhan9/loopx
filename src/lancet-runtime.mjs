import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_CONFIG = {
  enabled: true,
  codexAutoEnable: true,
  stageScopedByDefault: true,
};

const DEFAULT_SESSION = {
  mode: 'on',
  persistent: true,
};

const STAGE_MAP = new Map([
  ['exec', 'implementation'],
  ['subagent-exec', 'implementation'],
  ['fix', 'implementation'],
  ['review', 'review'],
  ['final-review', 'review'],
  ['plan-to-exec', 'planning'],
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function defaultLancetConfig() {
  return cloneJson(DEFAULT_CONFIG);
}

export function resolveLancetPaths(env = process.env) {
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  const root = join(home, '.loopx', 'lancet');
  return {
    root,
    configPath: join(root, 'config.json'),
    sessionPath: join(root, 'session.json'),
  };
}

async function readJson(path, fallback) {
  if (!existsSync(path)) {
    return cloneJson(fallback);
  }

  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return cloneJson(fallback);
  }
}

export async function readLancetConfig(env = process.env) {
  return readJson(resolveLancetPaths(env).configPath, DEFAULT_CONFIG);
}

export async function readLancetSession(env = process.env) {
  return readJson(resolveLancetPaths(env).sessionPath, DEFAULT_SESSION);
}

export async function writeLancetSession({ env = process.env, mode, persistent = true }) {
  const paths = resolveLancetPaths(env);
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.sessionPath, `${JSON.stringify({ mode, persistent }, null, 2)}\n`);
}

export function resolveLancetStage({ skillName }) {
  return STAGE_MAP.get(skillName || '') || null;
}

export function buildLancetGuidance({ stage }) {
  if (stage === 'planning') {
    return 'LANCET ADVISORY: planning stays broad; apply the `lancet` discipline at implementation stage only.';
  }

  if (stage === 'review') {
    return [
      'LANCET REVIEW ACTIVE - canonical contract is `lancet`.',
      '- Check whether repo reuse, stdlib, native platform, or fewer files could replace this implementation.',
      '- Report over-engineering, unnecessary abstractions, avoidable dependencies, and deletable boilerplate.',
      '- Never trade away validation, error handling, security, accessibility, or regression coverage.',
    ].join('\n');
  }

  return [
    'LANCET IMPLEMENTATION ACTIVE - canonical contract is `lancet`.',
    '- Before adding code: can this be skipped, reused from this repo, done with stdlib, native platform, or an already-installed dependency?',
    '- Prefer the smallest correct diff and fewest files.',
    '- Fix root cause, not symptom; keep safety, validation, error handling, accessibility, and one runnable check for non-trivial logic.',
  ].join('\n');
}
