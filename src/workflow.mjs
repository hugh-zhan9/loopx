import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUTOPILOT_PHASES, createDefaultAutopilotAdapter } from './autopilot-runtime.mjs';
import { ensureLoopxRoot, resolveLoopxRoot } from './runtime-maintenance.mjs';
import { DEFAULT_BUILD_MAX_ITERATIONS, createDefaultBuildAdapter } from './build-runtime.mjs';
import { DEFAULT_MAX_ITERATIONS, createDefaultPlanAdapter } from './plan-runtime.mjs';
import { createDefaultReviewAdapter } from './review-runtime.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_SCHEMA_VERSION = 1;
const WORKFLOW_SCHEMA_VERSION = 1;

export const STAGES = {
  CLARIFY: 'clarify',
  PLAN: 'plan',
  BUILD: 'build',
  REVIEW: 'review',
  DONE: 'done',
};

export const APPROVAL_STATES = {
  NOT_REQUESTED: 'not-requested',
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const TRANSITIONS = {
  NONE: 'none',
  CLARIFY_TO_PLAN: 'clarify->plan',
  PLAN_TO_BUILD: 'plan->build',
  BUILD_TO_REVIEW: 'build->review',
  REVIEW_TO_PLAN: 'review->plan',
  REVIEW_TO_DONE: 'review->done',
};

const PLAN_ARTIFACTS = ['plan.md', 'architecture.md', 'development-plan.md', 'test-plan.md'];
const V1_ARTIFACTS = ['spec.md', ...PLAN_ARTIFACTS, 'execution-record.md', 'review-report.md'];
const LEGACY_ARTIFACTS = ['brief.md', 'plan.md', 'detailed-design.md', 'architecture.md', 'test-plan.md', 'build-result.md', 'review-report.md'];
const PLAN_REVIEW_DIR = 'plan-reviews';
const BUILD_SUPPORT_DIR = 'build-support';
const CLARIFY_PROFILES = {
  standard: {
    threshold: 0.2,
    maxRounds: 15,
  },
  deep: {
    threshold: 0.1,
    maxRounds: 25,
  },
};

function normalizeSlug(raw) {
  const slug = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new Error('workflow_slug_required');
  }
  return slug;
}

function nowIso() {
  return new Date().toISOString();
}

function nowStamp() {
  return nowIso().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function normalizeClarifyProfile(raw) {
  const value = String(raw || 'standard').trim().toLowerCase();
  if (!(value in CLARIFY_PROFILES)) {
    throw new Error(`invalid_clarify_profile:${value}`);
  }
  return value;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return {};
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return {};
  }

  const result = {};
  for (const line of text.slice(4, end).split('\n')) {
    if (!line || /^\s/.test(line)) {
      continue;
    }
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (rawValue === 'null') {
      result[key] = null;
      continue;
    }
    if (rawValue === 'true' || rawValue === 'false') {
      result[key] = rawValue === 'true';
      continue;
    }
    if (/^-?\d+$/.test(rawValue)) {
      result[key] = Number.parseInt(rawValue, 10);
      continue;
    }
    if (rawValue.startsWith('[') || rawValue.startsWith('{')) {
      result[key] = JSON.parse(rawValue);
      continue;
    }
    result[key] = rawValue;
  }
  return result;
}

