#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { isGatewayDeath } from '../src/benchmark-eval.mjs';

// Campaigns recorded before the adapter learned to classify gateway stream
// death re-scored those runs as agent failures. This audit tool re-reads the
// raw codex transcripts and writes report-corrected.json with such runs marked
// blocked, leaving the original report untouched. Raw run directories are
// created in dispatch order, matching the report's run order one-to-one.

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const campaignDir = option('--campaign');
if (!campaignDir) {
  console.error('Usage: node scripts/reclassify-benchmark-gateway-deaths.mjs --campaign <dir with report.json and raw/>');
  process.exitCode = 2;
} else {
  const dir = resolve(campaignDir);
  const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
  const rawDirs = (await readdir(join(dir, 'raw'))).sort();
  if (rawDirs.length !== report.runs.length) {
    throw new Error(`reclassify_raw_run_count_mismatch:${rawDirs.length}:${report.runs.length}`);
  }
  let reclassified = 0;
  for (const [index, run] of report.runs.entries()) {
    const expectedSuffix = `${run.case_id}-${run.variant ?? run.arm}`;
    const rawName = rawDirs[index];
    if (!rawName.includes(run.case_id)) {
      throw new Error(`reclassify_raw_order_mismatch:${rawName}:${expectedSuffix}`);
    }
    const transcript = await readFile(join(dir, 'raw', rawName, 'codex.jsonl'), 'utf8').catch(() => '');
    if (run.outcome !== 'blocked' && isGatewayDeath(transcript)) {
      run.outcome = 'blocked';
      run.benchmark_passed = false;
      run.reclassified = 'gateway-death';
      reclassified += 1;
    }
  }
  await writeFile(join(dir, 'report-corrected.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, campaign: dir, runs: report.runs.length, reclassified }, null, 2));
}
