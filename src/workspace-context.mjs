import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export function resolveWorkspaceContextPaths(cwd) {
  const workspaceRoot = join(resolve(cwd), '.loopx');
  const agentsRoot = join(workspaceRoot, 'agents');
  const contextRoot = join(workspaceRoot, 'context');
  return {
    workspaceRoot,
    agentsRoot,
    contextRoot,
    issueTracker: join(agentsRoot, 'issue-tracker.md'),
    agentDomain: join(agentsRoot, 'domain.md'),
    triageLabels: join(agentsRoot, 'triage-labels.md'),
    domainGlossary: join(contextRoot, 'domain.md'),
  };
}

async function writeIfMissing(path, text) {
  if (existsSync(path)) {
    return false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${text.replace(/\s+$/, '')}\n`);
  return true;
}

function defaultIssueTrackerDoc() {
  return [
    '# loopx Agent Issue Tracker',
    '',
    '## Mode',
    '',
    '- local: loopx does not publish external issues by default.',
    '',
    '## Usage',
    '',
    '- Plan may create vertical slices as local change artifacts.',
    '- External issue publication is an explicit human decision.',
  ].join('\n');
}

function defaultAgentDomainDoc() {
  return [
    '# loopx Agent Domain Docs',
    '',
    '## Layout',
    '',
    '- domain_glossary: `.loopx/context/domain.md`',
    '- adr_candidates: `.loopx/decisions/adr-candidates/`',
    '',
    '## Consumer Rules',
    '',
    '- Plan uses the glossary to name requirements, slices, and spec deltas.',
    '- Build uses the glossary to preserve implementation vocabulary.',
    '- Review uses the glossary to detect terminology drift and architecture smells.',
  ].join('\n');
}

function defaultTriageLabelsDoc() {
  return [
    '# loopx Agent Triage Labels',
    '',
    '## Canonical Roles',
    '',
    '- needs-triage',
    '- needs-info',
    '- ready-for-agent',
    '- ready-for-human',
    '- wontfix',
    '',
    '## Mapping',
    '',
    '- loopx keeps these as local advisory roles unless an external tracker is configured.',
  ].join('\n');
}

function defaultDomainGlossaryDoc() {
  return [
    '# loopx Domain Context',
    '',
    '## Canonical Terms',
    '',
    '- Change Delta: 已批准变更进入长期 specs 前的差量描述。',
    '- Vertical Slice: 可独立验证的端到端交付切片。',
    '',
    '## Avoid Terms',
    '',
    '- Ticket: use workflow, change, or slice unless referencing an external issue tracker.',
    '',
    '## Ambiguous Terms',
    '',
    '- Done: clarify whether this means review-approved runtime state or archived long-lived specs.',
    '',
    '## Relationships',
    '',
    '- A workflow owns one active change delta.',
    '- A change delta may contain multiple vertical slices.',
    '- Archive syncs accepted change deltas into long-lived specs.',
  ].join('\n');
}

function fileInfo(path) {
  return {
    path,
    exists: existsSync(path),
  };
}

export async function setupWorkspaceContext(cwd) {
  const paths = resolveWorkspaceContextPaths(cwd);
  await mkdir(paths.agentsRoot, { recursive: true });
  await mkdir(paths.contextRoot, { recursive: true });
  const created = [];
  for (const [path, text] of [
    [paths.issueTracker, defaultIssueTrackerDoc()],
    [paths.agentDomain, defaultAgentDomainDoc()],
    [paths.triageLabels, defaultTriageLabelsDoc()],
    [paths.domainGlossary, defaultDomainGlossaryDoc()],
  ]) {
    if (await writeIfMissing(path, text)) {
      created.push(path);
    }
  }
  return {
    status: 'complete',
    created,
    ...await inspectWorkspaceContext(cwd),
  };
}

export async function inspectWorkspaceContext(cwd) {
  const paths = resolveWorkspaceContextPaths(cwd);
  const agentDocs = {
    issueTracker: fileInfo(paths.issueTracker),
    domain: fileInfo(paths.agentDomain),
    triageLabels: fileInfo(paths.triageLabels),
  };
  const domainGlossary = fileInfo(paths.domainGlossary);
  const all = [agentDocs.issueTracker, agentDocs.domain, agentDocs.triageLabels, domainGlossary];
  const existing = all.filter((item) => item.exists);
  let status = 'missing';
  if (existing.length === all.length) {
    status = 'complete';
  } else if (existing.length > 0) {
    status = 'partial';
  }
  return {
    status,
    workspaceRoot: paths.workspaceRoot,
    agentsRoot: paths.agentsRoot,
    contextRoot: paths.contextRoot,
    agentDocs,
    domainGlossaryPath: paths.domainGlossary,
    domainGlossary,
  };
}

export async function readDomainGlossary(cwd) {
  const { domainGlossary } = resolveWorkspaceContextPaths(cwd);
  if (!existsSync(domainGlossary)) {
    return '';
  }
  return readFile(domainGlossary, 'utf8');
}
