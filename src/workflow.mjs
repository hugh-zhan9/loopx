import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureLoopxRoot, resolveLoopxRoot } from './runtime-maintenance.mjs';
import { inspectProjectConventions } from './project-discovery.mjs';
import { inspectWorkspaceContext, setupWorkspaceContext } from './workspace-context.mjs';
import { discoverLoopxContextArtifacts } from './loopx-context-artifacts.mjs';
import { nextSkillCommand } from './next-skill.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_SCHEMA_VERSION = 1;
const WORKFLOW_SCHEMA_VERSION = 2;

export const STAGES = {
  CLARIFY: 'clarify',
  DONE: 'done',
};

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

const CLARIFY_HANDOFF_DECISIONS = new Set(['needs_spec', 'direct_to_plan', 'blocked']);

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

function normalizeClarifyProfile(raw) {
  const value = String(raw || 'standard').trim().toLowerCase();
  if (!(value in CLARIFY_PROFILES)) {
    throw new Error(`invalid_clarify_profile:${value}`);
  }
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function nowStamp() {
  return nowIso().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function writeText(path, text) {
  await ensureDir(dirname(path));
  await writeFile(path, `${String(text).replace(/\s+$/, '')}\n`);
}

function workspaceConfigPath(workspaceRoot) {
  return join(workspaceRoot, 'config.json');
}

function workspaceReadmePath(workspaceRoot) {
  return join(workspaceRoot, 'README.md');
}

function statePath(root) {
  return join(root, 'state.json');
}

function artifactPath(root, name) {
  return join(root, name);
}

export function resolveWorkspaceRoot(cwd) {
  return resolveLoopxRoot(cwd);
}

export function resolveWorkflowRoot(cwd, slug) {
  return join(resolveWorkspaceRoot(cwd), 'workflows', normalizeSlug(slug));
}

function resolveIntakeRoot(cwd) {
  return join(resolveWorkspaceRoot(cwd), 'intake');
}

function intakeDateStamp() {
  return nowIso().slice(0, 10);
}

function intakeTimeSuffix() {
  return nowIso().slice(11, 19).replaceAll(':', '');
}

function intakePackageName(slug, suffix = null) {
  const base = `${intakeDateStamp()}-${normalizeSlug(slug)}`;
  return suffix ? `${base}-${suffix}` : base;
}

function intakePackagePath(cwd, slug, suffix = null) {
  return join(resolveIntakeRoot(cwd), intakePackageName(slug, suffix));
}

function intakeChildPaths(packagePath) {
  return {
    clarification_path: join(packagePath, 'clarification.md'),
    requirements_path: join(packagePath, 'requirements.md'),
  };
}

function legacyClarifySpecPath(cwd, slug, stamp) {
  return join(resolveIntakeRoot(cwd), `clarify-${normalizeSlug(slug)}-${stamp}.md`);
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
  const state = JSON.parse(await readFile(path, 'utf8'));
  if (state.schema_version !== WORKFLOW_SCHEMA_VERSION) {
    throw new Error(`unsupported_workflow_schema:${state.schema_version ?? 'missing'}:restart_required`);
  }
  return state;
}

function buildWorkspaceReadme() {
  return [
    '# loopx Workspace',
    '',
    'This directory is initialized for the loopx skill-first helper contract.',
    '',
    '## Workflow Intents',
    '',
    '`clarify`, `spec`, `plan2exec`, `exec`, `review`, and `finish` are optional governed intents, not a required sequence.',
    '',
    '## User Commands',
    '',
    '- `loopx init [--slug <slug>]`',
    '- `loopx clarify <slug> [--standard|--deep] [--json]`',
    '- `loopx render [slug|--all]`',
    '- `loopx status [slug] [--json]`',
    '- `loopx next <slug> [--json]`',
    '- `loopx setup-context`',
    '- `loopx doctor`',
    '- `loopx repair-install`',
    '',
    '## Document Boundaries',
    '',
    'Retained loopx-owned runtime files:',
    '',
    '- `workflows/<slug>/state.json`',
    '- `workflows/<slug>/spec.md`',
    '- `intake/YYYY-MM-DD-<slug>/` clarify intake packages (`clarification.md`, `requirements.md`)',
    '- historical `intake/clarify-*.md` clarify snapshots may exist from older loopx versions',
    '- `context/domain.md` and `agents/*.md` for project context and collaboration guidance',
    '- `views/` and `workflows/<slug>/view/` generated HTML views',
  ].join('\n');
}

function createInitialState(slug, profile) {
  const clarifyProfile = CLARIFY_PROFILES[profile];
  const state = {
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
    intake_package_path: null,
    clarification_path: null,
    requirements_path: null,
    spec_artifact_path: null,
    handoff_decision: 'blocked',
    recommended_next_action: `Run $clarify ${slug} until the spec is handoff-ready.`,
  };
  return withRecommendedAction(state);
}

function parseFrontmatter(text) {
  if (!String(text || '').startsWith('---\n')) {
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
    } else if (rawValue === 'true' || rawValue === 'false') {
      result[key] = rawValue === 'true';
    } else if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      result[key] = Number(rawValue);
    } else if (rawValue.startsWith('[') || rawValue.startsWith('{')) {
      try {
        result[key] = JSON.parse(rawValue);
      } catch {
        result[key] = rawValue;
      }
    } else {
      result[key] = rawValue;
    }
  }
  return result;
}

