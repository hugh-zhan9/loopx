import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { inspectWorkspaceContext, resolveWorkspaceContextPaths } from './workspace-context.mjs';

export const CONTEXT_MANIFEST_SCHEMA_VERSION = 1;
const MAX_MANIFEST_ROWS = 80;

function normalizePath(cwd, path) {
  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);
  return rel && !rel.startsWith('..') ? rel : resolved;
}

function normalizeReason(reason) {
  if (Array.isArray(reason)) {
    return reason.filter(Boolean).map(String).join(',');
  }
  return String(reason || 'context');
}

function row(cwd, { stage, kind, path, reason, priority, required = true }) {
  const normalizedPath = normalizePath(cwd, path);
  return {
    schema_version: CONTEXT_MANIFEST_SCHEMA_VERSION,
    stage,
    kind,
    path: normalizedPath,
    reason: normalizeReason(reason),
    priority,
    required: Boolean(required),
    exists: existsSync(resolve(cwd, normalizedPath)),
  };
}

function stableRows(rows) {
  const byPath = new Map();
  for (const item of rows) {
    const key = `${item.stage}:${item.kind}:${item.path}`;
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, item);
      continue;
    }
    const reasons = new Set([
      ...existing.reason.split(',').map((value) => value.trim()).filter(Boolean),
      ...item.reason.split(',').map((value) => value.trim()).filter(Boolean),
    ]);
    byPath.set(key, {
      ...existing,
      priority: Math.min(existing.priority, item.priority),
      required: existing.required || item.required,
      reason: [...reasons].sort().join(','),
    });
  }
  return [...byPath.values()]
    .sort((left, right) => (
      left.priority - right.priority
      || left.stage.localeCompare(right.stage)
      || left.kind.localeCompare(right.kind)
      || left.path.localeCompare(right.path)
    ))
    .slice(0, MAX_MANIFEST_ROWS);
}

