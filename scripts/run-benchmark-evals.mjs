#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { summarizeAgentEvalRun } from '../src/agent-eval.mjs';
import { BENCHMARK_ARMS, renderBenchmarkMarkdown, runBenchmarkEvaluation } from '../src/benchmark-eval.mjs';
import { deriveExecutionSelection, deriveIntegrationOrder, findCodexRollouts, normalizeCodexRollouts } from '../src/codex-agent-trace.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(new URL('..', import.meta.url).pathname);

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-benchmark-evals.mjs --live --model <id> --baseline-ref <ref> --candidate-ref <ref> [options]',
    '  node scripts/run-benchmark-evals.mjs --dry-run [options]',
    '',
    'Opt-in four-arm product benchmark (see evals/benchmark/README.md and PROTOCOL.md).',
    'Arms: bare (A), docs-only (B), baseline (C), candidate (D). The primary judge is a',
    'hidden test suite injected only after the agent under test has finished, plus',
    'repository diff assertions; hidden tests are never visible to the agent.',
    '',
    'Options:',
    '  --model <id>                 Exact model ID used by every arm (required with --live)',
    '  --baseline-ref <git-ref>     Immutable loopx baseline ref (arm C)',
    '  --candidate-ref <git-ref>    Immutable loopx candidate ref (arm D)',
    '  --arms <list>                Comma-separated arms (default: bare,docs-only,baseline,candidate);',
    '                               requesting baseline or candidate always runs the bare control too',
    '  --task <id>                  Run one task',
    '  --replicates <count>         Replicates per arm (default: 2; protocol requires >= 5)',
    '  --order <crossover|baseline-first|candidate-first>',
    '  --effort <level>             Reasoning effort (default: high)',
    '  --timeout-ms <milliseconds>  Shared timeout for every arm',
    '  --seed <integer>             Bootstrap seed (default: 1)',
    '  --iterations <count>         Bootstrap iterations (default: 10000)',
    '  --out <directory>            Report directory under .loopx/evals',
    '  --dry-run                    Deterministic fake-agent pipeline check; no live models,',
    '                               installs a generated throwaway product for arms C/D',
    '',
    'The Codex adapter does not pass --ignore-rules: agent homes are fully isolated and',
    'the docs-only arm depends on the repository AGENTS.md overlay being honored.',
  ].join('\n');
}

