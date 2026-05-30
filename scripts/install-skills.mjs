#!/usr/bin/env node

import { installSkillsForTargets, verifyInstallTargets } from '../src/install-discovery.mjs';

async function main() {
  const checkOnly = process.argv.includes('--check');
  const result = checkOnly ? await verifyInstallTargets(process.env) : await installSkillsForTargets(process.env);
  const ok = checkOnly ? result.ok : result.ok !== false;
  const payload = checkOnly ? result : { ok, targets: result.targets, results: result.results };
  if (!ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

await main();
