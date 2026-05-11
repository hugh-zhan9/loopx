import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { getTemplateBaselinePath, inspectInstallState, verifyInstallState } from './install-discovery.mjs';
import { inspectTemplateGovernance } from './template-governance.mjs';

const WORKFLOW_SCHEMA_VERSION = 1;

const STAGES = {
  CLARIFY: 'clarify',
  PLAN: 'plan',
  BUILD: 'build',
  REVIEW: 'review',
  DONE: 'done',
};

const APPROVAL_STATES = {
  NOT_REQUESTED: 'not-requested',
  REQUESTED: 'requested',
  APPROVED: 'approved',
};

const TRANSITIONS = {
  NONE: 'none',
  CLARIFY_TO_PLAN: 'clarify->plan',
  PLAN_TO_BUILD: 'plan->build',
  BUILD_TO_REVIEW: 'build->review',
  REVIEW_TO_DONE: 'review->done',
};

const CHANGE_ARTIFACT_FILE_MAP = {
  proposal: 'proposal.md',
  specDelta: 'spec-delta.md',
  design: 'design.md',
  tasks: 'tasks.md',
  graph: 'artifact-graph.json',
};

function normalizeSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveLoopxRoot(cwd) {
  return join(resolve(cwd), '.loopx');
}

export function resolveUppercaseLoopxRoot(cwd) {
  return join(resolve(cwd), '.LoopX');
}

export function resolveLegacyRoot(cwd) {
  return join(resolve(cwd), '.codex-helper');
}

function existsExactPath(path) {
  const parent = dirname(path);
  const name = basename(path);
  if (!existsSync(parent)) {
    return false;
  }
  try {
    return readdirSync(parent).includes(name);
  } catch {
    return false;
  }
}

export async function ensureLoopxRoot(cwd) {
  const root = resolveLoopxRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  if (!existsExactPath(root) && existsExactPath(uppercaseRoot)) {
    await rename(uppercaseRoot, root);
  }
  await mkdir(root, { recursive: true });
  return root;
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readTextIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  return readFile(path, 'utf8');
}

function parseFrontmatter(text) {
  if (!text?.startsWith('---\n')) {
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
    if (rawValue === 'true' || rawValue === 'false') {
      result[key] = rawValue === 'true';
    } else {
      result[key] = rawValue;
    }
  }
  return result;
}

function resolveRuntimePath(cwd, rawPath, fallback) {
  if (!rawPath) {
    return fallback;
  }
  if (isAbsolute(rawPath)) {
    return rawPath;
  }
  return resolve(cwd, rawPath);
}

function artifactPathFromGraph(cwd, graph, key, fallback) {
  const snakeKey = key === 'specDelta' ? 'spec_delta' : key;
  const rawPath = graph?.change_artifacts?.[snakeKey] || graph?.artifacts?.[key]?.path;
  return resolveRuntimePath(cwd, rawPath, fallback);
}

function createChangeArtifactPaths(cwd, changeRoot, graph = null) {
  return {
    root: changeRoot,
    proposal: artifactPathFromGraph(cwd, graph, 'proposal', join(changeRoot, CHANGE_ARTIFACT_FILE_MAP.proposal)),
    specDelta: artifactPathFromGraph(cwd, graph, 'specDelta', join(changeRoot, CHANGE_ARTIFACT_FILE_MAP.specDelta)),
    design: artifactPathFromGraph(cwd, graph, 'design', join(changeRoot, CHANGE_ARTIFACT_FILE_MAP.design)),
    tasks: artifactPathFromGraph(cwd, graph, 'tasks', join(changeRoot, CHANGE_ARTIFACT_FILE_MAP.tasks)),
    graph: artifactPathFromGraph(cwd, graph, 'graph', join(changeRoot, CHANGE_ARTIFACT_FILE_MAP.graph)),
  };
}