export async function writeContextManifest(path, rows) {
  const text = stableRows(rows).map((item) => JSON.stringify(item)).join('\n');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${text}\n`);
}

export async function readContextManifest(path, options = {}) {
  if (!existsSync(path)) {
    return { status: 'fallback', rows: [], error: null };
  }
  try {
    const text = await readFile(path, 'utf8');
    const cwd = resolve(options.cwd || process.cwd());
    const rows = text.trim()
      ? text.trim().split('\n').map((line) => JSON.parse(line))
      : [];
    if (rows.length === 0) {
      return { status: 'invalid', rows: [], error: 'empty_manifest' };
    }
    const valid = rows.every((item) => (
      item
      && item.schema_version === CONTEXT_MANIFEST_SCHEMA_VERSION
      && typeof item.path === 'string'
      && item.path.length > 0
      && typeof item.kind === 'string'
      && item.kind.length > 0
      && typeof item.stage === 'string'
      && item.stage.length > 0
      && typeof item.reason === 'string'
      && item.reason.length > 0
      && typeof item.priority === 'number'
      && Number.isFinite(item.priority)
      && typeof item.required === 'boolean'
      && typeof item.exists === 'boolean'
    ));
    if (!valid) {
      return { status: 'invalid', rows: [], error: 'invalid_manifest_row' };
    }
    const missingRequired = rows.find((item) => item.required && (!item.exists || !existsSync(resolve(cwd, item.path))));
    if (missingRequired) {
      return { status: 'invalid', rows, error: `missing_required_context:${missingRequired.kind}` };
    }
    return { status: 'hit', rows, error: null };
  } catch (error) {
    return { status: 'invalid', rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildContextManifestPath(root) {
  return join(root, 'build-context.jsonl');
}

export function reviewContextManifestPath(root) {
  return join(root, 'review-context.jsonl');
}

export async function generateBuildContextManifest({ cwd, root, state, slug }) {
  const contextPaths = resolveWorkspaceContextPaths(cwd);
  const contextSetup = await inspectWorkspaceContext(cwd);
  const reviewReworkPath = state.review_rework_artifact_path || join(root, 'review-report.md');
  const requiresReviewRework = state.last_confirmed_transition === 'review->build'
    || (state.current_stage === 'review' && state.rollback_target === 'build');
  const rows = [
    row(cwd, { stage: 'build', kind: 'spec', path: join(root, 'spec.md'), reason: 'clarified_requirements', priority: 10 }),
    row(cwd, { stage: 'build', kind: 'plan', path: join(root, 'plan.md'), reason: 'implementation_strategy', priority: 20 }),
    row(cwd, { stage: 'build', kind: 'architecture', path: join(root, 'architecture.md'), reason: 'architecture_constraints', priority: 21 }),
    row(cwd, { stage: 'build', kind: 'development-plan', path: join(root, 'development-plan.md'), reason: 'execution_steps', priority: 22 }),
    row(cwd, { stage: 'build', kind: 'test-plan', path: join(root, 'test-plan.md'), reason: 'verification_strategy', priority: 23 }),
    row(cwd, { stage: 'build', kind: 'prd', path: state.plan_artifact_path || join(cwd, '.loopx', 'plans', `prd-${slug}.md`), reason: 'requirements', priority: 30 }),
    row(cwd, { stage: 'build', kind: 'test-spec', path: state.test_spec_artifact_path || join(cwd, '.loopx', 'plans', `test-spec-${slug}.md`), reason: 'test_requirements', priority: 31 }),
    row(cwd, { stage: 'build', kind: 'vertical-slices', path: state.change_artifact_paths?.slices || join(cwd, '.loopx', 'changes', 'active', state.change_id || `chg-${slug}`, 'slices.json'), reason: 'end_to_end_delivery_slices', priority: 32 }),
    row(cwd, { stage: 'build', kind: 'review-rework', path: reviewReworkPath, reason: 'review_requested_implementation_fixes', priority: 33, required: requiresReviewRework }),
    row(cwd, { stage: 'build', kind: 'domain-context', path: contextPaths.domainGlossary, reason: 'domain_vocabulary', priority: 34, required: contextSetup.status !== 'missing' }),
    row(cwd, { stage: 'build', kind: 'agent-domain', path: contextPaths.agentDomain, reason: 'agent_context_rules', priority: 35, required: false }),
    row(cwd, { stage: 'build', kind: 'workspace-config', path: join(cwd, '.loopx', 'config.json'), reason: 'project_rules_spec_sources_and_verification_commands', priority: 36, required: false }),
  ];
  const manifestPath = buildContextManifestPath(root);
  await writeContextManifest(manifestPath, rows);
  return { path: manifestPath, rows: stableRows(rows) };
}

export async function generateReviewContextManifest({ cwd, root, state, slug }) {
  const contextPaths = resolveWorkspaceContextPaths(cwd);
  const contextSetup = await inspectWorkspaceContext(cwd);
  const rows = [
    row(cwd, { stage: 'review', kind: 'execution-record', path: join(root, 'execution-record.md'), reason: 'execution_evidence', priority: 10 }),
    row(cwd, { stage: 'review', kind: 'test-spec', path: state.test_spec_artifact_path || join(cwd, '.loopx', 'plans', `test-spec-${slug}.md`), reason: 'acceptance_tests', priority: 20 }),
    row(cwd, { stage: 'review', kind: 'prd', path: state.plan_artifact_path || join(cwd, '.loopx', 'plans', `prd-${slug}.md`), reason: 'requirements', priority: 21 }),
    row(cwd, { stage: 'review', kind: 'vertical-slices', path: state.change_artifact_paths?.slices || join(cwd, '.loopx', 'changes', 'active', state.change_id || `chg-${slug}`, 'slices.json'), reason: 'slice_verification_contract', priority: 22 }),
    row(cwd, { stage: 'review', kind: 'domain-context', path: contextPaths.domainGlossary, reason: 'terminology_and_boundary_review', priority: 23, required: contextSetup.status !== 'missing' }),
    row(cwd, { stage: 'review', kind: 'changed-files', path: join(root, 'review-support', 'changed-files.json'), reason: 'changed_file_evidence', priority: 25, required: false }),
    row(cwd, { stage: 'review', kind: 'residual-risks', path: join(root, 'execution-record.md'), reason: 'residual_risk_reference', priority: 26, required: false }),
    row(cwd, { stage: 'review', kind: 'build-support', path: join(root, 'build-support'), reason: 'build_gate_evidence', priority: 30, required: false }),
    row(cwd, { stage: 'review', kind: 'agent-domain', path: contextPaths.agentDomain, reason: 'agent_context_rules', priority: 31, required: false }),
    row(cwd, { stage: 'review', kind: 'workspace-config', path: join(cwd, '.loopx', 'config.json'), reason: 'project_rules_spec_sources_and_verification_commands', priority: 32, required: false }),
    row(cwd, { stage: 'review', kind: 'state', path: join(root, 'state.json'), reason: 'workflow_state', priority: 40 }),
  ];
  const manifestPath = reviewContextManifestPath(root);
  await writeContextManifest(manifestPath, rows);
  return { path: manifestPath, rows: stableRows(rows) };
}

export function manifestRowsToInputManifest(rows, fallback = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return fallback;
  }
  return rows.map((item) => `${item.kind}:${item.path}:${item.reason}`);
}
