#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { findCodexRollouts, normalizeCodexRollouts } from '../src/codex-agent-trace.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const rootThreadId = option('--thread');
const caseId = option('--case');
const variant = option('--variant');
const out = resolve(option('--out', '.loopx/evals/gpt-5.6/codex-events.jsonl'));
if (!rootThreadId || !caseId || !variant) {
  throw new Error('Usage: normalize-codex-agent-trace --thread <id> --case <id> --variant <name> [--out <path>]');
}

const sessionsRoot = resolve(option('--sessions', `${process.env.HOME}/.codex/sessions`));
const rollouts = await findCodexRollouts(sessionsRoot, rootThreadId);
if (rollouts.length === 0) {
  throw new Error(`codex_agent_eval_thread_not_found:${rootThreadId}`);
}
const events = normalizeCodexRollouts(rollouts, {
  rootThreadId,
  caseId,
  variant,
  model: option('--model'),
  reasoningEffort: option('--reasoning-effort'),
});
await writeFile(out, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
console.log(JSON.stringify({ ok: true, thread_id: rootThreadId, rollouts: rollouts.length, events: events.length, out }, null, 2));