async function findActiveChangeForWorkflow(cwd, slug) {
  const normalized = normalizeSlug(slug);
  const activeRoot = join(resolveLoopxRoot(cwd), 'changes', 'active');
  if (!existsSync(activeRoot)) {
    return null;
  }
  const entries = await readdir(activeRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const changeRoot = join(activeRoot, entry.name);
    const graphPath = join(changeRoot, CHANGE_ARTIFACT_FILE_MAP.graph);
    const graph = await readJsonIfExists(graphPath);
    const specDeltaPath = join(changeRoot, CHANGE_ARTIFACT_FILE_MAP.specDelta);
    const specDeltaText = await readTextIfExists(specDeltaPath);
    const specDeltaMeta = parseFrontmatter(specDeltaText);
    let score = 0;
    if (normalizeSlug(graph?.slug || graph?.workflow) === normalized) {
      score += 100;
    }
    if (normalizeSlug(specDeltaMeta.slug) === normalized) {
      score += 80;
    }
    if (normalizeSlug(entry.name).startsWith(`${normalized}-`) || normalizeSlug(entry.name) === normalized) {
      score += 20;
    }
    if (score === 0) {
      continue;
    }
    const paths = createChangeArtifactPaths(cwd, changeRoot, graph);
    const changeId = normalizeSlug(graph?.change_id || graph?.change || specDeltaMeta.change_id || entry.name);
    candidates.push({ score, changeId, paths, rootName: entry.name });
  }
  candidates.sort((left, right) => right.score - left.score || right.rootName.localeCompare(left.rootName));
  return candidates[0] || null;
}

async function inferReviewState(workflowRoot) {
  const reviewText = await readTextIfExists(join(workflowRoot, 'review.md'))
    || await readTextIfExists(join(workflowRoot, 'review-report.md'))
    || '';
  const reviewMeta = parseFrontmatter(reviewText);
  const rawVerdict = String(reviewMeta.verdict || '').toLowerCase();
  const textVerdict = /(^|\n)\s*(REQUEST\s+CHANGES|NO-?GO)\s*($|\n)/i.test(reviewText)
    ? 'request-changes'
    : /(^|\n)\s*(APPROVE|GO)\s*($|\n)/i.test(reviewText)
      ? 'approve'
      : 'none';
  const reviewVerdict = rawVerdict === 'go' || rawVerdict.includes('approve')
    ? 'approve'
    : rawVerdict.includes('request') || rawVerdict === 'no-go' || rawVerdict === 'nogo'
      ? 'request-changes'
      : textVerdict;
  if (reviewVerdict === 'approve') {
    return {
      current_stage: STAGES.REVIEW,
      stage_status: 'awaiting-approval',
      review_status: 'in-review',
      review_verdict: 'approve',
      rollback_target: 'none',
      rollback_rationale: null,
      pending_user_decision: TRANSITIONS.REVIEW_TO_DONE,
      requested_transition: TRANSITIONS.NONE,
      last_confirmed_transition: TRANSITIONS.BUILD_TO_REVIEW,
      approval: {
        plan: APPROVAL_STATES.APPROVED,
        build: APPROVAL_STATES.APPROVED,
        review: APPROVAL_STATES.APPROVED,
        rollback: APPROVAL_STATES.NOT_REQUESTED,
        complete: APPROVAL_STATES.REQUESTED,
      },
    };
  }
  return null;
}

async function inferExecutionStatus(workflowRoot) {
  const text = await readTextIfExists(join(workflowRoot, 'execution-record.md'));
  if (!text) {
    return 'missing';
  }
  const meta = parseFrontmatter(text);
  if (meta.execution_approved_for_review === true || meta.status === 'review-ready' || /## Verification Evidence/i.test(text)) {
    return 'complete';
  }
  return 'partial';
}

