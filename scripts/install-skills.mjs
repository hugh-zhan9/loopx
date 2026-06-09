#!/usr/bin/env node

import { installSkillsForTargets, verifyInstallTargets } from '../src/install-discovery.mjs';

function shouldSkipPostinstall(env = process.env) {
  return env.LOOPX_SKIP_POSTINSTALL === '1' || env.LOOPX_POSTINSTALL === '0';
}

function skipPostinstallEnv(env = process.env) {
  if (env.LOOPX_SKIP_POSTINSTALL === '1') {
    return 'LOOPX_SKIP_POSTINSTALL';
  }
  if (env.LOOPX_POSTINSTALL === '0') {
    return 'LOOPX_POSTINSTALL';
  }
  return null;
}

function targetNames(result) {
  return Array.isArray(result.targets) && result.targets.length > 0 ? result.targets : Object.keys(result.results || {});
}

function count(result, key) {
  return Object.values(result.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target?.[key]) ? target[key].length : 0), 0);
}

function printSummary(result, { checkOnly = false } = {}) {
  console.log(`loopx ${checkOnly ? 'install check' : 'postinstall'}: ${result.ok === false ? 'attention needed' : 'ok'}`);
  console.log(`targets: ${targetNames(result).join(', ')}`);
  if (!checkOnly) {
    console.log(`installed skills: ${count(result, 'installed')}`);
  }
  console.log(`conflicts: ${count(result, 'conflicts')}`);
  console.log(`skipped user-modified: ${count(result, 'skipped')}`);
  console.log('repair: loopx repair-install');
  console.log('opt out: LOOPX_SKIP_POSTINSTALL=1');
  console.log('disable hooks for one process: LOOPX_HOOKS=0');
  console.log('details: node scripts/install-skills.mjs --json');
}

async function main() {
  const json = process.argv.includes('--json');
  if (shouldSkipPostinstall()) {
    if (json) {
      console.log(JSON.stringify({
        ok: true,
        skipped: true,
        reason: 'postinstall_disabled',
        env: skipPostinstallEnv(),
      }, null, 2));
    } else {
      console.log('loopx postinstall skipped: LOOPX_SKIP_POSTINSTALL=1 or LOOPX_POSTINSTALL=0');
    }
    return;
  }

  const checkOnly = process.argv.includes('--check');
  const result = checkOnly ? await verifyInstallTargets(process.env) : await installSkillsForTargets(process.env);
  const ok = checkOnly ? result.ok : result.ok !== false;
  const payload = checkOnly ? result : { ok, targets: result.targets, results: result.results };
  if (json) {
    const stream = ok ? process.stdout : process.stderr;
    stream.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    printSummary(payload, { checkOnly });
  }
  if (!ok) {
    process.exitCode = 1;
  }
}

await main();
