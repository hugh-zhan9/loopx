import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

export const TEMPLATE_BASELINE_SCHEMA_VERSION = 1;
export const TEMPLATE_DRIFT_STATUSES = [
  'current',
  'outdated-pristine',
  'user-modified',
  'conflict',
  'unknown',
];

async function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

function sha256Text(text) {
  const hash = createHash('sha256');
  hash.update(text);
  return hash.digest('hex');
}

export function parseManagedBlocks(text) {
  const pattern = /<!--\s*loopx:managed:block\s+([A-Za-z0-9_.:-]+)\s*-->([\s\S]*?)<!--\s*\/loopx:managed:block\s+\1\s*-->/g;
  const blocks = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    blocks.push({
      id: match[1],
      content: match[2],
      start: match.index,
      end: pattern.lastIndex,
    });
  }
  return blocks;
}

function managedBlockSnapshot(text, managedBlockId = null) {
  const blocks = parseManagedBlocks(text)
    .filter((block) => !managedBlockId || block.id === managedBlockId);
  return blocks.map((block, index) => {
    const previousEnd = index === 0 ? 0 : blocks[index - 1].end;
    const nextStart = index === blocks.length - 1 ? text.length : blocks[index + 1].start;
    return {
      id: block.id,
      hash: sha256Text(block.content),
      protected_user_regions: [
        ...(text.slice(previousEnd, block.start).trim() ? [`before:${block.id}`] : []),
        ...(text.slice(block.end, nextStart).trim() ? [`after:${block.id}`] : []),
      ],
    };
  });
}

function normalizePath(root, path) {
  const resolved = resolve(path);
  const rel = relative(root, resolved);
  return rel && !rel.startsWith('..') ? rel : resolved;
}

export async function createTemplateBaseline(root, items, options = {}) {
  const resolvedRoot = resolve(root);
  const baselineItems = [];
  for (const item of items) {
    const targetPath = resolve(item.path);
    const sourcePath = resolve(item.sourcePath || item.path);
    const currentHash = existsSync(targetPath) ? await sha256File(targetPath) : null;
    const registryHash = existsSync(sourcePath) ? await sha256File(sourcePath) : currentHash;
    const targetText = existsSync(targetPath) ? await readFile(targetPath, 'utf8') : '';
    const sourceText = existsSync(sourcePath) ? await readFile(sourcePath, 'utf8') : targetText;
    const managedBlockId = item.managedBlockId || null;
    baselineItems.push({
      path: normalizePath(resolvedRoot, targetPath),
      source_path: normalizePath(resolvedRoot, sourcePath),
      kind: item.kind || 'file',
      hash: currentHash,
      registry_hash: registryHash,
      managed_block_id: managedBlockId,
      managed_block_hashes: managedBlockSnapshot(targetText, managedBlockId),
      registry_managed_block_hashes: managedBlockSnapshot(sourceText, managedBlockId),
      installed_at: options.installedAt || new Date().toISOString(),
    });
  }
  return {
    schema_version: TEMPLATE_BASELINE_SCHEMA_VERSION,
    generated_by: 'loopx',
    registry_revision: options.registryRevision || 'local',
    items: baselineItems,
  };
}

