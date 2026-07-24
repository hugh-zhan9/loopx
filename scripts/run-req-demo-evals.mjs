#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  renderCrossVersionProductMarkdown,
  renderInstalledProductMarkdown,
  renderThreeWayProductMarkdown,
  summarizeAgentEvalRun,
} from '../src/agent-eval.mjs';
import { findCodexRollouts, normalizeCodexRollouts } from '../src/codex-agent-trace.mjs';
import { runInstalledProductEvaluation } from '../src/installed-product-eval.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(new URL('..', import.meta.url).pathname);

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function pathSegment(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ref';
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-req-demo-evals.mjs --live --model <id> [options]',
    '',
    'Opt-in FitPulse requirements-driven workflow demo.',
    '  sources live under test/fixtures/req-demo/sources/fitpulse/',
    '  agent cwd is harness/ with overlays (not sources/ as root)',
    '  bare / no-loopx: docs/product/REQUIREMENTS.md → PLAN.md → implement',
    '  installed loopx: fitpulse intake → spec → plan2exec → exec → final-review',
    '',
    'Options:',
    '  --runtime <codex|claude>     Local agent runtime (default: codex)',
    '  --model <id>                 Exact model ID used by every variant',
    '  --baseline-ref <git-ref>     Immutable loopx baseline ref (requires candidate ref)',
    '  --candidate-ref <git-ref>    Immutable loopx candidate ref (requires baseline ref)',
    '  --effort <level>             Reasoning effort for Codex (default: high)',
    '  --case <id>                  Run one case',
    '  --replicates <count>         Replicates per variant (default: 2)',
    '  --order <crossover|baseline-first|candidate-first>',
    '  --timeout-ms <milliseconds>  Shared timeout for every variant',
    '  --out <directory>            Ignored report directory under .loopx/evals',
    '',
    'With both ref options, every case runs three isolated arms: no-loopx, the',
    'baseline ref, and the candidate ref.',
    '',
    'Cursor manual runs are documented in evals/req-demo/MANUAL.md.',
  ].join('\n');
}

