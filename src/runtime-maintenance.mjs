import { mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { inspectInstallState, verifyInstallState } from './install-discovery.mjs';

export function resolveLoopXRoot(cwd) {
  return join(resolve(cwd), '.LoopX');
}

export function resolveLegacyRoot(cwd) {
  return join(resolve(cwd), '.codex-helper');
}

export async function ensureLoopXRoot(cwd) {
  const root = resolveLoopXRoot(cwd);
  await mkdir(root, { recursive: true });
  return root;
}

export async function migrateLegacyRuntime(cwd) {
  const legacyRoot = resolveLegacyRoot(cwd);
  const loopxRoot = resolveLoopXRoot(cwd);
  const legacyExists = existsSync(legacyRoot);
  const loopxExists = existsSync(loopxRoot);

  if (!legacyExists) {
    return {
      migrated: false,
      legacyExists: false,
      loopxExists,
      loopxRoot,
      legacyRoot,
      reason: 'legacy_root_missing',
    };
  }

  if (loopxExists) {
    throw new Error('mixed_runtime_roots_detected');
  }

  await rename(legacyRoot, loopxRoot);
  return {
    migrated: true,
    legacyExists: true,
    loopxExists: true,
    loopxRoot,
    legacyRoot,
    reason: 'migrated_legacy_runtime',
  };
}

export async function doctorRuntime(cwd, env = process.env) {
  const loopxRoot = resolveLoopXRoot(cwd);
  const legacyRoot = resolveLegacyRoot(cwd);
  const installState = await inspectInstallState(env);
  const installCheck = await verifyInstallState(env);

  return {
    loopxRoot,
    legacyRoot,
    loopxExists: existsSync(loopxRoot),
    legacyExists: existsSync(legacyRoot),
    mixedRuntimeRoots: existsSync(loopxRoot) && existsSync(legacyRoot),
    installState,
    installCheck,
  };
}
