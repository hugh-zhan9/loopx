import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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

async function readGitField(cwd, args, fallback = 'unknown') {
  const value = await gitOutputAllowFailure(cwd, args);
  return value || fallback;
}

async function resolveGitEvidence(cwd) {
  const isWorktree = await gitOutputAllowFailure(cwd, ['rev-parse', '--is-inside-work-tree']);
  const branch = isWorktree === 'true'
    ? await readGitField(cwd, ['branch', '--show-current'])
    : 'unknown';
  const head = isWorktree === 'true'
    ? await readGitField(cwd, ['rev-parse', '--short', 'HEAD'])
    : 'unknown';
  const baseBranch = isWorktree === 'true'
    ? await readGitField(cwd, ['config', '--get', 'branch.main.merge'])
    : 'unknown';
  const worktree = isWorktree === 'true'
    ? await readGitField(cwd, ['rev-parse', '--show-toplevel'])
    : 'unknown';

  return {
    branch: branch || 'unknown',
    base_branch: baseBranch || 'unknown',
    head: head || 'unknown',
    worktree: worktree || 'unknown',
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

function buildFinishReport({ auditId, slug, evidence, scannedInputs, choices }) {
  const accepted = choices.accepted.length > 0
    ? choices.accepted.map((item) => `- ${item.id}: ${item.summary}`).join('\n')
    : '- none';
  const rejected = choices.rejected.length > 0
    ? choices.rejected.map((item) => `- ${item.id}: ${item.summary}`).join('\n')
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
    `- status: needs-agent-audit`,
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
    '## Next Steps',
    '',
    '- Agent review the audit evidence and decide whether the finish state can advance.',
    '- Record the final audit decision once the audit is complete.',
    '',
  ].join('\n');
}

export async function finishAuditStage(cwd, slug, { env = process.env } = {}) {
  const auditId = finishAuditId(slug, new Date());
  const root = resolveFinishAuditPath(cwd, auditId);
  await mkdir(root, { recursive: true });

  const evidence = await resolveGitEvidence(cwd);
  const scannedInputs = [
    `slug=${normalizeSlug(slug) || 'finish-audit'}`,
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
    slug: normalizeSlug(slug),
    status: 'needs-agent-audit',
    inputs: {
      scanned: scannedInputs,
    },
    audit: {
      branch: evidence.branch,
      base_branch: evidence.base_branch,
      worktree: evidence.worktree,
      head: evidence.head,
    },
    choice: choices,
  };

  await writeFile(join(root, 'finish-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(join(root, 'finish-report.md'), buildFinishReport({
    auditId,
    slug: normalizeSlug(slug),
    evidence,
    scannedInputs,
    choices,
  }));

  return {
    auditId,
    root,
    state,
    reportPath: join(root, 'finish-report.md'),
    statePath: join(root, 'finish-state.json'),
  };
}
