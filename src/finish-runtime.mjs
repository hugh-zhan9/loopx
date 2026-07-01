import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FINISH_SCHEMA_VERSION = 1;
const EXECUTION_RANGE_SCHEMA_VERSION = 1;
const MULTI_PLAN_SCHEMA_VERSION = 2;
const MULTI_PLAN_PACKAGE_PATTERN = /^docs\/loopx\/plans\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\/(?:00-overview|[0-9]{2}-[a-z0-9-]+)\.md$/;
const DEFAULT_NO_CANDIDATES_REASON = 'No accepted or rejected candidates were recorded at audit start.';
const MAX_AUDIT_ID_COLLISIONS = 1000;
const FINISH_RECORD_STATE_STATUSES = ['needs-agent-audit', 'audited', 'choice-recorded', 'completed', 'failed'];
const EXTRACTION_SURFACE_PREFIXES = [
  'src',
  'skills',
  'scripts',
  'templates',
  'docs',
  'test',
  'README.md',
  'README.zh-CN.md',
];

function normalizeSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function finishStamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

function finishAuditId(slug, date = new Date()) {
  return `${finishStamp(date)}-${normalizeSlug(slug) || 'finish-audit'}`;
}

export function resolveFinishAuditRoot(cwd) {
  return join(resolve(cwd), '.loopx', 'finish');
}

export function resolveFinishAuditPath(cwd, auditId) {
  return join(resolveFinishAuditRoot(cwd), auditId);
}

export function resolveFinishBaselineRoot(cwd) {
  return join(resolveFinishAuditRoot(cwd), 'baselines');
}

export function resolveFinishBaselinePath(cwd, slug) {
  const normalizedSlug = normalizeSlug(slug) || 'finish-audit';
  const filename = normalizedSlug === 'latest' ? 'latest-baseline' : normalizedSlug;
  return join(resolveFinishBaselineRoot(cwd), `${filename}.json`);
}

export function resolveLatestFinishBaselinePath(cwd) {
  return join(resolveFinishBaselineRoot(cwd), 'latest.json');
}

export function resolveExecutionRangeRoot(cwd) {
  return join(resolve(cwd), '.loopx', 'execution-ranges');
}

export function resolveExecutionRangePath(cwd, slug) {
  const normalizedSlug = normalizeSlug(slug) || 'execution-range';
  return join(resolveExecutionRangeRoot(cwd), `${normalizedSlug}.json`);
}

async function gitOutput(cwd, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout.trim();
}

async function gitOutputAllowFailure(cwd, args) {
  try {
    return await gitOutput(cwd, args);
  } catch (error) {
    return `${error?.stdout || ''}${error?.stderr || ''}`.trim();
  }
}