function runCodex(args, prompt, options) {
  return new Promise((resolveRun) => {
    const child = spawn('codex', args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let aborted = false;
    const abort = () => {
      aborted = true;
      child.kill('SIGTERM');
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      options.signal?.removeEventListener('abort', abort);
      resolveRun({ code: null, aborted, stdout: '', stderr: error.message });
    });
    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', abort);
      resolveRun({
        code,
        aborted,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.stdin.end(prompt);
  });
}

function workerIntervals(events, workspaces = new Map()) {
  const active = new Map();
  const intervals = [];
  for (const event of events) {
    if (event.event === 'agent_spawn') {
      active.set(event.actor_id, event.at_ms);
    } else if ((event.event === 'agent_release' || event.event === 'agent_end') && active.has(event.actor_id)) {
      intervals.push({
        id: event.actor_id,
        started_at_ms: active.get(event.actor_id),
        ended_at_ms: event.at_ms,
        workspace: workspaces.get(event.actor_id) ?? null,
      });
      active.delete(event.actor_id);
    }
  }
  return intervals;
}

function createCodexAdapter(outDir) {
  let sequence = 0;
  return async function runAgent(request) {
    sequence += 1;
    const runDir = join(outDir, 'raw', `${String(sequence).padStart(3, '0')}-${request.case.id}-${request.variant}`);
    await mkdir(runDir, { recursive: true });
    const messagePath = join(runDir, 'message.txt');
    const args = [
      'exec', '-', '--json',
      '-s', 'workspace-write', '-C', request.repo,
      '-m', request.configuration.model,
      '-c', `model_reasoning_effort=${JSON.stringify(request.configuration.effort)}`,
      '-o', messagePath,
    ];
    if (request.execution_policy.force_serial) {
      args.push('--disable', 'multi_agent');
    }
    const startedAt = Date.now();
    const result = await runCodex(args, request.prompt, {
      cwd: request.repo,
      env: {
        ...request.env,
        CODEX_HOME: join(request.home, '.codex'),
      },
      signal: request.signal,
    });
    const latencyMs = Date.now() - startedAt;
    await Promise.all([
      writeFile(join(runDir, 'codex.jsonl'), result.stdout),
      writeFile(join(runDir, 'stderr.txt'), result.stderr),
    ]);
    const threadId = result.stdout.split(/\r?\n/).flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return event.type === 'thread.started' && event.thread_id ? [event.thread_id] : [];
      } catch {
        return [];
      }
    })[0] ?? null;
    let events = [];
    const workerWorkspaces = new Map();
    if (threadId) {
      const sessionsRoot = join(request.home, '.codex', 'sessions');
      const rollouts = await findCodexRollouts(sessionsRoot, threadId).catch(() => []);
      if (rollouts.length > 0) {
        for (const rollout of rollouts) {
          const metadata = rollout.records.find((record) => record.type === 'session_meta')?.payload;
          const actorId = metadata?.session_id ?? metadata?.id;
          if (actorId && actorId !== threadId && metadata?.cwd) {
            workerWorkspaces.set(actorId, metadata.cwd);
          }
        }
        events = normalizeCodexRollouts(rollouts, {
          rootThreadId: threadId,
          runId: `${request.case.id}-${sequence}`,
          caseId: request.case.id,
          variant: request.variant,
          model: request.configuration.model,
          reasoningEffort: request.configuration.effort,
        });
      }
    }
    const summary = events.length > 0 ? summarizeAgentEvalRun(events) : {
      peak_active_agents: 0,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
    };
    const response = await readFile(messagePath, 'utf8').catch(() => '');
    return {
      outcome: result.code === 0 && !result.aborted ? 'passed' : 'failed',
      verification: { passed: result.code === 0 && !result.aborted, commands: ['codex exec completed'] },
      response,
      workers: workerIntervals(events, workerWorkspaces),
      integration_order: deriveIntegrationOrder(events, workerWorkspaces),
      // Escalation-trap tasks carry trace_kind governed-escalation so the
      // fail-closed derivation (no trace -> unknown, dispatch/mutation ->
      // proceeded) judges whether the agent actually stopped.
      execution_selection: deriveExecutionSelection(request.case.trace_kind ?? request.case.kind, summary, events),
      tokens: {
        input: summary.input_tokens,
        cached_input: summary.cached_input_tokens,
        output: summary.output_tokens,
        total: summary.total_tokens,
      },
      latency_ms: Number.isFinite(summary.latency_ms) ? summary.latency_ms : latencyMs,
    };
  };
}

function parseArms(value) {
  if (!value) return [...BENCHMARK_ARMS];
  const arms = value.split(',').map((arm) => arm.trim()).filter(Boolean);
  const unknown = arms.filter((arm) => !BENCHMARK_ARMS.includes(arm));
  if (arms.length === 0 || unknown.length > 0) {
    throw new Error(`--arms must be a non-empty subset of ${BENCHMARK_ARMS.join(',')}`);
  }
  return arms;
}

