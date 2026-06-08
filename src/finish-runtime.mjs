import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FINISH_SCHEMA_VERSION = 1;
const DEFAULT_NO_CANDIDATES_REASON = 'No accepted or rejected candidates were recorded at audit start.';
const MAX_AUDIT_ID_COLLISIONS = 1000;
const FINISH_RECORD_STATE_STATUSES = ['needs-agent-audit', 'audited', 'choice-recorded', 'completed', 'failed'];

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
      head: 'unknown',
      worktree: 'unknown',
    };
  }

  const branch = normalizeBranchRef(await readGitField(cwd, ['branch', '--show-current']));
  const head = await readGitField(cwd, ['rev-parse', '--short', 'HEAD']);
  const mergeTarget = branch !== 'unknown'
    ? normalizeBranchRef(await gitOutputOrUnknown(cwd, ['config', '--get', `branch.${branch}.merge`]))
    : 'unknown';
  const upstreamRef = branch !== 'unknown'
    ? normalizeUpstreamRef(await gitOutputOrUnknown(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']))
    : 'unknown';
  const baseBranch = mergeTarget !== 'unknown' ? mergeTarget : upstreamRef;
  const worktree = await readGitField(cwd, ['rev-parse', '--show-toplevel']);

  return {
    branch,
    base_branch: baseBranch || 'unknown',
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
  const directBaseline = await readJsonIfExists(resolveFinishBaselinePath(cwd, normalizedSlug));
  if (directBaseline) {
    return directBaseline;
  }

  const latestBaseline = await readJsonIfExists(resolveLatestFinishBaselinePath(cwd));
  if (!latestBaseline) {
    return null;
  }

  const slugWasOmitted = String(slug ?? '').trim() === '';
  if (slugWasOmitted || latestBaselineMatchesRequest(latestBaseline, normalizedSlug, evidence)) {
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
    .filter(Boolean);
}

async function resolveMergeBaseRef(cwd, baseBranch) {
  if (!baseBranch || baseBranch === 'unknown') {
    return null;
  }
  const remoteRefs = await gitOutputAllowFailure(cwd, [
    'branch',
    '-r',
    '--list',
    `*/${baseBranch}`,
    '--format=%(refname:short)',
  ]);
  const candidates = [
    baseBranch,
    `origin/${baseBranch}`,
    `refs/remotes/origin/${baseBranch}`,
    ...remoteRefs.split('\n'),
  ].map((item) => String(item || '').trim()).filter(Boolean);
  const fullHead = await resolveFullHead(cwd);
  for (const candidate of [...new Set(candidates)]) {
    const value = await gitOutputAllowFailure(cwd, ['merge-base', 'HEAD', candidate]);
    if (!/^[0-9a-f]{7,40}$/.test(value) || value === fullHead) {
      continue;
    }
    return value;
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
  const fallbackMergeBase = baseline ? null : await resolveMergeBaseRef(cwd, evidence.base_branch);
  const ref = baseline?.head || fallbackMergeBase;
  const source = baseline?.head ? 'baseline' : fallbackMergeBase ? 'merge-base' : 'none';
  const statusText = await gitOutputAllowFailure(cwd, ['status', '--short']);
  const uncommittedStatus = parseStatusShort(statusText);

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
    uncommitted_status: uncommittedStatus,
    source_artifacts: baseline?.source ? [baseline.source] : [],
  };
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
  const accepted = acceptedSource.length > 0
    ? acceptedSource.map((item) => formatCandidate(item, ['evidence', 'target', 'confidence', 'status'])).join('\n')
    : '- none';
  const rejected = rejectedSource.length > 0
    ? rejectedSource.map((item) => formatCandidate(item, ['rejection_reason', 'reason', 'evidence', 'target', 'confidence', 'status'])).join('\n')
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
  const idPath = resolveFinishAuditPath(cwd, raw);
  const directPath = resolve(cwd, raw);

  if (raw && await pathExists(join(directPath, 'finish-state.json'))) {
    return directPath;
  }
  if (raw && await pathExists(join(idPath, 'finish-state.json'))) {
    return idPath;
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
  if (acceptedCandidates.length > 0) {
    return acceptedCandidates.every((candidate) => acceptedCandidateIsComplete(candidate));
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

export async function finishAuditStage(cwd, slug, { env = process.env, date = new Date(), baselineRef = null } = {}) {
  const auditDate = date instanceof Date ? date : new Date(date);
  const { auditId, root } = await createFinishAuditDirectory(cwd, slug, auditDate);

  const evidence = await resolveGitEvidence(cwd);
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
  const rootCwd = evidence.worktree === 'unknown' ? cwd : evidence.worktree;
  await mkdir(resolveFinishBaselineRoot(rootCwd), { recursive: true });
  const fullHead = await resolveFullHead(cwd);
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

  const path = resolveFinishBaselinePath(rootCwd, normalizedSlug);
  const latestPath = resolveLatestFinishBaselinePath(rootCwd);
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(latestPath, `${JSON.stringify(state, null, 2)}\n`);
  return { path, latestPath, state };
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

  const fallbackEvidence = await resolveGitEvidence(cwd);
  const evidence = evidenceFromState(state, fallbackEvidence);
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