async function gitOutputOrUnknown(cwd, args) {
  try {
    const value = await gitOutput(cwd, args);
    return value || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function readGitField(cwd, args) {
  return gitOutputOrUnknown(cwd, args);
}

async function resolveFullHead(cwd) {
  return readGitField(cwd, ['rev-parse', 'HEAD']);
}

async function resolveRequiredHead(cwd) {
  const head = await resolveCommitRef(cwd, 'HEAD');
  if (!head) {
    throw new Error('finish_start_no_valid_head');
  }
  return head;
}

async function resolveRequiredExecutionStartHead(cwd) {
  const head = await resolveCommitRef(cwd, 'HEAD');
  if (!head) {
    throw new Error('execution_start_no_valid_head');
  }
  return head;
}

function normalizeBranchRef(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return 'unknown';
  }
  return value
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\/[^/]+\//, '')
    || 'unknown';
}

function normalizeUpstreamRef(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return 'unknown';
  }
  return value
    .replace(/^refs\/remotes\/[^/]+\//, '')
    .replace(/^[^/]+\//, '')
    || 'unknown';
}

async function resolveGitEvidence(cwd) {
  const isWorktree = await gitOutputAllowFailure(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (isWorktree !== 'true') {
    return {
      branch: 'unknown',
      base_branch: 'unknown',
      base_ref: 'unknown',
      head: 'unknown',
      worktree: 'unknown',
    };
  }

  const branch = normalizeBranchRef(await readGitField(cwd, ['branch', '--show-current']));
  const head = await readGitField(cwd, ['rev-parse', '--short', 'HEAD']);
  const remoteName = branch !== 'unknown'
    ? await gitOutputOrUnknown(cwd, ['config', '--get', `branch.${branch}.remote`])
    : 'unknown';
  const mergeTarget = branch !== 'unknown'
    ? normalizeBranchRef(await gitOutputOrUnknown(cwd, ['config', '--get', `branch.${branch}.merge`]))
    : 'unknown';
  const rawUpstreamRef = branch !== 'unknown'
    ? await gitOutputOrUnknown(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    : 'unknown';
  const upstreamRef = normalizeUpstreamRef(rawUpstreamRef);
  const baseBranch = mergeTarget !== 'unknown' ? mergeTarget : upstreamRef;
  const configuredBaseRef = remoteName !== 'unknown' && mergeTarget !== 'unknown'
    ? `${remoteName}/${mergeTarget}`
    : rawUpstreamRef !== 'unknown'
      ? rawUpstreamRef
      : 'unknown';
  const worktree = await readGitField(cwd, ['rev-parse', '--show-toplevel']);

  return {
    branch,
    base_branch: baseBranch || 'unknown',
    base_ref: configuredBaseRef,
    head,
    worktree,
  };
}

function finishChoices() {
  return {
    accepted: [
      {
        id: 'audit-evidence',
        summary: 'Finish audit evidence collected from the current worktree.',
      },
    ],
    rejected: [],
  };
}

function changedPathStartsWith(path, prefixes) {
  const normalizedPath = String(path || '').replaceAll('\\', '/');
  return prefixes.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
}

function summarizeChangedPaths(changedFiles, limit = 5) {
  return changedFiles
    .map((item) => item.path)
    .filter(Boolean)
    .slice(0, limit)
    .map((path) => `file: ${path}`);
}

function summarizeCommitSubjects(commits, limit = 5) {
  return commits
    .map((item) => item.subject)
    .filter(Boolean)
    .slice(0, limit)
    .map((subject) => `commit: ${subject}`);
}

function extractionEvidenceForChangeWindow(changeWindow) {
  const evidence = [
    `change_window.source=${changeWindow.source}`,
    `change_window.range=${changeWindow.range ?? 'none'}`,
    `change_window.commit_count=${changeWindow.commit_count}`,
    ...summarizeCommitSubjects(changeWindow.commits || []),
    ...summarizeChangedPaths(changeWindow.changed_files || []),
  ];
  return evidence.filter((item) => nonEmptyText(item));
}

function changeWindowTouchesDurableSurface(changeWindow) {
  const changedFiles = Array.isArray(changeWindow.changed_files) ? changeWindow.changed_files : [];
  return changedFiles.some((item) => changedPathStartsWith(item.path, EXTRACTION_SURFACE_PREFIXES));
}

function changeWindowTouchesTeamRuleSurface(changeWindow) {
  const changedFiles = Array.isArray(changeWindow.changed_files) ? changeWindow.changed_files : [];
  return changedFiles.some((item) => changedPathStartsWith(item.path, EXTRACTION_SURFACE_PREFIXES));
}

function createExtractionCandidates(changeWindow) {
  if (!plainObject(changeWindow) || Number(changeWindow.commit_count || 0) <= 0) {
    return [];
  }

  const evidence = extractionEvidenceForChangeWindow(changeWindow);
  const candidates = [];
  if (changeWindowTouchesDurableSurface(changeWindow)) {
    candidates.push({
      id: 'memory-local-review-change-window',
      kind: 'memory',
      scope: 'local',
      status: 'pending-review',
      target: '.loopx/memory/entries/',
      summary: 'Review the committed finish change window for local agent memory worth preserving.',
      reason: 'Committed code, docs, tests, or workflow files may encode a reusable decision, constraint, pitfall, or handoff that future agents should know.',
      evidence,
    });
    candidates.push({
      id: 'memory-shared-review-change-window',
      kind: 'memory',
      scope: 'shared',
      status: 'pending-review',
      target: 'docs/loopx/memory/',
      summary: 'Review the committed finish change window for git-tracked shared memory worth preserving across machines.',
      reason: 'A user may need lightweight project memory across multiple machines before it becomes stable enough to promote to a spec.',
      evidence,
    });
  }
  if (changeWindowTouchesTeamRuleSurface(changeWindow)) {
    candidates.push({
      id: 'spec-review-change-window',
      kind: 'spec',
      status: 'pending-review',
      target: 'docs/loopx/specs/inbox.md',
      summary: 'Review the committed finish change window for a repo-tracked spec candidate.',
      reason: 'Committed workflow, skill, runtime, documentation, or test changes may define a stable team rule that belongs in specs.',
      evidence,
    });
  }
  return candidates;
}

async function createFinishAuditDirectory(cwd, slug, date) {
  await mkdir(resolveFinishAuditRoot(cwd), { recursive: true });
  const baseAuditId = finishAuditId(slug, date);
  for (let attempt = 0; attempt < MAX_AUDIT_ID_COLLISIONS; attempt += 1) {
    const auditId = attempt === 0 ? baseAuditId : `${baseAuditId}-${attempt + 1}`;
    const root = resolveFinishAuditPath(cwd, auditId);
    try {
      await mkdir(root);
      return { auditId, root };
    } catch (error) {
      if (error?.code === 'EEXIST') {
        continue;
      }
      throw error;
    }
  }
  throw new Error('finish_audit_id_collision');
}

function createChoiceRecord({
  action = null,
  status = null,
  summary = null,
  url = null,
  recorded_at = null,
  updated_at = null,
} = {}) {
  return {
    action,
    status,
    summary,
    url,
    recorded_at,
    updated_at,
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function selectReportCandidates(primary) {
  if (Array.isArray(primary) && primary.length > 0) {
    return primary;
  }
  return [];
}

async function readJsonIfExists(path) {
  if (!await pathExists(path)) {
    return null;
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function readMultiPlanStateIfExists(path, displayPath) {
  if (!await pathExists(path)) {
    return null;
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`finish_record_multi_plan_state_invalid:${displayPath}`);
  }
}

function normalizedArtifactPath(path) {
  return String(path || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function normalizedPlanPackagePath(path) {
  return normalizedArtifactPath(path).replace(/\/+$/, '');
}

function canonicalFinalReviewReportPath({ source, design, slug }) {
  const identity = normalizedArtifactPath(design || source);
  const designMatch = identity.match(/docs\/loopx\/design\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\/[^/]+\.md$/);
  const sourceMatch = identity.match(/(?:^|\/)(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)(?:\.md|\/00-overview\.md|\/)?$/);
  const reportSlug = designMatch?.[1] || sourceMatch?.[1] || normalizeSlug(slug) || 'final-review';
  return `.loopx/final-review/${reportSlug}.md`;
}

function multiPlanPackageFromSourceArtifact(sourceArtifact) {
  const normalized = normalizedArtifactPath(sourceArtifact);
  const match = normalized.match(MULTI_PLAN_PACKAGE_PATTERN);
  if (!match) {
    return null;
  }
  const featureSlug = match[1];
  return {
    featureSlug,
    planPackage: `docs/loopx/plans/${featureSlug}`,
    sourceArtifact: normalized,
    statePath: join('.loopx', 'multi-plan', featureSlug, 'state.json'),
  };
}

function firstMultiPlanPackageFromState(state) {
  const sourceArtifacts = Array.isArray(state?.audit?.change_window?.source_artifacts)
    ? state.audit.change_window.source_artifacts
    : [];
  for (const sourceArtifact of sourceArtifacts) {
    const result = multiPlanPackageFromSourceArtifact(sourceArtifact);
    if (result) {
      return result;
    }
  }
  return null;
}

function runtimeStateRoot(cwd, state) {
  const worktree = state?.audit?.worktree;
  return nonEmptyText(worktree) && worktree !== 'unknown'
    ? worktree
    : cwd;
}

async function resolveCommitRef(cwd, ref) {
  const value = String(ref || '').trim();
  if (!value) {
    return null;
  }
  try {
    return await gitOutput(cwd, ['rev-parse', '--verify', '--end-of-options', `${value}^{commit}`]);
  } catch {
    return null;
  }
}

async function readExecutionRangeState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw new Error('execution_start_invalid_state');
  }
}

async function readExecutionRangeForSlug(cwd, slug) {
  const path = resolveExecutionRangePath(cwd, slug);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw new Error('execution_range_invalid_state');
  }
}

function sameExecutionIdentity(state, expected) {
  return state.schema_version === EXECUTION_RANGE_SCHEMA_VERSION
    && state.slug === expected.slug
    && state.worktree === expected.worktree
    && normalizedArtifactPath(state.source_artifact) === normalizedArtifactPath(expected.source_artifact)
    && normalizedArtifactPath(state.design_artifact || '') === normalizedArtifactPath(expected.design_artifact || '');
}

async function validatedFinishBaseline(cwd, baseline, { slug = null, evidence = null } = {}) {
  const state = plainObject(baseline);
  if (!state) {
    return null;
  }

  const normalizedBaselineSlug = normalizeSlug(state.slug);
  if (!normalizedBaselineSlug || state.schema_version !== FINISH_SCHEMA_VERSION) {
    return null;
  }
  if (slug !== null && normalizedBaselineSlug !== normalizeSlug(slug)) {
    return null;
  }
  if (!nonEmptyText(state.created_at) || Number.isNaN(Date.parse(state.created_at))) {
    return null;
  }
  if (evidence?.worktree && evidence.worktree !== 'unknown' && state.worktree !== evidence.worktree) {
    return null;
  }
  if (evidence?.branch && state.branch !== evidence.branch) {
    return null;
  }
  if (!nonEmptyText(state.branch) || !nonEmptyText(state.head) || !nonEmptyText(state.head_short)) {
    return null;
  }
  if (state.source !== null && state.source !== undefined && typeof state.source !== 'string') {
    return null;
  }

  const fullHead = await resolveCommitRef(cwd, state.head);
  if (!fullHead) {
    return null;
  }

  return {
    schema_version: state.schema_version,
    slug: normalizedBaselineSlug,
    created_at: state.created_at,
    worktree: state.worktree,
    branch: state.branch,
    head: fullHead,
    head_short: state.head_short,
    source: state.source ?? null,
  };
}

async function readValidFinishBaseline(cwd, path, options) {
  return validatedFinishBaseline(cwd, await readJsonIfExists(path), options);
}

function latestBaselineMatchesRequest(baseline, slug, evidence) {
  if (!plainObject(baseline)) {
    return false;
  }
  return normalizeSlug(baseline.slug) === normalizeSlug(slug)
    && baseline.branch === evidence.branch
    && baseline.worktree === evidence.worktree;
}

async function readFinishBaseline(cwd, slug, evidence) {
  const normalizedSlug = normalizeSlug(slug) || 'finish-audit';
  const slugWasOmitted = String(slug ?? '').trim() === '';
  const latestBaseline = await readValidFinishBaseline(cwd, resolveLatestFinishBaselinePath(cwd), {
    evidence,
  });
  if (slugWasOmitted && latestBaseline) {
    return latestBaseline;
  }

  const directBaseline = await readValidFinishBaseline(cwd, resolveFinishBaselinePath(cwd, normalizedSlug), {
    slug: normalizedSlug,
    evidence,
  });
  if (directBaseline) {
    return directBaseline;
  }

  if (!latestBaseline) {
    return null;
  }

  if (latestBaselineMatchesRequest(latestBaseline, normalizedSlug, evidence)) {
    return latestBaseline;
  }

  return null;
}

function parseNameStatus(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, firstPath, secondPath] = line.split('\t');
      return {
        status,
        path: secondPath || firstPath,
      };
    })
    .filter((item) => item.status && item.path);
}

function parseCommitLog(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject = ''] = line.split('\t');
      return { sha, subject };
    })
    .filter((item) => /^[0-9a-f]{7,40}$/.test(item.sha));
}

