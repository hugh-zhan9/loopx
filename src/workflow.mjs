import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUTOPILOT_PHASES, createDefaultAutopilotAdapter } from './autopilot-runtime.mjs';
import { writeBuildActiveState } from './build-stop-gate.mjs';
import {
  buildContextManifestPath,
  generateBuildContextManifest,
  generateReviewContextManifest,
  manifestRowsToInputManifest,
  readContextManifest,
  reviewContextManifestPath,
} from './context-manifest.mjs';
import { doctorRuntime, ensureLoopxRoot, resolveLoopxRoot } from './runtime-maintenance.mjs';
import { DEFAULT_BUILD_MAX_ITERATIONS, createDefaultBuildAdapter } from './build-runtime.mjs';
import { DEFAULT_MAX_ITERATIONS, createDefaultPlanAdapter } from './plan-runtime.mjs';
import { inspectProjectConventions } from './project-discovery.mjs';
import { createDefaultReviewAdapter } from './review-runtime.mjs';
import { appendWorkspaceJournal } from './workspace-memory.mjs';
import { inspectWorkspaceContext, setupWorkspaceContext } from './workspace-context.mjs';

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
  REVIEW_TO_BUILD: 'review->build',
  REVIEW_TO_PLAN: 'review->plan',
  REVIEW_TO_CLARIFY: 'review->clarify',
  REVIEW_TO_DONE: 'review->done',
};

const PLAN_ARTIFACTS = ['plan.md', 'architecture.md', 'development-plan.md', 'test-plan.md'];
const V1_ARTIFACTS = ['spec.md', ...PLAN_ARTIFACTS, 'execution-record.md', 'review-report.md'];
const LEGACY_ARTIFACTS = ['brief.md', 'plan.md', 'detailed-design.md', 'architecture.md', 'test-plan.md', 'build-result.md', 'review-report.md'];
const PLAN_REVIEW_DIR = 'plan-reviews';
const BUILD_SUPPORT_DIR = 'build-support';
const CHANGE_ARTIFACTS = ['proposal.md', 'spec-delta.md', 'design.md', 'tasks.md', 'slices.json', 'artifact-graph.json'];
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
const DELEGATION_MODES = ['local', 'critic-only', 'parallel-review'];
const DEFAULT_AGENT_DELEGATION_CONFIG = {
  enabled: false,
  auto_start: false,
  threshold: 'critic-only',
  plan_parallelism: 'review-only',
  build_parallelism: 'disjoint-only',
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

function slugFromBuildInput(raw) {
  const value = String(raw || '');
  const name = basename(value);
  const match = /^(?:requirements-snapshot|prd)-(.+)\.md$/.exec(name);
  return match ? normalizeSlug(match[1]) : normalizeSlug(value);
}

function isReviewReworkArtifactInput(raw) {
  const name = basename(String(raw || ''));
  return name === 'review-report.md' || name === 'review.md';
}

function slugFromReviewReworkInput(raw) {
  if (!isReviewReworkArtifactInput(raw)) {
    throw new Error('build_from_review_artifact_required');
  }
  return normalizeSlug(basename(dirname(resolve(String(raw)))));
}

function displayPath(cwd, path) {
  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);
  return rel && !rel.startsWith('..') ? rel : resolved;
}

function reviewReportArtifactPath(slug) {
  return `.loopx/workflows/${normalizeSlug(slug)}/review-report.md`;
}

function reviewReworkBuildCommand(slug) {
  return `$build --from-review ${reviewReportArtifactPath(slug)}`;
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

function normalizeDelegationThreshold(raw) {
  const value = String(raw || DEFAULT_AGENT_DELEGATION_CONFIG.threshold).trim().toLowerCase();
  if (!DELEGATION_MODES.includes(value)) {
    throw new Error(`invalid_agent_delegation_threshold:${value}`);
  }
  return value;
}

function delegationModeRank(mode) {
  return DELEGATION_MODES.indexOf(String(mode || 'local'));
}

function delegationMeetsThreshold(mode, threshold) {
  return delegationModeRank(mode) >= delegationModeRank(normalizeDelegationThreshold(threshold));
}

function normalizeAgentDelegationConfig(raw = {}) {
  const candidate = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: candidate.enabled === true,
    auto_start: candidate.auto_start === true,
    threshold: normalizeDelegationThreshold(candidate.threshold),
    plan_parallelism: String(candidate.plan_parallelism || DEFAULT_AGENT_DELEGATION_CONFIG.plan_parallelism),
    build_parallelism: String(candidate.build_parallelism || DEFAULT_AGENT_DELEGATION_CONFIG.build_parallelism),
  };
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

const PLAN_SOURCE_DOCUMENT_KEYS = [
  'source_product_doc',
  'source_prototype_doc',
  'source_prototype_html',
  'product_doc',
  'prototype_doc',
  'prototype_html',
];
const MAX_PLAN_SOURCE_DOCUMENT_CHARS = 30000;
const MAX_PLAN_SOURCE_HTML_CHARS = 8000;
const MAX_PLAN_SOURCE_BUNDLE_CHARS = 70000;

function sourceDocumentPathsFromSpecAndState(sourceSpecPath, sourceText, state = {}) {
  const meta = parseFrontmatter(sourceText);
  const candidates = [];
  const pushValue = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        pushValue(item);
      }
      return;
    }
    if (typeof value === 'string' && value.trim()) {
      candidates.push(value.trim());
    }
  };

  for (const key of PLAN_SOURCE_DOCUMENT_KEYS) {
    pushValue(meta[key]);
    pushValue(state?.source_context?.[key]);
  }

  return dedupeStrings(candidates).map((candidate) => {
    if (isAbsolute(candidate)) {
      return candidate;
    }
    return resolve(dirname(sourceSpecPath), candidate);
  });
}

function htmlToPlanningText(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<h1[^>]*>/gi, '\n# ')
    .replace(/<h2[^>]*>/gi, '\n## ')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<h4[^>]*>/gi, '\n#### ')
    .replace(/<h[5-6][^>]*>/gi, '\n#### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, ' |\n')
    .replace(/<t[dh][^>]*>/gi, '| ')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<\/(p|li|table|section|article|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trimPlanSourceDocument(text) {
  const value = String(text || '').trim();
  if (value.length <= MAX_PLAN_SOURCE_DOCUMENT_CHARS) {
    return value;
  }
  return [
    value.slice(0, MAX_PLAN_SOURCE_DOCUMENT_CHARS),
    '',
    `...已截断，原始来源文档超过 ${MAX_PLAN_SOURCE_DOCUMENT_CHARS} 字符；plan 仍必须优先覆盖前文已提取的需求表、字段和流程。`,
  ].join('\n');
}

function compactPlanningText(text, { html = false } = {}) {
  const source = html ? htmlToPlanningText(text) : String(text || '');
  const maxChars = html ? MAX_PLAN_SOURCE_HTML_CHARS : MAX_PLAN_SOURCE_DOCUMENT_CHARS;
  const kept = [];
  let total = 0;
  let previousWasBlank = false;
  const keepLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return false;
    }
    return /^#{1,6}\s+/.test(trimmed)
      || trimmed.startsWith('|')
      || /^[-*]\s+/.test(trimmed)
      || /^\d+[.)]\s+/.test(trimmed)
      || /MUST|SHALL|必须|不得|不能|不自动|人工|确认|复核|执行|下发|任务|字段|状态|流程|规则|范围|来源|验收|示例|异常|差异|mock|API|接口|持久化|页面|明细|日志|权限/i.test(trimmed);
  };

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!keepLine(line)) {
      continue;
    }
    if (!previousWasBlank && kept.length > 0 && /^#{1,6}\s+/.test(trimmed)) {
      kept.push('');
      total += 1;
      previousWasBlank = true;
    }
    if (total + trimmed.length + 1 > maxChars) {
      kept.push(`...已压缩截断，来源文档高信号内容超过 ${maxChars} 字符。`);
      break;
    }
    kept.push(trimmed);
    total += trimmed.length + 1;
    previousWasBlank = false;
  }

  const compacted = kept.join('\n').trim();
  return compacted || trimPlanSourceDocument(source);
}

async function readPlanSourceText(cwd, state, sourceSpecPath) {
  const sourceText = await readFile(sourceSpecPath, 'utf8');
  const sourceDocumentPaths = sourceDocumentPathsFromSpecAndState(sourceSpecPath, sourceText, state);
  if (sourceDocumentPaths.length === 0) {
    return { sourceText, sourceDocumentPaths: [] };
  }

  const parts = [sourceText.trimEnd()];
  const loaded = [];
  for (const path of sourceDocumentPaths) {
    if (!existsSync(path)) {
      continue;
    }
    const raw = await readFile(path, 'utf8');
    const body = compactPlanningText(raw, { html: /\.html?$/i.test(path) });
    loaded.push(path);
    parts.push([
      '',
      `# 引用源文档：${relative(cwd, path) || path}`,
      '',
      trimPlanSourceDocument(body),
    ].join('\n'));
    const currentLength = parts.join('\n\n').length;
    if (currentLength >= MAX_PLAN_SOURCE_BUNDLE_CHARS) {
      parts.push(`\n# 引用源文档截断说明\n\n源文档合并内容超过 ${MAX_PLAN_SOURCE_BUNDLE_CHARS} 字符，后续文档未继续注入 planner prompt。`);
      break;
    }
  }

  return {
    sourceText: parts.join('\n\n').slice(0, MAX_PLAN_SOURCE_BUNDLE_CHARS),
    sourceDocumentPaths: loaded,
  };
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
  await writeText(statePath(root), JSON.stringify(enrichRuntimeJudgment(state), null, 2));
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

function resolveIntakeRoot(cwd) {
  return join(resolveWorkspaceRoot(cwd), 'intake');
}

function resolveChangesRoot(cwd) {
  return join(resolveWorkspaceRoot(cwd), 'changes');
}

function changeIdForWorkflowSlug(slug) {
  return `chg-${normalizeSlug(slug)}`;
}

function resolveChangeRoot(cwd, changeId) {
  return join(resolveChangesRoot(cwd), 'active', normalizeSlug(changeId));
}

function resolveArchivedChangeRoot(cwd, changeId) {
  return join(resolveChangesRoot(cwd), 'archive', normalizeSlug(changeId));
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
    delegationLedger: join(supportRoot, 'delegation-ledger.json'),
    completionAudit: join(supportRoot, 'completion-audit.json'),
  };
}

function canonicalClarifySpecPath(cwd, slug, stamp) {
  return join(resolveIntakeRoot(cwd), `clarify-${normalizeSlug(slug)}-${stamp}.md`);
}

