import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
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
  const match = /^prd-(.+)\.md$/.exec(name);
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

function dedupeStrings(items) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
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

function sectionTextForHeading(text, heading, level = 2) {
  const hashes = '#'.repeat(level);
  const pattern = new RegExp(`${hashes} ${heading}\\n\\n([\\s\\S]*?)(?=\\n${hashes} |$)`, 'i');
  return text.match(pattern)?.[1] || '';
}

function parseLegacyDomainDeltas(text) {
  const domains = targetDomainsForChange('general', text);
  const entries = new Map();
  for (const domain of domains) {
    const domainText = sectionTextForHeading(text, domain, 2);
    if (!domainText.trim()) {
      continue;
    }
    entries.set(domain, {
      added: bulletsFromSectionText(domainText, 'Added Requirements').filter((item) => item !== 'none'),
      modified: bulletsFromSectionText(domainText, 'Modified Requirements').filter((item) => item !== 'none'),
      removed: bulletsFromSectionText(domainText, 'Removed Requirements').filter((item) => item !== 'none'),
      scenarios: bulletsFromSectionText(domainText, 'Scenarios'),
    });
  }
  return entries;
}

function requirementsForDelta(slug, plannerDraft) {
  const requirements = String(plannerDraft.planText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, '').trim());
  return dedupeStrings(requirements.length > 0 ? requirements : [
    `Workflow ${slug} SHALL implement the approved loopx plan package.`,
  ]);
}