function parseStatusShort(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isLoopxRuntimeStatusLine(line));
}

function statusLinePath(line) {
  const value = String(line || '').slice(3).trim();
  const parts = value.split(' -> ');
  return parts.at(-1) || value;
}

function isLoopxRuntimeStatusLine(line) {
  const path = statusLinePath(line).replaceAll('\\', '/').replace(/^\.\//, '');
  return path.split('/').includes('.loopx');
}

function splitStatusShort(lines) {
  const statusLines = Array.isArray(lines) ? lines : [];
  const tracked = [];
  const untracked = [];
  for (const line of statusLines) {
    if (String(line).startsWith('?? ')) {
      untracked.push(line);
    } else {
      tracked.push(line);
    }
  }
  return { tracked, untracked };
}

async function resolveMergeBaseRef(cwd, evidence) {
  const normalizedBaseBranch = normalizeBranchRef(evidence.base_branch);
  const namedBase = normalizedBaseBranch !== 'unknown' && normalizedBaseBranch !== evidence.branch
    ? normalizedBaseBranch
    : null;
  const configuredRemoteBase = evidence.base_ref !== 'unknown' && normalizeUpstreamRef(evidence.base_ref) === namedBase
    ? evidence.base_ref
    : null;
  const baseRemoteRefs = namedBase ? await gitOutputAllowFailure(cwd, [
    'branch',
    '-r',
    '--list',
    `*/${namedBase}`,
    '--format=%(refname:short)',
  ]) : '';
  const originHead = await gitOutputAllowFailure(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const mainRemoteRefs = await gitOutputAllowFailure(cwd, [
    'branch',
    '-r',
    '--list',
    '*/main',
    '--format=%(refname:short)',
  ]);
  const masterRemoteRefs = await gitOutputAllowFailure(cwd, [
    'branch',
    '-r',
    '--list',
    '*/master',
    '--format=%(refname:short)',
  ]);
  const localConfiguredCandidates = [
    namedBase,
  ].map((item) => String(item || '').trim()).filter(Boolean);
  const exactRemoteConfiguredCandidates = [
    configuredRemoteBase,
  ].map((item) => String(item || '').trim()).filter(Boolean);
  const remoteConfiguredCandidates = [
    namedBase ? `origin/${namedBase}` : null,
    namedBase ? `refs/remotes/origin/${namedBase}` : null,
    ...baseRemoteRefs.split('\n'),
  ].map((item) => String(item || '').trim()).filter(Boolean);
  const fallbackCandidates = [
    originHead,
    'main',
    'master',
    'origin/main',
    'origin/master',
    'refs/remotes/origin/main',
    'refs/remotes/origin/master',
    ...mainRemoteRefs.split('\n'),
    ...masterRemoteRefs.split('\n'),
  ].map((item) => String(item || '').trim()).filter(Boolean);
  const fullHead = await resolveFullHead(cwd);
  const tryCandidates = async (candidates) => {
    for (const candidate of [...new Set(candidates)]) {
      const resolvedCandidate = await resolveCommitRef(cwd, candidate);
      if (!resolvedCandidate) {
        continue;
      }
      const value = await gitOutputAllowFailure(cwd, ['merge-base', 'HEAD', candidate]);
      if (!/^[0-9a-f]{7,40}$/.test(value)) {
        return { value: null, terminal: true };
      }
      if (value === fullHead) {
        return { value: null, terminal: true };
      }
      return { value, terminal: true };
    }
    return { value: null, terminal: false };
  };

  const localConfiguredResult = await tryCandidates(localConfiguredCandidates);
  if (localConfiguredResult.value || (namedBase && localConfiguredResult.terminal)) {
    return localConfiguredResult.value;
  }

  const exactRemoteConfiguredResult = await tryCandidates(exactRemoteConfiguredCandidates);
  if (exactRemoteConfiguredResult.value || (configuredRemoteBase && exactRemoteConfiguredResult.terminal)) {
    return exactRemoteConfiguredResult.value;
  }

  const remoteConfiguredResult = await tryCandidates(remoteConfiguredCandidates);
  if (remoteConfiguredResult.value || (namedBase && remoteConfiguredResult.terminal)) {
    return remoteConfiguredResult.value;
  }

  const fallbackResult = await tryCandidates(fallbackCandidates);
  if (fallbackResult.value || fallbackResult.terminal) {
    return fallbackResult.value;
  }
  return null;
}

async function resolveManualBaselineRef(cwd, ref) {
  const value = String(ref || '').trim();
  if (!value) {
    return null;
  }
  try {
    return await gitOutput(cwd, ['rev-parse', '--verify', `${value}^{commit}`]);
  } catch {
    throw new Error(`finish_audit_invalid_baseline_ref:${value}`);
  }
}

async function resolveChangeWindow(cwd, slug, evidence, { baselineRef = null } = {}) {
  const rootCwd = evidence.worktree === 'unknown' ? cwd : evidence.worktree;
  const manualBaselineHead = await resolveManualBaselineRef(cwd, baselineRef);
  const baseline = manualBaselineHead
    ? { head: manualBaselineHead, head_short: manualBaselineHead.slice(0, 7), source: null }
    : await readFinishBaseline(rootCwd, slug, evidence);
  const fallbackMergeBase = baseline ? null : await resolveMergeBaseRef(cwd, evidence);
  const ref = baseline?.head || fallbackMergeBase;
  const source = baseline?.head ? 'baseline' : fallbackMergeBase ? 'merge-base' : 'none';
  const statusText = evidence.worktree === 'unknown'
    ? ''
    : await gitOutputAllowFailure(cwd, ['status', '--short']);
  const uncommittedStatus = parseStatusShort(statusText);
  const statusGroups = splitStatusShort(uncommittedStatus);
  const executionRange = await readExecutionRangeForSlug(rootCwd, slug);
  const requirementStartCommit = executionRange?.start_commit || baseline?.head || null;
  const requirementStartSource = executionRange
    ? 'execution-range'
    : baseline?.head
      ? 'baseline'
      : 'none';
  const fullHead = await resolveFullHead(cwd);
  const finalHead = fullHead === 'unknown' ? evidence.head : fullHead.slice(0, 7);

  if (!ref || ref === 'unknown') {
    return {
      source,
      baseline_ref: null,
      baseline_ref_short: null,
      range: null,
      commit_count: 0,
      commits: [],
      changed_files: [],
      diff_stat: '',
      requirement_start_commit: requirementStartCommit,
      requirement_start_commit_short: requirementStartCommit ? requirementStartCommit.slice(0, 7) : null,
      requirement_start_source: requirementStartSource,
      final_head: finalHead,
      tracked_status: statusGroups.tracked,
      untracked_status: statusGroups.untracked,
      uncommitted_status: uncommittedStatus,
      source_artifacts: baseline?.source ? [baseline.source] : [],
    };
  }

  const range = `${ref}..HEAD`;
  const commits = parseCommitLog(await gitOutputAllowFailure(cwd, ['log', '--pretty=format:%H%x09%s', range]));
  const changedFiles = parseNameStatus(await gitOutputAllowFailure(cwd, ['diff', '--name-status', range]));
  const diffStat = await gitOutputAllowFailure(cwd, ['diff', '--stat', range]);
  return {
    source,
    baseline_ref: ref,
    baseline_ref_short: baseline?.head_short || ref.slice(0, 7),
    range: `${ref.slice(0, 7)}..HEAD`,
    commit_count: commits.length,
    commits,
    changed_files: changedFiles,
    diff_stat: diffStat,
    requirement_start_commit: requirementStartCommit,
    requirement_start_commit_short: requirementStartCommit ? requirementStartCommit.slice(0, 7) : null,
    requirement_start_source: requirementStartSource,
    final_head: finalHead,
    tracked_status: statusGroups.tracked,
    untracked_status: statusGroups.untracked,
    uncommitted_status: uncommittedStatus,
    source_artifacts: baseline?.source ? [baseline.source] : [],
  };
}

async function refreshChangeWindowStatus(cwd, evidence, changeWindow) {
  const current = plainObject(changeWindow) ? { ...changeWindow } : {};
  if (evidence.worktree === 'unknown') {
    return current;
  }
  const statusText = await gitOutputAllowFailure(cwd, ['status', '--short']);
  const uncommittedStatus = parseStatusShort(statusText);
  const statusGroups = splitStatusShort(uncommittedStatus);
  const fullHead = await resolveFullHead(cwd);
  current.final_head = fullHead === 'unknown' ? evidence.head : fullHead.slice(0, 7);
  current.tracked_status = statusGroups.tracked;
  current.untracked_status = statusGroups.untracked;
  current.uncommitted_status = uncommittedStatus;
  return current;
}

function singleLineText(value) {
  return String(value ?? 'null').replace(/\s*\r?\n+\s*/g, ' ').trim() || 'null';
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyTextArray(value) {
  return Array.isArray(value) && value.some((item) => nonEmptyText(item));
}

function plainObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item) ? item : null;
}

function multiPlanGateIssue(message, details = {}) {
  return {
    message,
    ...details,
  };
}

function validateMultiPlanState(multiPlanState, expected) {
  const issues = [];
  if (!plainObject(multiPlanState)) {
    return [multiPlanGateIssue('state file must contain a JSON object')];
  }
  if (multiPlanState.schema_version !== MULTI_PLAN_SCHEMA_VERSION) {
    issues.push(multiPlanGateIssue('schema_version must be 2'));
  }
  if (multiPlanState.feature_slug !== expected.featureSlug) {
    issues.push(multiPlanGateIssue('feature_slug must match source path', {
      expected: expected.featureSlug,
      actual: multiPlanState.feature_slug ?? null,
    }));
  }
  if (normalizedPlanPackagePath(multiPlanState.plan_package) !== expected.planPackage) {
    issues.push(multiPlanGateIssue('plan_package must match source path', {
      expected: expected.planPackage,
      actual: multiPlanState.plan_package ?? null,
    }));
  }
  if (!nonEmptyText(multiPlanState.source_spec)) {
    issues.push(multiPlanGateIssue('source_spec is required'));
  }
  if (!Array.isArray(multiPlanState.plans) || multiPlanState.plans.length === 0) {
    issues.push(multiPlanGateIssue('plans[] must be non-empty'));
    return issues;
  }

  const seenPlanPaths = new Set();
  for (const [index, plan] of multiPlanState.plans.entries()) {
    if (!plainObject(plan)) {
      issues.push(multiPlanGateIssue('plan entry must be an object', { index }));
      continue;
    }
    const path = normalizedArtifactPath(plan.path);
    if (!nonEmptyText(path)) {
      issues.push(multiPlanGateIssue('plan.path is required', { index }));
    } else if (seenPlanPaths.has(path)) {
      issues.push(multiPlanGateIssue('plan.path must be unique', { path }));
    } else {
      seenPlanPaths.add(path);
    }
    if (plan.status !== 'complete') {
      issues.push(multiPlanGateIssue('plan.status must be complete', {
        path: path || `(index ${index})`,
        actual: plan.status ?? null,
      }));
    }
    const planReview = plainObject(plan.plan_review);
    if (!planReview || planReview.status !== 'passed') {
      issues.push(multiPlanGateIssue('plan_review.status must be passed', {
        path: path || `(index ${index})`,
        actual: planReview?.status ?? null,
      }));
    }
    if (planReview && !nonEmptyText(planReview.summary)) {
      issues.push(multiPlanGateIssue('plan_review.summary is required', {
        path: path || `(index ${index})`,
      }));
    }
    if (planReview && !nonEmptyText(planReview.reviewed_at)) {
      issues.push(multiPlanGateIssue('plan_review.reviewed_at is required', {
        path: path || `(index ${index})`,
      }));
    }
    if (plan.ready_for_spec_review !== true) {
      issues.push(multiPlanGateIssue('ready_for_spec_review must be true', {
        path: path || `(index ${index})`,
        actual: plan.ready_for_spec_review ?? null,
      }));
    }
    for (const forbidden of ['start_commit', 'current_head', 'end_commit']) {
      if (Object.hasOwn(plan, forbidden)) {
        issues.push(multiPlanGateIssue(`${forbidden} must not be recorded on child plan state`, {
          path: path || `(index ${index})`,
        }));
      }
    }
  }

  const specReview = multiPlanState.spec_final_review;
  if (!plainObject(specReview)) {
    issues.push(multiPlanGateIssue('spec_final_review is required'));
  } else {
    if (!nonEmptyText(specReview.path)) {
      issues.push(multiPlanGateIssue('spec_final_review.path is required'));
    }
    if (specReview.ready_for_finish !== 'Yes') {
      issues.push(multiPlanGateIssue('spec_final_review.ready_for_finish must be Yes', {
        actual: specReview.ready_for_finish ?? null,
      }));
    }
  }

  return issues;
}

function candidateObject(item) {
  return plainObject(item);
}

function candidateIdentifier(item) {
  const candidate = candidateObject(item);
  return candidate?.id ?? candidate?.kind ?? 'candidate';
}

function formatCandidateValue(value) {
  if (Array.isArray(value)) {
    const parts = value.map((item) => singleLineText(item)).filter((item) => item !== 'null');
    return parts.length > 0 ? parts.join('; ') : 'null';
  }
  return singleLineText(value);
}

function candidateDetailLine(item, key) {
  const candidate = candidateObject(item);
  if (!candidate || !Object.hasOwn(candidate, key)) {
    return null;
  }
  const value = candidate[key];
  const hasValue = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && String(value).trim() !== '';
  return hasValue ? `  - ${key}: ${formatCandidateValue(value)}` : null;
}

function formatCandidate(item, detailKeys = []) {
  const candidate = candidateObject(item);
  const summary = candidate
    ? candidate.summary ?? candidate.rejection_reason ?? candidate.reason ?? 'null'
    : item;
  const lines = [`- ${singleLineText(candidateIdentifier(item))}: ${singleLineText(summary)}`];
  for (const key of detailKeys) {
    const line = candidateDetailLine(item, key);
    if (line) {
      lines.push(line);
    }
  }
  return lines.join('\n');
}

function formatChoiceHistoryEntry(item, index) {
  const recordedAt = item.recorded_at ?? item.updated_at;
  const parts = [
    `- ${index + 1}. ${singleLineText(item.action)}`,
    singleLineText(item.status),
    singleLineText(item.summary),
    `url=${singleLineText(item.url)}`,
    `recorded_at=${singleLineText(recordedAt)}`,
    `superseded_at=${singleLineText(item.superseded_at)}`,
  ];
  return parts.join(' / ');
}

function buildFinishReport({ state, evidence, scannedInputs }) {
  const auditId = state.audit_id;
  const slug = state.slug;
  const auditChoices = state.audit || {};
  const changeWindow = auditChoices.change_window || {};
  const noCandidatesReason = auditChoices.no_candidates_reason ?? null;
  const acceptedSource = selectReportCandidates(auditChoices.accepted_candidates);
  const rejectedSource = selectReportCandidates(auditChoices.rejected_candidates);
  const extractionSource = selectReportCandidates(auditChoices.extraction_candidates);
  const accepted = acceptedSource.length > 0
    ? acceptedSource.map((item) => formatCandidate(item, ['evidence', 'target', 'confidence', 'status'])).join('\n')
    : '- none';
  const rejected = rejectedSource.length > 0
    ? rejectedSource.map((item) => formatCandidate(item, ['rejection_reason', 'reason', 'evidence', 'target', 'confidence', 'status'])).join('\n')
    : '- none';
  const extraction = extractionSource.length > 0
    ? extractionSource.map((item) => formatCandidate(item, ['kind', 'scope', 'status', 'target', 'reason', 'evidence'])).join('\n')
    : '- none';
  const choice = state.choice || createChoiceRecord();
  const choiceLine = [
    `- action: ${singleLineText(choice.action)}`,
    `- status: ${singleLineText(choice.status)}`,
    `- summary: ${singleLineText(choice.summary)}`,
    `- url: ${singleLineText(choice.url)}`,
  ].join('\n');
  const noCandidatesLine = noCandidatesReason
    ? `- ${singleLineText(noCandidatesReason)}`
    : '- none';
  const history = Array.isArray(state.choice_history) && state.choice_history.length > 0
    ? state.choice_history.map((item, index) => formatChoiceHistoryEntry(item, index)).join('\n')
    : '- none';
  const scanned = scannedInputs.length > 0
    ? scannedInputs.map((item) => `- ${item}`).join('\n')
    : '- none';
  const commits = Array.isArray(changeWindow.commits) && changeWindow.commits.length > 0
    ? changeWindow.commits.map((item) => `- ${singleLineText(item.sha)} ${singleLineText(item.subject)}`).join('\n')
    : '- none';
  const changedFiles = Array.isArray(changeWindow.changed_files) && changeWindow.changed_files.length > 0
    ? changeWindow.changed_files.map((item) => `- ${singleLineText(item.status)} ${singleLineText(item.path)}`).join('\n')
    : '- none';
  const uncommitted = Array.isArray(changeWindow.uncommitted_status) && changeWindow.uncommitted_status.length > 0
    ? changeWindow.uncommitted_status.map((item) => `- ${singleLineText(item)}`).join('\n')
    : '- none';
  const trackedStatus = Array.isArray(changeWindow.tracked_status) && changeWindow.tracked_status.length > 0
    ? changeWindow.tracked_status.map((item) => `- ${singleLineText(item)}`).join('\n')
    : '- none';
  const untrackedStatus = Array.isArray(changeWindow.untracked_status) && changeWindow.untracked_status.length > 0
    ? changeWindow.untracked_status.map((item) => `- ${singleLineText(item)}`).join('\n')
    : '- none';
  const sourceArtifacts = Array.isArray(changeWindow.source_artifacts) && changeWindow.source_artifacts.length > 0
    ? changeWindow.source_artifacts.map((item) => `- ${singleLineText(item)}`).join('\n')
    : '- none';
  const diffStat = nonEmptyText(changeWindow.diff_stat)
    ? String(changeWindow.diff_stat).split('\n').map((line) => `- ${singleLineText(line)}`).join('\n')
    : '- none';

  return [
    '# Finish Audit',
    '',
    '## Summary',
    '',
    `- audit_id: ${auditId}`,
    `- slug: ${slug}`,
    `- status: ${state.status}`,
    `- updated_at: ${state.updated_at ?? 'null'}`,
    `- branch: ${evidence.branch}`,
    `- base branch: ${evidence.base_branch}`,
    `- worktree: ${evidence.worktree}`,
    '',
    '## Scanned Inputs',
    '',
    scanned,
    '',
    '## Change Window',
    '',
    `- source: ${singleLineText(changeWindow.source)}`,
    `- baseline_ref: ${singleLineText(changeWindow.baseline_ref_short ?? changeWindow.baseline_ref)}`,
    `- requirement_start_commit: ${singleLineText(changeWindow.requirement_start_commit_short ?? changeWindow.requirement_start_commit)}`,
    `- requirement_start_source: ${singleLineText(changeWindow.requirement_start_source)}`,
    `- final_HEAD: ${singleLineText(changeWindow.final_head)}`,
    `- range: ${singleLineText(changeWindow.range)}`,
    `- committed_change_count: ${singleLineText(changeWindow.commit_count)}`,
    '',
    '### Commits',
    '',
    commits,
    '',
    '### Changed Files',
    '',
    changedFiles,
    '',
    '### Tracked Status',
    '',
    trackedStatus,
    '',
    '### Untracked Status',
    '',
    untrackedStatus,
    '',
    '### Uncommitted Status',
    '',
    uncommitted,
    '',
    '### Source Artifacts',
    '',
    sourceArtifacts,
    '',
    '### Diff Stat',
    '',
    diffStat,
    '',
    '## Extraction Candidates',
    '',
    extraction,
    '',
    '## Accepted Candidates',
    '',
    accepted,
    '',
    '## Rejected Candidates',
    '',
    rejected,
    '',
    '## No Candidates Reason',
    '',
    noCandidatesLine,
    '',
    '## Choice',
    '',
    choiceLine,
    '',
    '## Choice History',
    '',
    history,
    '',
    '## Next Steps',
    '',
    '- Agent review the audit evidence and decide whether the finish state can advance.',
    '- Record the final audit decision once the audit is complete.',
    '',
  ].join('\n');
}

async function resolveFinishAuditDir(cwd, auditIdOrPath) {
  const raw = String(auditIdOrPath || '').trim();
  if (!raw) {
    return null;
  }

  const directPath = resolve(cwd, raw);
  if (await pathExists(join(directPath, 'finish-state.json'))) {
    return directPath;
  }

  const evidence = await resolveGitEvidence(cwd);
  const rootCwd = evidence.worktree === 'unknown' ? cwd : evidence.worktree;
  const rootIdPath = resolveFinishAuditPath(rootCwd, raw);
  if (await pathExists(join(rootIdPath, 'finish-state.json'))) {
    return rootIdPath;
  }

  const cwdIdPath = resolveFinishAuditPath(cwd, raw);
  if (cwdIdPath !== rootIdPath && await pathExists(join(cwdIdPath, 'finish-state.json'))) {
    return cwdIdPath;
  }

  return null;
}

async function readFinishState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    throw new Error('finish_record_invalid_state');
  }
}