function parseScalar(value) {
  const rawValue = String(value ?? '').trim();
  if (rawValue === 'null') {
    return null;
  }
  if (rawValue === 'true' || rawValue === 'false') {
    return rawValue === 'true';
  }
  if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
    return Number(rawValue);
  }
  return rawValue;
}

function parseResumeState(text) {
  const lines = String(text || '').split('\n');
  const start = lines.findLastIndex((line) => /^##\s+Resume State\s*$/i.test(line.trim()));
  if (start === -1) {
    return {};
  }
  const result = {};
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    const item = line.match(/^\s*[-*]\s+([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!item) {
      continue;
    }
    result[item[1]] = parseScalar(item[2]);
  }
  return result;
}

async function readClarifySummary(root, state) {
  const path = state?.clarification_path || artifactPath(root, 'spec.md');
  if (!existsSync(path)) {
    return null;
  }
  const text = await readFile(path, 'utf8');
  const meta = {
    ...parseFrontmatter(text),
    ...parseResumeState(text),
  };
  return {
    path,
    meta,
  };
}

function withClarifySummary(state, specSummary) {
  if (!specSummary?.meta) {
    return state;
  }
  const meta = specSummary.meta;
  const unresolved = Number(meta.unresolved_count ?? meta.unresolved_ambiguity_count ?? state.unresolved_ambiguity_count ?? 0);
  const next = {
    ...state,
    clarify_current_round: Number(meta.current_round ?? state.clarify_current_round ?? 0),
    clarify_ambiguity_score: Number(meta.ambiguity_score ?? state.clarify_ambiguity_score ?? 1),
    clarify_non_goals_resolved: Boolean(meta.non_goals_resolved ?? state.clarify_non_goals_resolved),
    clarify_decision_boundaries_resolved: Boolean(meta.decision_boundaries_resolved ?? state.clarify_decision_boundaries_resolved),
    clarify_pressure_pass_complete: Boolean(meta.pressure_pass_complete ?? state.clarify_pressure_pass_complete),
    unresolved_ambiguity_count: Number.isFinite(unresolved) ? unresolved : state.unresolved_ambiguity_count,
    handoff_decision: CLARIFY_HANDOFF_DECISIONS.has(meta.handoff_decision)
      ? meta.handoff_decision
      : 'blocked',
  };
  return withRecommendedAction({
    ...next,
    stage_status: clarifyReady(next) && next.handoff_decision !== 'blocked' ? 'ready' : 'blocked',
  });
}

function clarifyReady(state) {
  return state.current_stage === STAGES.CLARIFY
    && Number(state.clarify_current_round || 0) > 0
    && Number(state.unresolved_ambiguity_count || 0) === 0
    && state.clarify_non_goals_resolved === true
    && state.clarify_decision_boundaries_resolved === true
    && state.clarify_pressure_pass_complete === true;
}

function recommendedAction(state) {
  const next = nextSkillCommand(state);
  if (next) {
    return `Follow ${next}.`;
  }
  if (state?.current_stage === STAGES.CLARIFY) {
    return `Run $clarify ${state.slug} until the spec is handoff-ready.`;
  }
  if (state?.current_stage === STAGES.DONE || state?.completion_confirmed === true) {
    return 'Follow $finish.';
  }
  return 'Run loopx status for the next step.';
}

function withRecommendedAction(state) {
  const next = nextSkillCommand(state);
  return {
    ...state,
    next_skill_command: next,
    recommended_next_action: recommendedAction({ ...state, next_skill_command: next }),
  };
}

async function renderTemplate(name, replacements) {
  const templatePath = resolve(MODULE_DIR, '..', 'templates', name);
  let text = await readFile(templatePath, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    text = text.replaceAll(`<${key}>`, String(value));
  }
  return text;
}

async function writeTemplateArtifact(root, name, replacements) {
  await writeText(join(root, name), await renderTemplate(name, replacements));
}

async function writeTemplateToPath(target, templateName, replacements) {
  await writeText(target, await renderTemplate(templateName, replacements));
}

async function createIntakePackage(cwd, slug, replacements) {
  let packagePath = intakePackagePath(cwd, slug);
  if (existsSync(packagePath)) {
    packagePath = intakePackagePath(cwd, slug, intakeTimeSuffix());
  }
  let counter = 2;
  while (existsSync(packagePath)) {
    packagePath = intakePackagePath(cwd, slug, `${intakeTimeSuffix()}-${counter}`);
    counter += 1;
  }

  await ensureDir(packagePath);
  const childPaths = intakeChildPaths(packagePath);
  await writeTemplateToPath(childPaths.clarification_path, 'intake-clarification.md', replacements);
  await writeTemplateToPath(childPaths.requirements_path, 'intake-requirements.md', replacements);

  return {
    intake_package_path: packagePath,
    ...childPaths,
  };
}

function workflowArtifactStatus(root, state) {
  const specPath = state?.spec_artifact_path || join(root, 'spec.md');
  const intakePackagePath = state?.intake_package_path || null;
  const clarificationPath = state?.clarification_path || null;
  const requirementsPath = state?.requirements_path || specPath;
  const artifacts = {
    'spec.md': existsSync(join(root, 'spec.md')),
    requirements_path: requirementsPath,
    requirements_exists: requirementsPath ? existsSync(requirementsPath) : false,
    spec_artifact_path: specPath,
    spec_artifact_exists: existsSync(specPath),
  };
  if (intakePackagePath) {
    artifacts.intake_package_path = intakePackagePath;
    artifacts.intake_package_exists = existsSync(intakePackagePath);
  }
  if (clarificationPath) {
    artifacts.clarification_path = clarificationPath;
    artifacts.clarification_exists = existsSync(clarificationPath);
  }
  return artifacts;
}

async function listWorkflowSummaries(workflowsRoot) {
  if (!existsSync(workflowsRoot)) {
    return [];
  }
  const entries = await readdir(workflowsRoot, { withFileTypes: true });
  const workflows = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) {
      continue;
    }
    const stateFile = join(workflowsRoot, entry.name, 'state.json');
    const state = existsSync(stateFile) ? JSON.parse(await readFile(stateFile, 'utf8')) : null;
    if (state && state.schema_version !== WORKFLOW_SCHEMA_VERSION) {
      throw new Error(`unsupported_workflow_schema:${state.schema_version ?? 'missing'}:restart_required`);
    }
    workflows.push({
      slug: entry.name,
      current_stage: state?.current_stage ?? null,
      stage_status: state?.stage_status ?? null,
      next_skill_command: nextSkillCommand(state),
      contract: 'loopx-skill-first',
    });
  }
  return workflows;
}

