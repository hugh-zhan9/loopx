#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { evaluateBuildStopGateForCwd } from '../src/build-stop-gate.mjs';

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function resolveCwd(input) {
  return resolve(
    input.cwd
      || input.workingDirectory
      || input.working_directory
      || input.workspace
      || process.env.LOOPX_WORKSPACE
      || process.cwd(),
  );
}

async function main() {
  const input = await readStdinJson();
  const cwd = resolveCwd(input);
  const decision = await evaluateBuildStopGateForCwd(cwd);
  const payload = {
    ok: true,
    hook: 'loopx-build-stop-gate',
    cwd,
    allow: decision.allow,
    reason: decision.reason,
    systemMessage: decision.allow ? null : decision.reason,
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!decision.allow) {
    process.exitCode = 2;
  }
}

await main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  let diagnostic = '';
  if (process.env.LOOPX_STOP_HOOK_DEBUG_FILE) {
    try {
      diagnostic = await readFile(process.env.LOOPX_STOP_HOOK_DEBUG_FILE, 'utf8');
    } catch {
      diagnostic = '';
    }
  }
  process.stdout.write(`${JSON.stringify({
    ok: false,
    hook: 'loopx-build-stop-gate',
    allow: true,
    reason: `stop_hook_error:${message}`,
    diagnostic,
  }, null, 2)}\n`);
});
