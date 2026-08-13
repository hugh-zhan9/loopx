import { mkdir, rename } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

import { getTemplateBaselinePath, inspectInstallState, verifyInstallState } from './install-discovery.mjs';
import { inspectTemplateGovernance } from './template-governance.mjs';
import { inspectWorkspaceContext } from './workspace-context.mjs';

export function resolveLoopxRoot(cwd) {
  return join(resolve(cwd), '.loopx');
}

export function resolveUppercaseLoopxRoot(cwd) {
  return join(resolve(cwd), '.LoopX');
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

export function inspectRuntimeDependencies(env = process.env) {
  const rubyProbe = spawnSync('ruby', ['--version'], { encoding: 'utf8', env });
  return {
    ruby: {
      available: rubyProbe.status === 0,
      version: rubyProbe.status === 0 ? rubyProbe.stdout.trim() : null,
      requiredBy: ['generate-api-docs'],
    },
  };
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

export async function doctorRuntime(cwd, env = process.env) {
  const loopxRoot = resolveLoopxRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  const installState = await inspectInstallState(env);
  const installCheck = await verifyInstallState(env);
  const installTemplateBaselinePath = getTemplateBaselinePath(env);
  const workspaceTemplateBaselinePath = join(loopxRoot, 'template-hashes.json');
  const templateGovernance = await inspectTemplateGovernance(
    existsSync(installTemplateBaselinePath) ? installTemplateBaselinePath : workspaceTemplateBaselinePath,
  );
  // v0.8 docs-first ships no per-turn workflow hooks; report legacy installs
  // so doctor can suggest cleanup.
  const legacyInstalledWorkflowHookPath = installState.managedArtifacts?.['codex-workflow-hook']?.targetPath
    || join(resolve(env.LOOPX_HOME || env.HOME || process.cwd()), '.codex', 'hooks', 'codex-workflow-hook.mjs');
  const hook = {
    enabled: false,
    legacyInstalledWorkflowHookPath,
    legacyInstalled: existsSync(legacyInstalledWorkflowHookPath),
  };
  const runtimeDependencies = inspectRuntimeDependencies(env);

  return {
    loopxRoot,
    uppercaseRoot,
    loopxExists: existsExactPath(loopxRoot),
    uppercaseExists: existsExactPath(uppercaseRoot),
    mixedRuntimeRoots: existsExactPath(loopxRoot) && existsExactPath(uppercaseRoot),
    installState,
    installCheck,
    templateGovernance,
    contextSetup: await inspectWorkspaceContext(cwd),
    runtimeDependencies,
    hook,
  };
}
