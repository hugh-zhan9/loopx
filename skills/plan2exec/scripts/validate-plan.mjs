#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const VALID_PLAN_STATUS = new Set(['ready', 'blocked', 'complete']);
const VALID_SLICE_STATUS = new Set(['pending', 'in_progress', 'done', 'blocked']);

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

function parseListValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

export function parsePlanFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return { error: 'missing YAML frontmatter opening ---' };
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return { error: 'missing YAML frontmatter closing ---' };
  }
  const rawYaml = text.slice(4, end);
  const body = text.slice(end + 5);
  const data = { slices: [] };
  let inSlices = false;
  let currentSlice = null;

  for (const rawLine of rawYaml.split('\n')) {
    const line = stripComment(rawLine);
    if (!line.trim()) continue;
    if (line === 'slices:') {
      inSlices = true;
      continue;
    }
    if (!inSlices || !line.startsWith(' ')) {
      inSlices = false;
      const sep = line.indexOf(':');
      if (sep !== -1) {
        const key = line.slice(0, sep).trim();
        const val = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
        data[key] = val;
      }
      continue;
    }
    const itemStart = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (itemStart) {
      currentSlice = { id: itemStart[1].trim().replace(/^['"]|['"]$/g, ''), status: null, depends: null };
      data.slices.push(currentSlice);
      continue;
    }
    if (currentSlice) {
      const statusMatch = line.match(/^\s+status:\s*(.+)$/);
      if (statusMatch) {
        currentSlice.status = statusMatch[1].trim().replace(/^['"]|['"]$/g, '');
        continue;
      }
      const depMatch = line.match(/^\s+depends:\s*(.+)$/);
      if (depMatch) {
        currentSlice.depends = parseListValue(depMatch[1]);
      }
    }
  }

  return { data, body };
}

function normalizeWrites(rawWrites) {
  return rawWrites
    .replace(/`/g, '')
    .split(/[,;]\s*|\s+/)
    .map((p) => p.trim().replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(Boolean);
}

function pathsOverlap(a, b) {
  if (a === b) return true;
  if (a.endsWith('/*')) return b.startsWith(a.slice(0, -1));
  if (b.endsWith('/*')) return a.startsWith(b.slice(0, -1));
  return a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function isReachable(graph, start, target) {
  const visited = new Set();
  const stack = [...(graph.get(start) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === target) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of graph.get(node) ?? []) stack.push(next);
  }
  return false;
}

export function validatePlanDocument(text) {
  const errors = [];
  const parsed = parsePlanFrontmatter(text);
  if (parsed.error) {
    return { valid: false, errors: [parsed.error], slices: [] };
  }
  const { data, body } = parsed;

  if (data.schema !== 'loopx-plan/v1') {
    errors.push(`schema must be "loopx-plan/v1", got "${data.schema ?? ''}"`);
  }
  if (!data.source) {
    errors.push('frontmatter missing "source"');
  }
  if (!VALID_PLAN_STATUS.has(data.status)) {
    errors.push(`invalid plan status "${data.status ?? ''}" (expected ready | blocked | complete)`);
  }
  if (!Array.isArray(data.slices) || data.slices.length === 0) {
    errors.push('frontmatter must declare at least one slice');
    return { valid: false, errors, slices: [] };
  }

  const sliceIds = new Set();
  const depGraph = new Map();
  for (const slice of data.slices) {
    if (!slice.id) {
      errors.push('slice missing id');
      continue;
    }
    if (sliceIds.has(slice.id)) {
      errors.push(`duplicate slice id: ${slice.id}`);
    }
    sliceIds.add(slice.id);
    if (!VALID_SLICE_STATUS.has(slice.status)) {
      errors.push(`slice ${slice.id} has invalid status "${slice.status ?? ''}"`);
    }
    if (!Array.isArray(slice.depends)) {
      errors.push(`slice ${slice.id} must declare explicit depends list (e.g. depends: [])`);
    }
    depGraph.set(slice.id, Array.isArray(slice.depends) ? slice.depends : []);
  }

  // Check unknown dependencies and DAG cycles
  for (const [id, deps] of depGraph) {
    for (const dep of deps) {
      if (!sliceIds.has(dep)) {
        errors.push(`slice ${id} depends on unknown slice ${dep}`);
      }
    }
    if (isReachable(depGraph, id, id)) {
      errors.push(`dependency cycle detected involving slice ${id}`);
    }
  }

  // Parse body sections `## P-001 ...`
  const headingMatches = [...body.matchAll(/^##\s+(P-\d+)\b[^\n]*$/gm)];
  const bodySections = new Map();
  for (let i = 0; i < headingMatches.length; i += 1) {
    const match = headingMatches[i];
    const id = match[1];
    const start = match.index;
    const end = i + 1 < headingMatches.length ? headingMatches[i + 1].index : body.length;
    const sectionText = body.slice(start, end);
    if (bodySections.has(id)) {
      errors.push(`duplicate body section for slice ${id}`);
    }
    bodySections.set(id, sectionText);
  }

  const writesBySlice = new Map();
  for (const id of sliceIds) {
    const section = bodySections.get(id);
    if (!section) {
      errors.push(`missing body section "## ${id} ..."`);
      continue;
    }
    for (const meta of ['writes', 'anchors', 'architecture', 'verify']) {
      const m = section.match(new RegExp(`^>\\s*${meta}:\\s*(.+)$`, 'm'));
      if (!m || !m[1].trim()) {
        errors.push(`slice ${id} missing required meta line "> ${meta}:"`);
      } else if (meta === 'writes') {
        writesBySlice.set(id, normalizeWrites(m[1]));
      }
    }
  }

  for (const bodyId of bodySections.keys()) {
    if (!sliceIds.has(bodyId)) {
      errors.push(`body section "## ${bodyId}" not declared in frontmatter slices`);
    }
  }

  // Detect undeclared overlapping writes between independent (potentially parallel) slices
  const orderedIds = [...sliceIds];
  for (let i = 0; i < orderedIds.length; i += 1) {
    for (let j = i + 1; j < orderedIds.length; j += 1) {
      const a = orderedIds[i];
      const b = orderedIds[j];
      const ordered = isReachable(depGraph, a, b) || isReachable(depGraph, b, a);
      if (ordered) continue;
      const writesA = writesBySlice.get(a) ?? [];
      const writesB = writesBySlice.get(b) ?? [];
      for (const pathA of writesA) {
        for (const pathB of writesB) {
          if (pathsOverlap(pathA, pathB)) {
            errors.push(`independent slices ${a} and ${b} have overlapping writes (${pathA} vs ${pathB}); add an explicit depends edge or split ownership`);
          }
        }
      }
    }
  }

  if (data.status === 'complete' && data.slices.some((s) => s.status !== 'done')) {
    errors.push('plan status is "complete" while some slices are not "done"');
  }

  return {
    valid: errors.length === 0,
    errors,
    slices: orderedIds,
  };
}

async function main() {
  const target = process.argv[2];
  if (!target || target === '--help' || target === '-h') {
    console.log('Usage: node validate-plan.mjs <path-to-plan.md>');
    return;
  }
  const text = await readFile(resolve(target), 'utf8');
  const result = validatePlanDocument(text);
  if (!result.valid) {
    for (const err of result.errors) {
      console.error(`error: ${err}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`ok: validated loopx-plan/v1 (${result.slices.length} slices: ${result.slices.join(', ')})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
