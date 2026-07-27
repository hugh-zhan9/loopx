import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function resolveWorkspaceContextPaths(cwd) {
  const workspaceRoot = join(resolve(cwd), '.loopx');
  const contextRoot = join(workspaceRoot, 'context');
  return {
    workspaceRoot,
    contextRoot,
    domainGlossary: join(contextRoot, 'domain.md'),
  };
}

function defaultDomainContext() {
  return [
    '# Project Context',
    '',
    '## Domain Terms',
    '',
    '- [PENDING] Record terms whose meaning affects product or engineering decisions.',
    '',
    '## Boundaries',
    '',
    '- [PENDING] Record stable repository, product, compatibility, data, or security boundaries.',
    '',
    '## Evidence Sources',
    '',
    '- [PENDING] Record authoritative specifications, datasets, commands, or operational sources.',
  ].join('\n');
}

function fileInfo(path) {
  return { path, exists: existsSync(path) };
}

export async function setupWorkspaceContext(cwd) {
  const paths = resolveWorkspaceContextPaths(cwd);
  await mkdir(paths.contextRoot, { recursive: true });
  const created = [];
  if (!existsSync(paths.domainGlossary)) {
    await writeFile(paths.domainGlossary, `${defaultDomainContext()}\n`);
    created.push(paths.domainGlossary);
  }
  return {
    status: 'complete',
    created,
    ...await inspectWorkspaceContext(cwd),
  };
}

export async function inspectWorkspaceContext(cwd) {
  const paths = resolveWorkspaceContextPaths(cwd);
  const domainGlossary = fileInfo(paths.domainGlossary);
  return {
    status: domainGlossary.exists ? 'complete' : 'missing',
    workspaceRoot: paths.workspaceRoot,
    contextRoot: paths.contextRoot,
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
