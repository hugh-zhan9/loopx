import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ACTIVE_PHASES = new Set(['starting', 'executing', 'verifying', 'fixing']);
const READY_PHASES = new Set(['review-ready', 'complete']);
const TERMINAL_PHASES = new Set(['blocked', 'failed', 'cancelled', 'review-ready', 'complete']);

export function buildActivePath(cwd) {
  return join(resolve(cwd), '.loopx', 'build-active.json');
}

function nowIso() {
  return new Date().toISOString();
}

export async function writeBuildActiveState(cwd, patch) {
  const path = buildActivePath(cwd);
  let existing = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      existing = {};
    }
  }
  const next = {
    schema_version: 1,
    updated_at: nowIso(),
    ...existing,
    ...patch,
  };
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function readBuildActiveState(cwd) {
  const path = buildActivePath(cwd);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

export function evaluateBuildStopGate(state) {
  if (!state || state.active !== true) {
    return {
      allow: true,
      reason: 'no_active_build',
    };
  }

  if (READY_PHASES.has(state.phase) && state.review_handoff_ready === true) {
    return {
      allow: true,
      reason: 'build_review_handoff_ready',
      state,
    };
  }

  if (TERMINAL_PHASES.has(state.phase) && state.phase !== 'review-ready') {
    return {
      allow: true,
      reason: `build_${state.phase}`,
      state,
    };
  }

  if (ACTIVE_PHASES.has(state.phase) || state.review_handoff_ready !== true) {
    const blockers = Array.isArray(state.blockers) ? state.blockers.filter(Boolean) : [];
    const blockerText = blockers.length > 0 ? ` blockers=${blockers.join(',')}` : '';
    const ownerText = state.build_owner_id ? ` owner: ${state.build_owner_id}.` : '';
    const delegationCount = Number.isFinite(Number(state.active_delegation_count)) ? Number(state.active_delegation_count) : null;
    const delegationText = delegationCount !== null ? ` active delegations=${delegationCount}.` : '';
    const auditText = state.completion_audit_status ? ` completion audit: ${state.completion_audit_status}.` : '';
    const nextAction = state.next_action ? ` next action: ${state.next_action}` : ' next action: continue the contract-covered next step in $build.';
    const completionSignal = state.completion_signal ? ` completion signal: ${state.completion_signal}` : ' completion signal: review handoff readiness, a real blocker, user stop, or a return to plan/clarify.';
    return {
      allow: false,
      reason: `loopx build is still active for workflow "${state.slug ?? 'unknown'}" (phase: ${state.phase ?? 'unknown'}; iteration: ${state.iteration ?? 0}/${state.max_iterations ?? '?'}; state: .loopx/build-active.json).${ownerText}${delegationText}${auditText} Do not stop while a contract-covered next step remains.${nextAction}${completionSignal} If the work is genuinely blocked, record the blocker and leave build in a blocked state. If new evidence changes the contract, return to plan/clarify instead of stopping.${blockerText}`,
      state,
    };
  }

  return {
    allow: true,
    reason: 'build_state_not_active',
    state,
  };
}

export async function evaluateBuildStopGateForCwd(cwd) {
  return evaluateBuildStopGate(await readBuildActiveState(cwd));
}
