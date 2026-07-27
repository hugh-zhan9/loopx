import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverLoopxContextArtifacts } from './loopx-context-artifacts.mjs';
import { inspectProjectConventions } from './project-discovery.mjs';
import { ensureLoopxRoot, resolveLoopxRoot } from './runtime-maintenance.mjs';
import { inspectWorkspaceContext, setupWorkspaceContext } from './workspace-context.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_SCHEMA_VERSION = 2;
const DOCUMENT_INDEX_SCHEMA_VERSION = 3;

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

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function writeText(path, text) {
  await ensureDir(dirname(path));
  await writeFile(path, `${String(text).replace(/\s+$/, '')}\n`);
}

export function resolveWorkspaceRoot(cwd) {
  return resolveLoopxRoot(cwd);
}

export function resolveWorkflowRoot(cwd, slug) {
  return join(resolveWorkspaceRoot(cwd), 'workflows', normalizeSlug(slug));
}

function workspaceConfigPath(workspaceRoot) {
  return join(workspaceRoot, 'config.json');
}

function workspaceReadmePath(workspaceRoot) {
  return join(workspaceRoot, 'README.md');
}

function documentIndexPath(root) {
  return join(root, 'documents.json');
}

function legacyStatePath(root) {
  return join(root, 'state.json');
}

function resolveIntakeRoot(cwd) {
  return join(resolveWorkspaceRoot(cwd), 'intake');
}

function intakePackageName(slug, suffix = null) {
  const base = `${nowIso().slice(0, 10)}-${normalizeSlug(slug)}`;
  return suffix ? `${base}-${suffix}` : base;
}

function intakeTimeSuffix() {
  return nowIso().slice(11, 19).replaceAll(':', '');
}

function intakeChildPaths(packagePath) {
  return {
    clarification_path: join(packagePath, 'clarification.md'),
    requirements_path: join(packagePath, 'requirements.md'),
  };
}

function normalizeDocumentIndex(index, root, slug) {
  if (!index) {
    return null;
  }
  return {
    schema_version: DOCUMENT_INDEX_SCHEMA_VERSION,
    contract: 'loopx-docs-first',
    slug: index.slug || slug,
    working_copy_path: index.working_copy_path || join(root, 'spec.md'),
    intake_package_path: index.intake_package_path || null,
    clarification_path: index.clarification_path || null,
    requirements_path: index.requirements_path || index.spec_artifact_path || null,
    spec_artifact_path: index.requirements_path || index.spec_artifact_path || join(root, 'spec.md'),
  };
}

export async function readDocumentIndex(cwd, slug) {
  const normalized = normalizeSlug(slug);
  const root = resolveWorkflowRoot(cwd, normalized);
  const currentPath = documentIndexPath(root);
  const fallbackPath = legacyStatePath(root);
  const path = existsSync(currentPath) ? currentPath : fallbackPath;
  if (!existsSync(path)) {
    return null;
  }
  return normalizeDocumentIndex(JSON.parse(await readFile(path, 'utf8')), root, normalized);
}

