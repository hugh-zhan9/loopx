#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { applyAgentEvalPolicies, compareAgentEvalRuns, evaluateControllerIntegration, parseReviewResult, renderAgentEvalMarkdown, summarizeAgentEvalRun } from '../src/agent-eval.mjs';
import { extractCodexLeafFinalMessage, findCodexRollouts, normalizeCodexRollouts } from '../src/codex-agent-trace.mjs';

const execFileAsync = promisify(execFile);

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function promptAtRef(repoRoot, ref, path) {
  if (ref === 'HEAD') {
    return readFile(join(repoRoot, path), 'utf8');
  }
  return (await execFileAsync('git', ['show', `${ref}:${path}`], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 })).stdout;
}

function controllerPrompt(testCase, workerPrompt, workerRole = 'implementer') {
  return [
    'You are the top-level controller in a loopx agent evaluation.',
    `Create exactly one ${workerRole} subagent for the bounded task below. Do not perform the task yourself.`,
    'Pass the worker the task plus the worker contract below. The worker must remain a leaf agent.',
    'After the worker returns, report its result concisely and stop. Do not create a reviewer or replacement.',
    'If the worker returns a loopx-review-result block, reproduce that block verbatim in your final response. Do not reconstruct its status, severities, finding IDs, anchors, or cannot-verify items.',
    '',
    `TASK: ${testCase.task}`,
    '',
    'WORKER CONTRACT:',
    workerPrompt,
  ].join('\n');
}

function runCodex(args, prompt, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn('codex', args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeoutMs ?? 12 * 60 * 1000);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({
        code,
        timedOut,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.stdin.end(prompt);
  });
}

async function runOne({ repoRoot, sessionsRoot, outDir, testCase, variant, variantConfig, model, reasoningEffort, workerRole }) {
  const prompt = controllerPrompt(testCase, await promptAtRef(repoRoot, variantConfig.git_ref, variantConfig.prompt_path), workerRole);
  const rawPath = join(outDir, `${testCase.id}-${variant}-codex.jsonl`);
  const messagePath = join(outDir, `${testCase.id}-${variant}-message.txt`);
  const leafMessagePath = join(outDir, `${testCase.id}-${variant}-leaf-message.txt`);
  const startedAt = Date.now();
  const result = await runCodex([
      'exec', '-', '--json', '--ignore-rules', '-s', 'read-only', '-C', repoRoot,
      '-m', model,
      '-c', `model_reasoning_effort="${reasoningEffort}"`,
      '-o', messagePath,
    ], prompt, { cwd: repoRoot });
  const stdout = result.stdout;
  const stderr = result.stderr;
  const commandFailed = result.code !== 0 || result.timedOut;
  await writeFile(rawPath, stdout);
  const threadMatch = stdout.match(/"type":"thread\.started","thread_id":"([^"]+)"/);
  if (!threadMatch) {
    throw new Error(`codex_live_eval_thread_missing:${testCase.id}:${variant}:${stderr.slice(0, 500)}`);
  }
  const threadId = threadMatch[1];
  const rollouts = await findCodexRollouts(sessionsRoot, threadId);
  const events = normalizeCodexRollouts(rollouts, {
    rootThreadId: threadId,
    runId: `${testCase.id}-${variant}-${threadId}`,
    caseId: testCase.id,
    variant,
    model,
    reasoningEffort,
  });
  const controllerFinalMessage = await readFile(messagePath, 'utf8').catch(() => '');
  const leafResult = extractCodexLeafFinalMessage(rollouts, threadId);
  const finalMessage = leafResult.message;
  await writeFile(leafMessagePath, finalMessage);
  const expected = new RegExp(testCase.expected_pattern, 'i');
  const end = events.at(-1);
  const leafReviewResult = parseReviewResult(finalMessage);
  const controllerReviewResult = parseReviewResult(controllerFinalMessage);
  const integration = leafReviewResult
    ? evaluateControllerIntegration(leafReviewResult, controllerReviewResult)
    : null;
  end.outcome = !commandFailed && expected.test(finalMessage) ? 'passed' : 'failed';
  end.tests_passed = expected.test(finalMessage);
  if (integration) {
    Object.assign(end, integration);
  }
  end.latency_ms = Date.now() - startedAt;
  end.at_ms = end.latency_ms;
  return {
    events,
    finalMessage,
    controllerFinalMessage,
    threadId,
    leafThreadId: leafResult.threadId,
    rawPath,
    messagePath,
    leafMessagePath,
  };
}

const repoRoot = resolve(option('--repo', process.cwd()));
const outDir = resolve(option('--out', `.loopx/evals/gpt-5.6/live-${Date.now()}`));
const casesPath = resolve(option('--cases', 'evals/gpt-5.6/live-cases.json'));
const manifestPath = resolve(option('--manifest', 'evals/gpt-5.6/cases.json'));
const model = option('--model', 'gpt-5.6-sol');
const reasoningEffort = option('--reasoning-effort', 'high');
const selected = option('--case');
const order = option('--order', 'baseline-first');
const sessionsRoot = resolve(option('--sessions', `${process.env.HOME}/.codex/sessions`));
const liveCases = JSON.parse(await readFile(casesPath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const cases = selected ? liveCases.cases.filter((item) => item.id === selected) : liveCases.cases;
if (cases.length === 0) {
  throw new Error(`codex_live_eval_case_not_found:${selected}`);
}

await mkdir(outDir, { recursive: true });
const allEvents = [];
for (const testCase of cases) {
  const runNonce = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const resolvedCase = {
    ...testCase,
    task: testCase.task.replaceAll('{{RUN_NONCE}}', runNonce),
  };
  const variants = order === 'candidate-first'
    ? [manifest.candidate_variant, manifest.baseline_variant]
    : [manifest.baseline_variant, manifest.candidate_variant];
  for (const variant of variants) {
    const variantConfig = {
      ...manifest.variants[variant],
      prompt_path: liveCases.prompt_path ?? manifest.variants[variant].prompt_path,
    };
    const result = await runOne({ repoRoot, sessionsRoot, outDir, testCase: resolvedCase, variant, variantConfig, model, reasoningEffort, workerRole: liveCases.worker_role });
    allEvents.push(...result.events);
    console.error(`completed ${testCase.id}/${variant} thread=${result.threadId}`);
  }
}

const eventsPath = join(outDir, 'events.jsonl');
await writeFile(eventsPath, `${allEvents.map((event) => JSON.stringify(event)).join('\n')}\n`);
const policyManifest = {
  ...manifest,
  cases: manifest.cases.map((item) => ({
    ...item,
    limits: liveCases.cases.find((candidate) => candidate.id === item.id)?.limits ?? item.limits,
  })),
};
const summaries = applyAgentEvalPolicies(
  [...Map.groupBy(allEvents, (event) => event.run_id).values()].map(summarizeAgentEvalRun),
  policyManifest,
);
const comparison = compareAgentEvalRuns(summaries, {
  baselineVariant: manifest.baseline_variant,
  candidateVariant: manifest.candidate_variant,
});
await Promise.all([
  writeFile(join(outDir, 'run-summaries.json'), `${JSON.stringify(summaries, null, 2)}\n`),
  writeFile(join(outDir, 'comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`),
  writeFile(join(outDir, 'report.md'), renderAgentEvalMarkdown(comparison)),
]);
console.log(JSON.stringify({ ok: true, order, out: outDir, events: eventsPath, overall: comparison.overall }, null, 2));
