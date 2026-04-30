#!/usr/bin/env node

import { installBundledSkills, verifyInstallState } from '../src/install-discovery.mjs';

async function main() {
  const checkOnly = process.argv.includes('--check');
  const result = checkOnly ? await verifyInstallState(process.env) : await installBundledSkills(process.env);
  const ok = checkOnly ? result.ok : result.ok !== false;
  const payload = checkOnly ? result : { ok, installed: result.installed, conflicts: result.conflicts ?? [], inspection: result.inspection };
  if (!ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

await main();