export async function readWorkspaceConfig(cwd) {
  const path = workspaceConfigPath(resolveWorkspaceRoot(cwd));
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

function buildWorkspaceReadme() {
  return [
    '# loopx Workspace',
    '',
    'This directory contains docs-first loopx artifacts.',
    '',
    '## Document Intents',
    '',
    '`clarify`, `spec`, and `plan2exec` produce documents. They do not control model execution.',
    '',
    '## User Commands',
    '',
    '- `loopx init [--slug <slug>]`',
    '- `loopx clarify <slug> [--json]`',
    '- `loopx render [slug|--all]`',
    '- `loopx status [slug] [--json]`',
    '- `loopx setup-context`',
    '- `loopx doctor`',
    '- `loopx repair-install`',
    '',
    '## Stored Artifacts',
    '',
    '- `workflows/<slug>/documents.json` indexes document paths.',
    '- `workflows/<slug>/spec.md` is a local working copy.',
    '- `intake/YYYY-MM-DD-<slug>/` contains `clarification.md` and `requirements.md`.',
    '- `context/domain.md` contains project terms, boundaries, and evidence sources.',
    '- `views/` and `workflows/<slug>/view/` contain generated HTML views.',
  ].join('\n');
}

async function renderTemplate(name, replacements) {
  const templatePath = resolve(MODULE_DIR, '..', 'templates', name);
  let text = await readFile(templatePath, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    text = text.replaceAll(`<${key}>`, String(value));
  }
  return text;
}

async function writeTemplate(target, templateName, replacements) {
  await writeText(target, await renderTemplate(templateName, replacements));
}

async function createIntakePackage(cwd, slug, replacements) {
  let packagePath = join(resolveIntakeRoot(cwd), intakePackageName(slug));
  if (existsSync(packagePath)) {
    packagePath = join(resolveIntakeRoot(cwd), intakePackageName(slug, intakeTimeSuffix()));
  }
  let counter = 2;
  while (existsSync(packagePath)) {
    packagePath = join(resolveIntakeRoot(cwd), intakePackageName(slug, `${intakeTimeSuffix()}-${counter}`));
    counter += 1;
  }

  await ensureDir(packagePath);
  const paths = intakeChildPaths(packagePath);
  await writeTemplate(paths.clarification_path, 'intake-clarification.md', replacements);
  await writeTemplate(paths.requirements_path, 'intake-requirements.md', replacements);
  return { intake_package_path: packagePath, ...paths };
}

function artifactStatus(root, documents) {
  const paths = {
    working_copy: documents?.working_copy_path || join(root, 'spec.md'),
    intake_package: documents?.intake_package_path || null,
    clarification: documents?.clarification_path || null,
    requirements: documents?.requirements_path || null,
  };
  return Object.fromEntries(Object.entries(paths).flatMap(([name, path]) => [
    [`${name}_path`, path],
    [`${name}_exists`, Boolean(path) && existsSync(path)],
  ]));
}

async function listWorkflowSummaries(cwd) {
  const workflowsRoot = join(resolveWorkspaceRoot(cwd), 'workflows');
  if (!existsSync(workflowsRoot)) {
    return [];
  }
  const entries = await readdir(workflowsRoot, { withFileTypes: true });
  const workflows = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) {
      continue;
    }
    const documents = await readDocumentIndex(cwd, entry.name);
    workflows.push({
      slug: entry.name,
      contract: 'loopx-docs-first',
      document_count: documents
        ? [documents.working_copy_path, documents.clarification_path, documents.requirements_path].filter(Boolean).length
        : 0,
    });
  }
  return workflows;
}

export async function initWorkspace(cwd, { slug } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const projectConventions = await inspectProjectConventions(cwd);
  await ensureLoopxRoot(cwd);
  for (const directory of ['context', 'intake', 'workflows', 'specs', 'plans']) {
    await ensureDir(join(workspaceRoot, directory));
  }
  await setupWorkspaceContext(cwd);

  const config = {
    schema_version: WORKSPACE_SCHEMA_VERSION,
    tool: 'loopx',
    product_contract: 'docs-first',
    document_intents: ['clarify', 'spec', 'plan2exec'],
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

export async function clarifyStage(cwd, slug) {
  const normalized = normalizeSlug(slug);
  const root = resolveWorkflowRoot(cwd, normalized);
  const replacements = { 'task name': normalized, 'workflow id': normalized };
  await ensureLoopxRoot(cwd);
  await ensureDir(root);

  const workingCopyPath = join(root, 'spec.md');
  if (!existsSync(workingCopyPath)) {
    await writeTemplate(workingCopyPath, 'spec.md', replacements);
  }
  const intakePackage = await createIntakePackage(cwd, normalized, replacements);
  const documents = normalizeDocumentIndex({
    slug: normalized,
    working_copy_path: workingCopyPath,
    ...intakePackage,
  }, root, normalized);
  await writeText(documentIndexPath(root), JSON.stringify(documents, null, 2));
  return { root, documents };
}

export async function statusSummary(cwd, slug) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const initialized = existsSync(workspaceRoot);
  const config = await readWorkspaceConfig(cwd);
  const contextSetup = await inspectWorkspaceContext(cwd);
  const contextArtifacts = await discoverLoopxContextArtifacts(cwd);

  if (!slug) {
    const workflows = await listWorkflowSummaries(cwd);
    return {
      initialized,
      workspaceRoot,
      config,
      workflows,
      workflow_count: workflows.length,
      contextSetup,
      contextArtifacts,
    };
  }

  const normalized = normalizeSlug(slug);
  const root = resolveWorkflowRoot(cwd, normalized);
  const documents = await readDocumentIndex(cwd, normalized);
  const artifacts = documents ? artifactStatus(root, documents) : {};
  const missing = Object.entries(artifacts)
    .filter(([key, present]) => key.endsWith('_exists') && present === false)
    .map(([name]) => name.replace(/_exists$/, ''));
  return {
    initialized,
    workspaceRoot,
    config,
    slug: normalized,
    root,
    contract: 'loopx-docs-first',
    documents,
    artifacts,
    missing_artifacts: missing,
    contextSetup,
    contextArtifacts,
  };
}
