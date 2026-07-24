#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  aggregateDrillRuns,
  buildDrillAgentPrompt,
  buildDrillVerifierPrompt,
  loadDrillScenarios,
  parseDrillVerdict,
  renderDrillMarkdown,
} from '../src/drill-eval.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-drills.mjs --dry-run',
    '  node scripts/run-drills.mjs --live --model <id> --judge-model <different-id> [options]',
    '',
    'Pressure-scenario drills for core governance guarantees. Live runs invoke paid models.',
    '',
    'Options:',
    '  --model <id>          Model under test',
    '  --judge-model <id>    Verifier model; must differ from --model',
    '  --replicates <n>      Replicates per scenario (default: 5)',
    '  --scenario <id>       Run one scenario',
    '  --out <dir>           Report directory (default: .loopx/evals/drills/<ts>)',
    '  --record-baseline     Also write evals/drills/baselines/<date>-<model>.json',
  ].join('\n');
}

function runCodex(args, prompt, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn('codex', args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeoutMs ?? 10 * 60 * 1000);
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.stdout.resume();
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, timedOut, stderr: Buffer.concat(stderr).toString('utf8') });
    });
    child.stdin.end(prompt);
  });
}

async function runModel({ model, prompt, cwd, messagePath }) {
  // The scratch cwd is intentionally not a git repository, so the repo trust
  // check must be skipped explicitly.
  const result = await runCodex(
    ['exec', '-', '--json', '--ignore-rules', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd, '-m', model, '-o', messagePath],
    prompt,
    { cwd },
  );
  const message = await readFile(messagePath, 'utf8').catch(() => '');
  if (result.code !== 0 || result.timedOut) {
    await writeFile(`${messagePath}.stderr.txt`, result.stderr).catch(() => {});
  }
  return { failed: result.code !== 0 || result.timedOut, message, stderr: result.stderr };
}

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const scenariosRoot = join(repoRoot, 'evals', 'drills', 'scenarios');

if (process.argv.includes('--help')) {
  console.log(usage());
} else if (process.argv.includes('--dry-run')) {
  const scenarios = await loadDrillScenarios(scenariosRoot, repoRoot);
  const selected = option('--scenario');
  const plan = [];
  for (const scenario of scenarios) {
    if (selected && scenario.id !== selected) continue;
    const prompt = await buildDrillAgentPrompt(scenario, repoRoot);
    plan.push({
      scenario_id: scenario.id,
      guarantee: scenario.guarantee,
      subject_paths: scenario.subject_paths,
      pressures: scenario.pressures,
      agent_prompt_chars: prompt.length,
    });
  }
  if (plan.length === 0) {
    throw new Error(`drill_scenario_not_found:${selected}`);
  }
  console.log(JSON.stringify({ ok: true, dry_run: true, scenarios: plan }, null, 2));
} else if (!process.argv.includes('--live')) {
  console.error(usage());
  console.error('\nRefusing to invoke live models without --live (use --dry-run to validate scenarios).');
  process.exitCode = 2;
} else {
  const model = option('--model');
  const judgeModel = option('--judge-model');
  if (!model || !judgeModel) {
    console.error(usage());
    console.error('\n--model and --judge-model are required.');
    process.exitCode = 2;
  } else if (judgeModel === model) {
    // The verifier must not share the tested model's blind spots.
    console.error('--judge-model must differ from --model.');
    process.exitCode = 2;
  } else {
    const replicates = Number.parseInt(option('--replicates', '5'), 10);
    const selected = option('--scenario');
    const outDir = resolve(option('--out', join('.loopx', 'evals', 'drills', String(Date.now()))));
    const verifierContract = await readFile(join(repoRoot, 'evals', 'drills', 'VERIFIER.md'), 'utf8');
    const scenarios = (await loadDrillScenarios(scenariosRoot, repoRoot))
      .filter((scenario) => !selected || scenario.id === selected);
    if (scenarios.length === 0) {
      throw new Error(`drill_scenario_not_found:${selected}`);
    }
    await mkdir(outDir, { recursive: true });
    const aggregates = [];
    for (const scenario of scenarios) {
      const prompt = await buildDrillAgentPrompt(scenario, repoRoot);
      const runs = [];
      for (let replicate = 1; replicate <= replicates; replicate += 1) {
        const runDir = join(outDir, scenario.id, String(replicate));
        await mkdir(runDir, { recursive: true });
        // An empty scratch cwd keeps the drill judgment-level: the contract
        // under test travels in the prompt, not via repository browsing.
        const scratch = await mkdtemp(join(tmpdir(), 'loopx-drill-'));
        const agent = await runModel({ model, prompt, cwd: scratch, messagePath: join(runDir, 'agent-message.txt') });
        let verdict = { verdict: 'unknown', reason: 'agent_run_failed' };
        if (!agent.failed && agent.message.trim()) {
          const verifierPrompt = buildDrillVerifierPrompt(verifierContract, scenario, agent.message);
          const judge = await runModel({ model: judgeModel, prompt: verifierPrompt, cwd: scratch, messagePath: join(runDir, 'verifier-message.txt') });
          verdict = judge.failed ? { verdict: 'unknown', reason: 'verifier_run_failed' } : parseDrillVerdict(judge.message);
        }
        await writeFile(join(runDir, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
        runs.push(verdict);
        console.error(`completed ${scenario.id}/${replicate}: ${verdict.verdict}${verdict.reason ? ` (${verdict.reason})` : ''}`);
      }
      aggregates.push(aggregateDrillRuns(scenario.id, runs));
    }
    const report = {
      schema: 'loopx.drill-report.v1',
      generated_at: new Date().toISOString(),
      model,
      judge_model: judgeModel,
      replicates,
      contract_source: 'working-tree',
      scenarios: aggregates,
      passed: aggregates.every((scenario) => scenario.passed),
    };
    await Promise.all([
      writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`),
      writeFile(join(outDir, 'report.md'), renderDrillMarkdown(report)),
    ]);
    if (process.argv.includes('--record-baseline')) {
      const baselinePath = join(repoRoot, 'evals', 'drills', 'baselines', `${new Date().toISOString().slice(0, 10)}-${model.replace(/[^A-Za-z0-9.-]+/g, '-')}.json`);
      await writeFile(baselinePath, `${JSON.stringify(report, null, 2)}\n`);
      console.error(`baseline recorded: ${baselinePath}`);
    }
    console.log(JSON.stringify({ ok: report.passed, diagnostic_only: true, out: outDir, scenarios: aggregates }, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}