function frontmatterBlock(values) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (value === null) {
      lines.push(`${key}: null`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function frontmatterBoolean(value) {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return Boolean(value);
}

function statePath(root) {
  return join(root, 'state.json');
}

function workspaceConfigPath(root) {
  return join(root, 'config.json');
}

function workspaceReadmePath(root) {
  return join(root, 'README.md');
}

function artifactPath(root, name) {
  return join(root, name);
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function readTemplate(name) {
  return readFile(join(resolve(MODULE_DIR, '../templates'), name), 'utf8');
}

async function readTextIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  return readFile(path, 'utf8');
}

async function writeText(path, text) {
  await writeFile(path, `${text.replace(/\s+$/, '')}\n`);
}

async function writeState(root, state) {
  await writeText(statePath(root), JSON.stringify(state, null, 2));
}

export function resolveWorkspaceRoot(cwd) {
  return resolveLoopxRoot(cwd);
}

export function resolveWorkflowRoot(cwd, slug) {
  return join(resolveWorkspaceRoot(cwd), 'workflows', normalizeSlug(slug));
}

function resolveSpecsRoot(cwd) {
  return join(resolveWorkspaceRoot(cwd), 'specs');
}

function resolvePlansRoot(cwd) {
  return join(resolveWorkspaceRoot(cwd), 'plans');
}

function resolveContextRoot(cwd) {
  return join(resolveWorkspaceRoot(cwd), 'context');
}

function resolvePlanReviewPaths(root, iteration) {
  const reviewsRoot = join(root, PLAN_REVIEW_DIR);
  return {
    reviewsRoot,
    planner: join(reviewsRoot, `planner-iteration-${iteration}.md`),
    architect: join(reviewsRoot, `architect-iteration-${iteration}.md`),
    critic: join(reviewsRoot, `critic-iteration-${iteration}.md`),
  };
}

function resolveBuildSupportPaths(root, iteration) {
  const supportRoot = join(root, BUILD_SUPPORT_DIR);
  return {
    supportRoot,
    laneSummary: join(supportRoot, `lanes-iteration-${iteration}.md`),
    architect: join(supportRoot, `architect-iteration-${iteration}.md`),
    deslop: join(supportRoot, `deslop-iteration-${iteration}.md`),
    regression: join(supportRoot, `regression-iteration-${iteration}.md`),
  };
}

function canonicalClarifySpecPath(cwd, slug, stamp) {
  return join(resolveSpecsRoot(cwd), `clarify-${normalizeSlug(slug)}-${stamp}.md`);
}

export async function readWorkspaceConfig(cwd) {
  const path = workspaceConfigPath(resolveWorkspaceRoot(cwd));
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function readState(cwd, slug) {
  const path = statePath(resolveWorkflowRoot(cwd, slug));
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

function buildWorkspaceReadme() {
  return [
    '# loopx Workspace',
    '',
    'This directory is initialized for the loopx skill-first runtime contract.',
    '',
    '## Default Flow',
    '',
    '`clarify -> plan -> build -> review -> done`',
    '',
    '## Runtime Commands',
    '',
    '- `loopx init [--slug <slug>]`',
    '- `loopx clarify <slug>`',
    '- `loopx approve <slug> --from <stage> --to <stage>`',
    '- `loopx plan <slug>`',
    '- `loopx build <slug>`',
    '- `loopx review <slug> [--reviewer <name>]`',
    '- `loopx autopilot <slug> [--reviewer <name>]`',
    '- `loopx status [slug] [--json]`',
    '- `loopx doctor`',
    '- `loopx migrate`',
    '- `loopx repair-install`',
  ].join('\n');
}

function createInitialState(slug, profile) {
  const clarifyProfile = CLARIFY_PROFILES[profile];
  return {
    schema_version: WORKFLOW_SCHEMA_VERSION,
    slug,
    current_stage: STAGES.CLARIFY,
    stage_status: 'blocked',
    clarify_profile: profile,
    clarify_target_ambiguity_threshold: clarifyProfile.threshold,
    clarify_max_rounds: clarifyProfile.maxRounds,
    clarify_current_round: 0,
    clarify_ambiguity_score: 1,
    clarify_pressure_pass_complete: false,
    clarify_non_goals_resolved: false,
    clarify_decision_boundaries_resolved: false,
    ambiguity_items: [
      {
        id: 'A-1',
        question: 'What specific task should loopx execute in this workflow?',
        status: 'open',
        resolution: null,
      },
    ],
    unresolved_ambiguity_count: 1,
    plan_package_status: 'missing',
    plan_current_iteration: 0,
    plan_max_iterations: DEFAULT_MAX_ITERATIONS,
    plan_consensus_mode: false,
    plan_deliberate_mode: false,
    plan_interactive_mode: false,
    plan_principles_resolved: false,
    plan_options_reviewed: false,
    plan_architect_review_status: 'not-started',
    plan_critic_verdict: 'none',
    plan_acceptance_criteria_testable: false,
    plan_verification_steps_resolved: false,
    plan_execution_inputs_resolved: false,
    plan_docs_status: 'missing',
    plan_docs_artifact_paths: null,
    plan_review_artifact_paths: [],
    plan_blockers: [],
    plan_source_spec_path: null,
    build_run_id: null,
    build_current_iteration: 0,
    build_max_iterations: DEFAULT_BUILD_MAX_ITERATIONS,
    build_parallel_mode: false,
    build_lane_statuses: [],
    build_verification_status: 'pending',
    build_architect_verification_status: 'not-started',
    build_deslop_status: 'pending',
    build_regression_status: 'pending',
    build_blockers: [],
    build_progress_artifact_paths: [],
    build_support_evidence_paths: [],
    build_no_deslop: false,
    autopilot_current_phase: 'none',
    autopilot_phase_history: [],
    autopilot_blockers: [],
    autopilot_run_path: null,
    autopilot_completed: false,
    review_status: 'not-started',
    recommended_next_action: 'Resolve ambiguity items in spec.md before requesting approval to enter plan.',
    rollback_target: 'none',
    rollback_rationale: null,
    pending_user_decision: TRANSITIONS.NONE,
    requested_transition: TRANSITIONS.NONE,
    last_confirmed_transition: TRANSITIONS.NONE,
    approval: {
      plan: APPROVAL_STATES.NOT_REQUESTED,
      build: APPROVAL_STATES.NOT_REQUESTED,
      review: APPROVAL_STATES.NOT_REQUESTED,
      rollback: APPROVAL_STATES.NOT_REQUESTED,
      complete: APPROVAL_STATES.NOT_REQUESTED,
    },
    execution_record_status: 'missing',
    review_verdict: 'none',
    completion_confirmed: false,
    active_run_id: null,
    spec_artifact_path: null,
    plan_artifact_path: null,
    test_spec_artifact_path: null,
  };
}

function detectLegacyContract(root, state) {
  if (!state) {
    return false;
  }
  if (!('schema_version' in state)) {
    return true;
  }
  if (existsSync(artifactPath(root, 'brief.md')) && !existsSync(artifactPath(root, 'spec.md'))) {
    return true;
  }
  if (existsSync(artifactPath(root, 'build-result.md')) && !existsSync(artifactPath(root, 'execution-record.md'))) {
    return true;
  }
  return false;
}

function collectArtifactPresence(root, names) {
  return Object.fromEntries(names.map((name) => [name, existsSync(artifactPath(root, name))]));
}

function withTemplateVariables(template, replacements) {
  return Object.entries(replacements).reduce(
    (content, [key, value]) => content.replaceAll(`<${key}>`, String(value)),
    template,
  );
}

async function writeTemplateArtifact(root, name, replacements) {
  const template = await readTemplate(name);
  await writeText(artifactPath(root, name), withTemplateVariables(template, replacements));
}

async function copyArtifact(fromRoot, toPath, name) {
  await ensureDir(dirname(toPath));
  const content = await readFile(artifactPath(fromRoot, name), 'utf8');
  await writeText(toPath, content);
}

async function writeCanonicalPlanArtifacts(cwd, root, slug) {
  const plansRoot = resolvePlansRoot(cwd);
  await ensureDir(plansRoot);
  const planPath = join(plansRoot, `prd-${slug}.md`);
  const testSpecPath = join(plansRoot, `test-spec-${slug}.md`);
  const planText = await readFile(artifactPath(root, 'plan.md'), 'utf8');
  const architectureText = await readFile(artifactPath(root, 'architecture.md'), 'utf8');
  const developmentPlanText = await readFile(artifactPath(root, 'development-plan.md'), 'utf8');
  const testPlanText = await readFile(artifactPath(root, 'test-plan.md'), 'utf8');

  await writeText(
    planPath,
    [
      `# loopx PRD: ${slug}`,
      '',
      '## Plan',
      '',
      planText,
      '',
      '## Architecture',
      '',
      architectureText,
      '',
      '## Development Plan',
      '',
      developmentPlanText,
    ].join('\n'),
  );
  await writeText(testSpecPath, testPlanText);
  return { planPath, testSpecPath };
}

function deriveSlugFromSpecPath(path, text) {
  const meta = parseFrontmatter(text);
  if (meta.workflow_id) {
    return normalizeSlug(meta.workflow_id);
  }
  const name = basename(path).replace(/\.md$/i, '');
  return normalizeSlug(name.replace(/^deep-interview-/, '').replace(/^clarify-/, ''));
}

function containsChineseText(text) {
  return /[\u3400-\u9fff]/.test(text);
}

async function ensurePlanWorkflowFromDirectSpec(cwd, directSpecPath, explicitSlug, options = {}) {
  const resolvedSpecPath = resolve(cwd, directSpecPath);
  const specText = await readFile(resolvedSpecPath, 'utf8');
  const slug = explicitSlug ? normalizeSlug(explicitSlug) : deriveSlugFromSpecPath(resolvedSpecPath, specText);
  const root = resolveWorkflowRoot(cwd, slug);
  await ensureLoopxRoot(cwd);
  await ensureDir(root);
  await writeText(artifactPath(root, 'spec.md'), specText);

  const existing = await readState(cwd, slug);
  if (existing) {
    const merged = withRecommendedAction({
      ...existing,
      spec_artifact_path: resolvedSpecPath,
      plan_source_spec_path: resolvedSpecPath,
      plan_consensus_mode: true,
      plan_deliberate_mode: Boolean(options.deliberate),
      plan_interactive_mode: Boolean(options.interactive),
    });
    await writeState(root, merged);
    return { slug, root, state: merged };
  }

  const state = withRecommendedAction({
    ...createInitialState(slug, 'standard'),
    clarify_current_round: 1,
    clarify_ambiguity_score: 0,
    clarify_pressure_pass_complete: true,
    clarify_non_goals_resolved: true,
    clarify_decision_boundaries_resolved: true,
    unresolved_ambiguity_count: 0,
    spec_artifact_path: resolvedSpecPath,
    plan_source_spec_path: resolvedSpecPath,
    requested_transition: TRANSITIONS.CLARIFY_TO_PLAN,
    stage_status: 'awaiting-approval',
    plan_consensus_mode: true,
    plan_deliberate_mode: Boolean(options.deliberate),
    plan_interactive_mode: Boolean(options.interactive),
    approval: {
      ...createInitialState(slug, 'standard').approval,
      plan: APPROVAL_STATES.APPROVED,
    },
  });
  await writeState(root, state);
  return { slug, root, state };
}

async function writePlanArtifacts(root, cwd, slug, plannerDraft) {
  await writeText(artifactPath(root, 'plan.md'), plannerDraft.planText);
  await writeText(artifactPath(root, 'architecture.md'), plannerDraft.architectureText);
  await writeText(artifactPath(root, 'development-plan.md'), plannerDraft.developmentPlanText);
  await writeText(artifactPath(root, 'test-plan.md'), plannerDraft.testPlanText);
}

async function writePlanReviewArtifacts(root, iteration, plannerDraft, architectReview, criticReview) {
  const paths = resolvePlanReviewPaths(root, iteration);
  await ensureDir(paths.reviewsRoot);
  await writeText(
    paths.planner,
    [
      `# Planner Draft: iteration ${iteration}`,
      '',
      '## Principles',
      '',
      ...plannerDraft.principles.map((item) => `- ${item}`),
      '',
      '## Decision Drivers',
      '',
      ...plannerDraft.decisionDrivers.map((item) => `- ${item}`),
    ].join('\n'),
  );
  await writeText(
    paths.architect,
    [
      `# Architect Review: iteration ${iteration}`,
      '',
      `- status: ${architectReview.status}`,
      `- verdict: ${architectReview.verdict}`,
      '',
      '## Findings',
      '',
      ...architectReview.findings.map((item) => `- ${item}`),
    ].join('\n'),
  );
  await writeText(
    paths.critic,
    [
      `# Critic Review: iteration ${iteration}`,
      '',
      `- verdict: ${criticReview.verdict}`,
      '',
      '## Findings',
      '',
      ...criticReview.findings.map((item) => `- ${item}`),
    ].join('\n'),
  );
  return paths;
}

async function readPlanCompletion(cwd, root, slug, state) {
  const blockers = [];
  if (state.plan_architect_review_status !== 'complete') {
    blockers.push('architect_review_incomplete');
  }
  if (state.plan_critic_verdict !== 'approve') {
    blockers.push(`critic_verdict_${state.plan_critic_verdict}`);
  }
  if (state.plan_package_status !== 'complete') {
    blockers.push(`plan_package_${state.plan_package_status}`);
  }
  if (!state.plan_acceptance_criteria_testable) {
    blockers.push('acceptance_criteria_unresolved');
  }
  if (!state.plan_verification_steps_resolved) {
    blockers.push('verification_steps_unresolved');
  }
  if (!state.plan_execution_inputs_resolved) {
    blockers.push('execution_inputs_unresolved');
  }
  if (!state.plan_artifact_path || !existsSync(state.plan_artifact_path)) {
    blockers.push('missing_prd');
  }
  if (!state.test_spec_artifact_path || !existsSync(state.test_spec_artifact_path)) {
    blockers.push('missing_test_spec');
  }
  const workflowDocs = {
    architecture: artifactPath(root, 'architecture.md'),
    developmentPlan: artifactPath(root, 'development-plan.md'),
    testPlan: artifactPath(root, 'test-plan.md'),
  };
  for (const [key, path] of Object.entries(workflowDocs)) {
    if (!existsSync(path)) {
      blockers.push(`missing_plan_artifact_${key}`);
      continue;
    }
    const text = await readFile(path, 'utf8');
    if (!containsChineseText(text)) {
      blockers.push(`plan_artifact_not_chinese_${key}`);
    }
  }

  return {
    blockers,
    docsStatus: blockers.some((blocker) => blocker.startsWith('missing_plan_artifact_') || blocker.startsWith('plan_artifact_not_chinese_')) ? 'partial' : 'complete',
  };
}

function buildIterationBlockers(iterationData, { noDeslop = false } = {}) {
  const blockers = [];
  for (const lane of iterationData.lanes) {
    if (lane.status !== 'complete') {
      blockers.push(`lane_incomplete_${lane.name}`);
    }
  }
  if (iterationData.verificationStatus !== 'complete') {
    blockers.push(`verification_${iterationData.verificationStatus}`);
  }
  if (iterationData.architectVerdict !== 'approve') {
    blockers.push(`architect_${iterationData.architectVerdict}`);
  }
  if (!noDeslop && iterationData.deslopStatus !== 'complete') {
    blockers.push(`deslop_${iterationData.deslopStatus}`);
  }
  if (!noDeslop && iterationData.regressionStatus !== 'complete') {
    blockers.push(`regression_${iterationData.regressionStatus}`);
  }
  return blockers;
}

function buildExecutionRecordContent({ slug, iterationData, complete }) {
  const placeholder = complete ? null : 'TODO: build iteration is not review-ready yet.';
  return [
    frontmatterBlock({
      schema_version: WORKFLOW_SCHEMA_VERSION,
      workflow_id: slug,
      run_id: iterationData.runId,
      stage: STAGES.BUILD,
      actor_id: iterationData.actorId,
      actor_role: STAGES.BUILD,
      plan_digest: `plan@${slug}`,
      started_at: nowIso(),
      completed_at: nowIso(),
      checkpoint_count: iterationData.lanes.length,
      evidence_manifest: iterationData.lanes.flatMap((lane) => lane.evidence || []),
    }),
    `# loopx Execution Record: ${slug}`,
    '',
    '## Changes',
    '',
    '- Completed the current build iteration lanes and aggregated evidence.',
    '',
    '## Checkpoint Log',
    '',
    ...iterationData.lanes.map((lane) => `- ${lane.name}: ${lane.status}`),
    '',
    '## Execution Evidence',
    '',
    ...iterationData.executionEvidence.map((item) => `- ${item}`),
    '',
    '## Verification Evidence',
    '',
    ...iterationData.verificationEvidence.map((item) => `- ${item}`),
    '',
    '## Limitations',
    '',
    ...(placeholder ? [`- ${placeholder}`] : iterationData.limitations.map((item) => `- ${item}`)),
  ].join('\n');
}

async function writeBuildSupportArtifacts(root, iterationData, noDeslop) {
  const paths = resolveBuildSupportPaths(root, iterationData.iteration);
  await ensureDir(paths.supportRoot);
  await writeText(
    paths.laneSummary,
    [
      `# Build Lanes: iteration ${iterationData.iteration}`,
      '',
      ...iterationData.lanes.map((lane) => `- ${lane.name}: ${lane.status} | ${lane.summary}`),
    ].join('\n'),
  );
  await writeText(
    paths.architect,
    [
      `# Build Architect Gate: iteration ${iterationData.iteration}`,
      '',
      `- verdict: ${iterationData.architectVerdict}`,
      '',
      ...iterationData.architectFindings.map((item) => `- ${item}`),
    ].join('\n'),
  );
  await writeText(
    paths.deslop,
    [
      `# Build Deslop: iteration ${iterationData.iteration}`,
      '',
      `- status: ${noDeslop ? 'skipped' : iterationData.deslopStatus}`,
    ].join('\n'),
  );
  await writeText(
    paths.regression,
    [
      `# Build Regression: iteration ${iterationData.iteration}`,
      '',
      `- status: ${noDeslop ? 'skipped' : iterationData.regressionStatus}`,
    ].join('\n'),
  );
  return paths;
}

async function readSpecSummary(root) {
  const text = await readTextIfExists(artifactPath(root, 'spec.md'));
  if (!text) {
    return {
      unresolvedCount: 1,
      currentRound: 0,
      ambiguityScore: 1,
      pressurePassComplete: false,
      nonGoalsResolved: false,
      decisionBoundariesResolved: false,
    };
  }
  const meta = parseFrontmatter(text);
  const unresolvedCount = Number.parseInt(String(meta.unresolved_ambiguity_count ?? 1), 10);
  const currentRound = Number.parseInt(String(meta.current_round ?? meta.clarify_current_round ?? 0), 10);
  const ambiguityScore = Number.parseFloat(String(meta.ambiguity_score ?? meta.clarify_ambiguity_score ?? 1));
  return {
    unresolvedCount: Number.isNaN(unresolvedCount) ? 1 : unresolvedCount,
    currentRound: Number.isNaN(currentRound) ? 0 : currentRound,
    ambiguityScore: Number.isFinite(ambiguityScore) && ambiguityScore >= 0 && ambiguityScore <= 1 ? ambiguityScore : 1,
    pressurePassComplete: frontmatterBoolean(meta.pressure_pass_complete ?? meta.clarify_pressure_pass_complete ?? false),
    nonGoalsResolved: frontmatterBoolean(meta.non_goals_resolved ?? meta.clarify_non_goals_resolved ?? false),
    decisionBoundariesResolved: frontmatterBoolean(meta.decision_boundaries_resolved ?? meta.clarify_decision_boundaries_resolved ?? false),
  };
}

function withClarifySummary(state, spec) {
  return {
    ...state,
    clarify_current_round: spec.currentRound,
    clarify_ambiguity_score: spec.ambiguityScore,
    clarify_pressure_pass_complete: spec.pressurePassComplete,
    clarify_non_goals_resolved: spec.nonGoalsResolved,
    clarify_decision_boundaries_resolved: spec.decisionBoundariesResolved,
    unresolved_ambiguity_count: spec.unresolvedCount,
  };
}

function clarifyReadinessBlockers(state) {
  const blockers = [];
  if (state.unresolved_ambiguity_count > 0) {
    blockers.push('unresolved_ambiguity');
  }
  if (state.clarify_current_round <= 0) {
    blockers.push('clarify_current_round_required');
  }
  if (state.clarify_current_round > state.clarify_max_rounds) {
    blockers.push('clarify_max_rounds_exceeded');
  }
  if (state.clarify_ambiguity_score > state.clarify_target_ambiguity_threshold) {
    blockers.push('clarify_ambiguity_score_above_threshold');
  }
  if (!state.clarify_non_goals_resolved) {
    blockers.push('clarify_non_goals_unresolved');
  }
  if (!state.clarify_decision_boundaries_resolved) {
    blockers.push('clarify_decision_boundaries_unresolved');
  }
  if (!state.clarify_pressure_pass_complete) {
    blockers.push('clarify_pressure_pass_incomplete');
  }
  return blockers;
}

async function readExecutionRecordSummary(root) {
  const text = await readTextIfExists(artifactPath(root, 'execution-record.md'));
  if (!text) {
    return { status: 'missing', meta: {} };
  }
  const meta = parseFrontmatter(text);
  const hasRequiredMeta = [
    'schema_version',
    'workflow_id',
    'run_id',
    'stage',
    'actor_id',
    'actor_role',
    'plan_digest',
    'started_at',
    'completed_at',
    'checkpoint_count',
    'evidence_manifest',
  ].every((field) => meta[field] !== undefined && meta[field] !== null && meta[field] !== '');
  const hasEvidenceManifest = Array.isArray(meta.evidence_manifest) && meta.evidence_manifest.length > 0;
  const hasExecutionEvidence = /## Execution Evidence/i.test(text);
  const hasVerificationEvidence = /## Verification Evidence/i.test(text);
  const hasPlaceholder = /\bTODO\b|<[^>\n]+>/.test(text);
  return {
    status: hasRequiredMeta && hasEvidenceManifest && hasExecutionEvidence && hasVerificationEvidence && !hasPlaceholder ? 'complete' : 'partial',
    meta,
  };
}

function recommendedAction(state, legacy = false) {
  if (legacy) {
    return 'Legacy codex-helper workflow detected. Run loopx migrate or create a new loopx workflow.';
  }

  switch (state.current_stage) {
    case STAGES.CLARIFY:
      return state.approval.plan === APPROVAL_STATES.APPROVED
        ? 'Run loopx plan to consume the approved clarify -> plan transition.'
        : `Resolve ambiguity in ${state.clarify_profile ?? 'standard'} clarify mode and approve clarify -> plan.`;
    case STAGES.PLAN:
      if (Array.isArray(state.plan_blockers) && state.plan_blockers.length > 0) {
        return 'Run loopx plan to continue the planning review loop until architect, critic, and planning artifact blockers are cleared.';
      }
      return state.approval.build === APPROVAL_STATES.APPROVED
        ? 'Run loopx build to consume the approved plan -> build transition.'
        : 'Approve plan -> build when the plan package is ready.';
    case STAGES.BUILD:
      if (Array.isArray(state.build_blockers) && state.build_blockers.length > 0) {
        return 'Run loopx build to continue the execution loop until verification, architect, deslop, and regression blockers are cleared.';
      }
      return state.approval.review === APPROVAL_STATES.APPROVED
        ? 'Run loopx review to consume the approved build -> review transition.'
        : 'Approve build -> review when execution-record.md is complete.';
    case STAGES.REVIEW:
      if (state.review_verdict === 'approve') {
        return state.approval.complete === APPROVAL_STATES.APPROVED
          ? 'Run loopx review again to consume the approved review -> done transition.'
          : 'Approve review -> done to complete the workflow.';
      }
      if (state.review_verdict === 'request-changes') {
        return state.approval.rollback === APPROVAL_STATES.APPROVED
          ? 'Run loopx review again to consume the approved review -> plan transition.'
          : 'Approve review -> plan to roll back for another planning pass.';
      }
      return 'Run loopx review after build completes.';
    case STAGES.DONE:
      if (state.autopilot_current_phase && state.autopilot_current_phase !== 'none' && state.autopilot_completed) {
        return 'Autopilot run is complete.';
      }
      return 'Workflow is complete.';
    default:
      return 'Run loopx clarify to start a workflow.';
  }
}

function withRecommendedAction(state, legacy = false) {
  return {
    ...state,
    recommended_next_action: recommendedAction(state, legacy),
  };
}

async function loadWorkflowState(cwd, slug, { allowLegacy = true } = {}) {
  const normalized = normalizeSlug(slug);
  const root = resolveWorkflowRoot(cwd, normalized);
  const state = await readState(cwd, normalized);
  if (!state) {
    throw new Error('workflow_not_initialized');
  }
  const legacy = detectLegacyContract(root, state);
  if (legacy && !allowLegacy) {
    throw new Error('legacy_workflow_not_supported');
  }
  return { slug: normalized, root, legacy, state: withRecommendedAction(state, legacy) };
}

function transitionKey(from, to) {
  const value = `${from}->${to}`;
  if (!Object.values(TRANSITIONS).includes(value)) {
    throw new Error(`invalid_transition:${value}`);
  }
  return value;
}

function approvalKeyForTransition(transition) {
  switch (transition) {
    case TRANSITIONS.CLARIFY_TO_PLAN:
      return 'plan';
    case TRANSITIONS.PLAN_TO_BUILD:
      return 'build';
    case TRANSITIONS.BUILD_TO_REVIEW:
      return 'review';
    case TRANSITIONS.REVIEW_TO_PLAN:
      return 'rollback';
    case TRANSITIONS.REVIEW_TO_DONE:
      return 'complete';
    default:
      throw new Error(`approval_key_not_found:${transition}`);
  }
}

function ensureApprovedTransition(state, expectedTransition, key) {
  if (state.requested_transition !== expectedTransition || state.approval[key] !== APPROVAL_STATES.APPROVED) {
    throw new Error(`approved_transition_required:${expectedTransition}`);
  }
}

function executionRecordTemplate(slug, stage, actorId, runId) {
  const timestamp = nowIso();
  return [
    frontmatterBlock({
      schema_version: WORKFLOW_SCHEMA_VERSION,
      workflow_id: slug,
      run_id: runId,
      stage,
      actor_id: actorId,
      actor_role: stage,
      plan_digest: `plan@${slug}`,
      started_at: timestamp,
      completed_at: timestamp,
      checkpoint_count: 0,
      evidence_manifest: [],
    }),
    `# loopx Execution Record: ${slug}`,
    '',
    '## Changes',
    '',
    '- TODO: summarize the implementation result.',
    '',
    '## Checkpoint Log',
    '',
    '- TODO: record execution checkpoints.',
    '',
    '## Execution Evidence',
    '',
    '- TODO: add concrete execution evidence.',
    '',
    '## Verification Evidence',
    '',
    '- TODO: add concrete verification evidence.',
    '',
    '## Limitations',
    '',
    '- TODO: record remaining limitations.',
  ].join('\n');
}

function reviewVerdictLabel(verdict) {
  return verdict === 'APPROVE' ? '通过' : '要求修改';
}

function rollbackTargetLabel(rollbackTarget) {
  if (rollbackTarget === 'none') {
    return '无需回滚';
  }
  if (rollbackTarget === 'plan') {
    return '回退到 plan 阶段';
  }
  return rollbackTarget;
}

function reviewUserMessageZh({ slug, verdict, rollbackTarget, findings }) {
  const label = reviewVerdictLabel(verdict);
  const next = verdict === 'APPROVE'
    ? '下一步：批准 review -> done 后完成工作流。'
    : `下一步：按审查发现处理，并${rollbackTargetLabel(rollbackTarget)}。`;
  const findingText = Array.isArray(findings) && findings.length > 0 ? findings.join('；') : '无额外发现。';
  return `Review 结果：${slug} ${label}。审查发现：${findingText} ${next}`;
}

function codeReviewFindingText(finding) {
  const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : '未定位文件';
  return `[${finding.severity || 'medium'}] ${location}：${finding.message}`;
}

function reviewReportContent({ slug, reviewer, runId, verdict, rollbackTarget, rollbackRationale, inputManifest, evidenceManifest, findings, codeReview }) {
  return [
    frontmatterBlock({
      schema_version: WORKFLOW_SCHEMA_VERSION,
      workflow_id: slug,
      review_id: `${slug}-review-${Date.now()}`,
      reviewer_id: reviewer,
      reviewed_run_id: runId,
      input_manifest: inputManifest,
      evidence_manifest: evidenceManifest,
      code_review: codeReview ? {
        status: codeReview.status,
        verdict: codeReview.verdict,
        changed_files: codeReview.changedFiles,
      } : null,
      verdict: verdict.toLowerCase().replace('request changes', 'request-changes'),
      rollback_target: rollbackTarget,
      rollback_rationale: rollbackRationale ?? null,
    }),
    `# loopx Review 结果：${slug}`,
    '',
    '## 结论',
    '',
    `- ${reviewVerdictLabel(verdict)}（${verdict}）`,
    '',
    '## 已审查证据',
    '',
    ...inputManifest.map((item) => `- ${item}`),
    '',
    '## 审查发现',
    '',
    ...findings.map((item) => `- ${item}`),
    '',
    '## 代码审查',
    '',
    codeReview ? `- 状态：${codeReview.status}` : '- 状态：未执行',
    codeReview ? `- 结论：${codeReview.verdict}` : '- 结论：未知',
    codeReview ? `- 摘要：${codeReview.summary}` : '- 摘要：无',
    codeReview && codeReview.changedFiles.length > 0 ? `- 变更文件：${codeReview.changedFiles.join(', ')}` : '- 变更文件：无',
    ...(codeReview && codeReview.findings.length > 0 ? codeReview.findings.map((item) => `- ${codeReviewFindingText(item)}`) : ['- 未发现阻断性代码问题。']),
    '',
    '## 回退建议',
    '',
    `- ${rollbackTargetLabel(rollbackTarget)}`,
    rollbackRationale ? `- ${rollbackRationale}` : '- 无',
  ].join('\n');
}

async function refreshExecutionStatus(root, state) {
  const summary = await readExecutionRecordSummary(root);
  return {
    state: {
      ...state,
      execution_record_status: summary.status,
    },
    executionSummary: summary,
  };
}

export async function initWorkspace(cwd, { slug } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  await ensureLoopxRoot(cwd);
  await ensureDir(join(workspaceRoot, 'context'));
  await ensureDir(join(workspaceRoot, 'workflows'));
  await ensureDir(join(workspaceRoot, 'specs'));
  await ensureDir(join(workspaceRoot, 'plans'));
  await ensureDir(join(workspaceRoot, 'autopilot'));

  const config = {
    schema_version: WORKSPACE_SCHEMA_VERSION,
    tool: 'loopx',
    product_contract: 'skill-first-v1',
    default_flow: ['clarify', 'plan', 'build', 'review', 'done'],
    preferred_surface: ['clarify', 'plan', 'build', 'review', 'autopilot'],
  };

  if (!existsSync(workspaceConfigPath(workspaceRoot))) {
    await writeText(workspaceConfigPath(workspaceRoot), JSON.stringify(config, null, 2));
  }
  if (!existsSync(workspaceReadmePath(workspaceRoot))) {
    await writeText(workspaceReadmePath(workspaceRoot), buildWorkspaceReadme());
  }

  let workflow = null;
  if (slug) {
    workflow = await clarifyStage(cwd, slug);
  }
  return { workspaceRoot, config, workflow };
}

export async function clarifyStage(cwd, slug, { profile = 'standard' } = {}) {
  const normalized = normalizeSlug(slug);
  const clarifyProfile = normalizeClarifyProfile(profile);
  const root = resolveWorkflowRoot(cwd, normalized);
  await ensureLoopxRoot(cwd);
  await ensureDir(root);
  const stamp = nowStamp();
  await writeTemplateArtifact(root, 'spec.md', {
    'task name': normalized,
    'workflow id': normalized,
    profile: clarifyProfile,
    'target ambiguity threshold': CLARIFY_PROFILES[clarifyProfile].threshold,
    'max rounds': CLARIFY_PROFILES[clarifyProfile].maxRounds,
  });
  const specArtifactPath = canonicalClarifySpecPath(cwd, normalized, stamp);
  await copyArtifact(root, specArtifactPath, 'spec.md');
  const state = withRecommendedAction({
    ...createInitialState(normalized, clarifyProfile),
    spec_artifact_path: specArtifactPath,
  });
  await writeState(root, state);
  return { root, state };
}

export async function approveStage(cwd, slug, { from, to }) {
  const { root, state } = await loadWorkflowState(cwd, slug, { allowLegacy: false });
  if (state.current_stage !== from) {
    throw new Error(`approval_from_stage_mismatch:${from}`);
  }
  const transition = transitionKey(from, to);
  const approvalKey = approvalKeyForTransition(transition);
  let next = { ...state };

  if (transition === TRANSITIONS.CLARIFY_TO_PLAN) {
    const spec = await readSpecSummary(root);
    next = withClarifySummary(next, spec);
    const blockers = clarifyReadinessBlockers(next);
    if (blockers.length > 0) {
      const blocked = withRecommendedAction({
        ...next,
        stage_status: 'blocked',
        pending_user_decision: TRANSITIONS.CLARIFY_TO_PLAN,
        requested_transition: TRANSITIONS.NONE,
      });
      await writeState(root, blocked);
      throw new Error(`clarify_readiness_blocked:${blockers.join(',')}`);
    }
  }

  if (transition === TRANSITIONS.PLAN_TO_BUILD) {
    if (!PLAN_ARTIFACTS.every((name) => existsSync(artifactPath(root, name)))) {
      throw new Error('plan_package_incomplete');
    }
    next.plan_package_status = 'complete';
    const completion = await readPlanCompletion(cwd, root, state.slug, next);
    next = {
      ...next,
      plan_docs_status: completion.docsStatus,
      plan_docs_artifact_paths: null,
      plan_blockers: completion.blockers,
    };
    if (completion.blockers.length > 0) {
      const blocked = withRecommendedAction({
        ...next,
        stage_status: 'blocked',
        pending_user_decision: TRANSITIONS.PLAN_TO_BUILD,
        requested_transition: TRANSITIONS.NONE,
      });
      await writeState(root, blocked);
      throw new Error(`plan_review_gate_blocked:${completion.blockers.join(',')}`);
    }
  }

  if (transition === TRANSITIONS.BUILD_TO_REVIEW) {
    const refreshed = await refreshExecutionStatus(root, state);
    next = refreshed.state;
    if (next.execution_record_status !== 'complete') {
      throw new Error('review_gate_blocked:execution-record.md');
    }
    if (Array.isArray(next.build_blockers) && next.build_blockers.length > 0) {
      const blocked = withRecommendedAction({
        ...next,
        stage_status: 'blocked',
        pending_user_decision: TRANSITIONS.BUILD_TO_REVIEW,
        requested_transition: TRANSITIONS.NONE,
      });
      await writeState(root, blocked);
      throw new Error(`build_review_gate_blocked:${next.build_blockers.join(',')}`);
    }
  }

  if (transition === TRANSITIONS.REVIEW_TO_PLAN) {
    if (!next.rollback_rationale) {
      throw new Error('rollback_rationale_required');
    }
  }

  if (transition === TRANSITIONS.REVIEW_TO_DONE && next.review_verdict !== 'approve') {
    throw new Error('review_not_approved');
  }

  next = withRecommendedAction({
    ...next,
    stage_status: 'awaiting-approval',
    pending_user_decision: TRANSITIONS.NONE,
    requested_transition: transition,
    approval: {
      ...next.approval,
      [approvalKey]: APPROVAL_STATES.APPROVED,
    },
  });
  await writeState(root, next);
  return { root, state: next };
}

export async function planStage(cwd, slug, options = {}) {
  let normalized = slug ? normalizeSlug(slug) : null;
  if (options.directSpecPath) {
    const bootstrapped = await ensurePlanWorkflowFromDirectSpec(cwd, options.directSpecPath, normalized, options);
    normalized = bootstrapped.slug;
  }

  const loaded = await loadWorkflowState(cwd, normalized, { allowLegacy: false });
  const { root } = loaded;
  let { state } = loaded;
  if (!options.directSpecPath) {
    ensureApprovedTransition(state, TRANSITIONS.CLARIFY_TO_PLAN, 'plan');
    if (state.spec_artifact_path) {
      await copyArtifact(root, state.spec_artifact_path, 'spec.md');
    }
  }

  const sourceSpecPath = options.directSpecPath ? resolve(cwd, options.directSpecPath) : (state.plan_source_spec_path || artifactPath(root, 'spec.md'));
  const sourceText = await readFile(sourceSpecPath, 'utf8');
  const adapter = options.adapter || createDefaultPlanAdapter();
  const maxIterations = DEFAULT_MAX_ITERATIONS;
  let iteration = 1;
  let architectReview = null;
  let criticReview = null;
  const reviewArtifactPaths = [];

  while (iteration <= maxIterations) {
    const plannerDraft = await adapter.planner({
      cwd,
      root,
      slug: normalized,
      sourceText,
      iteration,
      deliberateMode: Boolean(options.deliberate),
      interactiveMode: Boolean(options.interactive),
    });
    await writePlanArtifacts(root, cwd, normalized, plannerDraft);
    const artifactPaths = await writeCanonicalPlanArtifacts(cwd, root, normalized);

    architectReview = await adapter.architect({
      cwd,
      root,
      slug: normalized,
      sourceText,
      plannerDraft,
      iteration,
      deliberateMode: Boolean(options.deliberate),
    });
    criticReview = await adapter.critic({
      cwd,
      root,
      slug: normalized,
      sourceText,
      plannerDraft,
      architectReview,
      iteration,
      deliberateMode: Boolean(options.deliberate),
    });
    const reviewPaths = await writePlanReviewArtifacts(root, iteration, plannerDraft, architectReview, criticReview);
    reviewArtifactPaths.push(reviewPaths);

    state = {
      ...state,
      current_stage: STAGES.PLAN,
      plan_current_iteration: iteration,
      plan_max_iterations: maxIterations,
      plan_consensus_mode: true,
      plan_deliberate_mode: Boolean(options.deliberate),
      plan_interactive_mode: Boolean(options.interactive),
      plan_principles_resolved: plannerDraft.principlesResolved,
      plan_options_reviewed: plannerDraft.optionsReviewed,
      plan_architect_review_status: architectReview.status,
      plan_critic_verdict: criticReview.verdict,
      plan_acceptance_criteria_testable: criticReview.acceptanceCriteriaTestable,
      plan_verification_steps_resolved: criticReview.verificationStepsResolved,
      plan_execution_inputs_resolved: criticReview.executionInputsResolved,
      plan_package_status: 'complete',
      plan_docs_artifact_paths: null,
      plan_review_artifact_paths: reviewArtifactPaths,
      plan_artifact_path: artifactPaths.planPath,
      test_spec_artifact_path: artifactPaths.testSpecPath,
      plan_source_spec_path: sourceSpecPath,
      last_confirmed_transition: TRANSITIONS.CLARIFY_TO_PLAN,
      approval: {
        ...state.approval,
        plan: APPROVAL_STATES.APPROVED,
        build: APPROVAL_STATES.NOT_REQUESTED,
        review: APPROVAL_STATES.NOT_REQUESTED,
        rollback: APPROVAL_STATES.NOT_REQUESTED,
        complete: APPROVAL_STATES.NOT_REQUESTED,
      },
    };

    if (criticReview.verdict === 'approve') {
      break;
    }
    iteration += 1;
  }

  const completion = await readPlanCompletion(cwd, root, normalized, state);
  const next = withRecommendedAction({
    ...state,
    current_stage: STAGES.PLAN,
    stage_status: completion.blockers.length > 0 ? 'blocked' : 'awaiting-approval',
    pending_user_decision: TRANSITIONS.NONE,
    requested_transition: TRANSITIONS.NONE,
    plan_docs_status: completion.docsStatus,
    plan_docs_artifact_paths: null,
    plan_blockers: completion.blockers,
  });
  await writeState(root, next);
  return { root, state: next, architectReview, criticReview };
}

export async function buildStage(cwd, slug, options = {}) {
  const { root, state, slug: normalized } = await loadWorkflowState(cwd, slug, { allowLegacy: false });
  ensureApprovedTransition(state, TRANSITIONS.PLAN_TO_BUILD, 'build');
  if (!PLAN_ARTIFACTS.every((name) => existsSync(artifactPath(root, name)))) {
    throw new Error('build_requires_workflow_plan_artifacts');
  }
  if (!state.plan_artifact_path || !existsSync(state.plan_artifact_path) || !state.test_spec_artifact_path || !existsSync(state.test_spec_artifact_path)) {
    throw new Error('build_requires_approved_plan_artifacts');
  }

  const adapter = options.adapter || createDefaultBuildAdapter();
  const maxIterations = adapter.maxIterations || DEFAULT_BUILD_MAX_ITERATIONS;
  const noDeslop = Boolean(options.noDeslop);
  const progressArtifacts = [];
  const supportArtifacts = [];
  let iteration = 1;
  let current = null;
  let blockers = ['build_not_started'];

  while (iteration <= maxIterations) {
    current = await adapter.executeLanes({
      cwd,
      root,
      slug: normalized,
      iteration,
      noDeslop,
      planArtifactPath: state.plan_artifact_path,
      testSpecArtifactPath: state.test_spec_artifact_path,
    });
    blockers = buildIterationBlockers(current, { noDeslop });
    const supportPaths = await writeBuildSupportArtifacts(root, current, noDeslop);
    progressArtifacts.push(supportPaths.laneSummary);
    supportArtifacts.push(supportPaths.architect, supportPaths.deslop, supportPaths.regression);
    await writeText(
      artifactPath(root, 'execution-record.md'),
      buildExecutionRecordContent({
        slug: normalized,
        iterationData: current,
        complete: blockers.length === 0,
      }),
    );
    if (blockers.length === 0) {
      break;
    }
    iteration += 1;
  }

  const finalBlocked = blockers.length > 0;
  const refreshed = await refreshExecutionStatus(root, state);
  const next = withRecommendedAction({
    ...refreshed.state,
    current_stage: STAGES.BUILD,
    stage_status: finalBlocked ? 'blocked' : 'awaiting-approval',
    execution_record_status: finalBlocked ? 'partial' : refreshed.state.execution_record_status,
    review_status: finalBlocked ? 'pending-input' : 'ready-for-review',
    build_run_id: current?.runId || null,
    build_current_iteration: current?.iteration || 0,
    build_max_iterations: maxIterations,
    build_parallel_mode: true,
    build_lane_statuses: current?.lanes || [],
    build_verification_status: current?.verificationStatus || 'pending',
    build_architect_verification_status: current?.architectVerdict || 'not-started',
    build_deslop_status: noDeslop ? 'skipped' : (current?.deslopStatus || 'pending'),
    build_regression_status: noDeslop ? 'skipped' : (current?.regressionStatus || 'pending'),
    build_blockers: blockers,
    build_progress_artifact_paths: progressArtifacts,
    build_support_evidence_paths: supportArtifacts,
    build_no_deslop: noDeslop,
    active_run_id: current?.runId || null,
    pending_user_decision: finalBlocked ? TRANSITIONS.NONE : TRANSITIONS.BUILD_TO_REVIEW,
    requested_transition: TRANSITIONS.NONE,
    last_confirmed_transition: TRANSITIONS.PLAN_TO_BUILD,
    approval: {
      ...state.approval,
      build: APPROVAL_STATES.APPROVED,
      review: APPROVAL_STATES.NOT_REQUESTED,
      rollback: APPROVAL_STATES.NOT_REQUESTED,
      complete: APPROVAL_STATES.NOT_REQUESTED,
    },
  });
  await writeState(root, next);
  return { root, state: next };
}

function reviewFindings({ executionMeta, executionStatus, reviewer, codeReview }) {
  const inputManifest = ['spec.md', ...PLAN_ARTIFACTS, 'execution-record.md', 'review-support/code-review.json'];
  const evidenceManifest = Array.isArray(executionMeta.evidence_manifest) ? [...executionMeta.evidence_manifest] : [];
  const findings = [];
  let verdict = 'APPROVE';
  let rollbackTarget = 'none';
  let rollbackRationale = null;

  if (executionStatus !== 'complete') {
    findings.push('execution-record.md 缺少必要的执行或验证证据。');
    verdict = 'REQUEST CHANGES';
    rollbackTarget = 'plan';
    rollbackRationale = '执行证据不完整，工作流需要回退到计划阶段后再重新执行。';
  }
  if (!Array.isArray(executionMeta.evidence_manifest) || executionMeta.evidence_manifest.length === 0) {
    findings.push('execution-record.md 缺少必需的 evidence_manifest 结构。');
    verdict = 'REQUEST CHANGES';
    rollbackTarget = 'plan';
    rollbackRationale = '执行证据结构不完整，review 不能接受本次运行。';
  }
  if (executionMeta.actor_id === reviewer) {
    findings.push('Reviewer 来源与执行者一致，不满足独立审查要求。');
    verdict = 'REQUEST CHANGES';
    rollbackTarget = 'plan';
    rollbackRationale = 'review 独立性校验失败，因为 reviewer 与执行者来源一致。';
  }
  if (codeReview?.status === 'skipped') {
    findings.push(`代码审查已跳过：${codeReview.summary}`);
  }
  if (codeReview?.verdict === 'request-changes') {
    findings.push(`代码审查发现阻断问题：${codeReview.summary}`);
    for (const finding of codeReview.findings || []) {
      findings.push(codeReviewFindingText(finding));
    }
    verdict = 'REQUEST CHANGES';
    rollbackTarget = 'plan';
    rollbackRationale = '代码审查发现需要修改的问题，不能进入 done。';
  }

  return {
    verdict,
    findings: findings.length > 0 ? findings : ['结构化证据与来源独立性检查均已通过。'],
    inputManifest,
    evidenceManifest,
    rollbackTarget,
    rollbackRationale,
  };
}

export async function reviewStage(cwd, slug, { reviewer = 'independent-reviewer', adapter } = {}) {
  const { root, state, slug: normalized } = await loadWorkflowState(cwd, slug, { allowLegacy: false });

  if (state.current_stage === STAGES.REVIEW && state.approval.complete === APPROVAL_STATES.APPROVED && state.review_verdict === 'approve') {
    const next = withRecommendedAction({
      ...state,
      current_stage: STAGES.DONE,
      stage_status: 'completed',
      pending_user_decision: TRANSITIONS.NONE,
      requested_transition: TRANSITIONS.NONE,
      last_confirmed_transition: TRANSITIONS.REVIEW_TO_DONE,
      completion_confirmed: true,
    });
    await writeState(root, next);
    return {
      root,
      state: next,
      verdict: 'APPROVE',
      rollbackTarget: 'none',
      reviewMessageZh: `Review 结果：${normalized} 已完成，工作流已进入 done。`,
    };
  }

  if (state.current_stage === STAGES.REVIEW && state.approval.rollback === APPROVAL_STATES.APPROVED && state.review_verdict === 'request-changes') {
    const next = withRecommendedAction({
      ...state,
      current_stage: STAGES.PLAN,
      stage_status: 'awaiting-approval',
      pending_user_decision: TRANSITIONS.NONE,
      requested_transition: TRANSITIONS.NONE,
      last_confirmed_transition: TRANSITIONS.REVIEW_TO_PLAN,
      plan_package_status: 'complete',
      approval: {
        ...state.approval,
        build: APPROVAL_STATES.NOT_REQUESTED,
        review: APPROVAL_STATES.NOT_REQUESTED,
        rollback: APPROVAL_STATES.APPROVED,
      },
    });
    await writeState(root, next);
    return {
      root,
      state: next,
      verdict: 'REQUEST CHANGES',
      rollbackTarget: 'plan',
      reviewMessageZh: `Review 结果：${normalized} 要求修改，已回退到 plan 阶段。`,
    };
  }

  ensureApprovedTransition(state, TRANSITIONS.BUILD_TO_REVIEW, 'review');
  const { state: refreshed, executionSummary } = await refreshExecutionStatus(root, state);
  const reviewAdapter = adapter || createDefaultReviewAdapter();
  const codeReview = await reviewAdapter.codeReview({
    cwd,
    root,
    slug: normalized,
    reviewer,
    executionRecordPath: artifactPath(root, 'execution-record.md'),
    planArtifactPath: refreshed.plan_artifact_path,
    testSpecArtifactPath: refreshed.test_spec_artifact_path,
  });
  await ensureDir(join(root, 'review-support'));
  await writeText(join(root, 'review-support', 'code-review.json'), JSON.stringify(codeReview, null, 2));
  const reviewInput = reviewFindings({
    executionMeta: executionSummary.meta,
    executionStatus: refreshed.execution_record_status,
    reviewer,
    codeReview,
  });
  const runId = executionSummary.meta.run_id || refreshed.active_run_id || `${normalized}-unknown-run`;

  await writeText(
    artifactPath(root, 'review-report.md'),
    reviewReportContent({
      slug: normalized,
      reviewer,
      runId,
      verdict: reviewInput.verdict,
      rollbackTarget: reviewInput.rollbackTarget,
      rollbackRationale: reviewInput.rollbackRationale,
      inputManifest: reviewInput.inputManifest,
      evidenceManifest: reviewInput.evidenceManifest,
      findings: reviewInput.findings,
      codeReview,
    }),
  );

  const next = withRecommendedAction({
    ...refreshed,
    current_stage: STAGES.REVIEW,
    stage_status: 'awaiting-approval',
    review_status: 'in-review',
    pending_user_decision: reviewInput.verdict === 'APPROVE' ? TRANSITIONS.REVIEW_TO_DONE : TRANSITIONS.REVIEW_TO_PLAN,
    requested_transition: TRANSITIONS.NONE,
    last_confirmed_transition: TRANSITIONS.BUILD_TO_REVIEW,
    review_verdict: reviewInput.verdict === 'APPROVE' ? 'approve' : 'request-changes',
    rollback_target: reviewInput.rollbackTarget,
    rollback_rationale: reviewInput.rollbackRationale,
    approval: {
      ...refreshed.approval,
      review: APPROVAL_STATES.APPROVED,
      rollback: reviewInput.verdict === 'APPROVE' ? APPROVAL_STATES.NOT_REQUESTED : APPROVAL_STATES.REQUESTED,
      complete: reviewInput.verdict === 'APPROVE' ? APPROVAL_STATES.REQUESTED : APPROVAL_STATES.NOT_REQUESTED,
    },
  });
  await writeState(root, next);
  return {
    root,
    state: next,
    verdict: reviewInput.verdict,
    rollbackTarget: reviewInput.rollbackTarget,
    reviewMessageZh: reviewUserMessageZh({
      slug: normalized,
      verdict: reviewInput.verdict,
      rollbackTarget: reviewInput.rollbackTarget,
      findings: reviewInput.findings,
    }),
  };
}

async function writeAutopilotRun(rootPath, payload) {
  await ensureDir(dirname(rootPath));
  await writeText(rootPath, JSON.stringify(payload, null, 2));
}

export async function autopilotStage(cwd, slug, { reviewer = 'autopilot-reviewer', phaseAdapter, planOptions = {}, buildOptions = {} } = {}) {
  const normalized = normalizeSlug(slug);
  const workflowRoot = resolveWorkflowRoot(cwd, normalized);
  if (!existsSync(statePath(workflowRoot))) {
    await clarifyStage(cwd, normalized);
  }

  const { root, state: initialState } = await loadWorkflowState(cwd, normalized, { allowLegacy: false });

  const adapter = phaseAdapter || createDefaultAutopilotAdapter();
  const autopilotRoot = join(resolveWorkspaceRoot(cwd), 'autopilot', normalized);
  const runPath = join(autopilotRoot, 'run.json');
  const controlEvents = [];
  const phases = [];
  const recordEvent = (transition) => controlEvents.push({
    transition,
    actor: 'autopilot',
    recorded_at: nowIso(),
  });
  const blockerKey = (value) => String(value).trim().toLowerCase().replace(/\s+/g, '-');
  const artifacts = {
    specPath: initialState.spec_artifact_path || artifactPath(root, 'spec.md'),
    planPath: null,
    testSpecPath: null,
    executionRecordPath: artifactPath(root, 'execution-record.md'),
    reviewReportPath: artifactPath(root, 'review-report.md'),
  };

  const updateWorkflowState = async (state, extras) => {
    const next = withRecommendedAction({
      ...state,
      autopilot_current_phase: extras.currentPhase,
      autopilot_phase_history: phases,
      autopilot_blockers: extras.blockers || [],
      autopilot_run_path: runPath,
      autopilot_completed: Boolean(extras.completed),
    });
    await writeState(root, next);
    return next;
  };

  const persistRun = async ({ currentPhase, completed, blockers = [], reviewedRunId = null, workflowState = null }) => {
    await writeAutopilotRun(runPath, {
      workflowId: normalized,
      reviewer,
      currentPhase,
      phases,
      controlEvents,
      reviewedRunId,
      artifacts,
      blockers,
      completed,
    });
    if (workflowState) {
      await updateWorkflowState(workflowState, { currentPhase, blockers, completed });
    }
  };

  const expansion = await adapter.expansion({
    cwd,
    slug: normalized,
    root,
    state: {
      ...initialState,
      cwd,
      root,
      slug: normalized,
      unresolved_ambiguity_count: (await readSpecSummary(root)).unresolvedCount,
    },
  });
  phases.push(expansion);
  if (expansion.status !== 'complete') {
    await persistRun({
      currentPhase: 'expansion',
      completed: false,
      blockers: [`expansion_${expansion.status}`],
      workflowState: initialState,
    });
    throw new Error(`autopilot_phase_blocked:expansion:${expansion.status}`);
  }
  const refreshedSpec = await readSpecSummary(root);
  if (refreshedSpec.unresolvedCount > 0) {
    await persistRun({
      currentPhase: 'expansion',
      completed: false,
      blockers: ['expansion_unresolved_ambiguity'],
      workflowState: initialState,
    });
    throw new Error('autopilot_requires_resolved_spec');
  }

  await approveStage(cwd, normalized, { from: STAGES.CLARIFY, to: STAGES.PLAN });
  recordEvent(TRANSITIONS.CLARIFY_TO_PLAN);
  const planned = await planStage(cwd, normalized, planOptions);
  artifacts.planPath = planned.state.plan_artifact_path;
  artifacts.testSpecPath = planned.state.test_spec_artifact_path;
  const planning = await adapter.planning({ cwd, slug: normalized, root, planResult: planned });
  phases.push(planning);
  if (planning.status !== 'complete') {
    await persistRun({
      currentPhase: 'planning',
      completed: false,
      blockers: [`planning_${planning.status}`],
      workflowState: planned.state,
    });
    throw new Error(`autopilot_phase_blocked:planning:${planning.status}`);
  }

  await approveStage(cwd, normalized, { from: STAGES.PLAN, to: STAGES.BUILD });
  recordEvent(TRANSITIONS.PLAN_TO_BUILD);
      const build = await buildStage(cwd, normalized, buildOptions);
  const execution = await adapter.execution({ cwd, slug: normalized, root, buildResult: build });
  phases.push(execution);
  if (execution.status !== 'complete') {
    await persistRun({
      currentPhase: 'execution',
      completed: false,
      blockers: [`execution_${execution.status}`, ...(build.state.build_blockers || [])],
      workflowState: build.state,
    });
    throw new Error(`autopilot_phase_blocked:execution:${execution.status}`);
  }
  const qa = await adapter.qa({ cwd, slug: normalized, root, buildResult: build });
  phases.push(qa);
  if (qa.status !== 'complete') {
    await persistRun({
      currentPhase: 'qa',
      completed: false,
      blockers: [`qa_${qa.status}`, ...(build.state.build_blockers || [])],
      workflowState: build.state,
    });
    throw new Error(`autopilot_phase_blocked:qa:${qa.status}`);
  }

  await approveStage(cwd, normalized, { from: STAGES.BUILD, to: STAGES.REVIEW });
  recordEvent(TRANSITIONS.BUILD_TO_REVIEW);
  const review = await reviewStage(cwd, normalized, { reviewer });
  const validation = await adapter.validation({ cwd, slug: normalized, root, reviewResult: review });
  phases.push(validation);
  if (review.verdict !== 'APPROVE' || validation.status !== 'complete') {
    await persistRun({
      currentPhase: 'validation',
      completed: false,
      blockers: [`validation_${blockerKey(validation.status)}`, `review_${blockerKey(review.verdict)}`],
      reviewedRunId: review.state.active_run_id || null,
      workflowState: review.state,
    });
    throw new Error('autopilot_review_failed');
  }
  await approveStage(cwd, normalized, { from: STAGES.REVIEW, to: STAGES.DONE });
  recordEvent(TRANSITIONS.REVIEW_TO_DONE);
  const done = await reviewStage(cwd, normalized, { reviewer });
  await persistRun({
    currentPhase: 'complete',
    completed: true,
    reviewedRunId: done.state.active_run_id || build.state.build_run_id || null,
    workflowState: done.state,
  });
  const finalState = await readState(cwd, normalized);
  return { root: done.root, state: finalState ?? done.state, runPath };
}

async function listWorkflowSummaries(workflowsRoot) {
  if (!existsSync(workflowsRoot)) {
    return [];
  }
  const entries = await readdir(workflowsRoot, { withFileTypes: true });
  const workflows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const slug = entry.name;
    const root = join(workflowsRoot, slug);
    const state = existsSync(statePath(root)) ? JSON.parse(await readFile(statePath(root), 'utf8')) : null;
    const legacy = detectLegacyContract(root, state);
    const artifacts = collectArtifactPresence(root, legacy ? LEGACY_ARTIFACTS : V1_ARTIFACTS);
    workflows.push({
      slug,
      current_stage: state?.current_stage ?? null,
      contract: legacy ? 'legacy-codex-helper' : 'loopx-v1',
      legacy,
      schema_version: state?.schema_version ?? 0,
      requested_transition: state?.requested_transition ?? TRANSITIONS.NONE,
      last_confirmed_transition: state?.last_confirmed_transition ?? TRANSITIONS.NONE,
      missing_artifact_count: Object.values(artifacts).filter((present) => !present).length,
    });
  }
  return workflows.sort((left, right) => left.slug.localeCompare(right.slug));
}

function summarizeWorkspace(workflows) {
  return workflows.reduce((summary, workflow) => {
    summary.total += 1;
    summary.by_stage[workflow.current_stage ?? 'unknown'] = (summary.by_stage[workflow.current_stage ?? 'unknown'] || 0) + 1;
    if (workflow.legacy) {
      summary.legacy += 1;
    }
    return summary;
  }, {
    total: 0,
    legacy: 0,
    by_stage: {},
  });
}

export async function statusSummary(cwd, slug) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const initialized = existsSync(workspaceRoot);
  const config = await readWorkspaceConfig(cwd);
  const workflowsRoot = join(workspaceRoot, 'workflows');

  if (!slug) {
    const workflows = await listWorkflowSummaries(workflowsRoot);
    return {
      initialized,
      workspaceRoot,
      config,
      workflows,
      workflow_count: workflows.length,
      summary: summarizeWorkspace(workflows),
      next_action: initialized ? 'Run loopx clarify <slug> to start a workflow, or inspect one with loopx status <slug>.' : 'Run loopx init to prepare the workspace.',
    };
  }

  const normalized = normalizeSlug(slug);
  const root = resolveWorkflowRoot(cwd, normalized);
  const state = await readState(cwd, normalized);
  let effectiveState = state;
  if (state?.current_stage === STAGES.CLARIFY) {
    effectiveState = withClarifySummary(state, await readSpecSummary(root));
  }
  const legacy = detectLegacyContract(root, effectiveState);
  const artifacts = collectArtifactPresence(root, legacy ? LEGACY_ARTIFACTS : V1_ARTIFACTS);
  const missing = Object.entries(artifacts).filter(([, present]) => !present).map(([name]) => name);
  return {
    initialized,
    workspaceRoot,
    config,
    slug: normalized,
    root,
    state: effectiveState ? withRecommendedAction(effectiveState, legacy) : null,
    legacy,
    contract: legacy ? 'legacy-codex-helper' : 'loopx-v1',
    schema_version: effectiveState?.schema_version ?? 0,
    artifacts,
    missing_artifacts: missing,
    next_action: effectiveState ? recommendedAction(effectiveState, legacy) : 'Run loopx clarify to start a workflow.',
  };
}