function throwInvalidFinishState() {
  throw new Error('finish_record_invalid_state');
}

function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validChoiceHistory(value) {
  return Array.isArray(value) && value.every((item) => Boolean(plainObject(item)));
}

function validateFinishRecordState(state, root) {
  if (!plainObject(state)) {
    throwInvalidFinishState();
  }
  if (state.schema_version !== FINISH_SCHEMA_VERSION) {
    throwInvalidFinishState();
  }
  if (!nonEmptyText(state.audit_id) || !nonEmptyText(state.slug)) {
    throwInvalidFinishState();
  }
  if (state.audit_id !== basename(root)) {
    throwInvalidFinishState();
  }
  if (!FINISH_RECORD_STATE_STATUSES.includes(state.status)) {
    throwInvalidFinishState();
  }
  if (!plainObject(state.inputs) || !stringArray(state.inputs.scanned)) {
    throwInvalidFinishState();
  }
  if (!plainObject(state.audit)) {
    throwInvalidFinishState();
  }
  for (const key of ['branch', 'base_branch', 'worktree', 'head']) {
    if (typeof state.audit[key] !== 'string') {
      throwInvalidFinishState();
    }
  }
  if (!Array.isArray(state.audit.accepted_candidates) || !Array.isArray(state.audit.rejected_candidates)) {
    throwInvalidFinishState();
  }
  if (state.audit.extraction_candidates !== undefined && !Array.isArray(state.audit.extraction_candidates)) {
    throwInvalidFinishState();
  }
  if (state.audit.change_window !== undefined && !plainObject(state.audit.change_window)) {
    throwInvalidFinishState();
  }
  if (state.audit.no_candidates_reason !== null && typeof state.audit.no_candidates_reason !== 'string') {
    throwInvalidFinishState();
  }
  if (state.choice !== null && state.choice !== undefined && !plainObject(state.choice)) {
    throwInvalidFinishState();
  }
  if (!validChoiceHistory(state.choice_history)) {
    throwInvalidFinishState();
  }
}