const dryRun = process.argv.includes('--dry-run');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage());
} else if (!dryRun && !process.argv.includes('--live')) {
  console.error(usage());
  console.error('\nRefusing to invoke live models without --live (use --dry-run for a fake-agent pipeline check).');
  process.exitCode = 2;
} else {
  let arms;
  try {
    arms = parseArms(option('--arms'));
  } catch (error) {
    console.error(usage());
    console.error(`\n${error.message}`);
    process.exitCode = 2;
  }
  const model = option('--model');
  const baselineRef = option('--baseline-ref');
  const candidateRef = option('--candidate-ref');
  const needsVersions = arms ? arms.includes('baseline') || arms.includes('candidate') : false;
  if (!arms) {
    // exit code already set above
  } else if (!dryRun && !model) {
    console.error(usage());
    console.error('\n--model is required with --live.');
    process.exitCode = 2;
  } else if (Boolean(baselineRef) !== Boolean(candidateRef)) {
    console.error(usage());
    console.error('\n--baseline-ref and --candidate-ref must be provided together.');
    process.exitCode = 2;
  } else if (!dryRun && needsVersions && !baselineRef) {
    console.error(usage());
    console.error('\nbaseline/candidate arms require --baseline-ref and --candidate-ref.');
    process.exitCode = 2;
  } else {
    const outDir = resolve(option('--out', `.loopx/evals/benchmark/${dryRun ? 'dry-run-' : ''}${Date.now()}`));
    const tasksRoot = resolve(option('--tasks', join(repoRoot, 'evals', 'benchmark', 'tasks')));
    const fixtureRoot = resolve(option('--fixtures', join(repoRoot, 'test', 'fixtures', 'benchmark')));
    const docsOnlyAgentsPath = resolve(option('--docs-only', join(repoRoot, 'evals', 'benchmark', 'docs-only', 'AGENTS.md')));
    const selectedTask = option('--task');
    const replicates = Number.parseInt(option('--replicates', '2'), 10);
    const seed = Number.parseInt(option('--seed', '1'), 10);
    const iterations = Number.parseInt(option('--iterations', '10000'), 10);
    await mkdir(outDir, { recursive: true });

    let dryRunRoot = null;
    let fakeAgent = null;
    try {
      let projectRoot = repoRoot;
      let versionRefs = baselineRef ? { baseline: baselineRef, candidate: candidateRef } : null;
      let runAgent;
      let adapter;
      let codexConfigRoot = null;
      if (dryRun) {
        const { createBenchmarkFakeAgent } = await import('../test/fixtures/benchmark/fake-agent.mjs');
        const { createBenchmarkVersionProductRepository } = await import('../test/fixtures/benchmark/version-product.mjs');
        fakeAgent = createBenchmarkFakeAgent();
        runAgent = fakeAgent.run;
        adapter = { name: 'benchmark-fake-agent', version: '1.0.0' };
        if (needsVersions && !versionRefs) {
          dryRunRoot = await mkdtemp(join(tmpdir(), 'loopx-benchmark-dry-run-'));
          const product = await createBenchmarkVersionProductRepository(dryRunRoot);
          projectRoot = product.root;
          versionRefs = product.versionRefs;
        }
      } else {
        runAgent = createCodexAdapter(outDir);
        const adapterVersion = await execFileAsync('codex', ['--version'])
          .then(({ stdout }) => stdout.trim(), () => null);
        adapter = { name: 'codex', version: adapterVersion };
        codexConfigRoot = resolve(process.env.CODEY_HOME || join(homedir(), '.codey'));
      }
      const result = await runBenchmarkEvaluation({
        tasksRoot,
        fixtureRoot,
        projectRoot,
        runAgent,
        arms,
        replicates,
        order: option('--order', 'crossover'),
        versionRefs,
        docsOnlyAgentsPath,
        selectedTaskIds: selectedTask ? [selectedTask] : null,
        codexConfigRoot,
        configuration: {
          model: model ?? 'dry-run-fake-agent',
          effort: option('--effort', 'high'),
          timeout_ms: Number.parseInt(option('--timeout-ms', dryRun ? '60000' : '1200000'), 10),
          adapter,
        },
        bootstrap: { seed, iterations },
      });
      const reportWrites = [
        writeFile(join(outDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`),
        writeFile(join(outDir, 'report.md'), renderBenchmarkMarkdown(result)),
      ];
      if (fakeAgent) {
        reportWrites.push(writeFile(
          join(outDir, 'dry-run-requests.json'),
          `${JSON.stringify(fakeAgent.requests(), null, 2)}\n`,
        ));
      }
      await Promise.all(reportWrites);
      console.log(JSON.stringify({
        ok: true,
        diagnostic_only: true,
        dry_run: dryRun,
        out: outDir,
        arms: result.arms,
        arm_summary: result.arm_summary,
        effect_size: result.effect_size.pairs.map((pair) => ({
          comparison: pair.name,
          delta: pair.delta,
          ci: [pair.ci_low, pair.ci_high],
          win_rate: pair.win_rate,
        })),
      }, null, 2));
    } finally {
      if (dryRunRoot) await rm(dryRunRoot, { recursive: true, force: true });
    }
  }
}
