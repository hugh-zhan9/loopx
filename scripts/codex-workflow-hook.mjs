#!/usr/bin/env node

import { existsSync } from 'node:fs';
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

function findNearestLoopxRoot(startCwd) {
  let current = resolve(startCwd);
  while (true) {
    const candidate = join(current, '.loopx');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

// Static relative imports crash at module load when the hook file is copied
// into an installed hooks directory, killing the whole hook before any
// try/catch runs. Every dependency loads dynamically from candidate layouts
// (installed sibling first, repository second) and degrades silently.
async function loadModule(candidates) {
  for (const candidate of candidates) {
    try {
      return await import(new URL(candidate, import.meta.url).href);
    } catch {
      // try the next layout
    }
  }
  return null;
}

async function lancetAdvisory(input) {
  // Best-effort, Codex-only support lens. Never throws; returns null on any
  // degrade condition so the workflow-state output stays intact.
  try {
    const lancet = await loadModule(['./lancet-runtime.mjs', '../src/lancet-runtime.mjs']);
    if (!lancet) {
      return null;
    }
    const stage = lancet.resolveLancetStage({ skillName: input.skillName });
    if (!stage) {
      return null;
    }
    const [config, session] = await Promise.all([
      lancet.readLancetConfig(process.env),
      lancet.readLancetSession(process.env),
    ]);
    if (config.enabled !== true || config.codexAutoEnable !== true || session.mode === 'off') {
      return null;
    }
    return lancet.buildLancetGuidance({ stage });
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
  const loopxRoot = findNearestLoopxRoot(cwd);

  if (loopxRoot) {
    const workflowState = await loadModule(['./workflow-state.mjs', '../src/workflow-state.mjs']);
    if (workflowState) {
      const state = await workflowState.detectWorkflowState(loopxRoot, {
        workflow: input.workflow || input.slug || null,
      });
      process.stdout.write(`${workflowState.renderWorkflowStateBlock(state).slice(0, 4000)}\n`);
    }
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

  // Best-effort version check — repository layout only, non-blocking.
  if (loopxRoot) {
    const versionCheck = await loadModule(['../src/version-check.mjs']);
    if (versionCheck) {
      try {
        const result = await versionCheck.checkForUpdates({
          cachePath: join(loopxRoot, '.version-check'),
          timeout: 3000,
        });
        const notification = versionCheck.updateNotification(result);
        if (notification) {
          process.stdout.write(`${notification}\n`);
        }
      } catch {
        // silently ignore version check failures
      }
    }
  }
} catch {
  process.exit(0);
}