function hasSpecificNoCandidatesReason(reason) {
  return nonEmptyText(reason) && reason.trim() !== DEFAULT_NO_CANDIDATES_REASON;
}

function acceptedCandidateIsComplete(candidate) {
  return Boolean(candidate)
    && nonEmptyText(candidate.summary)
    && nonEmptyTextArray(candidate.evidence);
}

function rejectedCandidateIsComplete(candidate) {
  return Boolean(candidate)
    && (nonEmptyText(candidate.rejection_reason) || nonEmptyText(candidate.reason));
}

function candidateIdSet(candidates) {
  return new Set(
    (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => candidateObject(candidate)?.id)
      .filter((id) => nonEmptyText(id)),
  );
}

function extractionCandidatesAreReviewed(state) {
  const extractionCandidates = Array.isArray(state?.audit?.extraction_candidates)
    ? state.audit.extraction_candidates
    : [];
  if (extractionCandidates.length === 0) {
    return true;
  }

  const acceptedIds = candidateIdSet(state?.audit?.accepted_candidates);
  const rejectedIds = candidateIdSet(state?.audit?.rejected_candidates);
  return extractionCandidates.every((candidate) => {
    const id = candidateObject(candidate)?.id;
    return nonEmptyText(id) && (acceptedIds.has(id) || rejectedIds.has(id));
  });
}

