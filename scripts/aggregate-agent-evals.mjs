#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { aggregateAgentEvalReplicates, compareAgentEvalRuns, renderAgentEvalMarkdown } from '../src/agent-eval.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const inputs = process.argv.flatMap((value, index) => process.argv[index - 1] === '--input' ? [resolve(value)] : []);
if (inputs.length === 0) {
  throw new Error('Usage: aggregate-agent-evals --input <run-summaries.json> [--input ...] --out <dir>');
}
const outDir = resolve(option('--out', '.loopx/evals/gpt-5.6/aggregate'));
const baselineVariant = option('--baseline', 'baseline');
const candidateVariant = option('--candidate', 'v2');
const summaries = (await Promise.all(inputs.map(async (path) => JSON.parse(await readFile(path, 'utf8'))))).flat();
const aggregates = aggregateAgentEvalReplicates(summaries);
const comparison = compareAgentEvalRuns(aggregates, { baselineVariant, candidateVariant });
await mkdir(outDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outDir, 'aggregate-summaries.json'), `${JSON.stringify(aggregates, null, 2)}\n`),
  writeFile(resolve(outDir, 'comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`),
  writeFile(resolve(outDir, 'report.md'), renderAgentEvalMarkdown(comparison)),
]);
console.log(JSON.stringify({ ok: true, inputs: inputs.length, out: outDir, overall: comparison.overall }, null, 2));
