#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { applyAgentEvalPolicies, compareAgentEvalRuns, evaluateControllerIntegration, evaluateLeafReviewResult, parseReviewResult, renderAgentEvalMarkdown, summarizeAgentEvalRun } from '../src/agent-eval.mjs';
import { findClaudeSession, normalizeClaudeSession, extractClaudeLeafFinalMessage } from '../src/claude-agent-trace.mjs';

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

function runClaude(args, prompt, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn('claude', args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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

async function findNewestClaudeSession(sessionsRoot, afterMs) {
  const entries = await readdir(sessionsRoot, { withFileTypes: true });
  const jsonlFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl') && e.name.includes('-') && e.name.includes('-'))
    .map((e) => ({ name: e.name, path: join(sessionsRoot, e.name) }));

  // Get file mtime for each
  const withTimes = await Promise.all(
    jsonlFiles.map(async (f) => {
      try {
        const stat = await import('node:fs/promises').then((m) => m.stat(f.path));
        return { ...f, mtimeMs: stat.mtimeMs, birthtimeMs: stat.birthtimeMs };
      } catch {
        return null;
      }
    })
  );

  const valid = withTimes.filter(Boolean);
  // Sort by mtime descending, pick the newest one created after our start
  valid.sort((a, b) => b.birthtimeMs - a.birthtimeMs);

  if (valid.length === 0) return null;

  const newest = valid[0];
  if (afterMs && newest.birthtimeMs <= afterMs) {
    // None of the files are newer than our cutoff
    // Try to find one with a matching recent mtime
    valid.sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (valid[0].mtimeMs > afterMs) {
      return valid[0].name.replace(/\.jsonl$/, '');
    }
    return null;
  }

  return newest.name.replace(/\.jsonl$/, '');
}

async function runOne({ repoRoot, sessionsRoot, outDir, testCase, variant, variantConfig, model, reasoningEffort, workerRole }) {
  const prompt = controllerPrompt(testCase, await promptAtRef(repoRoot, variantConfig.git_ref, variantConfig.prompt_path), workerRole);
  const messagePath = join(outDir, `${testCase.id}-${variant}-message.txt`);
  const leafMessagePath = join(outDir, `${testCase.id}-${variant}-leaf-message.txt`);
  const rawPath = join(outDir, `${testCase.id}-${variant}-claude.jsonl`);

  // Record timestamp before run to identify the new session
  const beforeMs = Date.now();
  const startedAt = beforeMs;

  // Build claude args — don't pass --model or --effort so the CLI uses
  // the user's configured default model (settings.json). The spawned
  // subagent will inherit the same session model/effort.
  const claudeArgs = [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
  ];
  if (reasoningEffort) {
    claudeArgs.push('--effort', reasoningEffort);
  }

  const result = await runClaude(claudeArgs, '', { cwd: repoRoot });
  const stdout = result.stdout || '';
  const commandFailed = result.code !== 0 || result.timedOut;

  // Save raw stdout
  await writeFile(messagePath, stdout);

  // Find the session trace that was just created
  let sessionId;
  const afterMs = Date.now();
  // Try direct approach: find by time window
  const entries = await readdir(sessionsRoot, { withFileTypes: true });
  const candidates = entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => join(sessionsRoot, e.name));

  // Look for files modified after beforeMs - 1000ms (some fudge)
  const sessionCandidates = [];
  for (const path of candidates) {
    try {
      const stat = (await import('node:fs/promises')).stat;
      const st = await stat(path);
      if (st.birthtimeMs > beforeMs - 1000 || st.mtimeMs > beforeMs - 1000) {
        sessionCandidates.push({ path, mtimeMs: st.mtimeMs, birthtimeMs: st.birthtimeMs });
      }
    } catch { /* skip */ }
  }
  sessionCandidates.sort((a, b) => b.birthtimeMs - a.birthtimeMs);

  if (sessionCandidates.length > 0) {
    sessionId = sessionCandidates[0].path.replace(/.*\//, '').replace(/\.jsonl$/, '');
    // Copy the session trace to our output dir for reproducibility
    const sessionJsonl = await readFile(sessionCandidates[0].path, 'utf8');
    await writeFile(rawPath, sessionJsonl);
  } else {
    // Fallback: try finding by newest mtime
    sessionId = await findNewestClaudeSession(sessionsRoot, beforeMs);
    if (sessionId) {
      const sessionJsonl = await readFile(join(sessionsRoot, `${sessionId}.jsonl`), 'utf8');
      await writeFile(rawPath, sessionJsonl);
    }
  }

  if (!sessionId) {
    throw new Error(`claude_live_eval_session_not_found:${testCase.id}:${variant}`);
  }

  // Process trace
  const session = await findClaudeSession(sessionsRoot, sessionId);
  const controllerFinalMessage = stdout;
  const leafResult = extractClaudeLeafFinalMessage(session);
  const finalMessage = leafResult.message;
  await writeFile(leafMessagePath, finalMessage || '(no leaf message)');

  const events = normalizeClaudeSession(session, {
    runId: `${testCase.id}-${variant}-${sessionId}`,
    caseId: testCase.id,
    variant,
    model,
    reasoningEffort,
  });

  // Scoring
  const expected = new RegExp(testCase.expected_pattern, 'i');
  const end = events.at(-1);
  let leafReviewResult = null;
  let controllerReviewResult = null;
  let leafReviewResultError = null;
  let controllerReviewResultError = null;

  try {
    leafReviewResult = parseReviewResult(finalMessage);
  } catch (error) {
    leafReviewResultError = error.message;
  }
  try {
    controllerReviewResult = parseReviewResult(controllerFinalMessage);
  } catch (error) {
    controllerReviewResultError = error.message;
  }

  const integration = leafReviewResult
    ? evaluateControllerIntegration(leafReviewResult, controllerReviewResult)
    : null;
  const reviewResultRequired = testCase.require_review_result === true;
  const leafReviewResultValid = reviewResultRequired ? Boolean(leafReviewResult) : leafReviewResultError === null;
  const structuredQuality = leafReviewResult && testCase.expected_review_result
    ? evaluateLeafReviewResult(leafReviewResult, testCase.expected_review_result)
    : null;
  const expectedPassed = leafReviewResultValid
    && (structuredQuality ? structuredQuality.passed : expected.test(finalMessage || ''));

  end.outcome = !commandFailed && expectedPassed ? 'passed' : 'failed';
  end.tests_passed = expectedPassed;
  end.leaf_review_result_valid = leafReviewResultValid;
  end.controller_review_result_valid = controllerReviewResultError === null && (!leafReviewResult || Boolean(controllerReviewResult));
  end.leaf_review_result_error = leafReviewResultError;
  end.controller_review_result_error = controllerReviewResultError;
  end.leaf_quality_violations = structuredQuality?.violations ?? [];
  if (integration) {
    Object.assign(end, integration);
  } else if (reviewResultRequired) {
    end.integration_passed = false;
  }
  end.latency_ms = Date.now() - startedAt;
  end.at_ms = end.latency_ms;

  return {
    events,
    finalMessage,
    controllerFinalMessage,
    threadId: sessionId,
    leafThreadId: leafResult.threadId,
    rawPath,
    messagePath,
    leafMessagePath,
  };
}

// ===== Main =====
const repoRoot = resolve(option('--repo', process.cwd()));
const outDir = resolve(option('--out', `.loopx/evals/gpt-5.6/claude-live-${Date.now()}`));
const casesPath = resolve(option('--cases', 'evals/gpt-5.6/live-cases.json'));
const manifestPath = resolve(option('--manifest', 'evals/gpt-5.6/cases.json'));
const model = option('--model', 'claude-sonnet-5');
const reasoningEffort = option('--reasoning-effort', 'high');
const selected = option('--case');
const order = option('--order', 'baseline-first');
const onlyVariant = option('--variant');
const sessionsRoot = resolve(option('--sessions', `${process.env.HOME}/.claude/projects/-Users-zhangyukun-project-loopx`));

const liveCases = JSON.parse(await readFile(casesPath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const cases = selected ? liveCases.cases.filter((item) => item.id === selected) : liveCases.cases;
if (cases.length === 0) {
  throw new Error(`claude_live_eval_case_not_found:${selected}`);
}

await mkdir(outDir, { recursive: true });
const allEvents = [];
for (const testCase of cases) {
  const runNonce = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const resolvedCase = {
    ...testCase,
    require_review_result: liveCases.require_review_result === true,
    task: testCase.task.replaceAll('{{RUN_NONCE}}', runNonce),
  };
  const variants = onlyVariant
    ? [onlyVariant]
    : order === 'candidate-first'
      ? [manifest.candidate_variant, manifest.baseline_variant]
      : [manifest.baseline_variant, manifest.candidate_variant];
  for (const variant of variants) {
    if (!manifest.variants[variant]) {
      throw new Error(`claude_live_eval_variant_not_found:${variant}`);
    }
    const variantConfig = {
      ...manifest.variants[variant],
      prompt_path: liveCases.prompt_path ?? manifest.variants[variant].prompt_path,
    };
    console.error(`running ${testCase.id}/${variant}...`);
    const result = await runOne({ repoRoot, sessionsRoot, outDir, testCase: resolvedCase, variant, variantConfig, model, reasoningEffort, workerRole: liveCases.worker_role });
    allEvents.push(...result.events);
    console.error(`  completed: session=${result.threadId} leaf=${result.leafThreadId}`);
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