function isFinishAuditReadyForDone(state) {
  if (!['audited', 'choice-recorded', 'completed', 'failed'].includes(state?.status)) {
    return false;
  }

  const acceptedCandidates = Array.isArray(state?.audit?.accepted_candidates)
    ? state.audit.accepted_candidates
    : [];
  const rejectedCandidates = Array.isArray(state?.audit?.rejected_candidates)
    ? state.audit.rejected_candidates
    : [];
  if (rejectedCandidates.some((candidate) => !rejectedCandidateIsComplete(candidate))) {
    return false;
  }
  if (!extractionCandidatesAreReviewed(state)) {
    return false;
  }
  const trackedStatus = Array.isArray(state?.audit?.change_window?.tracked_status)
    ? state.audit.change_window.tracked_status
    : [];
  if (trackedStatus.length > 0) {
    return false;
  }
  if (acceptedCandidates.length > 0) {
    return acceptedCandidates.every((candidate) => acceptedCandidateIsComplete(candidate));
  }
  if (Array.isArray(state?.audit?.extraction_candidates) && state.audit.extraction_candidates.length > 0) {
    return true;
  }
  return hasSpecificNoCandidatesReason(state?.audit?.no_candidates_reason);
}

function hasChoiceActionChange(previousChoice, nextChoice) {
  if (!previousChoice || typeof previousChoice !== 'object') {
    return false;
  }
  return (previousChoice.action ?? null) !== (nextChoice.action ?? null);
}