function verticalSlicesForChange(slug, plannerDraft) {
  const requirements = requirementsForDelta(slug, plannerDraft);
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
  const requirements = requirementsForDelta(slug, plannerDraft);
  const slices = verticalSlicesForChange(slug, plannerDraft);

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
    `# loopx Spec Delta: ${normalizedChangeId}`,
    '',
    '## Target Spec Domains',
    '',
    ...domains.map((domain) => `- ${domain}`),
    '',
    '## Added Requirements',
    '',
    ...requirements.map((item) => `- ${item}`),
    '',
    '## Modified Requirements',
    '',
    '- none',
    '',
    '## Removed Requirements',
    '',
    '- none',
    '',
    '## Scenarios',
    '',
    `- GIVEN workflow ${slug} has an approved plan`,
    '- WHEN build and review complete successfully',
    '- THEN the accepted behavior is merged into long-lived loopx specs during archive',
  ].join('\n'));

  await writeText(paths.design, [
    `# loopx Change Design: ${normalizedChangeId}`,
    '',
    '## Technical Approach',
    '',
    plannerDraft.architectureText || '- See workflow architecture artifact.',
    '',
    '## Task Plan',
    '',
    plannerDraft.developmentPlanText || '- See workflow development plan artifact.',
  ].join('\n'));

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
    const parsedDelta = parseSpecDelta(text);
    const domainDeltas = Array.from(parsedDelta.domainDeltas?.values() || []);
    const hasDomains = parsedDelta.domains.length > 0;
    const hasRequirements = parsedDelta.added.length > 0
      || parsedDelta.modified.length > 0
      || domainDeltas.some((delta) => delta.added.length > 0 || delta.modified.length > 0);
    if (!text.trim()) {
      specDeltaStatus = 'partial';
      blockers.push('spec_delta_empty');
    } else if (!hasDomains || !hasRequirements) {
      specDeltaStatus = 'partial';
      if (!hasDomains) {
        blockers.push('spec_delta_missing_domains');
      }
      if (!hasRequirements) {
        blockers.push('spec_delta_missing_requirements');
      }
    } else {
      specDeltaStatus = 'complete';
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
  const domainDeltas = parseLegacyDomainDeltas(text);
  return {
    domains: targetDomainsForChange('general', text),
    added: bulletsFromSectionText(text, 'Added Requirements').filter((item) => item !== 'none'),
    modified: bulletsFromSectionText(text, 'Modified Requirements').filter((item) => item !== 'none'),
    removed: bulletsFromSectionText(text, 'Removed Requirements').filter((item) => item !== 'none'),
    scenarios: bulletsFromSectionText(text, 'Scenarios'),
    domainDeltas,
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

function replaceChangeBlock(existing, slug, nextBlock) {
  if (!existing) {
    return nextBlock;
  }
  const marker = `### Change: ${slug}`;
  const start = existing.indexOf(marker);
  if (start === -1) {
    return [existing.replace(/\s+$/, ''), '', nextBlock].join('\n');
  }
  const before = existing.slice(0, start).replace(/\s+$/, '');
  const rest = existing.slice(start);
  const nextStart = rest.slice(marker.length).search(/\n### Change: /);
  const after = nextStart === -1 ? '' : rest.slice(marker.length + nextStart).replace(/^\s+/, '\n');
  return [before, nextBlock, after.trimEnd()].filter(Boolean).join('\n\n');
}

async function mergeSpecDeltaIntoLongLivedSpecs(cwd, slug, specDeltaPath) {
  const deltaText = await readFile(specDeltaPath, 'utf8');
  const delta = parseSpecDelta(deltaText);
  const updated = [];
  for (const domain of delta.domains) {
    const domainDelta = delta.domainDeltas?.get(domain) || delta;
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
    const changeBlock = [
      `### Change: ${slug}`,
      '',
      ...(domainDelta.added.length > 0 ? ['#### Added Requirements', '', ...domainDelta.added.map((item) => `- ${item}`), ''] : []),
      ...(domainDelta.modified.length > 0 ? ['#### Modified Requirements', '', ...domainDelta.modified.map((item) => `- ${item}`), ''] : []),
      ...(domainDelta.removed.length > 0 ? ['#### Removed Requirements', '', ...domainDelta.removed.map((item) => `- ${item}`), ''] : []),
      ...(domainDelta.scenarios.length > 0 ? ['#### Scenarios', '', ...domainDelta.scenarios.map((item) => `- ${item}`)] : []),
    ].join('\n');
    const next = replaceChangeBlock(base, slug, changeBlock);
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
  return normalizeSlug(name.replace(/^deep-interview-/, '').replace(/^clarify-/, ''));
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
    plan: artifactPath(root, 'plan.md'),
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
  const changeStatus = await readChangeArtifactStatus(state.change_artifact_paths);
  blockers.push(...changeStatus.blockers);

  return {
    blockers,
    docsStatus: blockers.some((blocker) => blocker.startsWith('missing_plan_artifact_') || blocker.startsWith('plan_artifact_not_chinese_')) ? 'partial' : 'complete',
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
  const addChecklistItem = (item) => {
    checklist.push({
      status: 'covered',
      evidence: [],
      ...item,
    });
  };

  addChecklistItem({
    id: 'approved-prd',
    source: 'approved-plan',
    requirement: state.plan_artifact_path || join(cwd, '.loopx', 'plans', `prd-${slug}.md`),
    evidence: [state.plan_artifact_path || 'approved plan artifact'],
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
    addChecklistItem({
      id: slice.id || `slice-${checklist.length + 1}`,
      source: 'vertical-slice',
      requirement: slice.behavior || slice.verification_signal || 'vertical slice',
      evidence: [
        slice.verification_signal,
        ...(iterationData.executionEvidence || []),
        ...(iterationData.verificationEvidence || []),
      ].filter(Boolean),
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
    blockers.push('missing_prd');
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
      'Clarify ambiguity score, non-goals, decision boundaries, pressure pass, and unresolved ambiguity gates are satisfied.',
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
      authorization.done.authorized ? 'The approved review -> done transition can be consumed.' : 'Completion still requires explicit review -> done authorization.',
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
        return state.approval.complete === APPROVAL_STATES.APPROVED
          ? 'Run loopx review again to consume the approved review -> done transition.'
          : 'Approve review -> done to complete the workflow.';
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
      `loopx approve ${slug} --from review --to done`,
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
    ? `下一步：批准 review -> done 后完成工作流。\n${nextCommandForRollbackTarget(slug, 'none')}`
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

export async function initWorkspace(cwd, { slug } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  await ensureLoopxRoot(cwd);
  await ensureDir(join(workspaceRoot, 'context'));
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

export async function archiveStage(cwd, slug) {
  const { root, state, slug: normalized } = await loadWorkflowState(cwd, slug, { allowLegacy: false });
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
  if (!options.directSpecPath) {
    if (consumesReviewPlan || resumesConsumedReviewPlan) {
      // A no-go review may route back to plan; the printed Next command is $plan.
    } else {
      ensureApprovedTransition(state, TRANSITIONS.CLARIFY_TO_PLAN, 'plan');
    }
    if (!consumesReviewPlan && !resumesConsumedReviewPlan && state.spec_artifact_path) {
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
    const changeId = state.change_id || changeIdForWorkflowSlug(normalized);
    const changeArtifactPaths = await writeChangeArtifacts(cwd, root, normalized, sourceText, plannerDraft, changeId);
    const changeArtifactStatus = await readChangeArtifactStatus(changeArtifactPaths);

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
      change_id: normalizeSlug(changeId),
      change_artifacts_status: changeArtifactStatus.status,
      change_artifact_paths: changeArtifactPaths,
      spec_delta_status: changeArtifactStatus.specDeltaStatus,
      slice_artifacts_status: changeArtifactStatus.sliceArtifactsStatus,
      plan_source_spec_path: sourceSpecPath,
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
    change_artifacts_status: completion.changeArtifactsStatus,
    spec_delta_status: completion.specDeltaStatus,
    slice_artifacts_status: completion.sliceArtifactsStatus,
    plan_blockers: completion.blockers,
    context_manifest_status: buildManifest ? 'hit' : 'fallback',
    build_context_manifest_path: buildManifest?.path || buildContextManifestPath(root),
  });
  await writeState(root, next);
  return { root, state: next, architectReview, criticReview };
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
      contextManifestStatus: reviewManifest.status,
      contextManifestPath: reviewContextManifestPath(root),
      contextManifestRows: reviewManifest.rows,
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
        contextManifestStatus: reviewManifest.status,
        contextManifestPath: reviewContextManifestPath(root),
        contextManifestRows: reviewManifest.rows,
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
        followUps: ['等待 review -> done 审批。'],
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
