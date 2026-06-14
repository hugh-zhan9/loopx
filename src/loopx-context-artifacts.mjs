import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const MAX_SPEC_CONTEXT_FILES = 12;

function displayPath(cwd, path) {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith('..') ? rel : path;
}

function normalizeChangedFiles(files = []) {
  return Array.isArray(files)
    ? files.map((file) => String(file || '').trim()).filter(Boolean)
    : [];
}

async function listMarkdownFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const found = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (entry.isFile() && /\.md$/i.test(entry.name)) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

function pathParts(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3);
}

function frontmatterAppliesTo(text) {
  if (!String(text || '').startsWith('---\n')) {
    return [];
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return [];
  }
  const lines = text.slice(4, end).split('\n');
  const values = [];
  let inAppliesTo = false;
  for (const line of lines) {
    if (/^applies_to:\s*$/.test(line)) {
      inAppliesTo = true;
      continue;
    }
    if (inAppliesTo && /^\s+-\s+/.test(line)) {
      values.push(line.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    if (inAppliesTo && /^\S/.test(line)) {
      inAppliesTo = false;
    }
  }
  return values.filter(Boolean);
}

function appliesToChangedFile(pattern, changedFile) {
  const normalizedPattern = String(pattern || '').replace(/\*\*?\/?/g, '').replace(/\/+$/, '');
  const normalizedFile = String(changedFile || '');
  return normalizedPattern && normalizedFile.includes(normalizedPattern);
}

async function specRecord(cwd, path, changedFiles) {
  const text = await readFile(path, 'utf8');
  const appliesTo = frontmatterAppliesTo(text);
  const stemParts = pathParts(basename(path, '.md'));
  const changedParts = new Set(changedFiles.flatMap(pathParts));
  const filenameMatch = stemParts.some((part) => changedParts.has(part));
  const appliesToMatch = appliesTo.some((pattern) => changedFiles.some((file) => appliesToChangedFile(pattern, file)));
  const isIndex = /(^|\/)index\.md$/i.test(path);
  const isInbox = /(^|\/)inbox\.md$/i.test(path);
  return {
    path: displayPath(cwd, path),
    appliesTo,
    relevant: isIndex || isInbox || filenameMatch || appliesToMatch || changedFiles.length === 0,
  };
}

export async function discoverLoopxContextArtifacts(cwd, options = {}) {
  const root = resolve(cwd);
  const changedFiles = normalizeChangedFiles(options.changedFiles);
  const specsRootPath = join(root, 'docs', 'loopx', 'specs');
  const specPaths = await listMarkdownFiles(specsRootPath);
  const records = await Promise.all(specPaths.map((path) => specRecord(root, path, changedFiles)));
  const relevantSpecs = records
    .filter((record) => record.relevant)
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, MAX_SPEC_CONTEXT_FILES);
  const memorySummaryPath = join(root, '.loopx', 'memory', 'MEMORY.md');
  const memoryIndexPath = join(root, '.loopx', 'memory', 'index.jsonl');
  return {
    specsRoot: existsSync(specsRootPath) ? displayPath(root, specsRootPath) : null,
    specFiles: relevantSpecs,
    memorySummary: existsSync(memorySummaryPath) ? { path: displayPath(root, memorySummaryPath) } : null,
    memoryIndex: existsSync(memoryIndexPath) ? { path: displayPath(root, memoryIndexPath) } : null,
  };
}
