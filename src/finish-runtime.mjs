import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FINISH_SCHEMA_VERSION = 1;

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

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function buildFinishReport({ state, evidence, scannedInputs }) {
  const auditId = state.audit_id;
  const slug = state.slug;
  const auditChoices = state.audit || {};
  const accepted = Array.isArray(auditChoices.accepted_candidates) && auditChoices.accepted_candidates.length > 0
    ? auditChoices.accepted_candidates.map((item) => `- ${item.id ?? 'candidate'}: ${item.summary ?? 'null'}`).join('\n')
    : '- none';
  const rejected = Array.isArray(auditChoices.rejected_candidates) && auditChoices.rejected_candidates.length > 0
    ? auditChoices.rejected_candidates.map((item) => `- ${item.id ?? 'candidate'}: ${item.summary ?? 'null'}`).join('\n')
    : '- none';
  const choiceLine = state.choice?.action
    ? `- action: ${state.choice.action}\n- status: ${state.choice.status}\n- summary: ${state.choice.summary ?? 'null'}\n- url: ${state.choice.url ?? 'null'}`
    : '- action: null\n- status: null\n- summary: null\n- url: null';
  const history = Array.isArray(state.choice_history) && state.choice_history.length > 0
    ? state.choice_history.map((item, index) => `- ${index + 1}. ${item.action} / ${item.status} / ${item.summary ?? 'null'}`).join('\n')
    : '- none';
  const scanned = scannedInputs.length > 0
    ? scannedInputs.map((item) => `- ${item}`).join('\n')
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
    '## Accepted Candidates',
    '',
    accepted,
    '',
    '## Rejected Candidates',
    '',
    rejected,
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
  return idPath;
}

async function readFinishState(statePath) {
  return JSON.parse(await readFile(statePath, 'utf8'));
}

function isFinishAuditReadyForDone(state) {
  return state?.status === 'audited'
    && Array.isArray(state?.audit?.accepted_candidates)
    && state.audit.accepted_candidates.length > 0;
}

function nextChoiceHistory(state, choice, updatedAt) {
  const history = Array.isArray(state.choice_history) ? state.choice_history.slice() : [];
  if (state.choice?.action && state.choice.action !== choice.action) {
    history.push({
      ...state.choice,
      superseded_at: updatedAt,
    });
  }
  return history;
}

export async function finishAuditStage(cwd, slug, { env = process.env } = {}) {
  const auditId = finishAuditId(slug, new Date());
  const root = resolveFinishAuditPath(cwd, auditId);
  await mkdir(root, { recursive: true });

  const evidence = await resolveGitEvidence(cwd);
  const normalizedSlug = normalizeSlug(slug) || 'finish-audit';
  const scannedInputs = [
    `slug=${normalizedSlug}`,
    `worktree=${evidence.worktree}`,
    `branch=${evidence.branch}`,
    `base_branch=${evidence.base_branch}`,
    `head=${evidence.head}`,
    `cwd=${resolve(cwd)}`,
    `env.LOOPX_DEVELOPER=${String(env.LOOPX_DEVELOPER || 'unknown')}`,
  ];
  const choices = finishChoices();
  const state = {
    schema_version: FINISH_SCHEMA_VERSION,
    audit_id: auditId,
    slug: normalizedSlug,
    status: 'needs-agent-audit',
    updated_at: new Date().toISOString(),
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
      no_candidates_reason: null,
    },
    choice: choices,
    choice_history: [],
  };

  await writeFile(join(root, 'finish-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(join(root, 'finish-report.md'), buildFinishReport({
    state,
    evidence,
    scannedInputs,
  }));

  return {
    auditId,
    root,
    state,
    reportPath: join(root, 'finish-report.md'),
    statePath: join(root, 'finish-state.json'),
  };
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
  const statePath = join(root, 'finish-state.json');
  const state = await readFinishState(statePath);
  if (normalizedStatus === 'done' && !isFinishAuditReadyForDone(state)) {
    throw new Error('finish_record_audit_incomplete');
  }

  const updatedAt = new Date().toISOString();
  const choice = {
    action: normalizedAction,
    status: normalizedStatus,
    summary,
    url,
    updated_at: updatedAt,
  };

  state.choice_history = nextChoiceHistory(state, choice, updatedAt);
  state.choice = choice;
  state.updated_at = updatedAt;
  state.status = normalizedStatus === 'done'
    ? 'completed'
    : normalizedStatus === 'failed' || normalizedStatus === 'aborted'
      ? 'failed'
      : 'choice-recorded';

  const evidence = await resolveGitEvidence(cwd);
  const scannedInputs = Array.isArray(state.inputs?.scanned) ? state.inputs.scanned : [];
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(join(root, 'finish-report.md'), buildFinishReport({
    state,
    evidence,
    scannedInputs,
  }));

  return {
    auditId: state.audit_id,
    root,
    state,
    reportPath: join(root, 'finish-report.md'),
    statePath,
  };
}