function summarizeWorkspace(workflows) {
  return {
    total: workflows.length,
    clarify: workflows.filter((workflow) => workflow.current_stage === STAGES.CLARIFY).length,
    done: workflows.filter((workflow) => workflow.current_stage === STAGES.DONE).length,
  };
}

export async function initWorkspace(cwd, { slug } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const projectConventions = await inspectProjectConventions(cwd);
  await ensureLoopxRoot(cwd);
  await ensureDir(join(workspaceRoot, 'context'));
  await ensureDir(join(workspaceRoot, 'intake'));
  await ensureDir(join(workspaceRoot, 'workflows'));
  await ensureDir(join(workspaceRoot, 'specs'));
  await ensureDir(join(workspaceRoot, 'plans'));
  await setupWorkspaceContext(cwd);

  const config = {
    schema_version: WORKSPACE_SCHEMA_VERSION,
    tool: 'loopx',
    product_contract: 'skill-first-helper',
    workflow_intents: ['clarify', 'spec', 'plan', 'exec', 'review', 'finish'],
    source_of_truth_policy: projectConventions.source_of_truth_policy,
    project_conventions: {
      existing_ai_rules: projectConventions.existing_ai_rules,
      existing_spec_sources: projectConventions.existing_spec_sources,
    },
    verification_commands: projectConventions.verification_commands,
  };

  if (!existsSync(workspaceConfigPath(workspaceRoot))) {
    await writeText(workspaceConfigPath(workspaceRoot), JSON.stringify(config, null, 2));
  }
  if (!existsSync(workspaceReadmePath(workspaceRoot))) {
    await writeText(workspaceReadmePath(workspaceRoot), buildWorkspaceReadme());
  }

  const workflow = slug ? await clarifyStage(cwd, slug) : null;
  return { workspaceRoot, config, workflow };
}

