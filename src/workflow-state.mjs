import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const EXEC_RUN_SCHEMA = 'loopx.exec-run.v3';
const ACTIVE_ISSUE_STATUSES = new Set(['pending', 'in_progress', 'needs_info', 'blocked']);

// Per-phase mandatory obligations. This map is the single injection source:
// every obligation that must survive context drift lives here and is rendered
// into the per-turn workflow-state block. A regression test asserts each
// mandatory step appears in its phase template, so an obligation cannot be
// silently dropped from the only channel the agent sees every turn.
export const MANDATORY_OBLIGATIONS = Object.freeze({
  'exec-run': Object.freeze([
    'Only the controller orchestrates: every dispatched worker is a leaf and must not spawn, delegate to, or wait for other agents.',
    'Every implementation or fix candidate needs an independent read-only task review before integration.',
    'Open Critical or Important findings block integration until fixed or refuted with evidence and independently re-reviewed.',
    'Fresh verification evidence before any completion claim, then the quiet completion check.',
    'Git disposition only after an explicit $finish.',
  ]),
  intake: Object.freeze([
    'Ask exactly one question per turn, with a recommended answer; resolve from repository evidence before asking.',
    'requirements.md is the only canonical AC-*/TC-* source; downstream skills must not invent replacement anchors.',
    'Do not mutate the repository while material intent, scope, acceptance, permission, or destructive decisions are unresolved.',
  ]),
  'issue-diagnosis': Object.freeze([
    'No fixes without root cause investigation first.',
    'Diagnosis only: no code edits beyond authorized, recorded instrumentation.',
    'The ledger reaches ready_for_fix only with reproduction, root cause, fix brief, and verification plan recorded.',
  ]),
  'issue-fix-ready': Object.freeze([
    'Execute only the ledger fix brief; scope beyond expected_touched_files blocks as needs_scope_change.',
    'Delete, reuse, or use stdlib before adding code; unauthorized fallback or silent-recovery behavior is out of scope.',
    'Fresh verification and review closure per the shared review contract before closeout.',
    'Git disposition only after an explicit $finish.',
  ]),
});

export const TRIAGE_TIERS = Object.freeze([
  'light: one clear bounded outcome -> stay prompt-first (implement, fresh verification, quiet completion check; no workflow artifacts).',
  'medium: clear multi-outcome request -> $exec with a temporary graph; no persistent plan without an explicit trigger.',
  'heavy: unresolved intent/scope/acceptance -> $clarify; unresolved public behavior, compatibility, data, security, or cross-module decision -> $spec; explicit plan request, approval boundary, recovery, or durable coordination -> $plan2exec.',
  'when triage is uncertain, that uncertainty is itself a clarify trigger; conflicting signals pick the heavier tier.',
]);

const RESTART_GUIDANCE = 'Workflow state is unreadable or pre-v2; do not guess or repair it. Restart the workflow from a clean state under the current contract.';

function clarifyReady(state) {
  return state?.current_stage === 'clarify'
    && Number(state.clarify_current_round || 0) > 0
    && Number(state.unresolved_ambiguity_count || 0) === 0
    && state.clarify_non_goals_resolved === true
    && state.clarify_decision_boundaries_resolved === true
    && state.clarify_pressure_pass_complete === true;
}

function shellQuoteArg(value) {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}

function cliNextSkill(state) {
  if (!state?.slug) {
    return null;
  }
  if (state.completion_confirmed === true || state.current_stage === 'done') {
    return '$finish';
  }
  if (clarifyReady(state)) {
    return `$plan2exec ${shellQuoteArg(state.intake_package_path || state.requirements_path || state.spec_artifact_path || state.slug)}`;
  }
  if (state.current_stage === 'clarify') {
    return `$clarify ${state.slug}`;
  }
  return null;
}