function isRecordedChoice(choice) {
  return Boolean(choice && (choice.recorded_at || choice.updated_at));
}

function nextChoiceHistory(state, choice, updatedAt) {
  const history = Array.isArray(state.choice_history) ? state.choice_history.slice() : [];
  if (isRecordedChoice(state.choice) && hasChoiceActionChange(state.choice, choice)) {
    history.push({
      ...state.choice,
      superseded_at: updatedAt,
    });
  }
  return history;
}

function evidenceFromState(state, fallback = {}) {
  const audit = state.audit || {};
  return {
    branch: audit.branch ?? fallback.branch ?? 'unknown',
    base_branch: audit.base_branch ?? fallback.base_branch ?? 'unknown',
    head: audit.head ?? fallback.head ?? 'unknown',
    worktree: audit.worktree ?? fallback.worktree ?? 'unknown',
  };
}

async function assertMultiPlanReadyForFinish(cwd, finishState) {
  const multiPlanPackage = firstMultiPlanPackageFromState(finishState);
  if (!multiPlanPackage) {
    return;
  }

  const stateRoot = runtimeStateRoot(cwd, finishState);
  const absoluteStatePath = join(stateRoot, multiPlanPackage.statePath);
  const multiPlanState = await readMultiPlanStateIfExists(absoluteStatePath, multiPlanPackage.statePath);
  if (!multiPlanState) {
    throw new Error(`finish_record_multi_plan_state_missing:${multiPlanPackage.statePath}`);
  }

  const issues = validateMultiPlanState(multiPlanState, multiPlanPackage);
  if (issues.length > 0) {
    const summary = issues
      .map((issue) => {
        const path = issue.path ? ` path=${issue.path}` : '';
        const actual = Object.hasOwn(issue, 'actual') ? ` actual=${String(issue.actual)}` : '';
        return `${issue.message}${path}${actual}`;
      })
      .join('; ');
    throw new Error(`finish_record_multi_plan_incomplete:${multiPlanPackage.statePath}:${summary}`);
  }
}

async function assertNoTrackedDirtyForFinish(cwd) {
  const statusText = await gitOutputAllowFailure(cwd, ['status', '--short']);
  const { tracked } = splitStatusShort(parseStatusShort(statusText));
  if (tracked.length > 0) {
    throw new Error(`finish_record_tracked_dirty:${tracked.join('; ')}`);
  }
}

function assertAuditHeadCurrentForFinish(state, evidence) {
  const auditHead = String(state?.audit?.head || '').trim();
  const currentHead = String(evidence?.head || '').trim();
  if (auditHead && currentHead && auditHead !== 'unknown' && currentHead !== 'unknown' && auditHead !== currentHead) {
    throw new Error(`finish_record_stale_audit_head:${auditHead}..${currentHead}`);
  }
}