export async function clarifyStage(cwd, slug, { profile = 'standard' } = {}) {
  const normalized = normalizeSlug(slug);
  const clarifyProfile = normalizeClarifyProfile(profile);
  const root = resolveWorkflowRoot(cwd, normalized);
  const existing = await readState(cwd, normalized);
  await ensureLoopxRoot(cwd);
  await ensureDir(root);
  const replacements = {
    'task name': normalized,
    'workflow id': normalized,
    profile: clarifyProfile,
    'target ambiguity threshold': CLARIFY_PROFILES[clarifyProfile].threshold,
    'max rounds': CLARIFY_PROFILES[clarifyProfile].maxRounds,
  };
  if (!existsSync(join(root, 'spec.md'))) {
    await writeTemplateArtifact(root, 'spec.md', replacements);
  }
  const intakePackage = await createIntakePackage(cwd, normalized, replacements);
  const base = existing || createInitialState(normalized, clarifyProfile);
  const state = withRecommendedAction({
    ...base,
    schema_version: WORKFLOW_SCHEMA_VERSION,
    slug: normalized,
    current_stage: STAGES.CLARIFY,
    stage_status: 'blocked',
    clarify_profile: clarifyProfile,
    clarify_target_ambiguity_threshold: CLARIFY_PROFILES[clarifyProfile].threshold,
    clarify_max_rounds: CLARIFY_PROFILES[clarifyProfile].maxRounds,
    intake_package_path: intakePackage.intake_package_path,
    clarification_path: intakePackage.clarification_path,
    requirements_path: intakePackage.requirements_path,
    spec_artifact_path: intakePackage.requirements_path,
  });
  await writeText(statePath(root), JSON.stringify(state, null, 2));
  return { root, state };
}

export async function statusSummary(cwd, slug) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const initialized = existsSync(workspaceRoot);
  const config = await readWorkspaceConfig(cwd);
  const workflowsRoot = join(workspaceRoot, 'workflows');
  const contextSetup = await inspectWorkspaceContext(cwd);
  const contextArtifacts = await discoverLoopxContextArtifacts(cwd);

  if (!slug) {
    const workflows = await listWorkflowSummaries(workflowsRoot);
    return {
      initialized,
      workspaceRoot,
      config,
      workflows,
      workflow_count: workflows.length,
      summary: summarizeWorkspace(workflows),
      contextSetup,
      contextArtifacts,
      next_action: initialized ? 'Run loopx clarify <slug> to start a workflow, or inspect one with loopx status <slug>.' : 'Run loopx init to prepare the workspace.',
    };
  }

  const normalized = normalizeSlug(slug);
  const root = resolveWorkflowRoot(cwd, normalized);
  const state = await readState(cwd, normalized);
  const clarifySummary = state ? await readClarifySummary(root, state) : null;
  const statusState = state?.current_stage === STAGES.CLARIFY
    ? withClarifySummary(state, clarifySummary)
    : withRecommendedAction(state);
  const artifacts = state ? workflowArtifactStatus(root, statusState) : {};
  const missing = Object.entries(artifacts)
    .filter(([key, present]) => key.endsWith('_exists') && present === false)
    .map(([name]) => name.replace(/_exists$/, ''));
  return {
    initialized,
    workspaceRoot,
    config,
    slug: normalized,
    root,
    state: statusState,
    contract: 'loopx-skill-first',
    schema_version: statusState?.schema_version ?? 0,
    artifacts,
    missing_artifacts: missing,
    contextSetup,
    contextArtifacts,
    next_skill_command: nextSkillCommand(statusState),
    intake_package_path: statusState?.intake_package_path ?? null,
    clarification_path: statusState?.clarification_path ?? null,
    requirements_path: statusState?.requirements_path ?? null,
    spec_artifact_path: statusState?.spec_artifact_path ?? null,
    next_action: statusState ? recommendedAction(statusState) : 'Run loopx clarify to start a workflow.',
  };
}
