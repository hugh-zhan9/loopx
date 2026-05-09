#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { nextSkillCommand } from '../src/next-skill.mjs';

function readStdin() {
  return new Promise((resolveValue) => {
    let text = '';
    let resolved = false;
    const finish = (value) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolveValue(value);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      text += chunk;
    });
    process.stdin.on('end', () => finish(text));
    if (process.stdin.isTTY) {
      finish('');
    }
    setTimeout(() => finish(text), 50).unref();
  });
}

function nextSkill(state) {
  const command = nextSkillCommand(state);
  if (command) {
    return command;
  }
  if (state.current_stage === 'review' && state.review_verdict === 'approve' && state.pending_user_decision === 'review->done') {
    return `loopx approve ${state.slug} --from review --to done`;
  }
  return null;
}

function blockers(state) {
  const values = [
    ...(Array.isArray(state.plan_blockers) ? state.plan_blockers : []),
    ...(Array.isArray(state.build_blockers) ? state.build_blockers : []),
    ...(Array.isArray(state.autopilot_blockers) ? state.autopilot_blockers : []),
  ].filter(Boolean);
  if (state.rollback_target && state.rollback_target !== 'none') {
    values.push(`rollback_target:${state.rollback_target}`);
  }
  return values.length > 0 ? values.join(',') : '(none)';
}

function latestWorkflowSlug(runtimeRoot) {
  const workflowsRoot = join(runtimeRoot, 'workflows');
  if (!existsSync(workflowsRoot)) {
    return null;
  }
  const entries = readdirSync(workflowsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return entries.at(-1) || null;
}

function findNearestLoopxRuntimeRoot(startCwd) {
  let current = resolve(startCwd);
  while (true) {
    const candidate = join(current, '.loopx');
    if (existsSync(join(candidate, 'workflows'))) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

try {
  if (process.env.LOOPX_HOOKS === '0') {
    process.exit(0);
  }
  const inputText = await readStdin();
  const input = inputText.trim() ? JSON.parse(inputText) : {};
  const cwd = resolve(input.cwd || process.cwd());
  const runtimeRoot = findNearestLoopxRuntimeRoot(cwd);
  if (!runtimeRoot) {
    process.exit(0);
  }
  const workflow = input.workflow || input.slug || latestWorkflowSlug(runtimeRoot);
  if (!workflow) {
    process.exit(0);
  }
  const workflowRoot = join(runtimeRoot, 'workflows', workflow);
  const statePath = join(workflowRoot, 'state.json');
  if (!existsSync(statePath)) {
    process.exit(0);
  }
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const buildContextPath = state.build_context_manifest_path || `.loopx/workflows/${workflow}/build-context.jsonl`;
  const reviewContextPath = state.review_context_manifest_path || `.loopx/workflows/${workflow}/review-context.jsonl`;
  const lines = [
    `loopx workflow: ${state.slug || workflow}`,
    `stage: ${state.current_stage || 'unknown'} (${state.stage_status || 'unknown'})`,
    `next: ${nextSkill(state) || state.recommended_next_action || 'none'}`,
    `blockers: ${blockers(state)}`,
    `approval: ${JSON.stringify(state.approval || {})}`,
    `build context: ${buildContextPath}`,
    `review context: ${reviewContextPath}`,
    'advisory only: loopx state gates remain authoritative.',
  ];
  process.stdout.write(`${lines.join('\n').slice(0, 4000)}\n`);
} catch {
  process.exit(0);
}
