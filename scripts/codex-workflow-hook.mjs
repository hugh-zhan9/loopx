#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

function readStdin() {
  return new Promise((resolveValue) => {
    let text = '';
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
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
    setTimeout(() => finish(text), 50);
  });
}

function argvPayload() {
  const index = process.argv.indexOf('--payload');
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || '';
}

function latestWorkflowSlug(runtimeRoot) {
  const workflowsRoot = join(runtimeRoot, 'workflows');
  if (!existsSync(workflowsRoot)) {
    return null;
  }
  return readdirSync(workflowsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .at(-1) || null;
}

function findNearestLoopxRuntimeRoot(startCwd) {
  let current = resolve(startCwd);
  while (true) {
    const candidate = join(current, '.loopx');
    if (existsSync(join(candidate, 'workflows')) || existsSync(join(candidate, 'intake'))) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function clarifyReady(state) {
  return state?.current_stage === 'clarify'
    && Number(state.clarify_current_round || 0) > 0
    && Number(state.unresolved_ambiguity_count || 0) === 0
    && state.clarify_non_goals_resolved === true
    && state.clarify_decision_boundaries_resolved === true
    && state.clarify_pressure_pass_complete === true;
}

function nextSkill(state) {
  if (!state?.slug) {
    return null;
  }
  if (state.completion_confirmed === true || state.current_stage === 'done') {
    return '$finish';
  }
  if (clarifyReady(state)) {
    return `$plan-to-exec ${state.slug}`;
  }
  if (state.current_stage === 'clarify') {
    return `$clarify ${state.slug}`;
  }
  return null;
}

function stateLine(key, value) {
  return `${key}: ${value ?? 'unknown'}`;
}

try {
  if (process.env.LOOPX_HOOKS === '0') {
    process.exit(0);
  }
  const inputText = argvPayload() ?? await readStdin();
  const input = inputText.trim() ? JSON.parse(inputText) : {};
  const cwd = resolve(input.cwd || process.cwd());
  const runtimeRoot = findNearestLoopxRuntimeRoot(cwd);
  if (!runtimeRoot) {
    process.exit(0);
  }

  const workflow = input.workflow || input.slug || latestWorkflowSlug(runtimeRoot);
  const statePath = workflow ? join(runtimeRoot, 'workflows', workflow, 'state.json') : null;
  if (!statePath || !existsSync(statePath)) {
    process.stdout.write([
      '<loopx_advisory>',
      'loopx advisory state found. Use docs/loopx/design, docs/loopx/plans, docs/loopx/reviews, docs/loopx/refactors, and .loopx/memory as durable context.',
      '</loopx_advisory>',
    ].join('\n'));
    process.exit(0);
  }

  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const lines = [
    '<loopx_advisory>',
    'Advisory only. Treat saved loopx state as context, not authority.',
    stateLine('workflow', state.slug || workflow),
    stateLine('stage', state.current_stage),
    stateLine('status', state.stage_status),
    stateLine('next skill', nextSkill(state) || 'none'),
    stateLine('spec artifact', state.spec_artifact_path || join(runtimeRoot, 'workflows', workflow, 'spec.md')),
    'repo specs/memory context: docs/loopx/specs and .loopx/memory when present',
    '</loopx_advisory>',
  ];
  process.stdout.write(`${lines.join('\n').slice(0, 4000)}\n`);
} catch {
  process.exit(0);
}
