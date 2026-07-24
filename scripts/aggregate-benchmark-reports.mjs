#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { mergeBenchmarkReports } from '../src/benchmark-eval.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function percent(value) {
  return value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function formatDelta(pair) {
  return `${(pair.delta * 100).toFixed(1)}pp [${(pair.ci_low * 100).toFixed(1)}, ${(pair.ci_high * 100).toFixed(1)}]`;
}

function renderMergedMarkdown(report) {
  const lines = [
    '# Merged Benchmark Report',
    '',
    `- Sources: ${report.sources} campaign reports; ${report.scored_run_count} scored runs (${report.run_count - report.scored_run_count} blocked excluded)`,
    '',
    '## Arm Summary',
    '',
    '| Arm | Scored | Passed | Pass rate | Median tokens | Blocked |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  for (const [arm, summary] of Object.entries(report.arm_summary)) {
    lines.push(`| ${arm} | ${summary.runs} | ${summary.benchmark_passed} | ${percent(summary.pass_rate)} | ${summary.median_tokens ?? 'n/a'} | ${summary.blocked} |`);
  }
  lines.push('', '## Overall Effect Size (seeded bootstrap, 95% CI)', '', '| Pair | Baseline rate | Candidate rate | Delta [CI] | Win rate |', '|---|---:|---:|---|---:|');
  for (const pair of report.effect_size.pairs) {
    lines.push(`| ${pair.name} | ${percent(pair.baseline_rate)} | ${percent(pair.candidate_rate)} | ${formatDelta(pair)} | ${percent(pair.win_rate)} |`);
  }
  for (const [category, data] of Object.entries(report.categories)) {
    lines.push('', `## Category: ${category}`, '', '| Arm | Scored | Passed | Median tokens |', '|---|---:|---:|---:|');
    for (const [arm, summary] of Object.entries(data.arm_summary)) {
      lines.push(`| ${arm} | ${summary.runs} | ${summary.benchmark_passed} | ${summary.median_tokens ?? 'n/a'} |`);
    }
    if (data.effect_size.pairs.length > 0) {
      lines.push('', '| Pair | Delta [CI] | Win rate |', '|---|---|---:|');
      for (const pair of data.effect_size.pairs) {
        lines.push(`| ${pair.name} | ${formatDelta(pair)} | ${percent(pair.win_rate)} |`);
      }
    }
  }
  lines.push('', '## Interpretation', '', '- Blocked runs are infrastructure failures and never count toward n.', '- Category tables prevent ceiling-effect tasks from diluting real differences.', '- Resource medians are secondary evidence and compare only scored runs.', '');
  return lines.join('\n');
}

const inputs = process.argv.flatMap((value, index) => (process.argv[index - 1] === '--input' ? [resolve(value)] : []));
if (inputs.length === 0) {
  console.error('Usage: node scripts/aggregate-benchmark-reports.mjs --input <report.json> [--input ...] [--seed n] [--iterations n] --out <dir>');
  process.exitCode = 2;
} else {
  const outDir = resolve(option('--out', '.loopx/evals/benchmark/merged'));
  const seed = Number.parseInt(option('--seed', '1'), 10);
  const iterations = Number.parseInt(option('--iterations', '10000'), 10);
  const reports = await Promise.all(inputs.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
  const merged = mergeBenchmarkReports(reports, { seed, iterations });
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(join(outDir, 'report.json'), `${JSON.stringify(merged, null, 2)}\n`),
    writeFile(join(outDir, 'report.md'), renderMergedMarkdown(merged)),
  ]);
  console.log(JSON.stringify({ ok: true, inputs: inputs.length, out: outDir, scored: merged.scored_run_count, arms: merged.arms }, null, 2));
}
