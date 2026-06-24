#!/usr/bin/env node

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installBundledSkills, verifyInstallState } from '../../../src/install-discovery.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(MODULE_DIR, '..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '..', '..');
const ROOT_SKILLS_DIR = join(REPO_ROOT, 'skills');
const DISTRIBUTION_CHANNEL = 'plugin';

function buildPluginEnv() {
  return {
    ...process.env,
    LOOPX_PROJECT_ROOT: REPO_ROOT,
    LOOPX_SKILL_SOURCE_ROOT: ROOT_SKILLS_DIR,
    LOOPX_DISTRIBUTION_CHANNEL: DISTRIBUTION_CHANNEL,
    LOOPX_INSTALLATION_IDENTITY: 'loopx',
    LOOPX_SOURCE_URL: PLUGIN_ROOT,
  };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const env = buildPluginEnv();
  const result = checkOnly
    ? await verifyInstallState(env)
    : await installBundledSkills(env);
  const ok = checkOnly ? result.ok : result.ok !== false;
  const payload = checkOnly
    ? {
        ...result,
        distributionChannel: DISTRIBUTION_CHANNEL,
        pluginRoot: PLUGIN_ROOT,
      }
    : {
        ok,
        installed: result.installed,
        conflicts: result.conflicts ?? [],
        inspection: result.inspection,
        distributionChannel: DISTRIBUTION_CHANNEL,
        pluginRoot: PLUGIN_ROOT,
      };

  if (!ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

await main();