export async function finishAuditStage(cwd, slug, { env = process.env, date = new Date(), baselineRef = null } = {}) {
  const auditDate = date instanceof Date ? date : new Date(date);
  const evidence = await resolveGitEvidence(cwd);
  const rootCwd = evidence.worktree === 'unknown' ? cwd : evidence.worktree;
  const { auditId, root } = await createFinishAuditDirectory(rootCwd, slug, auditDate);
  const normalizedSlug = normalizeSlug(slug) || 'finish-audit';
  const changeWindow = await resolveChangeWindow(cwd, slug, evidence, { baselineRef });
  const scannedInputs = [
    `slug=${normalizedSlug}`,
    `worktree=${evidence.worktree}`,
    `branch=${evidence.branch}`,
    `base_branch=${evidence.base_branch}`,
    `head=${evidence.head}`,
    `change_window_source=${changeWindow.source}`,
    `change_range=${changeWindow.range ?? 'none'}`,
    `committed_change_count=${changeWindow.commit_count}`,
    `changed_files_count=${changeWindow.changed_files.length}`,
    `uncommitted_change_count=${changeWindow.uncommitted_status.length}`,
    `cwd=${resolve(cwd)}`,
    `env.LOOPX_DEVELOPER=${String(env.LOOPX_DEVELOPER || 'unknown')}`,
  ];
  const choices = finishChoices();
  const extractionCandidates = createExtractionCandidates(changeWindow);
  const state = {
    schema_version: FINISH_SCHEMA_VERSION,
    audit_id: auditId,
    slug: normalizedSlug,
    status: 'needs-agent-audit',
    updated_at: auditDate.toISOString(),
    inputs: {
      scanned: scannedInputs,
    },
    audit: {
      branch: evidence.branch,
      base_branch: evidence.base_branch,
      worktree: evidence.worktree,
      head: evidence.head,
      accepted_candidates: [],
      rejected_candidates: [],
      extraction_candidates: extractionCandidates,
      no_candidates_reason: DEFAULT_NO_CANDIDATES_REASON,
      change_window: changeWindow,
      report_candidates: {
        accepted: choices.accepted.map((item) => ({ ...item })),
        rejected: choices.rejected.map((item) => ({ ...item })),
      },
    },
    choice: createChoiceRecord(),
    choice_history: [],
  };

  const reportText = buildFinishReport({
    state,
    evidence,
    scannedInputs,
  });
  await writeFile(join(root, 'finish-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(join(root, 'finish-report.md'), reportText);

  return {
    auditId,
    root,
    state,
    reportPath: join(root, 'finish-report.md'),
    statePath: join(root, 'finish-state.json'),
  };
}

export async function finishStartStage(cwd, slug, { source = null, date = new Date() } = {}) {
  const baselineDate = date instanceof Date ? date : new Date(date);
  const normalizedSlug = normalizeSlug(slug) || 'finish-audit';

  const evidence = await resolveGitEvidence(cwd);
  if (evidence.worktree === 'unknown') {
    throw new Error('finish_start_no_valid_head');
  }
  const fullHead = await resolveRequiredHead(cwd);
  const rootCwd = evidence.worktree === 'unknown' ? cwd : evidence.worktree;
  await mkdir(resolveFinishBaselineRoot(rootCwd), { recursive: true });
  const path = resolveFinishBaselinePath(rootCwd, normalizedSlug);
  const latestPath = resolveLatestFinishBaselinePath(rootCwd);
  const existingState = await readValidFinishBaseline(rootCwd, path, {
    slug: normalizedSlug,
    evidence,
  });
  if (existingState) {
    await writeFile(latestPath, `${JSON.stringify(existingState, null, 2)}\n`);
    return { path, latestPath, state: existingState };
  }

  const state = {
    schema_version: FINISH_SCHEMA_VERSION,
    slug: normalizedSlug,
    created_at: baselineDate.toISOString(),
    worktree: evidence.worktree,
    branch: evidence.branch,
    head: fullHead,
    head_short: fullHead === 'unknown' ? evidence.head : fullHead.slice(0, 7),
    source: source ? String(source) : null,
  };

  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(latestPath, `${JSON.stringify(state, null, 2)}\n`);
  return { path, latestPath, state };
}

export async function executionStartStage(cwd, slug, { source, design = null, date = new Date() } = {}) {
  const normalizedSlug = normalizeSlug(slug) || 'execution-range';
  if (!nonEmptyText(source)) {
    throw new Error('execution_start_source_required');
  }

  const evidence = await resolveGitEvidence(cwd);
  if (evidence.worktree === 'unknown') {
    throw new Error('execution_start_no_valid_head');
  }

  const fullHead = await resolveRequiredExecutionStartHead(cwd);
  const rootCwd = evidence.worktree;
  const stateDate = date instanceof Date ? date : new Date(date);
  await mkdir(resolveExecutionRangeRoot(rootCwd), { recursive: true });
  const path = resolveExecutionRangePath(rootCwd, normalizedSlug);
  const expected = {
    schema_version: EXECUTION_RANGE_SCHEMA_VERSION,
    slug: normalizedSlug,
    worktree: evidence.worktree,
    source_artifact: normalizedArtifactPath(source),
    design_artifact: design ? normalizedArtifactPath(design) : null,
  };
  const existingState = await readExecutionRangeState(path);
  if (existingState) {
    if (!sameExecutionIdentity(existingState, expected)) {
      throw new Error('execution_start_slug_conflict');
    }
    return { path, state: existingState, reused: true };
  }

  const state = {
    ...expected,
    started_at: stateDate.toISOString(),
    branch: evidence.branch,
    start_commit: fullHead,
    start_commit_short: fullHead.slice(0, 7),
    canonical_final_review_report: canonicalFinalReviewReportPath({ source, design, slug: normalizedSlug }),
  };
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
  return { path, state, reused: false };
}

export async function finishRecordStage(cwd, auditIdOrPath, {
  action,
  status,
  summary = null,
  url = null,
  env = process.env,
} = {}) {
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!['merge', 'pr', 'keep', 'discard'].includes(normalizedAction)) {
    throw new Error('finish_record_invalid_action');
  }

  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!['pending', 'done', 'failed', 'aborted'].includes(normalizedStatus)) {
    throw new Error('finish_record_invalid_status');
  }

  const root = await resolveFinishAuditDir(cwd, auditIdOrPath);
  if (!root) {
    throw new Error('finish_record_audit_not_found');
  }
  const statePath = join(root, 'finish-state.json');
  const state = await readFinishState(statePath);
  validateFinishRecordState(state, root);
  const stateRoot = runtimeStateRoot(cwd, state);
  const currentEvidence = await resolveGitEvidence(stateRoot);
  state.audit.change_window = await refreshChangeWindowStatus(stateRoot, currentEvidence, state.audit.change_window);
  if (normalizedStatus === 'done') {
    assertAuditHeadCurrentForFinish(state, currentEvidence);
    await assertNoTrackedDirtyForFinish(stateRoot);
    await assertMultiPlanReadyForFinish(stateRoot, state);
  }
  if (normalizedStatus === 'done' && !isFinishAuditReadyForDone(state)) {
    throw new Error('finish_record_audit_incomplete');
  }

  const updatedAt = new Date().toISOString();
  const choice = {
    ...createChoiceRecord({
      action: normalizedAction,
      status: normalizedStatus,
      summary,
      url,
      recorded_at: updatedAt,
      updated_at: updatedAt,
    }),
  };

  state.choice_history = nextChoiceHistory(state, choice, updatedAt);
  state.choice = choice;
  state.updated_at = updatedAt;
  state.status = normalizedStatus === 'done'
    ? 'completed'
    : normalizedStatus === 'failed' || normalizedStatus === 'aborted'
      ? 'failed'
      : 'choice-recorded';

  const evidence = evidenceFromState(state, currentEvidence);
  const scannedInputs = Array.isArray(state.inputs?.scanned) ? state.inputs.scanned : [];
  const reportText = buildFinishReport({
    state,
    evidence,
    scannedInputs,
  });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(join(root, 'finish-report.md'), reportText);

  return {
    auditId: state.audit_id,
    root,
    state,
    reportPath: join(root, 'finish-report.md'),
    statePath,
  };
}