function createMigratedWorkflowBaseState(slug, legacyState, change) {
  const profile = legacyState.clarify_profile || legacyState.profile || 'standard';
  return {
    schema_version: WORKFLOW_SCHEMA_VERSION,
    slug,
    current_stage: STAGES.CLARIFY,
    stage_status: 'blocked',
    clarify_profile: profile,
    clarify_target_ambiguity_threshold: legacyState.clarify_target_ambiguity_threshold ?? 0.2,
    clarify_max_rounds: legacyState.clarify_max_rounds ?? 15,
    clarify_current_round: legacyState.clarify_current_round ?? legacyState.current_round ?? 0,
    clarify_ambiguity_score: legacyState.clarify_ambiguity_score ?? legacyState.ambiguity_score ?? 1,
    clarify_pressure_pass_complete: Boolean(legacyState.clarify_pressure_pass_complete ?? legacyState.pressure_pass_complete),
    clarify_non_goals_resolved: Boolean(legacyState.clarify_non_goals_resolved ?? legacyState.non_goals_resolved),
    clarify_decision_boundaries_resolved: Boolean(legacyState.clarify_decision_boundaries_resolved ?? legacyState.decision_boundaries_resolved),
    ambiguity_items: Array.isArray(legacyState.ambiguity_items) ? legacyState.ambiguity_items : [],
    unresolved_ambiguity_count: Number(legacyState.unresolved_ambiguity_count ?? 0),
    plan_package_status: 'missing',
    plan_current_iteration: 0,
    plan_max_iterations: 3,
    plan_consensus_mode: true,
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
    change_id: change?.changeId || `chg-${slug}`,
    change_artifacts_status: change ? 'complete' : 'missing',
    change_artifact_paths: change?.paths || null,
    spec_delta_status: change ? 'complete' : 'missing',
    spec_sync_status: 'pending',
    archive_status: 'pending',
    archived_change_path: null,
    archived_spec_paths: [],
    build_run_id: null,
    build_current_iteration: 0,
    build_max_iterations: 5,
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

async function migrateLegacyWorkflowState(cwd, slug, workflowRoot, legacyState) {
  const change = await findActiveChangeForWorkflow(cwd, slug);
  const reviewState = await inferReviewState(workflowRoot);
  const canonicalPlanPath = join(resolveLoopxRoot(cwd), 'plans', `prd-${slug}.md`);
  const canonicalTestSpecPath = join(resolveLoopxRoot(cwd), 'plans', `test-spec-${slug}.md`);
  const baseState = createMigratedWorkflowBaseState(slug, legacyState, change);
  const planDocsComplete = ['plan.md', 'architecture.md', 'development-plan.md', 'test-plan.md']
    .every((name) => existsSync(join(workflowRoot, name)));
  const executionRecordStatus = await inferExecutionStatus(workflowRoot);
  const planState = planDocsComplete ? {
    current_stage: STAGES.PLAN,
    stage_status: 'awaiting-approval',
    plan_package_status: 'complete',
    plan_current_iteration: 1,
    plan_principles_resolved: true,
    plan_options_reviewed: true,
    plan_architect_review_status: 'complete',
    plan_critic_verdict: 'approve',
    plan_acceptance_criteria_testable: true,
    plan_verification_steps_resolved: true,
    plan_execution_inputs_resolved: true,
    plan_docs_status: 'complete',
    approval: {
      plan: APPROVAL_STATES.APPROVED,
      build: APPROVAL_STATES.NOT_REQUESTED,
      review: APPROVAL_STATES.NOT_REQUESTED,
      rollback: APPROVAL_STATES.NOT_REQUESTED,
      complete: APPROVAL_STATES.NOT_REQUESTED,
    },
  } : {};
  const buildState = executionRecordStatus === 'complete' ? {
    current_stage: STAGES.BUILD,
    stage_status: 'awaiting-approval',
    build_current_iteration: 1,
    build_parallel_mode: true,
    build_verification_status: 'complete',
    build_architect_verification_status: 'approved',
    build_deslop_status: 'complete',
    build_regression_status: 'passed',
    review_status: 'ready-for-review',
    execution_record_status: 'complete',
    approval: {
      ...(planState.approval || baseState.approval),
      build: APPROVAL_STATES.APPROVED,
      review: APPROVAL_STATES.NOT_REQUESTED,
    },
  } : {};
  const migrated = {
    ...baseState,
    ...legacyState,
    ...planState,
    ...buildState,
    schema_version: WORKFLOW_SCHEMA_VERSION,
    slug,
    clarify_profile: legacyState.clarify_profile || legacyState.profile || 'standard',
    plan_artifact_path: existsSync(canonicalPlanPath) ? canonicalPlanPath : join(workflowRoot, 'plan.md'),
    test_spec_artifact_path: existsSync(canonicalTestSpecPath) ? canonicalTestSpecPath : join(workflowRoot, 'test-plan.md'),
    execution_record_status: executionRecordStatus,
    ...(reviewState || {}),
  };
  await writeFile(join(workflowRoot, 'state.json'), `${JSON.stringify(migrated, null, 2)}\n`);
  return {
    slug,
    migrated: true,
    reason: 'migrated_legacy_workflow_schema',
    current_stage: migrated.current_stage,
    change_id: migrated.change_id,
  };
}

async function migrateLegacyWorkflowStates(cwd) {
  const workflowsRoot = join(resolveLoopxRoot(cwd), 'workflows');
  if (!existsSync(workflowsRoot)) {
    return [];
  }
  const entries = await readdir(workflowsRoot, { withFileTypes: true });
  const migrations = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const slug = normalizeSlug(entry.name);
    const workflowRoot = join(workflowsRoot, entry.name);
    const state = await readJsonIfExists(join(workflowRoot, 'state.json'));
    if (!state || state.schema_version === WORKFLOW_SCHEMA_VERSION) {
      continue;
    }
    migrations.push(await migrateLegacyWorkflowState(cwd, slug, workflowRoot, state));
  }
  return migrations;
}

export async function migrateLegacyRuntime(cwd) {
  const legacyRoot = resolveLegacyRoot(cwd);
  const loopxRoot = resolveLoopxRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  const legacyExists = existsExactPath(legacyRoot);
  const loopxExists = existsExactPath(loopxRoot);
  const uppercaseExists = existsExactPath(uppercaseRoot);

  if (!legacyExists && !uppercaseExists) {
    const workflowStateMigrations = loopxExists ? await migrateLegacyWorkflowStates(cwd) : [];
    return {
      migrated: workflowStateMigrations.length > 0,
      legacyExists: false,
      uppercaseExists: false,
      loopxExists,
      loopxRoot,
      legacyRoot,
      workflowStateMigrations,
      reason: workflowStateMigrations.length > 0 ? 'migrated_legacy_workflow_schema' : 'legacy_root_missing',
    };
  }

  if (loopxExists && (legacyExists || uppercaseExists)) {
    throw new Error('mixed_runtime_roots_detected');
  }

  if (uppercaseExists && !loopxExists) {
    await rename(uppercaseRoot, loopxRoot);
    const workflowStateMigrations = await migrateLegacyWorkflowStates(cwd);
    return {
      migrated: true,
      legacyExists,
      uppercaseExists: true,
      loopxExists: true,
      loopxRoot,
      legacyRoot,
      workflowStateMigrations,
      reason: 'migrated_uppercase_loopx_runtime',
    };
  }

  await rename(legacyRoot, loopxRoot);
  const workflowStateMigrations = await migrateLegacyWorkflowStates(cwd);
  return {
    migrated: true,
    legacyExists: true,
    uppercaseExists,
    loopxExists: true,
    loopxRoot,
    legacyRoot,
    workflowStateMigrations,
    reason: 'migrated_legacy_runtime',
  };
}

export async function doctorRuntime(cwd, env = process.env) {
  const loopxRoot = resolveLoopxRoot(cwd);
  const legacyRoot = resolveLegacyRoot(cwd);
  const uppercaseRoot = resolveUppercaseLoopxRoot(cwd);
  const installState = await inspectInstallState(env);
  const installCheck = await verifyInstallState(env);
  const installTemplateBaselinePath = getTemplateBaselinePath(env);
  const workspaceTemplateBaselinePath = join(loopxRoot, 'template-hashes.json');
  const templateGovernance = await inspectTemplateGovernance(
    existsSync(installTemplateBaselinePath) ? installTemplateBaselinePath : workspaceTemplateBaselinePath,
  );
  const workflowHookPath = join(resolve(cwd), 'scripts', 'codex-workflow-hook.mjs');
  const installedWorkflowHookPath = installState.managedArtifacts?.['codex-workflow-hook']?.targetPath
    || join(resolve(env.LOOPX_HOME || env.HOME || process.cwd()), '.codex', 'hooks', 'codex-workflow-hook.mjs');
  const hook = {
    enabled: env.LOOPX_HOOKS !== '0',
    workflowHookPath,
    installedWorkflowHookPath,
    installed: existsSync(installedWorkflowHookPath),
  };

  return {
    loopxRoot,
    legacyRoot,
    uppercaseRoot,
    loopxExists: existsExactPath(loopxRoot),
    legacyExists: existsExactPath(legacyRoot),
    uppercaseExists: existsExactPath(uppercaseRoot),
    mixedRuntimeRoots: existsExactPath(loopxRoot) && (existsExactPath(legacyRoot) || existsExactPath(uppercaseRoot)),
    installState,
    installCheck,
    templateGovernance,
    hook,
  };
}