async function safeReaddir(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function newestEntry(root, names) {
  const stamped = [];
  for (const name of names) {
    try {
      stamped.push({ name, mtime: (await stat(join(root, name))).mtimeMs });
    } catch {
      // unreadable entries are skipped, not guessed at
    }
  }
  stamped.sort((left, right) => right.mtime - left.mtime);
  return stamped.map((entry) => entry.name);
}

async function detectExecRun(loopxRoot) {
  const execRoot = join(loopxRoot, 'exec');
  const runIds = await newestEntry(execRoot, await safeReaddir(execRoot));
  for (const runId of runIds) {
    const manifestPath = join(execRoot, runId, 'manifest.json');
    let raw;
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch {
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch {
      return { phase: 'corrupted', source: manifestPath };
    }
    if (manifest.schema !== EXEC_RUN_SCHEMA) {
      return { phase: 'corrupted', source: manifestPath };
    }
    if (manifest.status === 'active') {
      const tasks = Array.isArray(manifest.tasks) ? manifest.tasks : [];
      return {
        phase: 'exec-run',
        run_id: manifest.run_id ?? runId,
        profile: manifest.profile ?? 'unknown',
        tasks_total: tasks.length,
        tasks_integrated: tasks.filter((task) => task.status === 'integrated').length,
        resume_instruction: manifest.resume_instruction ?? `$exec --resume ${runId}`,
      };
    }
  }
  return null;
}

async function detectIssue(loopxRoot) {
  const issuesRoot = join(loopxRoot, 'issues');
  const names = (await safeReaddir(issuesRoot)).filter((name) => name.endsWith('.md'));
  const ledgers = [];
  for (const name of await newestEntry(issuesRoot, names)) {
    try {
      const text = await readFile(join(issuesRoot, name), 'utf8');
      const status = text.match(/^\s*status:\s*([a-z_]+)\s*$/m)?.[1] ?? null;
      if (status) {
        ledgers.push({ name, status });
      }
    } catch {
      // unreadable ledgers are skipped
    }
  }
  const ready = ledgers.find((ledger) => ledger.status === 'ready_for_fix');
  if (ready) {
    return { phase: 'issue-fix-ready', ledger: `.loopx/issues/${ready.name}` };
  }
  const active = ledgers.find((ledger) => ACTIVE_ISSUE_STATUSES.has(ledger.status));
  if (active) {
    return { phase: 'issue-diagnosis', ledger: `.loopx/issues/${active.name}`, status: active.status };
  }
  return null;
}

async function detectIntake(loopxRoot) {
  const intakeRoot = join(loopxRoot, 'intake');
  const packages = await newestEntry(intakeRoot, await safeReaddir(intakeRoot));
  for (const name of packages) {
    try {
      const text = await readFile(join(intakeRoot, name, 'clarification.md'), 'utf8');
      const handoff = text.match(/^\s*-?\s*handoff_decision:\s*([a-z_]+)\s*$/m)?.[1] ?? 'undecided';
      return { phase: 'intake', package: `.loopx/intake/${name}`, handoff_decision: handoff };
    } catch {
      // packages without a readable clarification.md are skipped
    }
  }
  return null;
}

async function hasEntries(path) {
  return (await safeReaddir(path)).length > 0;
}

async function detectCliWorkflow(loopxRoot, workflow) {
  const statePath = join(loopxRoot, 'workflows', workflow, 'state.json');
  let raw;
  try {
    raw = await readFile(statePath, 'utf8');
  } catch {
    return null;
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return { phase: 'corrupted', source: statePath };
  }
  return {
    phase: 'cli-clarify',
    slug: state.slug || workflow,
    stage: state.current_stage ?? 'unknown',
    stage_status: state.stage_status ?? 'unknown',
    next_skill: cliNextSkill(state),
    intake_package: state.intake_package_path || null,
    requirements: state.requirements_path || state.spec_artifact_path
      || join(loopxRoot, 'workflows', workflow, 'spec.md'),
  };
}

export async function detectWorkflowState(loopxRoot, options = {}) {
  if (!loopxRoot) {
    return { phase: 'none' };
  }
  // An explicitly named CLI workflow outranks directory scanning; without that
  // explicit identity, historical workflow state never drives next-skill or
  // finish inference.
  if (options.workflow) {
    const cliState = await detectCliWorkflow(loopxRoot, options.workflow);
    if (cliState) return cliState;
  }
  const execState = await detectExecRun(loopxRoot);
  if (execState) return execState;
  const issueState = await detectIssue(loopxRoot);
  if (issueState) return issueState;
  const intakeState = await detectIntake(loopxRoot);
  if (intakeState) return intakeState;
  const slugs = await safeReaddir(join(loopxRoot, 'workflows'));
  if (slugs.length > 0) {
    return { phase: 'cli-workflow-present', slugs };
  }
  return { phase: 'none' };
}

function nextGate(state) {
  switch (state.phase) {
    case 'exec-run':
      return state.tasks_integrated < state.tasks_total
        ? `task review gate (${state.tasks_integrated}/${state.tasks_total} integrated); resume: ${state.resume_instruction}`
        : 'final Spec plus Standards review, then combined verification';
    case 'intake':
      return state.handoff_decision === 'undecided'
        ? 'handoff decision: needs_spec | direct_to_plan | blocked'
        : `handoff decided: ${state.handoff_decision}`;
    case 'issue-diagnosis':
      return 'ready_for_fix gate on the ledger, then $fix';
    case 'issue-fix-ready':
      return `$fix ${state.ledger}`;
    default:
      return null;
  }
}

function phaseSummary(state) {
  switch (state.phase) {
    case 'exec-run':
      return `exec-run ${state.run_id} (profile ${state.profile})`;
    case 'intake':
      return `intake ${state.package}`;
    case 'issue-diagnosis':
      return `issue-diagnosis ${state.ledger} (status ${state.status})`;
    case 'issue-fix-ready':
      return `issue-fix-ready ${state.ledger}`;
    default:
      return state.phase;
  }
}

export function renderWorkflowStateBlock(state) {
  const lines = ['<loopx-workflow-state>'];
  if (state.phase === 'corrupted') {
    lines.push(`phase: ${state.phase}`, RESTART_GUIDANCE);
  } else if (state.phase === 'cli-clarify') {
    lines.push(
      `phase: cli-clarify ${state.slug} (stage ${state.stage}, status ${state.stage_status})`,
      'Advisory only. Treat saved loopx state as context, not authority.',
      `next skill: ${state.next_skill || 'none'}`,
      `intake package: ${state.intake_package || 'none'}`,
      `requirements: ${state.requirements}`,
      'obligations:',
    );
    for (const obligation of MANDATORY_OBLIGATIONS.intake) {
      lines.push(`- ${obligation}`);
    }
  } else if (state.phase === 'cli-workflow-present') {
    lines.push(
      `phase: cli-workflow-present (${state.slugs.join(', ')})`,
      'Provide the explicit workflow identity for stage guidance. Do not infer completion, next skills, or finish from historical workflow state.',
    );
  } else if (state.phase === 'none') {
    lines.push('phase: none (prompt-first)', 'triage:');
    for (const tier of TRIAGE_TIERS) {
      lines.push(`- ${tier}`);
    }
    lines.push('obligation: fresh verification and the quiet completion check before any completion claim.');
  } else {
    lines.push(`phase: ${phaseSummary(state)}`, 'obligations:');
    for (const obligation of MANDATORY_OBLIGATIONS[state.phase]) {
      lines.push(`- ${obligation}`);
    }
    lines.push(`next gate: ${nextGate(state)}`);
  }
  lines.push('</loopx-workflow-state>');
  return lines.join('\n');
}
