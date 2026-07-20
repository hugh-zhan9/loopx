#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { renderInstalledProductMarkdown, summarizeAgentEvalRun } from '../src/agent-eval.mjs';
import { findCodexRollouts, normalizeCodexRollouts } from '../src/codex-agent-trace.mjs';
import { runInstalledProductEvaluation } from '../src/installed-product-eval.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-darwin-simple-evals.mjs --live --model <id> [options]',
    '',
    'Opt-in installed-product diagnostic. This command can invoke paid live model runs.',
    '',
    'Options:',
    '  --model <id>                 Exact model ID used by every variant',
    '  --effort <level>             Reasoning effort (default: high)',
    '  --case <id>                  Run one case (repeatable selection is not supported)',
    '  --replicates <count>         Replicates per variant (default: 2)',
    '  --order <crossover|baseline-first|candidate-first>',
    '  --timeout-ms <milliseconds>  Shared timeout for every variant',
    '  --out <directory>            Ignored report directory under .loopx/evals',
    '',
    'The candidate is installed into a temporary host home. Baseline and candidate',
    'receive the exact case task with no candidate-only resolver or prompt injection.',
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

function executionSelection(testCase, summary) {
  if (testCase.kind === 'governed-escalation') return 'blocked';
  if (testCase.kind === 'strongly-coupled') return summary.peak_active_agents <= 1 ? 'serial' : 'concurrent';
  if (testCase.kind === 'independent') return summary.peak_active_agents >= 2 ? 'concurrent' : 'serial';
  return 'direct';
}

function createCodexAdapter(outDir) {
  let sequence = 0;
  return async function runAgent(request) {
    sequence += 1;
    const runDir = join(outDir, 'raw', `${String(sequence).padStart(3, '0')}-${request.case.id}`);
    await mkdir(runDir, { recursive: true });
    const messagePath = join(runDir, 'message.txt');
    const args = [
      'exec', '-', '--json', '--ignore-user-config', '--ignore-rules',
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
      execution_selection: executionSelection(request.case, summary),
      tokens: { input: summary.input_tokens, output: summary.output_tokens, total: summary.total_tokens },
      latency_ms: Number.isFinite(summary.latency_ms) ? summary.latency_ms : latencyMs,
    };
  };
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else if (!process.argv.includes('--live')) {
  console.error(usage());
  console.error('\nRefusing to invoke live models without --live.');
  process.exitCode = 2;
} else {
  const model = option('--model');
  if (!model) {
    console.error(usage());
    console.error('\n--model is required.');
    process.exitCode = 2;
  } else {
    const repoRoot = resolve(new URL('..', import.meta.url).pathname);
    const outDir = resolve(option('--out', `.loopx/evals/darwin-simple/${Date.now()}`));
    const manifestPath = resolve(option('--manifest', join(repoRoot, 'evals', 'darwin-simple', 'cases.json')));
    const fixtureRoot = resolve(option('--fixtures', join(repoRoot, 'test', 'fixtures', 'darwin-simple')));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const selectedCase = option('--case');
    const replicates = Number.parseInt(option('--replicates', '2'), 10);
    const timeoutMs = Number.parseInt(option('--timeout-ms', String(manifest.configuration.timeout_ms)), 10);
    await mkdir(outDir, { recursive: true });
    const result = await runInstalledProductEvaluation({
      manifest,
      projectRoot: repoRoot,
      fixtureRoot,
      runAgent: createCodexAdapter(outDir),
      selectedCaseIds: selectedCase ? [selectedCase] : null,
      replicates,
      order: option('--order', 'crossover'),
      configuration: {
        model,
        effort: option('--effort', 'high'),
        timeout_ms: timeoutMs,
      },
    });
    await Promise.all([
      writeFile(join(outDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`),
      writeFile(join(outDir, 'report.md'), renderInstalledProductMarkdown(result.comparison)),
    ]);
    const ok = result.comparison.overall.criteria_passed;
    console.log(JSON.stringify({
      ok,
      diagnostic_only: true,
      out: outDir,
      overall: result.comparison.overall,
    }, null, 2));
    if (!ok) process.exitCode = 1;
  }
}
