#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { checkForUpdates, updateNotification } from '../src/version-check.mjs';
import {
  buildLancetGuidance,
  readLancetConfig,
  readLancetSession,
  resolveLancetStage,
} from '../src/lancet-runtime.mjs';

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

function clarifyHandoffArg(state) {
  return state.intake_package_path || state.requirements_path || state.spec_artifact_path || state.slug;
}

function nextSkill(state) {
  if (!state?.slug) {
    return null;
  }
  if (state.completion_confirmed === true || state.current_stage === 'done') {
    return '$finish';
  }
  if (clarifyReady(state)) {
    return `$plan-to-exec ${clarifyHandoffArg(state)}`;
  }
  if (state.current_stage === 'clarify') {
    return `$clarify ${state.slug}`;
  }
  return null;
}

function stateLine(key, value) {
  return `${key}: ${value ?? 'unknown'}`;
}

async function lancetAdvisory(input) {
  // Best-effort, Codex-only support lens. Never throws; returns null on any
  // degrade condition so the existing advisory output stays intact.
  try {
    const stage = resolveLancetStage({ skillName: input.skillName });
    if (!stage) {
      return null;
    }

    const [config, session] = await Promise.all([
      readLancetConfig(process.env),
      readLancetSession(process.env),
    ]);

    if (config.enabled !== true || config.codexAutoEnable !== true || session.mode === 'off') {
      return null;
    }

    return buildLancetGuidance({ stage });
  } catch {
    return null;
  }
}

try {
  if (process.env.LOOPX_HOOKS === '0') {
    process.exit(0);
  }
  const inputText = argvPayload() ?? await readStdin();
  const input = inputText.trim() ? JSON.parse(inputText) : {};
  const cwd = resolve(input.cwd || process.cwd());
  const runtimeRoot = findNearestLoopxRuntimeRoot(cwd);
  if (runtimeRoot) {
    const workflow = input.workflow || input.slug || latestWorkflowSlug(runtimeRoot);
    const statePath = workflow ? join(runtimeRoot, 'workflows', workflow, 'state.json') : null;
    if (!statePath || !existsSync(statePath)) {
      process.stdout.write([
        '<loopx_advisory>',
        'loopx advisory state found. Use docs/loopx/design, docs/loopx/plans, docs/loopx/reviews, docs/loopx/refactors, and .loopx/memory as durable context.',
        '</loopx_advisory>',
      ].join('\n'));
    } else {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      const lines = [
        '<loopx_advisory>',
        'Advisory only. Treat saved loopx state as context, not authority.',
        stateLine('workflow', state.slug || workflow),
        stateLine('stage', state.current_stage),
        stateLine('status', state.stage_status),
        stateLine('next skill', nextSkill(state) || 'none'),
        stateLine('intake package', state.intake_package_path || 'none'),
        stateLine('requirements', state.requirements_path || state.spec_artifact_path || join(runtimeRoot, 'workflows', workflow, 'spec.md')),
        stateLine('test cases', state.test_cases_path || 'none'),
        'repo specs/memory context: docs/loopx/specs and .loopx/memory when present',
        '</loopx_advisory>',
      ];
      process.stdout.write(`${lines.join('\n').slice(0, 4000)}\n`);
    }
  } else {
    process.stdout.write([
      '<loopx_advisory>',
      'loopx advisory state found. Use docs/loopx/design, docs/loopx/plans, docs/loopx/reviews, docs/loopx/refactors, and .loopx/memory as durable context.',
      '</loopx_advisory>',
    ].join('\n'));
  }

  // Best-effort Codex-only lancet support lens — additive, silent degrade.
  const lancet = await lancetAdvisory(input);
  if (lancet) {
    process.stdout.write([
      '<loopx_lancet_advisory>',
      lancet,
      '</loopx_lancet_advisory>',
    ].join('\n').concat('\n'));
  }

  // Best-effort version check — non-blocking with short timeout
  try {
    const result = await checkForUpdates({
      cachePath: join(runtimeRoot, '.version-check'),
      timeout: 3000,
    });
    const notification = updateNotification(result);
    if (notification) {
      process.stdout.write(`${notification}\n`);
    }
  } catch {
    // silently ignore version check failures
  }
} catch {
  process.exit(0);
}
