import { mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { inspectInstallState, verifyInstallState } from './install-discovery.mjs';

export function resolveLoopxRoot(cwd) {
  return join(resolve(cwd), '.loopx');
}

export function resolveUppercaseLoopxRoot(cwd) {
  return join(resolve(cwd), '.LoopX');
}

export function resolveLegacyRoot(cwd) {
  return join(resolve(cwd), '.codex-helper');
}

export async function ensureLoopxRoot(cwd) {
  const root = resolveLoopxRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  if (!existsSync(root) && existsSync(uppercaseRoot)) {
    await rename(uppercaseRoot, root);
  }
  await mkdir(root, { recursive: true });
  return root;
}

export async function migrateLegacyRuntime(cwd) {
  const legacyRoot = resolveLegacyRoot(cwd);
  const loopxRoot = resolveLoopxRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  const legacyExists = existsSync(legacyRoot);
  const loopxExists = existsSync(loopxRoot);
  const uppercaseExists = existsSync(uppercaseRoot);

  if (!legacyExists && !uppercaseExists) {
    return {
      migrated: false,
      legacyExists: false,
      uppercaseExists: false,
      loopxExists,
      loopxRoot,
      legacyRoot,
      reason: 'legacy_root_missing',
    };
  }

  if (loopxExists && (legacyExists || uppercaseExists)) {
    throw new Error('mixed_runtime_roots_detected');
  }

  if (uppercaseExists && !loopxExists) {
    await rename(uppercaseRoot, loopxRoot);
    return {
      migrated: true,
      legacyExists,
      uppercaseExists: true,
      loopxExists: true,
      loopxRoot,
      legacyRoot,
      reason: 'migrated_uppercase_loopx_runtime',
    };
  }

  await rename(legacyRoot, loopxRoot);
  return {
    migrated: true,
    legacyExists: true,
    uppercaseExists,
    loopxExists: true,
    loopxRoot,
    legacyRoot,
    reason: 'migrated_legacy_runtime',
  };
}

export async function doctorRuntime(cwd, env = process.env) {
  const loopxRoot = resolveLoopxRoot(cwd);
  const legacyRoot = resolveLegacyRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  const installState = await inspectInstallState(env);
  const installCheck = await verifyInstallState(env);

  return {
    loopxRoot,
    legacyRoot,
    uppercaseRoot,
    loopxExists: existsSync(loopxRoot),
    legacyExists: existsSync(legacyRoot),
    uppercaseExists: existsSync(uppercaseRoot),
    mixedRuntimeRoots: existsSync(loopxRoot) && (existsSync(legacyRoot) || existsSync(uppercaseRoot)),
    installState,
    installCheck,
  };
}
