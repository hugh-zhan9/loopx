import { mkdir, rename } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { getTemplateBaselinePath, inspectInstallState, verifyInstallState } from './install-discovery.mjs';
import { inspectTemplateGovernance } from './template-governance.mjs';

export function resolveLoopxRoot(cwd) {
  return join(resolve(cwd), '.loopx');
}

export function resolveUppercaseLoopxRoot(cwd) {
  return join(resolve(cwd), '.LoopX');
}

export function resolveLegacyRoot(cwd) {
  return join(resolve(cwd), '.codex-helper');
}

function existsExactPath(path) {
  const parent = dirname(path);
  const name = basename(path);
  if (!existsSync(parent)) {
    return false;
  }
  try {
    return readdirSync(parent).includes(name);
  } catch {
    return false;
  }
}

export async function ensureLoopxRoot(cwd) {
  const root = resolveLoopxRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  if (!existsExactPath(root) && existsExactPath(uppercaseRoot)) {
    await rename(uppercaseRoot, root);
  }
  await mkdir(root, { recursive: true });
  return root;
}

export async function migrateLegacyRuntime(cwd) {
  const legacyRoot = resolveLegacyRoot(cwd);
  const loopxRoot = resolveLoopxRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  const legacyExists = existsExactPath(legacyRoot);
  const loopxExists = existsExactPath(loopxRoot);
  const uppercaseExists = existsExactPath(uppercaseRoot);

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
  const installTemplateBaselinePath = getTemplateBaselinePath(env);
  const workspaceTemplateBaselinePath = join(loopxRoot, 'template-hashes.json');
  const templateGovernance = await inspectTemplateGovernance(
    existsSync(installTemplateBaselinePath) ? installTemplateBaselinePath : workspaceTemplateBaselinePath,
  );
  const workflowHookPath = join(resolve(cwd), 'scripts', 'codex-workflow-hook.mjs');
  const installedWorkflowHookPath = installState.managedArtifacts?.['codex-workflow-hook']?.targetPath
    || join(resolve(env.LOOPX_HOME || env.HOME || process.cwd()), '.codex', 'hooks', 'codex-workflow-hook.mjs');
  const hook = {
    enabled: env.LOOPX_HOOKS !== '0',
    workflowHookPath,
    installedWorkflowHookPath,
    installed: existsSync(installedWorkflowHookPath),
  };

  return {
    loopxRoot,
    legacyRoot,
    uppercaseRoot,
    loopxExists: existsExactPath(loopxRoot),
    legacyExists: existsExactPath(legacyRoot),
    uppercaseExists: existsExactPath(uppercaseRoot),
    mixedRuntimeRoots: existsExactPath(loopxRoot) && (existsExactPath(legacyRoot) || existsExactPath(uppercaseRoot)),
    installState,
    installCheck,
    templateGovernance,
    hook,
  };
}