export async function readTemplateBaseline(path) {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeTemplateBaseline(path, baseline) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

function resolveItemPath(itemPath, explicitPath, root) {
  if (explicitPath) {
    return resolve(explicitPath);
  }
  return root ? resolve(root, itemPath) : resolve(itemPath);
}

export async function classifyTemplateDrift(item, options = {}) {
  if (!item || item.hash === undefined || item.hash === null) {
    return { status: 'unknown', reason: 'missing_baseline_hash' };
  }
  const targetPath = resolveItemPath(item.path, options.targetPath, options.root);
  const sourcePath = resolveItemPath(item.source_path || item.path, options.sourcePath, options.root);
  if (!existsSync(targetPath)) {
    return { status: 'unknown', reason: 'missing_target' };
  }

  const currentHash = await sha256File(targetPath);
  const baselineHash = item.hash;
  const registryHash = existsSync(sourcePath) ? await sha256File(sourcePath) : (item.registry_hash || baselineHash);
  if (item.managed_block_id || (Array.isArray(item.managed_block_hashes) && item.managed_block_hashes.length > 0)) {
    const targetText = await readFile(targetPath, 'utf8');
    const sourceText = existsSync(sourcePath) ? await readFile(sourcePath, 'utf8') : targetText;
    const currentBlocks = managedBlockSnapshot(targetText, item.managed_block_id);
    const registryBlocks = managedBlockSnapshot(sourceText, item.managed_block_id);
    const baselineBlocks = Array.isArray(item.managed_block_hashes) ? item.managed_block_hashes : [];
    if (baselineBlocks.length === 0 || currentBlocks.length !== baselineBlocks.length) {
      return { status: 'unknown', reason: 'missing_managed_block' };
    }
    const currentMatchesBaseline = currentBlocks.every((block) => baselineBlocks.some((baseline) => baseline.id === block.id && baseline.hash === block.hash));
    const registryMatchesBaseline = registryBlocks.length === baselineBlocks.length
      && registryBlocks.every((block) => baselineBlocks.some((baseline) => baseline.id === block.id && baseline.hash === block.hash));
    const currentMatchesRegistry = currentBlocks.length === registryBlocks.length
      && currentBlocks.every((block) => registryBlocks.some((registry) => registry.id === block.id && registry.hash === block.hash));
    const protectedRegions = [...new Set(currentBlocks.flatMap((block) => block.protected_user_regions || []))];
    const blockResult = {
      currentHash,
      registryHash,
      baselineHash,
      managedBlockHashes: currentBlocks,
      protected_user_regions: protectedRegions,
    };
    if (currentMatchesRegistry) {
      return { status: 'current', ...blockResult };
    }
    if (currentMatchesBaseline && !registryMatchesBaseline) {
      return { status: 'outdated-pristine', ...blockResult };
    }
    if (registryMatchesBaseline && !currentMatchesBaseline) {
      return { status: 'user-modified', ...blockResult };
    }
    return { status: 'conflict', ...blockResult };
  }

  if (currentHash === registryHash) {
    return {
      status: 'current',
      currentHash,
      registryHash,
      baselineHash,
    };
  }
  if (currentHash === baselineHash && registryHash !== baselineHash) {
    return {
      status: 'outdated-pristine',
      currentHash,
      registryHash,
      baselineHash,
    };
  }
  if (registryHash === baselineHash && currentHash !== baselineHash) {
    return {
      status: 'user-modified',
      currentHash,
      registryHash,
      baselineHash,
    };
  }
  return {
    status: 'conflict',
    currentHash,
    registryHash,
    baselineHash,
  };
}

export async function inspectTemplateGovernance(baselinePath) {
  const baseline = await readTemplateBaseline(baselinePath);
  if (!baseline) {
    return {
      schema_version: TEMPLATE_BASELINE_SCHEMA_VERSION,
      status: 'missing',
      baselinePath,
      items: [],
      summary: {},
    };
  }
  const items = [];
  const baselineRoot = dirname(dirname(resolve(baselinePath)));
  for (const item of baseline.items || []) {
    const drift = await classifyTemplateDrift(item, { root: baselineRoot });
    items.push({ ...item, drift_status: drift.status, drift_reason: drift.reason || null });
  }
  const summary = {};
  for (const item of items) {
    summary[item.drift_status] = (summary[item.drift_status] || 0) + 1;
  }
  const nonCurrent = items.find((item) => item.drift_status !== 'current');
  return {
    schema_version: baseline.schema_version || TEMPLATE_BASELINE_SCHEMA_VERSION,
    status: nonCurrent ? 'drift' : 'current',
    baselinePath,
    items,
    summary,
  };
}