export async function readWorkspaceConfig(cwd) {
  const path = workspaceConfigPath(resolveWorkspaceRoot(cwd));
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readAgentDelegationConfig(cwd) {
  const config = await readWorkspaceConfig(cwd);
  return normalizeAgentDelegationConfig(config?.agent_delegation);
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
    '- `loopx archive <slug>`',
    '- `loopx autopilot <slug> [--reviewer <name>]`',
    '- `loopx render [slug|--all]`',
    '- `loopx status [slug] [--json]`',
    '- `loopx setup-context`',
    '- `loopx doctor`',
    '- `loopx migrate`',
    '- `loopx repair-install`',
    '',
    '## Document Boundaries',
    '',
    'User-facing documents to watch:',
    '',
    '- `workflows/<slug>/spec.md`',
    '- `workflows/<slug>/plan.md`, `architecture.md`, `development-plan.md`, and `test-plan.md`',
    '- `workflows/<slug>/execution-record.md` and `review-report.md`',
    '- `views/index.html` and `workflows/<slug>/view/index.html` after `loopx plan` or `loopx render`',
    '',
    'Documents users may read and edit as workflow fact sources:',
    '',
    '- `workflows/<slug>/*.md` for the active workflow working copy',
    '- `context/domain.md` and `agents/*.md` for project context and collaboration guidance',
    '- `changes/active/<change-id>/*.md` for proposal, design, tasks, and spec delta',
    '- `specs/<domain>/spec.md` for archived long-lived behavior specs',
    '',
    'Tool-owned or derived files:',
    '',
    '- `workflows/<slug>/state.json`, `build-context.jsonl`, and `review-context.jsonl`',
    '- `workflows/<slug>/plan-reviews/`, `build-support/`, and `review-support/`',
    '- `intake/clarify-*.md` clarify snapshots',
    '- `changes/active/<change-id>/slices.json` and `artifact-graph.json`',
    '- `autopilot/<slug>/run.json` and `build-active.json`',
    '- `views/` and `workflows/<slug>/view/` generated HTML views',
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
    plan_delegation_decision_path: null,
    plan_delegation_mode: 'local',
    plan_delegation_recommended_mode: 'local',
    plan_delegation_actual_mode: 'local',
    plan_delegation_runtime_execution: 'local-sequential',
    plan_delegation_authorization_status: 'disabled',
    plan_delegation_authorization_source: '.loopx/config.json:agent_delegation.enabled=false',
    plan_delegation_threshold: DEFAULT_AGENT_DELEGATION_CONFIG.threshold,
    plan_delegation_score: 0,
    plan_delegation_triggers: [],
    plan_delegation_reason: null,
    plan_review_artifact_paths: [],
    plan_review_history: [],
    plan_blockers: [],
    plan_source_spec_path: null,
    change_id: changeIdForWorkflowSlug(slug),
    change_artifacts_status: 'missing',
    change_artifact_paths: null,
    slice_artifacts_status: 'missing',
    spec_delta_status: 'missing',
    spec_sync_status: 'pending',
    archive_status: 'pending',
    archived_change_path: null,
    archived_spec_paths: [],
    adr_candidate_path: null,
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
    build_owner_id: null,
    build_owner_session_id: null,
    build_owner_status: 'not-started',
    build_delegation_status: 'not-started',
    build_delegation_ledger_path: null,
    build_active_delegation_count: 0,
    build_completion_audit_status: 'not-started',
    build_completion_audit_path: null,
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

async function writeJson(path, value) {
  await writeText(path, JSON.stringify(value, null, 2));
}

async function writeCanonicalPlanArtifacts(cwd, root, slug) {
  const plansRoot = resolvePlansRoot(cwd);
  await ensureDir(plansRoot);
  const planPath = join(plansRoot, `requirements-snapshot-${slug}.md`);
  const testSpecPath = join(plansRoot, `test-spec-${slug}.md`);
  const planText = await readFile(artifactPath(root, 'plan.md'), 'utf8');
  const architectureText = await readFile(artifactPath(root, 'architecture.md'), 'utf8');
  const developmentPlanText = await readFile(artifactPath(root, 'development-plan.md'), 'utf8');
  const testPlanText = await readFile(artifactPath(root, 'test-plan.md'), 'utf8');

  await writeText(
    planPath,
    [
      `# loopx Requirements Snapshot: ${slug}`,
      '',
      '本文件是用户原始需求和已批准计划包的执行快照，不是由 loopx 生成的 PRD。原始需求来源仍以 `spec.md` / `plan_source_spec_path` 指向的用户材料为准。',
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

function dedupeStrings(items) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function slugKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[`'"*_#()[\]{}]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'requirement';
}

function bulletsFromSectionText(text, heading) {
  const pattern = new RegExp(`#{2,3} ${heading}\\n\\n([\\s\\S]*?)(?=\\n#{2,3} |$)`, 'i');
  const match = text.match(pattern);
  if (!match) {
    return [];
  }
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function sectionBodiesForHeadings(text, headingPatterns) {
  const body = stripFrontmatter(text);
  const headingPattern = /^#{2,4}\s+(.+?)\s*$/gm;
  const headings = [...body.matchAll(headingPattern)];
  const bodies = [];
  for (let index = 0; index < headings.length; index += 1) {
    const title = headings[index][1].trim();
    if (!headingPatterns.some((pattern) => pattern.test(title))) {
      continue;
    }
    const start = headings[index].index + headings[index][0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : body.length;
    bodies.push(body.slice(start, end).trim());
  }
  return bodies;
}

function explicitCoverageItems(sourceText) {
  const bodies = sectionBodiesForHeadings(sourceText, [
    /^in\s+scope$/i,
    /^testable\s+acceptance\s+criteria$/i,
    /^functional\s+requirements?$/i,
    /required\s+coverage/i,
    /requirement\s+coverage/i,
    /requirements?/i,
    /coverage\s+matrix/i,
    /功能需求/,
    /交付范围/,
    /验收/,
    /成功标准/,
    /需求.*覆盖/,
    /需求.*完整/,
    /需求.*卡点/,
  ]);
  if (bodies.length === 0) {
    return [];
  }
  return bodies
    .flatMap((body) => body.split('\n'))
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean);
}

function markdownTableCoverageItems(sourceText) {
  const items = [];
  const lines = String(sourceText || '').split('\n');
  let currentHeading = '';
  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (heading) {
      currentHeading = heading[1].trim();
      continue;
    }
    if (!line.trim().startsWith('|')) {
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      continue;
    }
    const first = cells[0].replace(/`/g, '').trim();
    if (!first || /^(字段|事件类型|模块|维度|对象|处理环节|field|type|module)$/i.test(first)) {
      continue;
    }
    if (
      /事件|字段|处理模式|标准化|范围|任务|确认|复核|审批|审计|权限|资源|下发|source|event|field|coverage|requirement/i.test(currentHeading)
      || cells.some((cell) => /SHALL|MUST|manual_|raw_snapshot|event_|处理|确认|复核|审批|补偿|回滚|下发|不自动/i.test(cell))
    ) {
      items.push(first);
    }
  }
  return items;
}

function requirementHeadingCoverageItems(sourceText) {
  return [...String(sourceText || '').matchAll(/^###\s+Requirement:\s*(.+?)\s*$/gim)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function relevantHeadingCoverageItems(sourceText) {
  return [...String(sourceText || '').matchAll(/^#{2,4}\s+(.+?)\s*$/gm)]
    .map((match) => match[1].replace(/`/g, '').trim())
    .filter((title) => /需求|范围|验收|页面|任务|事件|流程|规则|字段|接口|架构|设计|计划|处理|异常|差异|复核|审批|审计|权限|资源|mock/i.test(title))
    .filter((title) => !/^(审阅说明|门禁|source|context|inference)$/i.test(title));
}

function sourceRequirementItems(sourceText) {
  return dedupeStrings([
    ...explicitCoverageItems(sourceText),
    ...relevantHeadingCoverageItems(sourceText),
    ...markdownTableCoverageItems(sourceText),
    ...requirementHeadingCoverageItems(sourceText),
  ]).slice(0, 80);
}

function markdownTableCell(value) {
  return String(value ?? '')
    .replace(/\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function numberedPlanItems(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean);
}

function hasMarkdownHeading(text, heading) {
  const escaped = String(heading || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^#{2,4}\\s+${escaped}\\s*$`, 'm').test(String(text || ''));
}

function appendMarkdownSectionIfMissing(text, heading, body) {
  if (hasMarkdownHeading(text, heading)) {
    return text;
  }
  return [
    String(text || '').trimEnd(),
    '',
    `## ${heading}`,
    '',
    String(body || '').trim(),
  ].join('\n');
}

function sourceItemsForPlanEnrichment(sourceText, plannerDraft) {
  const sourceItems = sourceRequirementItems(sourceText);
  if (sourceItems.length > 0) {
    return sourceItems;
  }
  return dedupeStrings([
    ...numberedPlanItems(plannerDraft?.planText),
    ...numberedPlanItems(plannerDraft?.developmentPlanText),
  ]).slice(0, 24);
}

function requirementMappingTable(items, columns) {
  const header = `| ${columns.map(([label]) => markdownTableCell(label)).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const rows = items.map((item, index) => `| ${columns.map(([, render]) => markdownTableCell(render(item, index))).join(' | ')} |`);
  return [header, divider, ...rows].join('\n');
}

function sourceRequirementRows(items, columns) {
  return requirementMappingTable(items, [
    ['#', (_, index) => index + 1],
    ['原始需求项', (item) => item],
    ...columns,
  ]);
}

function enrichPlanTextForReview(text, items) {
  let next = text;
  next = appendMarkdownSectionIfMissing(next, '原始需求清单', [
    '以下条目来自本次 plan 的源需求，是 build 前必须保留的审阅面。后续实现不得把这些条目隐含在泛化任务里。',
    '',
    ...items.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '原始需求映射', [
    requirementMappingTable(items, [
      ['#', (_, index) => index + 1],
      ['原始需求项', (item) => item],
      ['计划落点', () => '进入交付范围、变更规格、开发切片和测试计划'],
      ['Build 证据要求', () => 'execution-record.md 中必须记录对应实现、验证命令或人工验收证据'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, 'Build 前审阅清单', [
    '- `requirement-traceability.md` 中所有原始需求项必须为 covered。',
    '- `spec-delta.md` 中每个新增/修改需求必须有 SHALL/MUST 和 Scenario。',
    '- `slices.json` 中每个切片必须有 AFK/HITL 类型、验收标准和验证信号。',
    '- 执行阶段只能从用户显式批准的 plan package 启动，不允许 plan 自动进入 build。',
  ].join('\n'));
  return next;
}

function enrichArchitectureTextForReview(text, items) {
  let next = text;
  next = appendMarkdownSectionIfMissing(next, '文档定位', [
    '架构文档回答“系统应如何分层、如何集成、哪些边界不能越过”。它不是任务清单，也不是字段级详细设计；build 阶段必须用它约束模块归属、数据流、状态边界和风险控制。',
    '',
    '| 文档 | 负责回答 | 不负责回答 |',
    '| --- | --- | --- |',
    '| `architecture.md` | 系统边界、模块职责、数据/状态流、接口边界、架构决策和质量属性 | 逐文件编码步骤、字段默认值、函数签名细节 |',
    '| `development-plan.md` | 交付顺序、切片、依赖、验证和完成定义 | 重新选择架构方向 |',
    '| `design.md` | 数据结构、接口/函数/组件契约、流程细节和边界条件 | 跨系统架构取舍或排期 |',
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '架构目标与非目标', [
    '- 目标：把每个原始需求映射到稳定的系统边界、模块职责、状态/数据模型和集成方式。',
    '- 目标：暴露关键风险、不可越过的副作用边界，以及后续真实接入需要重新规划的位置。',
    '- 非目标：不在架构文档里安排开发顺序，不写字段级实现细节，不替代详细设计。',
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '上下文与系统边界', [
    sourceRequirementRows(items, [
      ['系统入口/用户', () => '在 build 前由 Planner 明确入口、操作者、上游来源和下游消费者'],
      ['边界约束', () => '列明本次可修改模块、不可修改模块、外部系统是否 mock、权限/审计约束'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '组件与职责', [
    sourceRequirementRows(items, [
      ['承载组件', () => '明确后端 domain/usecase/repository/API、前端页面/组件、provider 或 adapter 的归属'],
      ['职责边界', () => '说明该组件负责什么、不负责什么，以及和相邻模块的调用方向'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '数据与状态模型', [
    sourceRequirementRows(items, [
      ['核心数据', () => '列出必须结构化保存或传递的实体、字段组、状态值和关联键'],
      ['状态/一致性', () => '说明状态推进、幂等、去重、审计、补偿或异常处理边界'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '接口与集成契约', [
    sourceRequirementRows(items, [
      ['入口契约', () => '列出 API、CLI、任务、页面路由、事件或 provider 方法的输入输出边界'],
      ['集成约束', () => '说明真实依赖、mock 依赖、权限、错误传播和副作用控制'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '关键流程', [
    sourceRequirementRows(items, [
      ['主流程', () => '用步骤描述从入口到状态/数据落点再到响应或回写的路径'],
      ['异常流程', () => '列出失败、重试、人工介入、回滚或 no-op 的处理方式'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '需求到架构映射', [
    requirementMappingTable(items, [
      ['#', (_, index) => index + 1],
      ['原始需求项', (item) => item],
      ['架构落点', () => '在模块边界、数据结构、接口入口或状态流转中显式承接'],
      ['风险控制', () => '通过状态校验、mock/adapter 隔离、权限/日志或回归测试约束副作用'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '架构审阅重点', [
    '- 模块边界必须能解释每个原始需求项由谁负责，不得只写“新增模块”。',
    '- 数据持久化、外部依赖、前端入口和状态推进必须分别列出约束。',
    '- 高风险领域必须写出不做什么，以及为什么不会触达真实副作用。',
    '- 后续接真实系统时，必须通过 adapter 或新 plan 增量承接，不在本次 build 中暗接。',
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '质量属性与风险', [
    '- 可测试性：每个模块边界都必须能被单测、集成测试或人工验收独立证明。',
    '- 可观测性：关键状态推进、人工动作、外部依赖和异常处理必须有日志或执行记录证据。',
    '- 可维护性：共享抽象只能承载真实共性；事件/场景差异必须在受控扩展点中表达。',
    '- 安全与副作用：涉及资金、资产、交易、权限、通知或外部系统时必须显式说明 mock/真实边界。',
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '架构决策记录', [
    '| 决策 | 选项 | 取舍 | 后续影响 |',
    '| --- | --- | --- | --- |',
    '| 当前架构方向 | 采用计划中已批准的模块边界和 adapter/provider 隔离方式 | 优先降低误实现和真实副作用风险 | build 阶段如发现边界不成立，必须回到 plan 修订 |',
  ].join('\n'));
  return next;
}

function enrichDevelopmentPlanTextForReview(text, items) {
  let next = text;
  next = appendMarkdownSectionIfMissing(next, '文档定位', [
    '开发计划回答“按什么顺序交付、每个切片完成到什么程度、如何验证和交接”。它不重新做架构取舍，也不写字段级详细设计；build 阶段用它排定执行顺序和完成定义。',
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '交付切片', [
    sourceRequirementRows(items, [
      ['切片目标', (_, index) => `Slice ${index + 1}: 交付该需求的最小端到端可验证行为`],
      ['验收标准', () => '代码、数据/接口、测试、执行记录和必要人工验收证据齐全'],
      ['模式', () => '按风险标记 AFK 或 HITL；涉及人工审批、外部副作用或产品判断时必须 HITL'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '实施顺序与依赖', [
    '| 顺序 | 工作 | 依赖 | 退出条件 |',
    '| --- | --- | --- | --- |',
    '| 1 | 建立领域/数据/状态底座 | 已批准架构和详细设计 | 状态、数据结构和基础测试可运行 |',
    '| 2 | 接入入口和业务编排 | 底座可测 | API/页面/任务入口能驱动核心流程 |',
    '| 3 | 完成异常、权限、日志和验收样例 | 主流程可运行 | 风险边界和异常路径有证据 |',
    '| 4 | 收敛回归和人工验收 | 自动化验证通过 | execution-record.md 覆盖全部切片 |',
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '需求到开发切片', [
    requirementMappingTable(items, [
      ['#', (_, index) => index + 1],
      ['原始需求项', (item) => item],
      ['建议切片', (_, index) => `Slice ${index + 1}`],
      ['交付物', () => '代码变更、测试、执行记录和必要的人工验收截图/说明'],
      ['完成判定', () => '对应验证信号通过且 completion audit 标记 covered'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '文件级变更清单', [
    sourceRequirementRows(items, [
      ['预计文件/目录', () => '列出应新增或修改的后端、前端、schema、测试、配置或文档路径'],
      ['变更类型', () => '新增/修改/生成/迁移/测试；生成代码必须说明来源命令'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '验证计划', [
    sourceRequirementRows(items, [
      ['自动化验证', () => '列出最小命令、仓库级回归命令和失败时回退路径'],
      ['人工验证', () => '列出页面、审批、外部副作用或数据核对等必须人工确认的点'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '人工确认点', [
    '- Plan 完成后只能等待用户批准 `plan -> build`。',
    '- 每个 HITL 切片在 build 阶段必须记录人工确认或人工验收缺口。',
    '- 如果实现时发现源需求与代码事实冲突，必须停止对应分支并回到 plan/clarify，而不是自行改范围。',
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '回滚/降级策略', [
    '- 如果某个切片无法完成，`execution-record.md` 必须把它放入 `remaining_scope`，不得声明 full completion。',
    '- 如果验证失败来自计划边界错误，回到 plan；如果来自需求歧义，回到 clarify；如果来自实现缺陷，留在 build 修复。',
    '- 不允许为了通过 build 删除源需求或把未完成项改成隐含非目标。',
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '完成定义', [
    '- 所有源需求在 `requirement-traceability.md` 中保持 covered。',
    '- 每个 vertical slice 有实现证据、验证证据和必要人工验收记录。',
    '- `execution-record.md` 的 `completion_claim` 与实际完成范围一致。',
    '- deslop 后回归重新通过，且 review handoff blocker 为空。',
  ].join('\n'));
  return next;
}

function detailedDesignTextForChange({ changeId, slug, items, plannerDraft }) {
  return [
    `# loopx Detailed Design: ${changeId}`,
    '',
    '## 文档定位',
    '',
    '详细设计回答“具体怎么实现到字段、接口、函数、组件、状态流转和边界条件”。它承接 `architecture.md` 的边界和 `development-plan.md` 的切片，但比二者更接近 build 可执行输入；build 阶段不得只凭概要描述自行发明字段、接口或状态。',
    '',
    '## 需求到设计映射',
    '',
    sourceRequirementRows(items, [
      ['设计落点', () => '数据结构、接口/函数/组件契约、状态机、错误处理和测试设计均需有对应条目'],
      ['实现证据', () => 'build 阶段在 execution-record.md 记录代码路径、验证命令或人工验收证据'],
    ]),
    '',
    '## 数据结构与字段',
    '',
    sourceRequirementRows(items, [
      ['实体/结构', () => '列出需要新增或修改的实体、DTO、schema、payload 或前端 state'],
      ['关键字段', () => '字段名、类型、来源、是否必填、默认值、唯一性/索引、审计要求'],
      ['迁移/兼容', () => '是否需要 migration、生成代码、旧数据兼容或回填策略'],
    ]),
    '',
    '## 接口、函数与组件契约',
    '',
    sourceRequirementRows(items, [
      ['契约对象', () => 'API 路径、provider 方法、usecase 函数、repository 方法、前端组件 props/events'],
      ['输入输出', () => '参数、响应、错误码、权限、幂等键、分页/筛选/排序或事件格式'],
      ['调用方/被调方', () => '明确调用方向和禁止调用的真实外部依赖'],
    ]),
    '',
    '## 状态机与流程细节',
    '',
    sourceRequirementRows(items, [
      ['状态/步骤', () => '列出允许状态、动作、前置条件、后置条件和审计日志'],
      ['非法路径', () => '列出必须拒绝的动作、重复请求、越权、缺数据和异常回写'],
    ]),
    '',
    '## 错误处理与边界条件',
    '',
    sourceRequirementRows(items, [
      ['错误场景', () => '输入缺失、依赖失败、并发冲突、数据不一致、mock/真实边界误用'],
      ['处理方式', () => '返回错误、保持原状态、写日志、创建异常、人工处理或回滚'],
    ]),
    '',
    '## 测试设计',
    '',
    sourceRequirementRows(items, [
      ['测试类型', () => '单测、集成、API、前端构建、浏览器人工验收或回归命令'],
      ['断言重点', () => '状态、字段、权限、副作用隔离、日志、错误路径和源需求覆盖'],
    ]),
    '',
    '## 实现注意事项',
    '',
    '- build 阶段必须优先遵循本详细设计；发现字段、接口或状态缺失时，不得自行扩大范围，必须记录 blocker 或回到 plan。',
    '- 任何真实外部系统、资金资产、交易订单、通知或权限相关副作用，都必须在本文件中有明确允许才可实现。',
    '- 生成代码、迁移和前端构建产物必须记录来源命令，避免把运行时临时产物当作设计输入。',
    '',
    '## 上游架构摘要',
    '',
    plannerDraft.architectureText || '- 见 workflow-local `architecture.md`。',
    '',
    '## 上游开发切片摘要',
    '',
    plannerDraft.developmentPlanText || '- 见 workflow-local `development-plan.md`。',
    '',
    '## Source',
    '',
    `- workflow slug: ${slug}`,
    `- change id: ${changeId}`,
  ].join('\n');
}

function enrichTestPlanTextForReview(text, items) {
  let next = text;
  next = appendMarkdownSectionIfMissing(next, '需求到测试矩阵', [
    requirementMappingTable(items, [
      ['#', (_, index) => index + 1],
      ['原始需求项', (item) => item],
      ['自动化验证', () => '优先使用仓库原生命令覆盖状态、接口、数据或构建行为'],
      ['人工验收', () => '对无法自动证明的页面、审批、风险边界做人工确认'],
      ['证据', () => '命令输出、截图路径、日志片段或执行记录条目'],
    ]),
  ].join('\n'));
  next = appendMarkdownSectionIfMissing(next, '回归门禁', [
    '- build 阶段必须先跑计划列出的最小验证，再跑仓库级回归。',
    '- deslop 后必须重新验证，不能复用旧输出。',
    '- 如果某个源需求没有验证信号，execution-record.md 必须把它列入 blocker 或 remaining_scope。',
  ].join('\n'));
  return next;
}

function enrichPlannerDraftForReview({ sourceText, plannerDraft }) {
  const draft = {
    ...plannerDraft,
    principles: Array.isArray(plannerDraft.principles) ? plannerDraft.principles : [],
    decisionDrivers: Array.isArray(plannerDraft.decisionDrivers) ? plannerDraft.decisionDrivers : [],
    options: Array.isArray(plannerDraft.options) ? plannerDraft.options : [],
    planText: String(plannerDraft.planText || ''),
    architectureText: String(plannerDraft.architectureText || ''),
    developmentPlanText: String(plannerDraft.developmentPlanText || ''),
    testPlanText: String(plannerDraft.testPlanText || ''),
  };
  const items = sourceItemsForPlanEnrichment(sourceText, draft);
  if (items.length === 0) {
    return draft;
  }
  return {
    ...draft,
    planText: canEnrichChineseReviewText(draft.planText) ? enrichPlanTextForReview(draft.planText, items) : draft.planText,
    architectureText: canEnrichChineseReviewText(draft.architectureText) ? enrichArchitectureTextForReview(draft.architectureText, items) : draft.architectureText,
    developmentPlanText: canEnrichChineseReviewText(draft.developmentPlanText) ? enrichDevelopmentPlanTextForReview(draft.developmentPlanText, items) : draft.developmentPlanText,
    testPlanText: canEnrichChineseReviewText(draft.testPlanText) ? enrichTestPlanTextForReview(draft.testPlanText, items) : draft.testPlanText,
  };
}

function normalizedCoverageText(...parts) {
  return parts.join('\n')
    .toLowerCase()
    .replace(/[`'"*_#()[\]{}]/g, '')
    .replace(/\s+/g, ' ');
}

function sourceRequirementCovered(item, haystack) {
  const raw = String(item || '').trim();
  if (!raw) {
    return true;
  }
  const compactNeedle = raw.toLowerCase().replace(/\s+/g, '');
  const compactHaystack = haystack.replace(/\s+/g, '');
  if (compactNeedle.length >= 2 && compactHaystack.includes(compactNeedle)) {
    return true;
  }
  const tokens = raw
    .toLowerCase()
    .replace(/[`'"*_#()[\]{}]/g, ' ')
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !['the', 'and', 'for', 'with', 'from', 'this', 'that'].includes(token));
  if (tokens.length === 0) {
    return false;
  }
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  return matched / tokens.length >= 0.65;
}

async function writeRequirementTraceabilityArtifact({ root, sourceSpecPath, sourceText, plannerDraft, changeArtifactPaths }) {
  const traceabilityPath = artifactPath(root, 'requirement-traceability.md');
  const sourceItems = sourceRequirementItems(sourceText);
  const specDeltaText = changeArtifactPaths?.specDelta && existsSync(changeArtifactPaths.specDelta)
    ? await readFile(changeArtifactPaths.specDelta, 'utf8')
    : '';
  const slicesText = changeArtifactPaths?.slices && existsSync(changeArtifactPaths.slices)
    ? await readFile(changeArtifactPaths.slices, 'utf8')
    : '';
  const haystack = normalizedCoverageText(
    plannerDraft.planText,
    plannerDraft.architectureText,
    plannerDraft.developmentPlanText,
    plannerDraft.testPlanText,
    specDeltaText,
    slicesText,
  );
  const rows = sourceItems.map((item) => ({
    item,
    status: sourceRequirementCovered(item, haystack) ? 'covered' : 'uncovered',
  }));
  const blockers = rows
    .filter((row) => row.status !== 'covered')
    .map((row) => `source_requirement_uncovered_${slugKey(row.item)}`);
  const status = blockers.length > 0 ? 'partial' : 'complete';

  await writeText(traceabilityPath, [
    '# 原始需求覆盖矩阵',
    '',
    `- 来源：${sourceSpecPath}`,
    `- 覆盖状态：${status === 'complete' ? '完整' : '部分缺失'} (${status})`,
    `- 提取项数量：${rows.length}`,
    '',
    '## 审阅说明',
    '',
    '- 本文件用于人工确认源需求是否被计划、架构、开发切片、规格增量和测试计划承接。',
    '- “原始需求项”保留源文档原文；如果源文档是英文，表格会保留英文原句，但覆盖状态和审阅说明必须使用中文。',
    '- 未覆盖项会阻断 `plan -> build`，直到 Planner 重新展开计划或明确把该项列为非目标并说明理由。',
    '',
    '## 覆盖矩阵',
    '',
    '| 原始需求项 | 覆盖状态 | 审阅说明 |',
    '| --- | --- | --- |',
    ...(rows.length > 0
      ? rows.map((row) => `| ${row.item.replace(/\|/g, '\\|')} | ${row.status === 'covered' ? '已覆盖' : '未覆盖'} | ${row.status === 'covered' ? '已在计划包或变更工件中找到对应表述。' : '计划包没有找到可追溯表述，需要回到 plan 修订。'} |`)
      : ['| 未检测到显式需求覆盖项 | 已覆盖 | 没有从源文档中提取到独立覆盖项。 |']),
    '',
    '## 门禁',
    '',
    ...(blockers.length > 0
      ? [
          '- 结果：存在原始需求未被计划包充分承接，不能进入 build handoff。',
          ...rows
            .filter((row) => row.status !== 'covered')
            .map((row) => `- 未覆盖需求：${row.item}`),
          ...blockers.map((blocker) => `- ${blocker}`),
        ]
      : ['- 结果：全部原始需求已覆盖，可以进入后续 plan gate 检查。']),
  ].join('\n'));

  return {
    path: traceabilityPath,
    status,
    blockers,
    itemCount: rows.length,
  };
}

function delegationDecisionForPlan(sourceText, plannerDraft) {
  const source = String(sourceText || '');
  const draft = [
    plannerDraft.planText,
    plannerDraft.architectureText,
    plannerDraft.developmentPlanText,
    plannerDraft.testPlanText,
  ].join('\n');
  const combined = `${source}\n${draft}`;
  const requirementCount = sourceRequirementItems(source).length;
  const lineCount = source.split('\n').filter((line) => line.trim()).length;
  const triggers = [];
  let score = 0;

  const addTrigger = (trigger, weight) => {
    if (!triggers.includes(trigger)) {
      triggers.push(trigger);
      score += weight;
    }
  };

  if (requirementCount >= 12 || lineCount >= 180) {
    addTrigger('large_requirement_surface', 3);
  } else if (requirementCount >= 6 || lineCount >= 90) {
    addTrigger('medium_requirement_surface', 2);
  }
  if (/资金|资产|清算|结算|交易|订单|风控|权限|安全|合规|审计|corporate action|settlement|trading|order|asset|security|auth|permission|compliance|audit|financial/i.test(combined)) {
    addTrigger('high_risk_domain', 3);
  }
  if (/api|接口|service|biz|data|database|schema|migration|数据库|迁移|worker|cron|frontend|后台|部署|deploy/i.test(combined)) {
    addTrigger('cross_module_scope', 2);
  }
  if (/状态机|幂等|补偿|差异|回滚|并发|重试|eventual|idempot|retry|rollback|concurrency|state machine/i.test(combined)) {
    addTrigger('state_or_integrity_complexity', 2);
  }
  if (/e2e|集成测试|integration|regression|回归|验收|acceptance|fixture|mock|真实数据|external/i.test(combined)) {
    addTrigger('verification_complexity', 1);
  }
  if (/多个方案|备选|取舍|tradeoff|alternative|ADR|architecture/i.test(combined)) {
    addTrigger('architectural_tradeoff', 1);
  }

  const recommendedMode = score >= 7 ? 'parallel-review' : (score >= 4 ? 'critic-only' : 'local');
  const reason = recommendedMode === 'parallel-review'
    ? '高风险或跨模块规划，建议独立 Planner/Architect/Critic 视角并行审查。'
    : recommendedMode === 'critic-only'
      ? '存在中等复杂度或验证风险，建议至少引入独立 critic 复核需求覆盖和风险。'
      : '范围较小或风险较低，本地顺序 Planner/Architect/Critic 审阅足够。';

  return {
    mode: recommendedMode,
    recommended_mode: recommendedMode,
    score,
    triggers,
    reason,
  };
}

function resolvePlanDelegationExecution(recommendedMode, config) {
  const normalized = normalizeAgentDelegationConfig(config);
  const thresholdMet = delegationMeetsThreshold(recommendedMode, normalized.threshold);
  if (!normalized.enabled) {
    return {
      actual_mode: 'local',
      runtime_execution: 'local-sequential',
      authorization_status: 'disabled',
      authorization_source: '.loopx/config.json:agent_delegation.enabled=false',
      threshold: normalized.threshold,
      config: normalized,
      note: '已记录推荐委派模式；未授权自动启动 subagents，因此本次实际执行保持本地顺序审阅。',
    };
  }
  if (!thresholdMet) {
    return {
      actual_mode: 'local',
      runtime_execution: 'local-sequential',
      authorization_status: 'below-threshold',
      authorization_source: '.loopx/config.json:agent_delegation.threshold',
      threshold: normalized.threshold,
      config: normalized,
      note: `推荐模式 ${recommendedMode} 低于自动委派阈值 ${normalized.threshold}，实际执行保持本地顺序审阅。`,
    };
  }
  if (!normalized.auto_start) {
    return {
      actual_mode: 'local',
      runtime_execution: 'manual-subagent-review',
      authorization_status: 'manual-required',
      authorization_source: '.loopx/config.json:agent_delegation.auto_start=false',
      threshold: normalized.threshold,
      config: normalized,
      note: '配置允许记录委派建议，但未授权自动启动；需要用户或外部执行器手动开启推荐的 subagent review。',
    };
  }
  return {
    actual_mode: recommendedMode,
    runtime_execution: 'auto-subagent-review',
    authorization_status: 'auto-authorized',
    authorization_source: '.loopx/config.json:agent_delegation.auto_start=true',
    threshold: normalized.threshold,
    config: normalized,
    note: '配置已授权达到阈值时自动使用推荐的 subagent review 模式；具体启动由当前 agent runtime 执行。',
  };
}

async function writePlanDelegationDecisionArtifact({ root, sourceText, plannerDraft, agentDelegationConfig }) {
  const decision = delegationDecisionForPlan(sourceText, plannerDraft);
  const execution = resolvePlanDelegationExecution(decision.recommended_mode, agentDelegationConfig);
  const path = artifactPath(root, 'plan-delegation-decision.md');
  await writeText(path, [
    '# Plan Delegation Decision',
    '',
    `- recommended_mode: ${decision.recommended_mode}`,
    `- actual_mode: ${execution.actual_mode}`,
    `- runtime_execution: ${execution.runtime_execution}`,
    `- authorization_status: ${execution.authorization_status}`,
    `- authorization_source: ${execution.authorization_source}`,
    `- threshold: ${execution.threshold}`,
    `- score: ${decision.score}`,
    `- reason: ${decision.reason}`,
    '',
    '## Triggers',
    '',
    ...(decision.triggers.length > 0 ? decision.triggers.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Guidance',
    '',
    '- local: 低风险、小范围、单模块任务，本地顺序 Planner/Architect/Critic 即可。',
    '- critic-only: 中等风险或覆盖面较宽，至少需要独立 critic 复核需求覆盖、验证和遗漏风险。',
    '- parallel-review: 高风险、多模块、状态/资产/安全相关任务，建议独立 Planner/Architect/Critic 视角并行审查。',
    '',
    '## Authorization',
    '',
    '- `recommended_mode` 是基于需求/plan 风险面的规划建议。',
    '- `actual_mode` 是结合 `.loopx/config.json` 授权边界后的本次实际执行模式。',
    '- 只有 `agent_delegation.enabled=true`、`auto_start=true` 且推荐模式达到 `threshold` 时，loopx 才会把实际模式提升到推荐的 subagent review。',
    '',
    '## Runtime Note',
    '',
    `- ${execution.note}`,
  ].join('\n'));
  return { path, ...decision, ...execution };
}

function frontmatterList(text, key) {
  if (!text.startsWith('---\n')) {
    return [];
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return [];
  }
  const lines = text.slice(4, end).split('\n');
  const values = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === `${key}:`) {
      for (let child = index + 1; child < lines.length; child += 1) {
        const childLine = lines[child];
        if (!/^\s+-\s+/.test(childLine)) {
          break;
        }
        values.push(childLine.replace(/^\s+-\s+/, '').trim());
      }
      break;
    }
  }
  return values.filter(Boolean);
}

function targetDomainsForChange(slug, sourceText) {
  const explicit = bulletsFromSectionText(sourceText, 'Target Spec Domains');
  if (explicit.length > 0) {
    return dedupeStrings(explicit.map((item) => item.replace(/`/g, '')));
  }
  const frontmatterDomains = frontmatterList(sourceText, 'target_domains');
  if (frontmatterDomains.length > 0) {
    return dedupeStrings(frontmatterDomains.map((item) => item.replace(/`/g, '')));
  }
  return ['general'];
}

function declaredTargetDomainsForDelta(sourceText) {
  const explicit = bulletsFromSectionText(sourceText, 'Target Spec Domains');
  if (explicit.length > 0) {
    return dedupeStrings(explicit.map((item) => item.replace(/`/g, '')));
  }
  const frontmatterDomains = frontmatterList(sourceText, 'target_domains');
  if (frontmatterDomains.length > 0) {
    return dedupeStrings(frontmatterDomains.map((item) => item.replace(/`/g, '')));
  }
  return [];
}

function stripFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return text;
  }
  const end = text.indexOf('\n---\n', 4);
  return end === -1 ? text : text.slice(end + 5);
}

function normalizeRequirementName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function requirementDisplayName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function sentenceToRequirementName(text, fallback) {
  const cleaned = String(text || '')
    .replace(/[`*_#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。:：]+$/, '');
  if (!cleaned) {
    return fallback;
  }
  const withoutModal = cleaned
    .replace(/\bSHALL\b.*$/i, '')
    .replace(/\bMUST\b.*$/i, '')
    .trim();
  const value = withoutModal || cleaned;
  return value.length > 80 ? value.slice(0, 77).trim() : value;
}

function normativeRequirementText(text, slug, index) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');
  if (/\b(SHALL|MUST)\b/i.test(cleaned)) {
    return `${cleaned}.`;
  }
  return `Workflow ${slug} SHALL satisfy: ${cleaned || `approved requirement ${index + 1}`}.`;
}

function scenarioNameForRequirement(name) {
  const cleaned = requirementDisplayName(name).replace(/[.。]+$/, '');
  return cleaned.length > 70 ? cleaned.slice(0, 67).trim() : cleaned;
}

function requirementBlockFromText({ slug, text, index }) {
  const name = sentenceToRequirementName(text, `Approved requirement ${index + 1}`);
  return [
    `### Requirement: ${name}`,
    normativeRequirementText(text, slug, index),
    '',
    `#### Scenario: ${scenarioNameForRequirement(name)}`,
    `- GIVEN workflow ${slug} has an approved plan`,
    `- WHEN the accepted implementation is archived`,
    `- THEN the system satisfies: ${String(text || '').replace(/\s+/g, ' ').trim() || name}`,
  ].join('\n');
}

function splitDeltaSections(text) {
  const body = stripFrontmatter(text);
  const pattern = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/gim;
  const matches = [...body.matchAll(pattern)];
  const sections = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const kind = match[1].toUpperCase();
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : body.length;
    sections.set(kind, body.slice(start, end).trim());
  }
  return sections;
}

function parseRequirementBlocks(sectionText) {
  const pattern = /^###\s+Requirement:\s*(.+?)\s*$/gm;
  const matches = [...String(sectionText || '').matchAll(pattern)];
  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : sectionText.length;
    return {
      name: requirementDisplayName(match[1]),
      raw: sectionText.slice(start, end).trim(),
    };
  }).filter((block) => block.name && block.raw);
}

function parseRenamedRequirement(block) {
  const inline = block.name.match(/^(.*?)\s*(?:->|=>)\s*(.*?)$/);
  if (inline) {
    return {
      from: requirementDisplayName(inline[1]),
      to: requirementDisplayName(inline[2]),
    };
  }
  const from = block.raw.match(/^FROM:\s*(.+?)\s*$/im)?.[1];
  const to = block.raw.match(/^TO:\s*(.+?)\s*$/im)?.[1];
  return {
    from: requirementDisplayName(from || block.name),
    to: requirementDisplayName(to || ''),
  };
}

function countRequirementScenarios(raw) {
  return (String(raw || '').match(/^####\s+Scenario:\s*.+$/gim) || []).length;
}

function requirementTextBeforeScenarios(raw) {
  const lines = String(raw || '').split('\n').slice(1);
  const scenarioIndex = lines.findIndex((line) => /^####\s+Scenario:/i.test(line.trim()));
  const requirementLines = scenarioIndex === -1 ? lines : lines.slice(0, scenarioIndex);
  return requirementLines.map((line) => line.trim()).filter(Boolean).join(' ');
}

function parseRequirementDelta(text) {
  const sections = splitDeltaSections(text);
  const added = parseRequirementBlocks(sections.get('ADDED') || '');
  const modified = parseRequirementBlocks(sections.get('MODIFIED') || '');
  const removed = parseRequirementBlocks(sections.get('REMOVED') || '').map((block) => block.name);
  const renamed = parseRequirementBlocks(sections.get('RENAMED') || '').map(parseRenamedRequirement);
  return { added, modified, removed, renamed };
}

function deltaOperationCount(delta) {
  return delta.added.length + delta.modified.length + delta.removed.length + delta.renamed.length;
}

function validateRequirementDelta(text) {
  const delta = parseRequirementDelta(text);
  const blockers = [];
  if (deltaOperationCount(delta) === 0) {
    blockers.push('spec_delta_missing_requirement_operations');
    return { delta, blockers };
  }
  const seenBySection = {
    added: new Set(),
    modified: new Set(),
    removed: new Set(),
    renamedFrom: new Set(),
    renamedTo: new Set(),
  };
  for (const [section, blocks] of [['added', delta.added], ['modified', delta.modified]]) {
    for (const block of blocks) {
      const key = normalizeRequirementName(block.name);
      if (seenBySection[section].has(key)) {
        blockers.push(`spec_delta_duplicate_${section}_${key}`);
      }
      seenBySection[section].add(key);
      const requirementText = requirementTextBeforeScenarios(block.raw);
      if (!requirementText) {
        blockers.push(`spec_delta_${section}_${key}_missing_text`);
      }
      if (!/\b(SHALL|MUST)\b/i.test(requirementText)) {
        blockers.push(`spec_delta_${section}_${key}_missing_shall_must`);
      }
      if (countRequirementScenarios(block.raw) === 0) {
        blockers.push(`spec_delta_${section}_${key}_missing_scenario`);
      }
    }
  }
  for (const name of delta.removed) {
    const key = normalizeRequirementName(name);
    if (seenBySection.removed.has(key)) {
      blockers.push(`spec_delta_duplicate_removed_${key}`);
    }
    seenBySection.removed.add(key);
  }
  for (const item of delta.renamed) {
    const from = normalizeRequirementName(item.from);
    const to = normalizeRequirementName(item.to);
    if (!from || !to) {
      blockers.push('spec_delta_renamed_missing_from_or_to');
    }
    if (seenBySection.renamedFrom.has(from)) {
      blockers.push(`spec_delta_duplicate_renamed_from_${from}`);
    }
    if (seenBySection.renamedTo.has(to)) {
      blockers.push(`spec_delta_duplicate_renamed_to_${to}`);
    }
    seenBySection.renamedFrom.add(from);
    seenBySection.renamedTo.add(to);
  }
  for (const name of seenBySection.added) {
    if (seenBySection.modified.has(name)) {
      blockers.push(`spec_delta_conflict_added_modified_${name}`);
    }
    if (seenBySection.removed.has(name)) {
      blockers.push(`spec_delta_conflict_added_removed_${name}`);
    }
  }
  for (const name of seenBySection.modified) {
    if (seenBySection.removed.has(name)) {
      blockers.push(`spec_delta_conflict_modified_removed_${name}`);
    }
    if (seenBySection.renamedFrom.has(name)) {
      blockers.push(`spec_delta_conflict_modified_renamed_from_${name}`);
    }
  }
  return { delta, blockers: dedupeStrings(blockers) };
}

function requirementsForDelta(slug, plannerDraft, sourceText = '') {
  const sourceRequirements = sourceRequirementItems(sourceText);
  const requirements = sourceRequirements.length > 0
    ? sourceRequirements
    : numberedPlanItems(plannerDraft.planText);
  return dedupeStrings(requirements.length > 0 ? requirements : [
    `Workflow ${slug} SHALL implement the approved loopx plan package.`,
  ]);
}

function verticalSlicesForChange(slug, plannerDraft, sourceText = '') {
  const requirements = requirementsForDelta(slug, plannerDraft, sourceText);
  const slices = requirements.slice(0, 8).map((requirement, index) => ({
    id: `VS-${index + 1}`,
    title: requirement.length > 90 ? `${requirement.slice(0, 87)}...` : requirement,
    type: 'AFK',
    blocked_by: index === 0 ? [] : [`VS-${index}`],
    behavior: requirement,
    acceptance_criteria: [
      `完成端到端行为：${requirement}`,
      '执行记录包含对应验证证据。',
    ],
    verification_signal: 'execution-record.md verification evidence',
  }));
  return {
    schema_version: 1,
    philosophy: 'tracer-bullet-vertical-slices',
    workflow: slug,
    slices: slices.length > 0 ? slices : [{
      id: 'VS-1',
      title: `Implement approved workflow ${slug}`,
      type: 'AFK',
      blocked_by: [],
      behavior: `Workflow ${slug} delivers the approved plan end-to-end.`,
      acceptance_criteria: ['Execution record verifies the approved behavior.'],
      verification_signal: 'execution-record.md verification evidence',
    }],
  };
}

function changeArtifactGraph({ changeId, slug, artifacts }) {
  const graph = {
    schema_version: 1,
    change: changeId,
    workflow: slug,
    philosophy: 'artifact-dependency-graph',
    artifacts: {
      proposal: {
        path: artifacts.proposal,
        status: existsSync(artifacts.proposal) ? 'done' : 'missing',
        dependsOn: [],
      },
      specDelta: {
        path: artifacts.specDelta,
        status: existsSync(artifacts.specDelta) ? 'done' : 'missing',
        dependsOn: ['proposal'],
      },
      design: {
        path: artifacts.design,
        status: existsSync(artifacts.design) ? 'done' : 'missing',
        dependsOn: ['proposal', 'specDelta'],
      },
      tasks: {
        path: artifacts.tasks,
        status: existsSync(artifacts.tasks) ? 'done' : 'missing',
        dependsOn: ['proposal', 'specDelta', 'design'],
      },
      slices: {
        path: artifacts.slices,
        status: existsSync(artifacts.slices) ? 'done' : 'missing',
        dependsOn: ['proposal', 'specDelta', 'design'],
      },
    },
  };
  graph.nextReady = Object.entries(graph.artifacts)
    .filter(([, node]) => node.status !== 'done')
    .filter(([, node]) => node.dependsOn.every((dependency) => graph.artifacts[dependency]?.status === 'done'))
    .map(([name]) => name);
  return graph;
}

async function writeChangeArtifacts(cwd, root, slug, sourceText, plannerDraft, changeId = changeIdForWorkflowSlug(slug)) {
  const normalizedChangeId = normalizeSlug(changeId);
  const changeRoot = resolveChangeRoot(cwd, normalizedChangeId);
  const specsRoot = join(changeRoot, 'specs');
  await ensureDir(specsRoot);
  const paths = {
    root: changeRoot,
    proposal: join(changeRoot, 'proposal.md'),
    specDelta: join(changeRoot, 'spec-delta.md'),
    design: join(changeRoot, 'design.md'),
    tasks: join(changeRoot, 'tasks.md'),
    slices: join(changeRoot, 'slices.json'),
    graph: join(changeRoot, 'artifact-graph.json'),
  };
  const domains = targetDomainsForChange(slug, sourceText);
  const requirements = requirementsForDelta(slug, plannerDraft, sourceText);
  const slices = verticalSlicesForChange(slug, plannerDraft, sourceText);

  await writeText(paths.proposal, [
    `# loopx Change Proposal: ${normalizedChangeId}`,
    '',
    '## Why',
    '',
    '- Preserve the approved workflow intent as a durable change proposal.',
    '',
    '## What Changes',
    '',
    ...requirements.map((item) => `- ${item}`),
    '',
    '## Target Spec Domains',
    '',
    ...domains.map((domain) => `- ${domain}`),
    '',
    '## Source',
    '',
    `- change id: ${normalizedChangeId}`,
    `- workflow slug: ${slug}`,
    `- workflow: ${artifactPath(root, 'state.json')}`,
    `- source spec: ${artifactPath(root, 'spec.md')}`,
  ].join('\n'));

  await writeText(paths.specDelta, [
    '---',
    `change_id: ${normalizedChangeId}`,
    `slug: ${slug}`,
    'target_domains:',
    ...domains.map((domain) => `  - ${domain}`),
    '---',
    '',
    `# loopx Spec Delta: ${normalizedChangeId}`,
    '',
    '## ADDED Requirements',
    '',
    ...requirements.flatMap((item, index) => [requirementBlockFromText({ slug, text: item, index }), '']),
  ].join('\n'));

  await writeText(paths.design, detailedDesignTextForChange({
    changeId: normalizedChangeId,
    slug,
    items: requirements,
    plannerDraft,
  }));

  await writeText(paths.tasks, [
    `# loopx Change Tasks: ${normalizedChangeId}`,
    '',
    '## Vertical Slices',
    '',
    ...slices.slices.map((slice) => `- [ ] ${slice.id} ${slice.title} (${slice.type}) - verification: ${slice.verification_signal}`),
    '',
    '## Tasks',
    '',
    ...requirements.map((item, index) => `- [ ] ${index + 1}. ${item}`),
    '',
    '## Verification',
    '',
    plannerDraft.testPlanText || '- See workflow test plan artifact.',
  ].join('\n'));

  await writeJson(paths.slices, slices);
  await writeJson(paths.graph, changeArtifactGraph({ changeId: normalizedChangeId, slug, artifacts: paths }));
  for (const domain of domains) {
    const specDeltaPath = join(specsRoot, ...domain.split('/'), 'spec.md');
    await ensureDir(dirname(specDeltaPath));
    await copyArtifact(changeRoot, specDeltaPath, 'spec-delta.md');
  }
  return paths;
}

async function readChangeArtifactStatus(paths) {
  if (!paths || typeof paths !== 'object') {
    return {
      status: 'missing',
      specDeltaStatus: 'missing',
      blockers: ['missing_change_artifacts'],
    };
  }
  const blockers = [];
  for (const name of ['proposal', 'specDelta', 'design', 'tasks', 'slices', 'graph']) {
    const path = paths[name];
    if (!path || !existsSync(path)) {
      blockers.push(`missing_change_artifact_${name}`);
    }
  }
  let specDeltaStatus = 'missing';
  if (paths.specDelta && existsSync(paths.specDelta)) {
    const text = await readFile(paths.specDelta, 'utf8');
    const parsedDelta = validateRequirementDelta(text);
    const declaredDomains = declaredTargetDomainsForDelta(text);
    const hasDomains = declaredDomains.length > 0;
    if (!text.trim()) {
      specDeltaStatus = 'partial';
      blockers.push('spec_delta_empty');
    } else if (!hasDomains || parsedDelta.blockers.length > 0) {
      specDeltaStatus = 'partial';
      if (!hasDomains) {
        blockers.push('spec_delta_missing_domains');
      }
      blockers.push(...parsedDelta.blockers);
    } else {
      specDeltaStatus = 'complete';
    }
    const specsRoot = paths.root ? join(paths.root, 'specs') : null;
    if (specsRoot && existsSync(specsRoot)) {
      const entries = await readdir(specsRoot, { withFileTypes: true });
      const declaredDomainSet = new Set(declaredDomains);
      for (const entry of entries) {
        if (!entry.isDirectory() || declaredDomainSet.has(entry.name)) {
          continue;
        }
        const candidate = join(specsRoot, entry.name, 'spec.md');
        if (!existsSync(candidate)) {
          continue;
        }
        const domainDelta = await readFile(candidate, 'utf8');
        const validation = validateRequirementDelta(domainDelta);
        if (validation.blockers.length > 0) {
          specDeltaStatus = 'partial';
          blockers.push(
            ...validation.blockers.map((blocker) => `spec_delta_${entry.name}_${blocker.replace(/^spec_delta_/, '')}`),
          );
        }
      }
    }
  }
  if (paths.slices && existsSync(paths.slices)) {
    try {
      const payload = JSON.parse(await readFile(paths.slices, 'utf8'));
      const slices = Array.isArray(payload.slices) ? payload.slices : [];
      const valid = slices.length > 0 && slices.every((slice) => (
        slice
        && typeof slice.id === 'string'
        && slice.id
        && ['AFK', 'HITL'].includes(slice.type)
        && typeof slice.behavior === 'string'
        && slice.behavior
        && Array.isArray(slice.acceptance_criteria)
        && slice.acceptance_criteria.length > 0
        && typeof slice.verification_signal === 'string'
        && slice.verification_signal
      ));
      if (!valid) {
        blockers.push('vertical_slices_missing');
      }
    } catch {
      blockers.push('vertical_slices_invalid');
    }
  }
  return {
    status: blockers.length > 0 ? 'partial' : 'complete',
    specDeltaStatus,
    sliceArtifactsStatus: blockers.some((blocker) => blocker.startsWith('missing_change_artifact_slices') || blocker.startsWith('vertical_slices_')) ? 'partial' : 'complete',
    blockers,
  };
}

async function ensureArchiveSlicesArtifact(cwd, root, slug, state) {
  if (state.change_artifact_paths?.slices && existsSync(state.change_artifact_paths.slices)) {
    return state.change_artifact_paths;
  }
  if (!state.change_artifact_paths?.root || !existsSync(state.change_artifact_paths.root)) {
    return state.change_artifact_paths;
  }
  const slicesPath = join(state.change_artifact_paths.root, 'slices.json');
  const draft = {
    planText: existsSync(state.change_artifact_paths.tasks)
      ? await readFile(state.change_artifact_paths.tasks, 'utf8')
      : `1. Archive approved workflow ${slug}`,
  };
  await writeJson(slicesPath, verticalSlicesForChange(slug, draft));
  const nextPaths = {
    ...state.change_artifact_paths,
    slices: slicesPath,
  };
  if (nextPaths.graph && existsSync(nextPaths.graph)) {
    await writeJson(nextPaths.graph, changeArtifactGraph({
      changeId: state.change_id || changeIdForWorkflowSlug(slug),
      slug,
      artifacts: nextPaths,
    }));
  }
  await writeState(root, withRecommendedAction({
    ...state,
    change_artifact_paths: nextPaths,
    slice_artifacts_status: 'complete',
  }));
  return nextPaths;
}

function parseSpecDelta(text) {
  const parsed = parseRequirementDelta(text);
  return {
    domains: declaredTargetDomainsForDelta(text),
    ...parsed,
  };
}

function specDomainPath(cwd, domain) {
  return join(resolveSpecsRoot(cwd), ...String(domain).split('/').map((part) => normalizeSlug(part)), 'spec.md');
}

async function writeAdrCandidate(cwd, changeId, state, archivedSpecPaths) {
  const path = join(resolveWorkspaceRoot(cwd), 'decisions', 'adr-candidates', `${normalizeSlug(changeId)}.md`);
  await ensureDir(dirname(path));
  await writeText(path, [
    `# ADR Candidate: ${normalizeSlug(changeId)}`,
    '',
    '## Decision',
    '',
    `- Archive accepted workflow ${state.slug} into long-lived loopx specs.`,
    '',
    '## Drivers',
    '',
    '- The reviewed change delta has reached done.',
    '- The change may affect future planning, build, and review context.',
    '',
    '## Alternatives Considered',
    '',
    '- Keep the decision only in workflow artifacts.',
    '- Promote the accepted behavior into long-lived specs and keep this ADR candidate as advisory memory.',
    '',
    '## Why Candidate Only',
    '',
    '- loopx should not make irreversible architectural decisions without human confirmation.',
    '- This file records the candidate so a future human can promote it to docs/adr if useful.',
    '',
    '## Consequences',
    '',
    ...archivedSpecPaths.map((item) => `- Updated spec: ${item}`),
    '',
    '## Follow-ups',
    '',
    '- Promote to a real ADR only if the decision is hard to reverse, surprising, and trade-off-heavy.',
  ].join('\n'));
  return path;
}

function splitSpecRequirements(existing) {
  const text = String(existing || '');
  const match = text.match(/^##\s+Requirements\s*$/im);
  if (!match) {
    return {
      before: text.trimEnd(),
      header: '## Requirements',
      body: '',
      after: '',
    };
  }
  const headerStart = match.index;
  const bodyStart = headerStart + match[0].length;
  const rest = text.slice(bodyStart);
  const nextTopHeading = rest.search(/\n##\s+/);
  const body = nextTopHeading === -1 ? rest : rest.slice(0, nextTopHeading);
  const after = nextTopHeading === -1 ? '' : rest.slice(nextTopHeading);
  return {
    before: text.slice(0, headerStart).trimEnd(),
    header: match[0],
    body: body.trim(),
    after: after.trimEnd(),
  };
}

function requirementMapFromSpec(existing) {
  const parts = splitSpecRequirements(existing);
  const blocks = parseRequirementBlocks(parts.body);
  const map = new Map();
  const order = [];
  for (const block of blocks) {
    const key = normalizeRequirementName(block.name);
    if (!map.has(key)) {
      order.push(key);
    }
    map.set(key, block);
  }
  return { parts, map, order };
}

function applyRequirementDelta(existing, delta, domain) {
  const { parts, map, order } = requirementMapFromSpec(existing);
  const ensureExisting = (key, label, name) => {
    if (!map.has(key)) {
      throw new Error(`${domain} ${label} failed for "### Requirement: ${name}" - not found`);
    }
  };

  for (const item of delta.renamed) {
    const fromKey = normalizeRequirementName(item.from);
    const toKey = normalizeRequirementName(item.to);
    ensureExisting(fromKey, 'RENAMED', item.from);
    if (map.has(toKey)) {
      throw new Error(`${domain} RENAMED failed for "### Requirement: ${item.to}" - target already exists`);
    }
    const block = map.get(fromKey);
    const rawLines = block.raw.split('\n');
    rawLines[0] = `### Requirement: ${item.to}`;
    map.delete(fromKey);
    map.set(toKey, { name: item.to, raw: rawLines.join('\n') });
    const orderIndex = order.indexOf(fromKey);
    if (orderIndex !== -1) {
      order[orderIndex] = toKey;
    }
  }

  for (const name of delta.removed) {
    const key = normalizeRequirementName(name);
    ensureExisting(key, 'REMOVED', name);
    map.delete(key);
    const orderIndex = order.indexOf(key);
    if (orderIndex !== -1) {
      order.splice(orderIndex, 1);
    }
  }

  for (const block of delta.modified) {
    const key = normalizeRequirementName(block.name);
    ensureExisting(key, 'MODIFIED', block.name);
    map.set(key, block);
  }

  for (const block of delta.added) {
    const key = normalizeRequirementName(block.name);
    if (map.has(key)) {
      if (map.get(key).raw.trim() === block.raw.trim()) {
        continue;
      }
      throw new Error(`${domain} ADDED failed for "### Requirement: ${block.name}" - already exists`);
    }
    map.set(key, block);
    order.push(key);
  }

  const requirementBody = order.map((key) => map.get(key)?.raw).filter(Boolean).join('\n\n').trimEnd();
  return [
    parts.before,
    parts.header,
    requirementBody,
    parts.after,
  ].filter((part) => String(part || '').trim()).join('\n\n').replace(/\n{3,}/g, '\n\n');
}

async function specDeltaFilesForArchive(cwd, specDeltaPath) {
  const changeRoot = dirname(specDeltaPath);
  const mainText = await readFile(specDeltaPath, 'utf8');
  const files = new Map();
  const declaredDomains = declaredTargetDomainsForDelta(mainText);
  if (declaredDomains.length === 0) {
    throw new Error('archive_blocked:spec_delta_missing_domains');
  }
  for (const domain of declaredDomains) {
    files.set(domain, specDeltaPath);
  }
  const specsRoot = join(changeRoot, 'specs');
  if (existsSync(specsRoot)) {
    const entries = await readdir(specsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidate = join(specsRoot, entry.name, 'spec.md');
      if (existsSync(candidate) && !files.has(entry.name)) {
        files.set(entry.name, candidate);
      }
    }
  }
  return files;
}

async function mergeSpecDeltaIntoLongLivedSpecs(cwd, slug, specDeltaPath) {
  const deltaFiles = await specDeltaFilesForArchive(cwd, specDeltaPath);
  const updated = [];
  for (const [domain, deltaPath] of deltaFiles.entries()) {
    const deltaText = await readFile(deltaPath, 'utf8');
    const validation = validateRequirementDelta(deltaText);
    if (validation.blockers.length > 0) {
      throw new Error(`archive_blocked:${domain}:${validation.blockers.join(',')}`);
    }
    const domainDelta = parseSpecDelta(deltaText);
    const path = specDomainPath(cwd, domain);
    await ensureDir(dirname(path));
    const existing = await readTextIfExists(path);
    const base = existing || [
      `# loopx Spec Domain: ${domain}`,
      '',
      '## Purpose',
      '',
      `Long-lived accepted behavior for ${domain}.`,
      '',
      '## Requirements',
    ].join('\n');
    const next = applyRequirementDelta(base, domainDelta, domain);
    await writeText(path, next);
    updated.push(path);
  }
  return updated;
}

function deriveSlugFromSpecPath(path, text) {
  const meta = parseFrontmatter(text);
  if (meta.workflow_id) {
    return normalizeSlug(meta.workflow_id);
  }
  const name = basename(path).replace(/\.md$/i, '');
  return normalizeSlug(name.replace(/^clarify-/, ''));
}

function containsChineseText(text) {
  const chineseChars = text.match(/[\u3400-\u9fff]/g) || [];
  const latinChars = text.match(/[A-Za-z]/g) || [];
  const signalChars = chineseChars.length + latinChars.length;
  if (signalChars === 0) {
    return false;
  }
  return chineseChars.length >= 40 || (chineseChars.length >= 8 && chineseChars.length / signalChars >= 0.2);
}

function canEnrichChineseReviewText(text) {
  const chineseChars = String(text || '').match(/[\u3400-\u9fff]/g) || [];
  return chineseChars.length >= 12;
}

const REVIEW_DOCUMENT_CONTRACTS = {
  architecture: ['文档定位', '架构目标与非目标', '上下文与系统边界', '组件与职责', '数据与状态模型', '接口与集成契约', '关键流程', '架构决策记录'],
  developmentPlan: ['文档定位', '交付切片', '实施顺序与依赖', '文件级变更清单', '验证计划', '完成定义'],
  design: ['文档定位', '需求到设计映射', '数据结构与字段', '接口、函数与组件契约', '状态机与流程细节', '错误处理与边界条件', '测试设计'],
};

function planReviewabilityBlockers(key, text, sourceItemCount) {
  const reviewerDocs = new Set(['plan', 'architecture', 'developmentPlan', 'testPlan', 'requirementsSnapshot', 'testSpec', 'design']);
  if (!reviewerDocs.has(key)) {
    return [];
  }
  const blockers = [];
  const nonEmptyLineCount = String(text || '').split('\n').filter((line) => line.trim()).length;
  const headingCount = (String(text || '').match(/^#{2,4}\s+/gm) || []).length;
  const needsSourceMapping = sourceItemCount >= 2;
  const minLines = needsSourceMapping ? Math.min(22, 8 + sourceItemCount) : 3;
  const minHeadings = needsSourceMapping ? 3 : 1;
  if (nonEmptyLineCount < minLines || headingCount < minHeadings) {
    blockers.push(`plan_artifact_too_thin_${key}`);
  }
  if (needsSourceMapping && !/(原始需求|需求.*映射|需求.*覆盖|覆盖矩阵|需求到|测试矩阵|交付切片)/.test(text)) {
    blockers.push(`plan_artifact_missing_source_mapping_${key}`);
  }
  const requiredHeadings = REVIEW_DOCUMENT_CONTRACTS[key] || [];
  for (const heading of requiredHeadings) {
    if (!hasMarkdownHeading(text, heading)) {
      blockers.push(`plan_artifact_missing_section_${key}_${slugKey(heading)}`);
    }
  }
  return blockers;
}

async function planLanguageBlockers(pathsByKey, { sourceItemCount = 0 } = {}) {
  const blockers = [];
  for (const [key, path] of Object.entries(pathsByKey)) {
    if (!existsSync(path)) {
      blockers.push(`missing_plan_artifact_${key}`);
      continue;
    }
    const text = await readFile(path, 'utf8');
    if (!containsChineseText(text)) {
      blockers.push(`plan_artifact_not_chinese_${key}`);
    }
    blockers.push(...planReviewabilityBlockers(key, text, sourceItemCount));
  }
  return blockers;
}

function planReviewArtifactBlockers(state) {
  if (!Array.isArray(state.plan_review_artifact_paths) || state.plan_review_artifact_paths.length === 0) {
    return ['missing_plan_review_artifacts'];
  }
  const latest = state.plan_review_artifact_paths[state.plan_review_artifact_paths.length - 1] || {};
  return ['planner', 'architect', 'critic']
    .filter((key) => !latest[key] || !existsSync(latest[key]))
    .map((key) => `missing_plan_review_artifact_${key}`);
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
      ...createInitialState(slug, existing.clarify_profile || existing.profile || 'standard'),
      ...existing,
      schema_version: WORKFLOW_SCHEMA_VERSION,
      slug,
      current_stage: existing.current_stage || STAGES.CLARIFY,
      stage_status: existing.stage_status || 'awaiting-approval',
      spec_artifact_path: resolvedSpecPath,
      plan_source_spec_path: resolvedSpecPath,
      requested_transition: existing.requested_transition || TRANSITIONS.CLARIFY_TO_PLAN,
      plan_consensus_mode: true,
      plan_deliberate_mode: Boolean(options.deliberate),
      plan_interactive_mode: Boolean(options.interactive),
      approval: {
        ...createInitialState(slug, existing.clarify_profile || existing.profile || 'standard').approval,
        ...(existing.approval || {}),
        plan: APPROVAL_STATES.APPROVED,
      },
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

function planReviewSummary(iteration, architectReview, criticReview) {
  return {
    iteration,
    architectReview: {
      status: architectReview.status,
      verdict: architectReview.verdict,
      findings: Array.isArray(architectReview.findings) ? architectReview.findings : [],
      strongestObjection: architectReview.strongestObjection || null,
      tradeoffTension: architectReview.tradeoffTension || null,
    },
    criticReview: {
      verdict: criticReview.verdict,
      findings: Array.isArray(criticReview.findings) ? criticReview.findings : [],
      acceptanceCriteriaTestable: Boolean(criticReview.acceptanceCriteriaTestable),
      verificationStepsResolved: Boolean(criticReview.verificationStepsResolved),
      executionInputsResolved: Boolean(criticReview.executionInputsResolved),
    },
  };
}

function initialPlanReviewHistory(state) {
  const history = Array.isArray(state.plan_review_history) ? state.plan_review_history : [];
  if (state.current_stage !== STAGES.PLAN || state.stage_status !== 'blocked' || history.length === 0) {
    return [];
  }
  return [history[history.length - 1]];
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
    blockers.push('missing_requirements_snapshot');
  }
  if (!state.test_spec_artifact_path || !existsSync(state.test_spec_artifact_path)) {
    blockers.push('missing_test_spec');
  }
  if (!state.plan_source_spec_path || !existsSync(state.plan_source_spec_path)) {
    blockers.push('missing_source_requirements');
  }
  if (!state.requirement_traceability_path || !existsSync(state.requirement_traceability_path)) {
    blockers.push('missing_requirement_traceability');
  }
  if (!state.plan_delegation_decision_path || !existsSync(state.plan_delegation_decision_path)) {
    blockers.push('missing_plan_delegation_decision');
  }
  blockers.push(...planReviewArtifactBlockers(state));
  if (state.source_requirements_status && state.source_requirements_status !== 'complete') {
    if (state.requirement_traceability_path && existsSync(state.requirement_traceability_path)) {
      const traceabilityText = await readFile(state.requirement_traceability_path, 'utf8');
      blockers.push(
        ...traceabilityText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('- source_requirement_'))
          .map((line) => line.slice(2).trim()),
      );
    } else {
      blockers.push(`source_requirements_${state.source_requirements_status}`);
    }
  }
  let sourceItemCount = 0;
  if (state.plan_source_spec_path && existsSync(state.plan_source_spec_path)) {
    sourceItemCount = sourceRequirementItems(await readFile(state.plan_source_spec_path, 'utf8')).length;
  }
  blockers.push(...await planLanguageBlockers({
    plan: artifactPath(root, 'plan.md'),
    architecture: artifactPath(root, 'architecture.md'),
    developmentPlan: artifactPath(root, 'development-plan.md'),
    testPlan: artifactPath(root, 'test-plan.md'),
    requirementsSnapshot: state.plan_artifact_path || join(resolvePlansRoot(cwd), `requirements-snapshot-${slug}.md`),
    testSpec: state.test_spec_artifact_path || join(resolvePlansRoot(cwd), `test-spec-${slug}.md`),
    traceability: state.requirement_traceability_path || artifactPath(root, 'requirement-traceability.md'),
    delegationDecision: state.plan_delegation_decision_path || artifactPath(root, 'plan-delegation-decision.md'),
    design: state.change_artifact_paths?.design || join(resolveChangeRoot(cwd, state.change_id || changeIdForWorkflowSlug(slug)), 'design.md'),
  }, { sourceItemCount }));
  const changeStatus = await readChangeArtifactStatus(state.change_artifact_paths);
  blockers.push(...changeStatus.blockers);

  return {
    blockers,
    docsStatus: blockers.some((blocker) => blocker.startsWith('missing_plan_artifact_') || blocker.startsWith('plan_artifact_not_chinese_')) ? 'partial' : 'complete',
    sourceRequirementsStatus: blockers.some((blocker) => blocker === 'missing_source_requirements' || blocker === 'missing_requirement_traceability' || blocker.startsWith('source_requirement_') || blocker.startsWith('source_requirements_')) ? 'partial' : 'complete',
    changeArtifactsStatus: changeStatus.status,
    specDeltaStatus: changeStatus.specDeltaStatus,
    sliceArtifactsStatus: changeStatus.sliceArtifactsStatus,
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

function buildOwnerId(slug) {
  return `loopx-build-owner:${normalizeSlug(slug)}`;
}

function buildOwnerSessionId(slug, runId) {
  return `${buildOwnerId(slug)}:${runId || 'pending'}`;
}

function normalizeBuildDelegations(iterationData = {}) {
  return Array.isArray(iterationData.delegations)
    ? iterationData.delegations.map((item, index) => ({
      id: item?.id || `delegation-${index + 1}`,
      role: item?.role || 'implementation',
      status: ['active', 'complete', 'failed', 'blocked', 'pending', 'skipped'].includes(String(item?.status || '').trim().toLowerCase())
        ? String(item.status).trim().toLowerCase()
        : 'pending',
      blocking: item?.blocking !== false,
      scope: Array.isArray(item?.scope) ? item.scope.map(String) : [],
      evidence_path: item?.evidence_path || item?.evidencePath || null,
      summary: item?.summary || 'Build delegation entry',
    }))
    : [];
}

function isBlockingDelegationOpen(item) {
  return item?.blocking && !['complete', 'skipped'].includes(String(item.status));
}

function buildDelegationLedger({ slug, ownerId, ownerSessionId, iterationData, previousLedger = null }) {
  const delegationsById = new Map();
  for (const item of previousLedger?.delegations || []) {
    if (isBlockingDelegationOpen(item)) {
      delegationsById.set(item.id, item);
    }
  }
  for (const item of normalizeBuildDelegations(iterationData)) {
    if (['complete', 'skipped'].includes(String(item.status))) {
      delegationsById.delete(item.id);
    } else {
      delegationsById.set(item.id, item);
    }
  }
  const delegations = [...delegationsById.values()];
  const activeBlocking = delegations.filter((item) => item.blocking && !['complete', 'skipped'].includes(String(item.status)));
  return {
    schema_version: WORKFLOW_SCHEMA_VERSION,
    slug,
    owner_id: ownerId,
    owner_session_id: ownerSessionId,
    updated_at: nowIso(),
    active_blocking_count: activeBlocking.length,
    status: activeBlocking.length > 0 ? 'active' : 'drained',
    delegations,
  };
}

function buildDelegationBlockers(ledger) {
  return (ledger.delegations || [])
    .filter((item) => item.blocking && !['complete', 'skipped'].includes(String(item.status)))
    .map((item) => `delegation_active_${item.id}`);
}

async function readJsonIfExists(path) {
  if (!path || !existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function buildCompletionAudit({ cwd, root, slug, state, reviewReworkArtifactPath = null, iterationData, ledger, baseBlockers }) {
  const checklist = [];
  const iterationEvidence = [
    ...(iterationData.executionEvidence || []),
    ...(iterationData.verificationEvidence || []),
  ].filter(Boolean).map(String);
  const addChecklistItem = (item) => {
    checklist.push({
      status: 'covered',
      evidence: [],
      ...item,
    });
  };

  addChecklistItem({
    id: 'requirements-snapshot',
    source: 'approved-plan',
    requirement: state.plan_artifact_path || join(cwd, '.loopx', 'plans', `requirements-snapshot-${slug}.md`),
    evidence: [state.plan_artifact_path || 'requirements snapshot artifact'],
  });
  addChecklistItem({
    id: 'test-spec',
    source: 'test-spec',
    requirement: state.test_spec_artifact_path || join(cwd, '.loopx', 'plans', `test-spec-${slug}.md`),
    evidence: iterationData.verificationEvidence || [],
  });
  const effectiveReviewReworkPath = reviewReworkArtifactPath || state.review_rework_artifact_path;
  if (effectiveReviewReworkPath) {
    addChecklistItem({
      id: 'review-rework',
      source: 'review-rework',
      requirement: effectiveReviewReworkPath,
      evidence: [
        effectiveReviewReworkPath,
        ...(iterationData.executionEvidence || []),
        ...(iterationData.verificationEvidence || []),
      ].filter(Boolean),
    });
  }

  const slicesPayload = await readJsonIfExists(state.change_artifact_paths?.slices);
  const slices = Array.isArray(slicesPayload?.slices) ? slicesPayload.slices : [];
  for (const slice of slices) {
    const signal = String(slice.verification_signal || '').trim();
    const usesLegacyGenericSignal = signal === 'execution-record.md verification evidence';
    const sliceEvidence = usesLegacyGenericSignal
      ? iterationEvidence
      : iterationEvidence.filter((item) => item.includes(signal));
    addChecklistItem({
      id: slice.id || `slice-${checklist.length + 1}`,
      source: 'vertical-slice',
      status: sliceEvidence.length > 0 ? 'covered' : 'missing-evidence',
      requirement: slice.behavior || signal || 'vertical slice',
      evidence: sliceEvidence,
    });
  }

  const verificationEvidence = [
    ...(iterationData.verificationEvidence || []),
    ...(iterationData.lanes || [])
      .flatMap((lane) => Array.isArray(lane.evidence) ? lane.evidence : [])
      .map((item) => `${item.kind}:${item.summary}:${item.ref}`),
  ].filter(Boolean);
  const blockers = dedupeStrings([
    ...baseBlockers,
    ...buildDelegationBlockers(ledger),
  ]);
  const missingEvidence = checklist.filter((item) => !Array.isArray(item.evidence) || item.evidence.length === 0);
  if (checklist.length === 0 || missingEvidence.length > 0 || verificationEvidence.length === 0) {
    blockers.push('completion_audit_missing_evidence');
  }
  const passed = blockers.length === 0;
  return {
    schema_version: WORKFLOW_SCHEMA_VERSION,
    slug,
    owner_id: ledger.owner_id,
    owner_session_id: ledger.owner_session_id,
    status: passed ? 'passed' : 'blocked',
    passed,
    updated_at: nowIso(),
    blockers: dedupeStrings(blockers),
    checklist,
    verification_evidence: verificationEvidence,
    lane_statuses: (iterationData.lanes || []).map((lane) => ({ name: lane.name, status: lane.status })),
  };
}

function buildHasInfrastructureFailure(iterationData) {
  const limitationText = [
    ...(Array.isArray(iterationData.limitations) ? iterationData.limitations : []),
    ...(Array.isArray(iterationData.lanes) ? iterationData.lanes.flatMap((lane) => [lane.summary, ...(Array.isArray(lane.limitations) ? lane.limitations : [])]) : []),
  ].join('\n');
  return /codex_exec_failed:|codex_exec_invalid_json:|timeout/i.test(limitationText);
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
      changed_files: iterationData.changedFiles || [],
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

async function writeBuildSupportArtifacts(root, iterationData, noDeslop, { delegationLedger = null, completionAudit = null } = {}) {
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
  await writeJson(paths.delegationLedger, delegationLedger || {
    schema_version: WORKFLOW_SCHEMA_VERSION,
    slug: iterationData.slug,
    status: 'drained',
    active_blocking_count: 0,
    delegations: [],
  });
  await writeJson(paths.completionAudit, completionAudit || {
    schema_version: WORKFLOW_SCHEMA_VERSION,
    slug: iterationData.slug,
    status: 'blocked',
    passed: false,
    blockers: ['completion_audit_not_run'],
    checklist: [],
    verification_evidence: [],
  });
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

function planReadinessBlockersSync(state) {
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
  if (!state.plan_artifact_path) {
    blockers.push('missing_requirements_snapshot');
  }
  if (!state.test_spec_artifact_path) {
    blockers.push('missing_test_spec');
  }
  if (state.change_artifacts_status !== 'complete' && state.change_artifacts_status !== 'archived') {
    blockers.push(`change_artifacts_${state.change_artifacts_status || 'missing'}`);
  }
  if (state.spec_delta_status !== 'complete') {
    blockers.push(`spec_delta_${state.spec_delta_status || 'missing'}`);
  }
  if (Array.isArray(state.plan_blockers)) {
    blockers.push(...state.plan_blockers);
  }
  return dedupeStrings(blockers);
}

function buildReadinessBlockersSync(state) {
  const blockers = [];
  if (state.execution_record_status !== 'complete') {
    blockers.push(`execution_record_${state.execution_record_status || 'missing'}`);
  }
  if (Array.isArray(state.build_blockers)) {
    blockers.push(...state.build_blockers);
  }
  return dedupeStrings(blockers);
}

function reviewReadinessBlockersSync(state) {
  const blockers = [];
  if (state.review_status !== 'ready-for-review' && state.review_status !== 'in-review') {
    blockers.push(`review_status_${state.review_status || 'not-started'}`);
  }
  if (state.execution_record_status !== 'complete') {
    blockers.push(`execution_record_${state.execution_record_status || 'missing'}`);
  }
  if (Array.isArray(state.build_blockers)) {
    blockers.push(...state.build_blockers);
  }
  return dedupeStrings(blockers);
}

function doneReadinessBlockersSync(state) {
  const blockers = [];
  if (state.review_verdict !== 'approve') {
    blockers.push(`review_verdict_${state.review_verdict || 'none'}`);
  }
  return blockers;
}

function archiveReadinessBlockersSync(state) {
  const blockers = [];
  if (state.current_stage !== STAGES.DONE || state.completion_confirmed !== true) {
    blockers.push('workflow_not_done');
  }
  if (state.spec_delta_status !== 'complete') {
    blockers.push(`spec_delta_${state.spec_delta_status || 'missing'}`);
  }
  if (!state.change_artifact_paths?.specDelta) {
    blockers.push('missing_spec_delta_path');
  }
  return dedupeStrings(blockers);
}

function readinessEntry(blockers) {
  const unique = dedupeStrings(blockers);
  return {
    ready: unique.length === 0,
    blockers: unique,
  };
}

function authorizationEntry(state, key, transition) {
  return {
    authorized: state.approval?.[key] === APPROVAL_STATES.APPROVED,
    approval_status: state.approval?.[key] || APPROVAL_STATES.NOT_REQUESTED,
    transition,
  };
}

function buildReadiness(state) {
  return {
    plan: readinessEntry(clarifyReadinessBlockers(state)),
    build: readinessEntry(planReadinessBlockersSync(state)),
    review: readinessEntry(buildReadinessBlockersSync(state)),
    done: readinessEntry(doneReadinessBlockersSync(state)),
    archive: readinessEntry(archiveReadinessBlockersSync(state)),
  };
}

function buildAuthorization(state) {
  return {
    plan: authorizationEntry(state, 'plan', TRANSITIONS.CLARIFY_TO_PLAN),
    build: authorizationEntry(state, 'build', TRANSITIONS.PLAN_TO_BUILD),
    review: authorizationEntry(state, 'review', TRANSITIONS.BUILD_TO_REVIEW),
    done: authorizationEntry(state, 'complete', TRANSITIONS.REVIEW_TO_DONE),
    rollback: authorizationEntry(state, 'rollback', state.requested_transition || TRANSITIONS.NONE),
  };
}

function evidenceEntry(claim, basis, implication) {
  return { claim, basis, implication };
}

function buildCurrentEvidenceChain(state, readiness = buildReadiness(state), authorization = buildAuthorization(state)) {
  const evidence = [];
  if (readiness.plan.ready) {
    evidence.push(evidenceEntry(
      'clarify_ready_for_plan',
      'Clarify has zero unresolved ambiguity and non-goals, decision boundaries, and pressure pass gates are satisfied.',
      authorization.plan.authorized ? 'The approved clarify -> plan transition can be consumed by plan.' : 'Plan readiness exists, but user authorization is still separate.',
    ));
  }
  if (authorization.plan.authorized) {
    evidence.push(evidenceEntry(
      'plan_authorized',
      'approval.plan is approved for clarify -> plan.',
      'Planning may proceed without treating readiness alone as authorization.',
    ));
  }
  if (readiness.build.ready) {
    evidence.push(evidenceEntry(
      'plan_ready_for_build',
      'Planner, architect, critic, plan artifacts, execution inputs, and change delta gates are satisfied.',
      authorization.build.authorized ? 'The approved plan -> build transition can be consumed by build.' : 'Build readiness exists, but user authorization is still separate.',
    ));
  }
  if (authorization.build.authorized) {
    evidence.push(evidenceEntry(
      'build_authorized',
      'approval.build is approved for plan -> build or review-requested build rework.',
      'Build may consume the approved transition while preserving gate evidence.',
    ));
  }
  if (readiness.review.ready) {
    evidence.push(evidenceEntry(
      'build_ready_for_review',
      'Execution record is complete and no build blockers remain.',
      authorization.review.authorized ? 'The approved build -> review transition can be consumed by review.' : 'Review readiness exists, but user authorization is still separate.',
    ));
  }
  if (authorization.review.authorized) {
    evidence.push(evidenceEntry(
      'review_authorized',
      'approval.review is approved for build -> review.',
      'Review may proceed as an independent acceptance gate.',
    ));
  }
  if (state.review_verdict === 'approve') {
    evidence.push(evidenceEntry(
      'review_approved',
      'Review verdict is approve.',
      authorization.done.authorized ? 'Archive can consume the approved review -> done transition before syncing specs.' : 'Completion still requires explicit review -> done authorization.',
    ));
  }
  if (state.archive_status === 'archived' && state.spec_sync_status === 'synced') {
    evidence.push(evidenceEntry(
      'change_delta_archived',
      'Archive synced the accepted spec delta into long-lived specs.',
      'The workflow has durable spec memory and can remain closed.',
    ));
  }
  return evidence;
}

function enrichRuntimeJudgment(state, legacy = false) {
  if (!state || legacy) {
    return state;
  }
  const readiness = buildReadiness(state);
  const authorization = buildAuthorization(state);
  return {
    ...state,
    readiness,
    authorization,
    current_evidence_chain: buildCurrentEvidenceChain(state, readiness, authorization),
    recommended_next_action: recommendedAction(state, legacy),
  };
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

function normalizeScopeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (value === null || value === undefined || value === '') {
    return [];
  }
  return String(value)
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function executionScopeGate(meta = {}) {
  const plannedScope = String(meta.planned_scope || '').trim();
  const implementedScope = String(meta.implemented_scope || '').trim();
  const completionClaim = String(meta.completion_claim || '').trim().toLowerCase();
  const remainingScope = normalizeScopeList(meta.remaining_scope);
  const blockers = [];

  if (remainingScope.length > 0) {
    blockers.push('partial_scope_remaining');
  }
  if (completionClaim && !['full', 'complete', 'workflow', 'all'].includes(completionClaim)) {
    blockers.push(`completion_claim_${completionClaim}`);
  }
  if (plannedScope && implementedScope && plannedScope !== implementedScope && completionClaim !== 'full') {
    blockers.push('implemented_scope_mismatch');
  }

  return {
    ok: blockers.length === 0,
    blockers: dedupeStrings(blockers),
    plannedScope,
    implementedScope,
    completionClaim,
    remainingScope,
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
        return 'Run loopx archive; archive consumes the pending review -> done completion transition before syncing specs.';
      }
      if (state.review_verdict === 'request-changes') {
        if (state.requested_transition === TRANSITIONS.REVIEW_TO_BUILD && state.approval.build === APPROVAL_STATES.APPROVED) {
          return 'Run loopx build to consume the approved review -> build transition.';
        }
        if (state.requested_transition === TRANSITIONS.REVIEW_TO_PLAN && state.approval.rollback === APPROVAL_STATES.APPROVED) {
          return 'Run loopx plan to consume the approved review -> plan transition.';
        }
        if (state.requested_transition === TRANSITIONS.REVIEW_TO_CLARIFY && state.approval.rollback === APPROVAL_STATES.APPROVED) {
          return 'Run loopx clarify to consume the approved review -> clarify transition.';
        }
        if (state.rollback_target === STAGES.BUILD) {
          return 'Approve review -> build to fix implementation issues.';
        }
        if (state.rollback_target === STAGES.CLARIFY) {
          return 'Approve review -> clarify to resolve requirement ambiguity.';
        }
        return 'Approve review -> plan to revise the plan package.';
      }
      return 'Run loopx review after build completes.';
    case STAGES.DONE:
      if (state.autopilot_current_phase && state.autopilot_current_phase !== 'none' && state.autopilot_completed) {
        return 'Autopilot run is complete.';
      }
      if (state.archive_status !== 'archived') {
        return 'Run loopx archive to sync the approved change delta into long-lived specs.';
      }
      return 'Workflow is complete.';
    default:
      return 'Run loopx clarify to start a workflow.';
  }
}

function withRecommendedAction(state, legacy = false) {
  return enrichRuntimeJudgment(state, legacy);
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
    case TRANSITIONS.REVIEW_TO_BUILD:
      return 'build';
    case TRANSITIONS.REVIEW_TO_PLAN:
    case TRANSITIONS.REVIEW_TO_CLARIFY:
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

function ensureValidContextManifest(manifest, stage) {
  if (manifest?.status === 'invalid') {
    throw new Error(`context_manifest_invalid:${stage}:${manifest.error || 'unknown'}`);
  }
}

async function writeReviewJournal({ cwd, slug, verdict, reviewMessageZh, evidenceManifest = [], findings = [], followUps = [] }) {
  return appendWorkspaceJournal({
    cwd,
    workspaceRoot: resolveWorkspaceRoot(cwd),
    slug,
    stage: STAGES.REVIEW,
    verdict,
    reviewMessageZh,
    verificationEvidence: evidenceManifest.map((item) => item.summary || item.ref || JSON.stringify(item)),
    decisions: ['review 已执行 code review 与证据完整性检查。'],
    risks: verdict === 'APPROVE' ? ['暂无阻断风险。'] : findings,
    followUps,
  });
}

async function writeReviewChangedFiles(root, changedFiles = []) {
  await ensureDir(join(root, 'review-support'));
  const path = join(root, 'review-support', 'changed-files.json');
  await writeText(path, `${JSON.stringify(Array.isArray(changedFiles) ? changedFiles : [], null, 2)}\n`);
  return path;
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
  if (rollbackTarget === 'build') {
    return '回到 build 阶段修复实现问题';
  }
  if (rollbackTarget === 'plan') {
    return '回退到 plan 阶段';
  }
  if (rollbackTarget === 'clarify') {
    return '回到 clarify 阶段澄清需求';
  }
  return rollbackTarget;
}

function transitionForRollbackTarget(target) {
  if (target === STAGES.BUILD) {
    return TRANSITIONS.REVIEW_TO_BUILD;
  }
  if (target === STAGES.CLARIFY) {
    return TRANSITIONS.REVIEW_TO_CLARIFY;
  }
  return TRANSITIONS.REVIEW_TO_PLAN;
}

function nextCommandForRollbackTarget(slug, target) {
  if (target === STAGES.BUILD) {
    return [
      'Next:',
      reviewReworkBuildCommand(slug),
    ].join('\n');
  }
  if (target === STAGES.CLARIFY) {
    return [
      'Next:',
      `loopx approve ${slug} --from review --to clarify`,
      `$clarify ${slug}`,
    ].join('\n');
  }
  if (target === 'none') {
    return [
      'Next:',
      `$archive ${slug}`,
      '',
      'CLI-only equivalent:',
      `loopx approve ${slug} --from review --to done`,
      `loopx archive ${slug}`,
    ].join('\n');
  }
  return [
    'Next:',
    `loopx approve ${slug} --from review --to plan`,
    `$plan ${slug}`,
  ].join('\n');
}

function reviewUserMessageZh({ slug, verdict, rollbackTarget, findings }) {
  const label = reviewVerdictLabel(verdict);
  const next = verdict === 'APPROVE'
    ? `下一步：直接归档；archive 会先消费 pending 的 review -> done 完成态。\n${nextCommandForRollbackTarget(slug, 'none')}`
    : `下一步：按审查发现处理，并${rollbackTargetLabel(rollbackTarget)}。\n${nextCommandForRollbackTarget(slug, rollbackTarget)}`;
  const findingText = Array.isArray(findings) && findings.length > 0 ? findings.join('；') : '无额外发现。';
  return `Review 结果：${slug} ${label}。审查发现：${findingText} ${next}`;
}

function codeReviewFindingText(finding) {
  const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : '未定位文件';
  return `[${finding.severity || 'medium'}] ${location}：${finding.message}`;
}

function codeReviewFailureResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 'failed',
    verdict: 'request-changes',
    summary: `code-review 子流程失败，review 不能接受本次运行：${message}`,
    rollbackTarget: STAGES.BUILD,
    changedFiles: [],
    findings: [{
      severity: 'high',
      file: 'review-support/code-review.raw.json',
      line: null,
      message: `code-review 子流程未返回有效结构化 JSON：${message}`,
    }],
  };
}

function architectureReviewFailureResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 'failed',
    verdict: 'block',
    summary: `architecture-smell 子流程失败，review 不能接受本次运行：${message}`,
    rollbackTarget: STAGES.BUILD,
    findings: [{
      severity: 'high',
      file: 'review-support/architecture-smell.raw.json',
      line: null,
      message: `architecture-smell 子流程未返回有效结构化 JSON：${message}`,
    }],
  };
}

function architectureReviewFindingText(finding) {
  const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : '未定位文件';
  return `[${finding.severity || 'medium'}] ${location}：${finding.message}`;
}

function reviewReportContent({ slug, reviewer, runId, verdict, rollbackTarget, rollbackRationale, inputManifest, evidenceManifest, findings, codeReview, architectureReview }) {
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
      architecture_smell: architectureReview ? {
        status: architectureReview.status,
        verdict: architectureReview.verdict,
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
    '## Architecture Smell Scan',
    '',
    architectureReview ? `- 状态：${architectureReview.status}` : '- 状态：未执行',
    architectureReview ? `- 结论：${architectureReview.verdict}` : '- 结论：未知',
    architectureReview ? `- 摘要：${architectureReview.summary}` : '- 摘要：无',
    ...(architectureReview && architectureReview.findings.length > 0 ? architectureReview.findings.map((item) => `- ${architectureReviewFindingText(item)}`) : ['- 架构 smell 扫描通过。']),
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

async function renderPlanReadingViews(cwd, root, state, slug) {
  try {
    const { renderHtmlViews } = await import('./html-views.mjs');
    const rendered = await renderHtmlViews(cwd, { slug });
    return {
      ...state,
      html_view_status: 'written',
      html_view_path: rendered.workflowViewPath,
      workspace_view_path: rendered.workspaceViewPath,
      html_view_error: null,
    };
  } catch (error) {
    return {
      ...state,
      html_view_status: 'failed',
      html_view_path: join(root, 'view', 'index.html'),
      workspace_view_path: join(resolveWorkspaceRoot(cwd), 'views', 'index.html'),
      html_view_error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function initWorkspace(cwd, { slug, agentDelegation = {} } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const projectConventions = await inspectProjectConventions(cwd);
  await ensureLoopxRoot(cwd);
  await ensureDir(join(workspaceRoot, 'context'));
  await ensureDir(join(workspaceRoot, 'intake'));
  await ensureDir(join(workspaceRoot, 'workflows'));
  await ensureDir(join(workspaceRoot, 'specs'));
  await ensureDir(join(workspaceRoot, 'changes'));
  await ensureDir(join(workspaceRoot, 'changes', 'active'));
  await ensureDir(join(workspaceRoot, 'changes', 'archive'));
  await ensureDir(join(workspaceRoot, 'plans'));
  await ensureDir(join(workspaceRoot, 'autopilot'));
  await setupWorkspaceContext(cwd);

  const config = {
    schema_version: WORKSPACE_SCHEMA_VERSION,
    tool: 'loopx',
    product_contract: 'skill-first-v1',
    default_flow: ['clarify', 'plan', 'build', 'review', 'done', 'archive'],
    preferred_surface: ['clarify', 'plan', 'build', 'review', 'archive', 'autopilot'],
    source_of_truth_policy: projectConventions.source_of_truth_policy,
    project_conventions: {
      existing_ai_rules: projectConventions.existing_ai_rules,
      existing_spec_sources: projectConventions.existing_spec_sources,
    },
    verification_commands: projectConventions.verification_commands,
    agent_delegation: normalizeAgentDelegationConfig(agentDelegation),
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
  const existing = await readState(cwd, normalized);
  const consumesReviewClarify = existing?.current_stage === STAGES.REVIEW
    && existing?.requested_transition === TRANSITIONS.REVIEW_TO_CLARIFY
    && existing?.approval?.rollback === APPROVAL_STATES.APPROVED
    && existing?.review_verdict === 'request-changes';
  const resumesConsumedReviewClarify = existing?.current_stage === STAGES.CLARIFY
    && existing?.last_confirmed_transition === TRANSITIONS.REVIEW_TO_CLARIFY
    && existing?.approval?.rollback === APPROVAL_STATES.APPROVED;
  const preservesExistingClarifySpec = consumesReviewClarify || resumesConsumedReviewClarify;
  await ensureLoopxRoot(cwd);
  await ensureDir(root);
  const stamp = nowStamp();
  if (!preservesExistingClarifySpec) {
    await writeTemplateArtifact(root, 'spec.md', {
      'task name': normalized,
      'workflow id': normalized,
      profile: clarifyProfile,
      'target ambiguity threshold': CLARIFY_PROFILES[clarifyProfile].threshold,
      'max rounds': CLARIFY_PROFILES[clarifyProfile].maxRounds,
    });
  }
  const specArtifactPath = canonicalClarifySpecPath(cwd, normalized, stamp);
  await copyArtifact(root, specArtifactPath, 'spec.md');
	  const state = withRecommendedAction({
	    ...(preservesExistingClarifySpec ? existing : createInitialState(normalized, clarifyProfile)),
	    current_stage: STAGES.CLARIFY,
	    stage_status: 'blocked',
	    clarify_profile: clarifyProfile,
	    clarify_target_ambiguity_threshold: CLARIFY_PROFILES[clarifyProfile].threshold,
	    clarify_max_rounds: CLARIFY_PROFILES[clarifyProfile].maxRounds,
	    clarify_current_round: preservesExistingClarifySpec ? existing.clarify_current_round : 0,
	    clarify_ambiguity_score: 1,
	    clarify_pressure_pass_complete: false,
	    clarify_non_goals_resolved: false,
	    clarify_decision_boundaries_resolved: false,
	    ambiguity_items: preservesExistingClarifySpec ? existing.ambiguity_items : [
      {
        id: 'A-1',
        question: 'What specific task should loopx execute in this workflow?',
        status: 'open',
        resolution: null,
      },
    ],
	    unresolved_ambiguity_count: preservesExistingClarifySpec ? Math.max(1, Number(existing.unresolved_ambiguity_count || 0)) : 1,
    spec_artifact_path: specArtifactPath,
    pending_user_decision: TRANSITIONS.NONE,
    requested_transition: TRANSITIONS.NONE,
    last_confirmed_transition: preservesExistingClarifySpec ? TRANSITIONS.REVIEW_TO_CLARIFY : TRANSITIONS.NONE,
    approval: {
      ...(preservesExistingClarifySpec ? existing.approval : createInitialState(normalized, clarifyProfile).approval),
      plan: APPROVAL_STATES.NOT_REQUESTED,
      build: APPROVAL_STATES.NOT_REQUESTED,
      review: APPROVAL_STATES.NOT_REQUESTED,
      rollback: preservesExistingClarifySpec ? APPROVAL_STATES.APPROVED : APPROVAL_STATES.NOT_REQUESTED,
      complete: APPROVAL_STATES.NOT_REQUESTED,
    },
  });
  await writeState(root, state);
  const rendered = await renderPlanReadingViews(cwd, root, state, normalized);
  await writeState(root, rendered);
  return { root, state: rendered };
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
      change_artifacts_status: completion.changeArtifactsStatus,
      spec_delta_status: completion.specDeltaStatus,
      slice_artifacts_status: completion.sliceArtifactsStatus,
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
    if (next.review_verdict !== 'request-changes' || next.rollback_target !== STAGES.PLAN) {
      throw new Error('review_plan_fix_not_requested');
    }
    if (!next.rollback_rationale) {
      throw new Error('rollback_rationale_required');
    }
  }
  if (transition === TRANSITIONS.REVIEW_TO_BUILD) {
    if (next.review_verdict !== 'request-changes' || next.rollback_target !== STAGES.BUILD) {
      throw new Error('review_build_fix_not_requested');
    }
  }
  if (transition === TRANSITIONS.REVIEW_TO_CLARIFY) {
    if (next.review_verdict !== 'request-changes' || next.rollback_target !== STAGES.CLARIFY) {
      throw new Error('review_clarify_fix_not_requested');
    }
    if (!next.rollback_rationale) {
      throw new Error('rollback_rationale_required');
    }
  }

  if (transition === TRANSITIONS.REVIEW_TO_DONE && next.review_verdict !== 'approve') {
    throw new Error('review_not_approved');
  }

  if (transition === TRANSITIONS.REVIEW_TO_DONE) {
    const executionSummary = await readExecutionRecordSummary(root);
    const scopeGate = executionScopeGate(executionSummary.meta);
    if (!scopeGate.ok) {
      const blocked = withRecommendedAction({
        ...next,
        stage_status: 'blocked',
        pending_user_decision: TRANSITIONS.REVIEW_TO_BUILD,
        requested_transition: TRANSITIONS.REVIEW_TO_BUILD,
        review_verdict: 'request-changes',
        rollback_target: STAGES.BUILD,
        rollback_rationale: 'execution-record.md scope gate blocked review -> done because remaining workflow scope is declared.',
        plan_blockers: dedupeStrings([...(next.plan_blockers || []), ...scopeGate.blockers]),
        approval: {
          ...next.approval,
          build: APPROVAL_STATES.REQUESTED,
          complete: APPROVAL_STATES.NOT_REQUESTED,
        },
      });
      await writeState(root, blocked);
      throw new Error(`review_done_scope_blocked:${scopeGate.blockers.join(',')}`);
    }
    let doneJournal = null;
    let doneJournalWarning = null;
    if (next.workspace_journal_status !== 'written' || !next.workspace_journal_path) {
      try {
        doneJournal = await writeReviewJournal({
          cwd,
          slug: state.slug,
          verdict: 'APPROVE',
          reviewMessageZh: `Review 结果：${state.slug} 已批准完成，工作流进入 done。`,
          evidenceManifest: [],
          findings: [],
          followUps: ['工作流已完成。'],
        });
      } catch (error) {
        doneJournalWarning = error instanceof Error ? error.message : String(error);
      }
    }
    next = withRecommendedAction({
      ...next,
      current_stage: STAGES.DONE,
      stage_status: 'completed',
      pending_user_decision: TRANSITIONS.NONE,
      requested_transition: TRANSITIONS.NONE,
      last_confirmed_transition: TRANSITIONS.REVIEW_TO_DONE,
      completion_confirmed: true,
      workspace_journal_status: doneJournal ? 'written' : (next.workspace_journal_status || 'failed'),
      workspace_journal_path: doneJournal?.journalPath || next.workspace_journal_path || null,
      workspace_journal_error: doneJournalWarning || next.workspace_journal_error || null,
      approval: {
        ...next.approval,
        [approvalKey]: APPROVAL_STATES.APPROVED,
      },
    });
    await writeState(root, next);
    return { root, state: next };
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

function isDoneRoute(value) {
  return value === TRANSITIONS.REVIEW_TO_DONE || value === STAGES.DONE;
}

function canArchiveConsumePendingDoneApproval(state) {
  if (state.current_stage !== STAGES.REVIEW) {
    return false;
  }
  const reviewVerdict = String(state.review_verdict || '').trim().toLowerCase();
  const reviewApproved = reviewVerdict === 'approve' || reviewVerdict === 'go';
  const routesToDone = [
    state.pending_user_decision,
    state.requested_transition,
    state.review_route,
    state.requested_transition_after_review,
  ].some(isDoneRoute);
  const completionRequested = [
    APPROVAL_STATES.REQUESTED,
    APPROVAL_STATES.APPROVED,
  ].includes(state.approval?.complete) || state.execution_approved === true || state.execution_approved_for_review === true;
  return reviewApproved && routesToDone && completionRequested;
}

async function consumePendingDoneApprovalForArchive(cwd, root, state, slug) {
  if (!canArchiveConsumePendingDoneApproval(state)) {
    return { root, state, consumed: false };
  }
  const normalized = withRecommendedAction({
    ...state,
    review_verdict: 'approve',
    pending_user_decision: TRANSITIONS.REVIEW_TO_DONE,
    requested_transition: TRANSITIONS.NONE,
    approval: {
      ...state.approval,
      review: APPROVAL_STATES.APPROVED,
      complete: state.approval?.complete || APPROVAL_STATES.REQUESTED,
    },
  });
  await writeState(root, normalized);
  const done = await approveStage(cwd, slug, { from: STAGES.REVIEW, to: STAGES.DONE });
  return {
    root: done.root,
    state: {
      ...done.state,
      archive_consumed_pending_done_approval: true,
    },
    consumed: true,
  };
}

export async function archiveStage(cwd, slug) {
  const loaded = await loadWorkflowState(cwd, slug, { allowLegacy: false });
  const normalized = loaded.slug;
  let root = loaded.root;
  let state = loaded.state;
  const doneApproval = await consumePendingDoneApprovalForArchive(cwd, root, state, normalized);
  root = doneApproval.root;
  state = doneApproval.state;
  if (state.current_stage !== STAGES.DONE || !state.completion_confirmed) {
    throw new Error('archive_requires_done_workflow');
  }
  const executionSummary = await readExecutionRecordSummary(root);
  const scopeGate = executionScopeGate(executionSummary.meta);
  if (!scopeGate.ok) {
    const blocked = withRecommendedAction({
      ...state,
      archive_status: 'blocked',
      plan_blockers: dedupeStrings([...(state.plan_blockers || []), ...scopeGate.blockers]),
    });
    await writeState(root, blocked);
    throw new Error(`archive_scope_blocked:${scopeGate.blockers.join(',')}`);
  }
  const effectiveChangeArtifactPaths = await ensureArchiveSlicesArtifact(cwd, root, normalized, state);
  const effectiveState = {
    ...state,
    change_artifact_paths: effectiveChangeArtifactPaths,
    slice_artifacts_status: effectiveChangeArtifactPaths?.slices && existsSync(effectiveChangeArtifactPaths.slices) ? 'complete' : state.slice_artifacts_status,
  };
  const changeStatus = await readChangeArtifactStatus(effectiveState.change_artifact_paths);
  if (changeStatus.blockers.length > 0) {
    const blocked = withRecommendedAction({
      ...effectiveState,
      archive_status: 'blocked',
      spec_sync_status: changeStatus.specDeltaStatus,
      plan_blockers: [...(effectiveState.plan_blockers || []), ...changeStatus.blockers],
    });
    await writeState(root, blocked);
    throw new Error(`archive_blocked:${changeStatus.blockers.join(',')}`);
  }

  const changeId = normalizeSlug(effectiveState.change_id || changeIdForWorkflowSlug(normalized));
  const archivedSpecPaths = await mergeSpecDeltaIntoLongLivedSpecs(cwd, changeId, effectiveState.change_artifact_paths.specDelta);
  const adrCandidatePath = await writeAdrCandidate(cwd, changeId, effectiveState, archivedSpecPaths);
  const archiveRoot = resolveArchivedChangeRoot(cwd, changeId);
  await ensureDir(dirname(archiveRoot));
  if (effectiveState.change_artifact_paths.root === archiveRoot) {
    // Already archived; keep paths stable and use merge as an idempotent re-sync.
  } else if (existsSync(archiveRoot)) {
    await cp(effectiveState.change_artifact_paths.root, archiveRoot, { recursive: true, force: true });
  } else {
    await rename(effectiveState.change_artifact_paths.root, archiveRoot);
  }
  const archivedPaths = {
    ...effectiveState.change_artifact_paths,
    root: archiveRoot,
    proposal: join(archiveRoot, 'proposal.md'),
    specDelta: join(archiveRoot, 'spec-delta.md'),
    design: join(archiveRoot, 'design.md'),
    tasks: join(archiveRoot, 'tasks.md'),
    slices: join(archiveRoot, 'slices.json'),
    graph: join(archiveRoot, 'artifact-graph.json'),
  };
  const next = withRecommendedAction({
    ...effectiveState,
    archive_status: 'archived',
    spec_sync_status: 'synced',
    spec_delta_status: 'complete',
    slice_artifacts_status: 'complete',
    change_id: changeId,
    change_artifacts_status: 'archived',
    archived_change_path: archiveRoot,
    archived_spec_paths: archivedSpecPaths,
    adr_candidate_path: adrCandidatePath,
    change_artifact_paths: archivedPaths,
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
  const consumesReviewPlan = state.current_stage === STAGES.REVIEW
    && state.requested_transition === TRANSITIONS.REVIEW_TO_PLAN
    && state.approval.rollback === APPROVAL_STATES.APPROVED
    && state.review_verdict === 'request-changes';
  const resumesConsumedReviewPlan = state.current_stage === STAGES.PLAN
    && state.last_confirmed_transition === TRANSITIONS.REVIEW_TO_PLAN
    && state.approval.rollback === APPROVAL_STATES.APPROVED;
  const resumesClarifyPlan = state.current_stage === STAGES.PLAN
    && state.stage_status === 'blocked'
    && state.last_confirmed_transition === TRANSITIONS.CLARIFY_TO_PLAN
    && state.approval.plan === APPROVAL_STATES.APPROVED;
  if (!options.directSpecPath) {
    if (consumesReviewPlan || resumesConsumedReviewPlan || resumesClarifyPlan) {
      // A no-go review or a blocked planning run may route back to plan; the printed Next command is $plan.
    } else {
      ensureApprovedTransition(state, TRANSITIONS.CLARIFY_TO_PLAN, 'plan');
    }
    if (!consumesReviewPlan && !resumesConsumedReviewPlan && !resumesClarifyPlan && state.spec_artifact_path) {
      await copyArtifact(root, state.spec_artifact_path, 'spec.md');
    }
  }

  const sourceSpecPath = options.directSpecPath ? resolve(cwd, options.directSpecPath) : (state.plan_source_spec_path || artifactPath(root, 'spec.md'));
  const sourceBundle = await readPlanSourceText(cwd, state, sourceSpecPath);
  const sourceText = sourceBundle.sourceText;
  const agentDelegationConfig = await readAgentDelegationConfig(cwd);
  const adapter = options.adapter || createDefaultPlanAdapter();
  const maxIterations = DEFAULT_MAX_ITERATIONS;
  let iteration = 1;
  let architectReview = null;
  let criticReview = null;
  const reviewArtifactPaths = [];
  const reviewHistory = initialPlanReviewHistory(state);

  while (iteration <= maxIterations) {
    const rawPlannerDraft = await adapter.planner({
      cwd,
      root,
      slug: normalized,
      sourceText,
      iteration,
      reviewHistory: [...reviewHistory],
      deliberateMode: Boolean(options.deliberate),
      interactiveMode: Boolean(options.interactive),
    });
    const plannerDraft = enrichPlannerDraftForReview({ sourceText, plannerDraft: rawPlannerDraft });
    await writePlanArtifacts(root, cwd, normalized, plannerDraft);
    const artifactPaths = await writeCanonicalPlanArtifacts(cwd, root, normalized);
    const changeId = state.change_id || changeIdForWorkflowSlug(normalized);
    const changeArtifactPaths = await writeChangeArtifacts(cwd, root, normalized, sourceText, plannerDraft, changeId);
    const changeArtifactStatus = await readChangeArtifactStatus(changeArtifactPaths);
    const traceability = await writeRequirementTraceabilityArtifact({
      root,
      sourceSpecPath,
      sourceText,
      plannerDraft,
      changeArtifactPaths,
    });
    const delegationDecision = await writePlanDelegationDecisionArtifact({
      root,
      sourceText,
      plannerDraft,
      agentDelegationConfig,
    });

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
    reviewHistory.push(planReviewSummary(iteration, architectReview, criticReview));

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
      plan_review_history: reviewHistory,
      plan_artifact_path: artifactPaths.planPath,
      test_spec_artifact_path: artifactPaths.testSpecPath,
      requirement_traceability_path: traceability.path,
      source_requirements_status: traceability.status,
      source_requirements_item_count: traceability.itemCount,
      plan_delegation_decision_path: delegationDecision.path,
      plan_delegation_mode: delegationDecision.mode,
      plan_delegation_recommended_mode: delegationDecision.recommended_mode,
      plan_delegation_actual_mode: delegationDecision.actual_mode,
      plan_delegation_runtime_execution: delegationDecision.runtime_execution,
      plan_delegation_authorization_status: delegationDecision.authorization_status,
      plan_delegation_authorization_source: delegationDecision.authorization_source,
      plan_delegation_threshold: delegationDecision.threshold,
      plan_delegation_score: delegationDecision.score,
      plan_delegation_triggers: delegationDecision.triggers,
      plan_delegation_reason: delegationDecision.reason,
      change_id: normalizeSlug(changeId),
      change_artifacts_status: changeArtifactStatus.status,
      change_artifact_paths: changeArtifactPaths,
      spec_delta_status: changeArtifactStatus.specDeltaStatus,
      slice_artifacts_status: changeArtifactStatus.sliceArtifactsStatus,
      plan_source_spec_path: sourceSpecPath,
      plan_source_document_paths: sourceBundle.sourceDocumentPaths,
      last_confirmed_transition: consumesReviewPlan || resumesConsumedReviewPlan ? TRANSITIONS.REVIEW_TO_PLAN : TRANSITIONS.CLARIFY_TO_PLAN,
      approval: {
        ...state.approval,
        plan: APPROVAL_STATES.APPROVED,
        build: APPROVAL_STATES.NOT_REQUESTED,
        review: APPROVAL_STATES.NOT_REQUESTED,
        rollback: consumesReviewPlan || resumesConsumedReviewPlan ? APPROVAL_STATES.APPROVED : APPROVAL_STATES.NOT_REQUESTED,
        complete: APPROVAL_STATES.NOT_REQUESTED,
      },
    };

    if (criticReview.verdict === 'approve') {
      break;
    }
    iteration += 1;
  }

  const completion = await readPlanCompletion(cwd, root, normalized, state);
  const buildManifest = completion.blockers.length > 0
    ? null
    : await generateBuildContextManifest({ cwd, root, state, slug: normalized });
  const next = withRecommendedAction({
    ...state,
    current_stage: STAGES.PLAN,
    stage_status: completion.blockers.length > 0 ? 'blocked' : 'awaiting-approval',
    pending_user_decision: completion.blockers.length > 0 ? TRANSITIONS.NONE : TRANSITIONS.PLAN_TO_BUILD,
    requested_transition: TRANSITIONS.NONE,
    plan_docs_status: completion.docsStatus,
    plan_docs_artifact_paths: null,
    source_requirements_status: completion.sourceRequirementsStatus,
    change_artifacts_status: completion.changeArtifactsStatus,
    spec_delta_status: completion.specDeltaStatus,
    slice_artifacts_status: completion.sliceArtifactsStatus,
    plan_blockers: completion.blockers,
    context_manifest_status: buildManifest ? 'hit' : 'fallback',
    build_context_manifest_path: buildManifest?.path || buildContextManifestPath(root),
  });
  await writeState(root, next);
  const renderedNext = await renderPlanReadingViews(cwd, root, next, normalized);
  await writeState(root, renderedNext);
  return { root, state: renderedNext, architectReview, criticReview };
}

export async function buildStage(cwd, slug, options = {}) {
  const explicitReviewReworkPath = options.fromReviewPath || (isReviewReworkArtifactInput(slug) ? slug : null);
  const buildSlug = explicitReviewReworkPath ? slugFromReviewReworkInput(explicitReviewReworkPath) : slugFromBuildInput(slug);
  const { root, state, slug: normalized } = await loadWorkflowState(cwd, buildSlug, { allowLegacy: false });
  const reviewReworkArtifactDisplayPath = explicitReviewReworkPath ? displayPath(cwd, explicitReviewReworkPath) : null;
  const reviewReworkArtifactResolvedPath = explicitReviewReworkPath ? resolve(cwd, explicitReviewReworkPath) : null;
  const effectiveReviewReworkArtifactPath = reviewReworkArtifactDisplayPath || state.review_rework_artifact_path || null;
  if (explicitReviewReworkPath && !existsSync(reviewReworkArtifactResolvedPath)) {
    throw new Error('build_from_review_artifact_missing');
  }
  const consumesReviewBuild = state.current_stage === STAGES.REVIEW
    && state.review_verdict === 'request-changes'
    && state.rollback_target === STAGES.BUILD
    && (
      state.pending_user_decision === TRANSITIONS.REVIEW_TO_BUILD
      || state.requested_transition === TRANSITIONS.REVIEW_TO_BUILD
      || state.approval.build === APPROVAL_STATES.REQUESTED
      || state.approval.build === APPROVAL_STATES.APPROVED
    )
    && Boolean(explicitReviewReworkPath);
  const resumesConsumedReviewBuild = state.current_stage === STAGES.BUILD
    && state.last_confirmed_transition === TRANSITIONS.REVIEW_TO_BUILD
    && state.approval.build === APPROVAL_STATES.APPROVED;
  if (!consumesReviewBuild && !resumesConsumedReviewBuild) {
    ensureApprovedTransition(state, TRANSITIONS.PLAN_TO_BUILD, 'build');
  }
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
  const ownerId = buildOwnerId(normalized);
  let iteration = 1;
  let current = null;
  let accumulatedChangedFiles = [];
  let blockers = ['build_not_started'];
  let delegationLedger = null;
  let completionAudit = null;
  let delegationLedgerPath = resolveBuildSupportPaths(root, 1).delegationLedger;
  let completionAuditPath = resolveBuildSupportPaths(root, 1).completionAudit;
  if (consumesReviewBuild || resumesConsumedReviewBuild) {
    await generateBuildContextManifest({
      cwd,
      root,
      state: {
        ...state,
        current_stage: STAGES.BUILD,
        last_confirmed_transition: TRANSITIONS.REVIEW_TO_BUILD,
        review_rework_artifact_path: reviewReworkArtifactResolvedPath || state.review_rework_artifact_path || artifactPath(root, 'review-report.md'),
      },
      slug: normalized,
    });
  }
  const buildManifest = await readContextManifest(buildContextManifestPath(root), { cwd });
  ensureValidContextManifest(buildManifest, STAGES.BUILD);
  const contextManifestStatus = buildManifest.status;

  await writeBuildActiveState(cwd, {
    active: true,
    slug: normalized,
    phase: 'starting',
    iteration: 0,
    max_iterations: maxIterations,
    review_handoff_ready: false,
    blockers,
    build_owner_id: ownerId,
    build_owner_session_id: buildOwnerSessionId(normalized, null),
    delegation_ledger_path: displayPath(cwd, delegationLedgerPath),
    active_delegation_count: 0,
    completion_audit_path: displayPath(cwd, completionAuditPath),
    completion_audit_status: 'pending',
    next_action: 'Run build execution lanes and write execution-record.md.',
    completion_signal: 'Build may stop only after execution-record.md is complete and build -> review handoff readiness is reached, or after a real blocker is recorded.',
    workflow_root: root,
    execution_record_path: artifactPath(root, 'execution-record.md'),
    started_at: nowIso(),
  });

  while (iteration <= maxIterations) {
    await writeBuildActiveState(cwd, {
      active: true,
      slug: normalized,
      phase: 'executing',
      iteration,
      max_iterations: maxIterations,
      review_handoff_ready: false,
      blockers,
      build_owner_id: ownerId,
      build_owner_session_id: buildOwnerSessionId(normalized, null),
      delegation_ledger_path: displayPath(cwd, delegationLedgerPath),
      active_delegation_count: delegationLedger?.active_blocking_count || 0,
      completion_audit_path: displayPath(cwd, completionAuditPath),
      completion_audit_status: completionAudit?.status || 'pending',
      next_action: 'Continue $build execution and gather fresh implementation evidence.',
      completion_signal: 'Build may stop only after execution-record.md is complete and build -> review handoff readiness is reached, or after a real blocker is recorded.',
    });
    current = await adapter.executeLanes({
      cwd,
      root,
      slug: normalized,
      iteration,
      noDeslop,
      planArtifactPath: state.plan_artifact_path,
      testSpecArtifactPath: state.test_spec_artifact_path,
      reviewReworkArtifactPath: reviewReworkArtifactDisplayPath || state.review_rework_artifact_path || null,
      contextManifestPath: buildContextManifestPath(root),
      contextManifestRows: buildManifest.rows,
      contextManifestStatus,
    });
    accumulatedChangedFiles = dedupeStrings([
      ...accumulatedChangedFiles,
      ...(Array.isArray(current.changedFiles) ? current.changedFiles : []),
    ]);
    current = {
      ...current,
      changedFiles: accumulatedChangedFiles,
    };
    const supportPaths = resolveBuildSupportPaths(root, current.iteration);
    delegationLedgerPath = supportPaths.delegationLedger;
    completionAuditPath = supportPaths.completionAudit;
    delegationLedger = buildDelegationLedger({
      slug: normalized,
      ownerId,
      ownerSessionId: buildOwnerSessionId(normalized, current?.runId || null),
      iterationData: current,
      previousLedger: delegationLedger,
    });
    const baseBlockers = buildIterationBlockers(current, { noDeslop });
    completionAudit = await buildCompletionAudit({
      cwd,
      root,
      slug: normalized,
      state,
      reviewReworkArtifactPath: effectiveReviewReworkArtifactPath,
      iterationData: current,
      ledger: delegationLedger,
      baseBlockers,
    });
    const auditBlocksHandoff = !completionAudit.passed
      && baseBlockers.length === 0;
    blockers = dedupeStrings([
      ...baseBlockers,
      ...buildDelegationBlockers(delegationLedger),
      ...(auditBlocksHandoff ? ['completion_audit_blocked'] : []),
    ]);
    await writeBuildActiveState(cwd, {
      active: true,
      slug: normalized,
      phase: blockers.length === 0 ? 'verifying' : 'fixing',
      iteration,
      max_iterations: maxIterations,
      review_handoff_ready: false,
      blockers,
      build_owner_id: ownerId,
      build_owner_session_id: buildOwnerSessionId(normalized, current?.runId || null),
      delegation_ledger_path: displayPath(cwd, delegationLedgerPath),
      active_delegation_count: delegationLedger.active_blocking_count,
      completion_audit_path: displayPath(cwd, completionAuditPath),
      completion_audit_status: completionAudit.status,
      next_action: blockers.length === 0
        ? 'Verify execution evidence and prepare build -> review handoff.'
        : 'Continue $build to resolve blockers before review handoff.',
      completion_signal: 'Build may stop only after execution-record.md is complete and build -> review handoff readiness is reached, or after a real blocker is recorded.',
    });
    const writtenSupportPaths = await writeBuildSupportArtifacts(root, current, noDeslop, {
      delegationLedger,
      completionAudit,
    });
    progressArtifacts.push(writtenSupportPaths.laneSummary);
    supportArtifacts.push(
      writtenSupportPaths.architect,
      writtenSupportPaths.deslop,
      writtenSupportPaths.regression,
      writtenSupportPaths.delegationLedger,
      writtenSupportPaths.completionAudit,
    );
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
    if (buildHasInfrastructureFailure(current)) {
      break;
    }
    iteration += 1;
  }

  const finalBlocked = blockers.length > 0;
  const reviewManifest = finalBlocked
    ? null
    : await generateReviewContextManifest({ cwd, root, state, slug: normalized });
  const refreshed = await refreshExecutionStatus(root, state);
  const next = withRecommendedAction({
    ...refreshed.state,
    current_stage: STAGES.BUILD,
    stage_status: finalBlocked ? 'blocked' : 'awaiting-approval',
    execution_record_status: finalBlocked ? 'partial' : refreshed.state.execution_record_status,
    review_status: finalBlocked ? 'pending-input' : 'ready-for-review',
    review_handoff_ready: !finalBlocked,
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
    build_owner_id: ownerId,
    build_owner_session_id: buildOwnerSessionId(normalized, current?.runId || null),
    build_owner_status: finalBlocked ? 'blocked' : 'review-ready',
    build_delegation_status: delegationLedger?.status || 'drained',
    build_delegation_ledger_path: delegationLedgerPath,
    build_active_delegation_count: delegationLedger?.active_blocking_count || 0,
    build_completion_audit_status: completionAudit?.status || (finalBlocked ? 'blocked' : 'passed'),
    build_completion_audit_path: completionAuditPath,
    review_rework_artifact_path: reviewReworkArtifactDisplayPath || state.review_rework_artifact_path || null,
    context_manifest_status: contextManifestStatus,
    build_context_manifest_path: buildContextManifestPath(root),
    review_context_manifest_path: reviewManifest?.path || reviewContextManifestPath(root),
    active_run_id: current?.runId || null,
    pending_user_decision: finalBlocked ? TRANSITIONS.NONE : TRANSITIONS.BUILD_TO_REVIEW,
    requested_transition: TRANSITIONS.NONE,
    last_confirmed_transition: consumesReviewBuild || resumesConsumedReviewBuild ? TRANSITIONS.REVIEW_TO_BUILD : TRANSITIONS.PLAN_TO_BUILD,
    review_verdict: 'none',
    rollback_target: null,
    rollback_rationale: null,
    workspace_journal_path: null,
    workspace_journal_status: 'skipped',
    workspace_journal_error: null,
    approval: {
      ...state.approval,
      build: APPROVAL_STATES.APPROVED,
      review: APPROVAL_STATES.NOT_REQUESTED,
      rollback: APPROVAL_STATES.NOT_REQUESTED,
      complete: APPROVAL_STATES.NOT_REQUESTED,
    },
  });
  await writeState(root, next);
  await writeBuildActiveState(cwd, {
    active: false,
    slug: normalized,
    phase: finalBlocked ? 'blocked' : 'review-ready',
    iteration: current?.iteration || 0,
    max_iterations: maxIterations,
    review_handoff_ready: !finalBlocked,
    blockers,
    build_owner_id: ownerId,
    build_owner_session_id: buildOwnerSessionId(normalized, current?.runId || null),
    delegation_ledger_path: displayPath(cwd, delegationLedgerPath),
    active_delegation_count: delegationLedger?.active_blocking_count || 0,
    completion_audit_path: displayPath(cwd, completionAuditPath),
    completion_audit_status: completionAudit?.status || (finalBlocked ? 'blocked' : 'passed'),
    next_action: finalBlocked ? 'Run $build again after resolving recorded blockers.' : 'Approve build -> review and run $review.',
    completion_signal: finalBlocked ? 'Build is stopped because real blockers remain recorded.' : 'execution-record.md is complete and build -> review handoff is ready.',
    execution_record_status: next.execution_record_status,
    execution_record_path: artifactPath(root, 'execution-record.md'),
    completed_at: nowIso(),
  });
  return { root, state: next };
}

function reviewFindings({ executionMeta, executionStatus, reviewer, codeReview, architectureReview }) {
  const inputManifest = ['spec.md', ...PLAN_ARTIFACTS, 'execution-record.md', 'review-support/code-review.json', 'review-support/architecture-smell.json'];
  const evidenceManifest = Array.isArray(executionMeta.evidence_manifest) ? [...executionMeta.evidence_manifest] : [];
  const scopeGate = executionScopeGate(executionMeta);
  const findings = [];
  let verdict = 'APPROVE';
  let rollbackTarget = 'none';
  let rollbackRationale = null;

  if (executionStatus !== 'complete') {
    findings.push('execution-record.md 缺少必要的执行或验证证据。');
    verdict = 'REQUEST CHANGES';
    rollbackTarget = STAGES.BUILD;
    rollbackRationale = '执行证据不完整，工作流需要回到 build 阶段补齐执行和验证证据后重新 review。';
  }
  if (!Array.isArray(executionMeta.evidence_manifest) || executionMeta.evidence_manifest.length === 0) {
    findings.push('execution-record.md 缺少必需的 evidence_manifest 结构。');
    verdict = 'REQUEST CHANGES';
    rollbackTarget = STAGES.BUILD;
    rollbackRationale = '执行证据结构不完整，review 不能接受本次运行，需要回到 build 阶段补齐 evidence_manifest。';
  }
  if (executionMeta.actor_id === reviewer) {
    findings.push('Reviewer 来源与执行者一致，不满足独立审查要求。');
    verdict = 'REQUEST CHANGES';
    rollbackTarget = 'plan';
    rollbackRationale = 'review 独立性校验失败，因为 reviewer 与执行者来源一致。';
  }
  if (!scopeGate.ok) {
    findings.push(`execution-record.md 声明只完成了部分 scope，不能批准完整工作流完成：${scopeGate.blockers.join(', ')}`);
    if (scopeGate.plannedScope) {
      findings.push(`planned_scope=${scopeGate.plannedScope}`);
    }
    if (scopeGate.implementedScope) {
      findings.push(`implemented_scope=${scopeGate.implementedScope}`);
    }
    if (scopeGate.remainingScope.length > 0) {
      findings.push(`remaining_scope=${scopeGate.remainingScope.join(', ')}`);
    }
    verdict = 'REQUEST CHANGES';
    if (rollbackTarget === 'none') {
      rollbackTarget = STAGES.BUILD;
      rollbackRationale = '执行记录显示当前 build 只完成了部分 scope，需要回到 build 继续执行剩余工作，或回到 plan 重新拆分独立 slice。';
    }
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
    if (rollbackTarget === 'none' || rollbackTarget === STAGES.BUILD) {
      rollbackTarget = codeReview.rollbackTarget || STAGES.BUILD;
    }
    rollbackRationale = rollbackTarget === STAGES.BUILD
      ? '代码审查发现实现问题，需要回到 build 阶段修复后重新 review。'
      : rollbackTarget === STAGES.CLARIFY
        ? '代码审查暴露需求歧义，需要回到 clarify 阶段重新澄清。'
        : '代码审查发现计划或架构问题，需要回到 plan 阶段修订后重新执行。';
  }
  if (architectureReview?.verdict === 'warn') {
    findings.push(`架构 smell 扫描提示风险：${architectureReview.summary}`);
    for (const finding of architectureReview.findings || []) {
      findings.push(architectureReviewFindingText(finding));
    }
  }
  if (architectureReview?.verdict === 'block') {
    findings.push(`架构 smell 扫描发现阻断问题：${architectureReview.summary}`);
    for (const finding of architectureReview.findings || []) {
      findings.push(architectureReviewFindingText(finding));
    }
    verdict = 'REQUEST CHANGES';
    rollbackTarget = architectureReview.rollbackTarget || STAGES.PLAN;
    rollbackRationale = rollbackTarget === STAGES.BUILD
      ? '架构 smell 扫描发现实现边界问题，需要回到 build 阶段修复后重新 review。'
      : rollbackTarget === STAGES.CLARIFY
        ? '架构 smell 扫描暴露需求或领域语言歧义，需要回到 clarify 阶段重新澄清。'
        : '架构 smell 扫描发现计划或模块 seam 问题，需要回到 plan 阶段修订。';
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
  const reviewSlug = String(slug || '').endsWith('execution-record.md')
    ? basename(dirname(resolve(cwd, slug)))
    : slug;
  const { root, state, slug: normalized } = await loadWorkflowState(cwd, reviewSlug, { allowLegacy: false });
  const rerunsAwaitingCompletionReview = state.current_stage === STAGES.REVIEW
    && state.review_verdict === 'approve'
    && state.pending_user_decision === TRANSITIONS.REVIEW_TO_DONE
    && state.requested_transition === TRANSITIONS.NONE;

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

	  if (state.current_stage === STAGES.REVIEW && state.approval.build === APPROVAL_STATES.APPROVED && state.requested_transition === TRANSITIONS.REVIEW_TO_BUILD && state.review_verdict === 'request-changes') {
	    const next = withRecommendedAction({
	      ...state,
	      current_stage: STAGES.BUILD,
	      stage_status: 'pending-rework',
	      review_status: 'pending-fix',
	      pending_user_decision: TRANSITIONS.NONE,
	      requested_transition: TRANSITIONS.NONE,
	      last_confirmed_transition: TRANSITIONS.REVIEW_TO_BUILD,
	      execution_record_status: 'pending-rework',
	      build_verification_status: 'pending',
	      build_architect_verification_status: 'pending',
	      build_deslop_status: state.build_no_deslop ? 'skipped' : 'pending',
	      build_regression_status: state.build_no_deslop ? 'skipped' : 'pending',
	      build_blockers: ['review_rework_required'],
	      approval: {
	        ...state.approval,
        build: APPROVAL_STATES.APPROVED,
        review: APPROVAL_STATES.NOT_REQUESTED,
        rollback: APPROVAL_STATES.NOT_REQUESTED,
        complete: APPROVAL_STATES.NOT_REQUESTED,
      },
    });
    await writeState(root, next);
    return {
      root,
      state: next,
      verdict: 'REQUEST CHANGES',
      rollbackTarget: 'build',
      reviewMessageZh: `Review 结果：${normalized} 要求修改，已回到 build 阶段。\nNext:\n${reviewReworkBuildCommand(normalized)}`,
    };
  }

  if (state.current_stage === STAGES.REVIEW && state.approval.rollback === APPROVAL_STATES.APPROVED && state.requested_transition === TRANSITIONS.REVIEW_TO_PLAN && state.review_verdict === 'request-changes') {
    const next = withRecommendedAction({
      ...state,
      current_stage: STAGES.PLAN,
	      stage_status: 'pending-rework',
	      pending_user_decision: TRANSITIONS.NONE,
	      requested_transition: TRANSITIONS.NONE,
	      last_confirmed_transition: TRANSITIONS.REVIEW_TO_PLAN,
	      plan_package_status: 'pending-rework',
	      plan_principles_resolved: false,
	      plan_options_reviewed: false,
	      plan_architect_review_status: 'pending',
	      plan_critic_verdict: 'pending',
	      plan_acceptance_criteria_testable: false,
	      plan_verification_steps_resolved: false,
	      plan_execution_inputs_resolved: false,
	      plan_docs_status: 'pending-rework',
	      plan_blockers: ['review_rework_required'],
	      plan_current_iteration: 0,
	      build_blockers: ['plan_rework_required'],
	      review_status: 'pending-fix',
      approval: {
        ...state.approval,
        plan: APPROVAL_STATES.NOT_REQUESTED,
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

  if (state.current_stage === STAGES.REVIEW && state.approval.rollback === APPROVAL_STATES.APPROVED && state.requested_transition === TRANSITIONS.REVIEW_TO_CLARIFY && state.review_verdict === 'request-changes') {
    const next = withRecommendedAction({
      ...state,
	      current_stage: STAGES.CLARIFY,
	      stage_status: 'pending-rework',
	      clarify_ambiguity_score: 1,
	      clarify_pressure_pass_complete: false,
	      clarify_non_goals_resolved: false,
	      clarify_decision_boundaries_resolved: false,
	      unresolved_ambiguity_count: Math.max(1, Number(state.unresolved_ambiguity_count || 0)),
	      plan_package_status: 'pending-rework',
	      plan_principles_resolved: false,
	      plan_options_reviewed: false,
	      plan_architect_review_status: 'pending',
	      plan_critic_verdict: 'pending',
	      plan_acceptance_criteria_testable: false,
	      plan_verification_steps_resolved: false,
	      plan_execution_inputs_resolved: false,
	      plan_docs_status: 'pending-rework',
	      plan_blockers: ['clarify_rework_required'],
      build_blockers: ['clarify_rework_required'],
      review_status: 'pending-fix',
      pending_user_decision: TRANSITIONS.NONE,
      requested_transition: TRANSITIONS.NONE,
      last_confirmed_transition: TRANSITIONS.REVIEW_TO_CLARIFY,
      approval: {
        ...state.approval,
        plan: APPROVAL_STATES.NOT_REQUESTED,
        build: APPROVAL_STATES.NOT_REQUESTED,
        review: APPROVAL_STATES.NOT_REQUESTED,
        rollback: APPROVAL_STATES.APPROVED,
        complete: APPROVAL_STATES.NOT_REQUESTED,
      },
    });
    await writeState(root, next);
    return {
      root,
      state: next,
      verdict: 'REQUEST CHANGES',
      rollbackTarget: 'clarify',
      reviewMessageZh: `Review 结果：${normalized} 要求修改，已回到 clarify 阶段。\nNext:\n$clarify ${normalized}`,
    };
  }

  if (!rerunsAwaitingCompletionReview) {
    ensureApprovedTransition(state, TRANSITIONS.BUILD_TO_REVIEW, 'review');
  }
  const { state: refreshed, executionSummary } = await refreshExecutionStatus(root, state);
  const buildOwnedChangedFilesStatus = Object.hasOwn(executionSummary.meta, 'changed_files')
    ? 'present'
    : 'unavailable';
  const buildOwnedChangedFiles = buildOwnedChangedFilesStatus === 'present' && Array.isArray(executionSummary.meta.changed_files)
    ? executionSummary.meta.changed_files
    : [];
  const reviewManifest = await readContextManifest(reviewContextManifestPath(root), { cwd });
  ensureValidContextManifest(reviewManifest, STAGES.REVIEW);
  const reviewAdapter = adapter || createDefaultReviewAdapter();
  let codeReview = null;
  try {
    codeReview = await reviewAdapter.codeReview({
      cwd,
      root,
      slug: normalized,
      reviewer,
      executionRecordPath: artifactPath(root, 'execution-record.md'),
      planArtifactPath: refreshed.plan_artifact_path,
      testSpecArtifactPath: refreshed.test_spec_artifact_path,
      buildOwnedChangedFiles,
      contextManifestStatus: reviewManifest.status,
      contextManifestPath: reviewContextManifestPath(root),
      contextManifestRows: reviewManifest.rows,
      buildOwnedChangedFilesStatus,
    });
  } catch (error) {
    codeReview = codeReviewFailureResult(error);
  }
  await ensureDir(join(root, 'review-support'));
  await writeText(join(root, 'review-support', 'code-review.json'), JSON.stringify(codeReview, null, 2));
  await writeReviewChangedFiles(root, codeReview?.changedFiles || []);
  let architectureReview = null;
  if (reviewAdapter.architectureReview) {
    try {
      architectureReview = await reviewAdapter.architectureReview({
        cwd,
        root,
        slug: normalized,
        reviewer,
        executionRecordPath: artifactPath(root, 'execution-record.md'),
        planArtifactPath: refreshed.plan_artifact_path,
        testSpecArtifactPath: refreshed.test_spec_artifact_path,
        changeArtifactPaths: refreshed.change_artifact_paths,
        buildOwnedChangedFiles,
        contextManifestStatus: reviewManifest.status,
        contextManifestPath: reviewContextManifestPath(root),
        contextManifestRows: reviewManifest.rows,
        buildOwnedChangedFilesStatus,
      });
    } catch (error) {
      architectureReview = architectureReviewFailureResult(error);
    }
  } else {
    architectureReview = {
      status: 'complete',
      verdict: 'pass',
      summary: '架构 smell 扫描通过。',
      findings: [],
    };
  }
  await writeText(join(root, 'review-support', 'architecture-smell.json'), JSON.stringify(architectureReview, null, 2));
  const reviewInput = reviewFindings({
    executionMeta: executionSummary.meta,
    executionStatus: refreshed.execution_record_status,
    reviewer,
    codeReview,
    architectureReview,
  });
  reviewInput.inputManifest = manifestRowsToInputManifest(reviewManifest.rows, reviewInput.inputManifest);
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
      architectureReview,
    }),
  );

  const reviewMessage = reviewUserMessageZh({
    slug: normalized,
    verdict: reviewInput.verdict,
    rollbackTarget: reviewInput.rollbackTarget,
    findings: reviewInput.findings,
  });
  let journal = null;
  let journalWarning = null;
  const shouldReuseReviewJournal = reviewInput.verdict === 'APPROVE'
    && rerunsAwaitingCompletionReview
    && refreshed.workspace_journal_status === 'written'
    && refreshed.workspace_journal_path;
  const shouldWriteReviewJournal = reviewInput.verdict === 'APPROVE' && !shouldReuseReviewJournal;
  if (shouldReuseReviewJournal) {
    journal = { journalPath: refreshed.workspace_journal_path };
  }
  if (shouldWriteReviewJournal) {
    try {
      journal = await writeReviewJournal({
        cwd,
        slug: normalized,
        verdict: reviewInput.verdict,
        reviewMessageZh: reviewMessage,
        evidenceManifest: reviewInput.evidenceManifest,
        followUps: ['执行 $archive；archive 会消费 pending 的 review -> done 完成态。'],
      });
    } catch (error) {
      journalWarning = error instanceof Error ? error.message : String(error);
    }
  }

  const next = withRecommendedAction({
    ...refreshed,
    current_stage: STAGES.REVIEW,
    stage_status: 'awaiting-approval',
    review_status: 'in-review',
    pending_user_decision: reviewInput.verdict === 'APPROVE' ? TRANSITIONS.REVIEW_TO_DONE : transitionForRollbackTarget(reviewInput.rollbackTarget),
    requested_transition: TRANSITIONS.NONE,
    last_confirmed_transition: TRANSITIONS.BUILD_TO_REVIEW,
    review_verdict: reviewInput.verdict === 'APPROVE' ? 'approve' : 'request-changes',
    rollback_target: reviewInput.rollbackTarget,
    rollback_rationale: reviewInput.rollbackRationale,
    context_manifest_status: reviewManifest.status,
    review_context_manifest_path: reviewContextManifestPath(root),
    workspace_journal_status: reviewInput.verdict === 'APPROVE' ? (journal ? 'written' : 'failed') : 'skipped',
    workspace_journal_path: journal?.journalPath || null,
    workspace_journal_error: journalWarning,
    approval: {
      ...refreshed.approval,
      review: APPROVAL_STATES.APPROVED,
      build: reviewInput.verdict === 'REQUEST CHANGES' && reviewInput.rollbackTarget === STAGES.BUILD ? APPROVAL_STATES.REQUESTED : refreshed.approval.build,
      rollback: reviewInput.verdict === 'APPROVE' || reviewInput.rollbackTarget === STAGES.BUILD ? APPROVAL_STATES.NOT_REQUESTED : APPROVAL_STATES.REQUESTED,
      complete: reviewInput.verdict === 'APPROVE' ? APPROVAL_STATES.REQUESTED : APPROVAL_STATES.NOT_REQUESTED,
    },
  });
  await writeState(root, next);
  return {
    root,
    state: next,
    verdict: reviewInput.verdict,
    rollbackTarget: reviewInput.rollbackTarget,
    reviewMessageZh: `${reviewMessage} 代码审查：${codeReview.summary} 架构扫描：${architectureReview.summary}${journalWarning ? ` journal 写入失败：${journalWarning}` : ''}`,
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
  const done = await approveStage(cwd, normalized, { from: STAGES.REVIEW, to: STAGES.DONE });
  recordEvent(TRANSITIONS.REVIEW_TO_DONE);
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
      archive_status: state?.archive_status ?? null,
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
  const { hook } = await doctorRuntime(cwd);
  const contextSetup = await inspectWorkspaceContext(cwd);

  if (!slug) {
    const workflows = await listWorkflowSummaries(workflowsRoot);
    return {
      initialized,
      workspaceRoot,
      config,
      workflows,
      workflow_count: workflows.length,
      summary: summarizeWorkspace(workflows),
      hook,
      contextSetup,
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
    hook,
    contextSetup,
    next_action: effectiveState ? recommendedAction(effectiveState, legacy) : 'Run loopx clarify to start a workflow.',
  };
}