function runProcess(command, args, prompt, options) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
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
    const runDir = join(outDir, 'raw', `${String(sequence).padStart(3, '0')}-${request.case.id}`);
    await mkdir(runDir, { recursive: true });
    const messagePath = join(runDir, 'message.txt');
    const args = [
      'exec', '-', '--json', '--ignore-rules',
      '-s', 'workspace-write', '-C', request.repo,
      '-m', request.configuration.model,
      '-c', `model_reasoning_effort=${JSON.stringify(request.configuration.effort)}`,
      '-o', messagePath,
    ];
    if (request.execution_policy.force_serial) {
      args.push('--disable', 'multi_agent');
    }
    const startedAt = Date.now();
    const result = await runProcess('codex', args, request.prompt, {
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
          variant: 'native',
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
      integration_order: [],
      execution_selection: summary.peak_active_agents >= 2 ? 'concurrent' : 'serial',
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

function createClaudeAdapter(outDir) {
  let sequence = 0;
  return async function runAgent(request) {
    sequence += 1;
    const runDir = join(outDir, 'raw', `${String(sequence).padStart(3, '0')}-${request.case.id}`);
    await mkdir(runDir, { recursive: true });
    const args = [
      '-p',
      '--output-format', 'json',
      '--permission-mode', 'acceptEdits',
    ];
    if (request.configuration.model) {
      args.push('--model', request.configuration.model);
    }
    const startedAt = Date.now();
    const result = await runProcess('claude', args, request.prompt, {
      cwd: request.repo,
      env: {
        ...request.env,
        HOME: request.home,
      },
      signal: request.signal,
    });
    const latencyMs = Date.now() - startedAt;
    await Promise.all([
      writeFile(join(runDir, 'claude-stdout.json'), result.stdout),
      writeFile(join(runDir, 'stderr.txt'), result.stderr),
    ]);
    let response = result.stdout;
    let tokens = { input: null, cached_input: null, output: null, total: null };
    try {
      const parsed = JSON.parse(result.stdout);
      response = parsed.result ?? parsed.output ?? result.stdout;
      const usage = parsed.usage ?? parsed.token_usage ?? null;
      if (usage) {
        tokens = {
          input: usage.input_tokens ?? usage.input ?? null,
          cached_input: usage.cache_read_input_tokens ?? usage.cached_input ?? null,
          output: usage.output_tokens ?? usage.output ?? null,
          total: usage.total_tokens
            ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) || null),
        };
      }
    } catch {
      // keep raw stdout
    }
    return {
      outcome: result.code === 0 && !result.aborted ? 'passed' : 'failed',
      verification: { passed: result.code === 0 && !result.aborted, commands: ['claude -p completed'] },
      response: typeof response === 'string' ? response : JSON.stringify(response),
      workers: [],
      integration_order: [],
      execution_selection: 'serial',
      tokens,
      latency_ms: latencyMs,
    };
  };
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage());
} else if (!process.argv.includes('--live')) {
  console.error(usage());
  console.error('\nRefusing to invoke live models without --live.');
  process.exitCode = 2;
} else {
  const model = option('--model');
  const runtime = option('--runtime', 'codex');
  const baselineRef = option('--baseline-ref');
  const candidateRef = option('--candidate-ref');
  if (!model) {
    console.error(usage());
    console.error('\n--model is required.');
    process.exitCode = 2;
  } else if (!['codex', 'claude'].includes(runtime)) {
    console.error(usage());
    console.error('\n--runtime must be codex or claude.');
    process.exitCode = 2;
  } else if (Boolean(baselineRef) !== Boolean(candidateRef)) {
    console.error(usage());
    console.error('\n--baseline-ref and --candidate-ref must be provided together.');
    process.exitCode = 2;
  } else {
    const defaultOut = baselineRef
      ? `.loopx/evals/version-compare/${pathSegment(baselineRef)}-vs-${pathSegment(candidateRef)}/${Date.now()}`
      : `.loopx/evals/req-demo/${runtime}/${Date.now()}`;
    const outDir = resolve(option('--out', defaultOut));
    const manifestPath = resolve(option('--manifest', join(repoRoot, 'evals', 'req-demo', 'cases.json')));
    const fixtureRoot = resolve(option('--fixtures', join(repoRoot, 'test', 'fixtures', 'req-demo')));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const selectedCase = option('--case');
    const replicates = Number.parseInt(option('--replicates', '2'), 10);
    const timeoutMs = Number.parseInt(option('--timeout-ms', String(manifest.configuration.timeout_ms)), 10);
    const adapterVersion = runtime === 'codex'
      ? await execFileAsync('codex', ['--version']).then(({ stdout }) => stdout.trim(), () => null)
      : await execFileAsync('claude', ['--version']).then(({ stdout }) => stdout.trim(), () => null);
    const codeyHome = resolve(process.env.CODEY_HOME || join(homedir(), '.codey'));
    await mkdir(outDir, { recursive: true });
    const result = await runInstalledProductEvaluation({
      manifest,
      projectRoot: repoRoot,
      fixtureRoot,
      runAgent: runtime === 'claude' ? createClaudeAdapter(outDir) : createCodexAdapter(outDir),
      codexConfigRoot: runtime === 'codex' ? codeyHome : null,
      installTargets: [runtime],
      selectedCaseIds: selectedCase ? [selectedCase] : null,
      replicates,
      order: option('--order', 'crossover'),
      configuration: {
        model,
        effort: option('--effort', 'high'),
        timeout_ms: timeoutMs,
        adapter: { name: runtime, version: adapterVersion },
      },
      versionRefs: baselineRef ? { baseline: baselineRef, candidate: candidateRef } : null,
    });
    const reportWrites = [
      writeFile(join(outDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`),
      writeFile(
        join(outDir, 'report.md'),
        result.schema === 'loopx.three-way-product-benchmark-report.v1'
          ? renderThreeWayProductMarkdown(result)
          : result.schema === 'loopx.cross-version-product-benchmark-report.v1'
            ? renderCrossVersionProductMarkdown(result)
            : renderInstalledProductMarkdown(result.comparison),
      ),
      writeFile(join(outDir, 'runtime.json'), `${JSON.stringify({ runtime, model }, null, 2)}\n`),
    ];
    if (result.provenance) {
      reportWrites.push(writeFile(join(outDir, 'matrix.json'), `${JSON.stringify(result.provenance, null, 2)}\n`));
    }
    await Promise.all(reportWrites);
    const comparisonOveralls = result.comparisons
      ? Object.fromEntries(Object.entries(result.comparisons).map(([name, value]) => [name, value.overall]))
      : null;
    const ok = comparisonOveralls
      ? Object.values(comparisonOveralls).every((overall) => overall.criteria_passed)
      : result.comparison.overall.criteria_passed;
    console.log(JSON.stringify({
      ok,
      diagnostic_only: true,
      runtime,
      out: outDir,
      overall: result.comparison.overall,
      comparisons: comparisonOveralls,
    }, null, 2));
    if (!ok && !baselineRef) process.exitCode = 1;
  }
}
