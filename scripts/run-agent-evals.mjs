#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { applyAgentEvalPolicies, compareAgentEvalRuns, renderAgentEvalMarkdown, summarizeAgentEvalRun } from '../src/agent-eval.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-agent-evals.mjs --trace <events.jsonl> [--out <dir>]',
    '    [--manifest <cases.json>] [--baseline <variant>] [--candidate <variant>]',
    '',
    'The trace is NDJSON with one event per line. Runs are grouped by run_id.',
  ].join('\n');
}

function parseEvents(text, path) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) {
      return [];
    }
    try {
      return [JSON.parse(line)];
    } catch (error) {
      throw new Error(`agent_eval_invalid_json:${path}:${index + 1}:${error.message}`);
    }
  });
}

function groupRuns(events) {
  const runs = new Map();
  for (const event of events) {
    if (!event.run_id) {
      throw new Error(`agent_eval_run_id_required:${event.event ?? 'unknown'}`);
    }
    if (!runs.has(event.run_id)) {
      runs.set(event.run_id, []);
    }
    runs.get(event.run_id).push(event);
  }
  return [...runs.values()];
}

const traceArg = option('--trace');
if (!traceArg || process.argv.includes('--help')) {
  console.log(usage());
  process.exitCode = traceArg ? 0 : 2;
} else {
  const tracePath = resolve(traceArg);
  const outDir = resolve(option('--out', '.loopx/evals/agent'));
  const baselineVariant = option('--baseline', 'baseline');
  const candidateVariant = option('--candidate', 'v2');
  const manifestPath = resolve(option('--manifest', 'evals/gpt-5.6/cases.json'));
  const events = parseEvents(await readFile(tracePath, 'utf8'), tracePath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const summaries = applyAgentEvalPolicies(groupRuns(events).map(summarizeAgentEvalRun), manifest);
  const comparison = compareAgentEvalRuns(summaries, { baselineVariant, candidateVariant });

  if (comparison.overall.compared_cases === 0) {
    throw new Error(`agent_eval_no_matched_cases:${baselineVariant}:${candidateVariant}`);
  }

  const pendingMachineChecks = (manifest.cases ?? [])
    .filter((item) => item.machine_check === 'pending-live-harness')
    .map((item) => item.id);
  if (comparison.overall.unknown_correctness_cases > 0) {
    console.error(`warning: ${comparison.overall.unknown_correctness_cases}/${comparison.overall.compared_cases} compared cases have unknown correctness; they never count as passed or improved.`);
  }
  if (pendingMachineChecks.length > 0) {
    console.error(`warning: manifest cases without machine-checkable correctness: ${pendingMachineChecks.join(', ')}`);
  }

  await mkdir(outDir, { recursive: true });
  const summaryPath = resolve(outDir, 'run-summaries.json');
  const comparisonPath = resolve(outDir, 'comparison.json');
  const reportPath = resolve(outDir, 'report.md');
  await Promise.all([
    writeFile(summaryPath, `${JSON.stringify(summaries, null, 2)}\n`),
    writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`),
    writeFile(reportPath, renderAgentEvalMarkdown(comparison)),
  ]);

  console.log(JSON.stringify({
    ok: true,
    trace: tracePath,
    manifest: manifestPath,
    out: outDir,
    summaries: summaryPath,
    comparison: comparisonPath,
    report: reportPath,
    overall: comparison.overall,
  }, null, 2));
}
