import { cp, lstat, mkdir, readFile, readdir, readlink, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyTemplateDrift,
  createTemplateBaseline,
  inspectTemplateGovernance,
  readTemplateBaseline,
  writeTemplateBaseline,
} from './template-governance.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, '..');
export const LOOPX_CANONICAL_WORKFLOW_SKILLS = Object.freeze([
  'clarify',
  'spec',
  'plan2exec',
]);
const LOOPX_SKILLS = [
  'clarify',
  'spec',
  'codebase-spec',
  'plan2exec',
  'plan-reviewer',
  'issue',
  'fix',
  'refactor-plan',
  'debug',
  'tdd',
  'verify',
  'using-git-worktrees',
  'doc-readability',
  'humanize-doc',
  'requirement-analyzer',
  'go-style',
  'kratos',
  'api-designer',
  'architecture-designer',
  'sql-style',
  'cli-developer',
  'lancet',
];
const LOOPX_RETIRED_SKILLS = Object.freeze([
  'plan',
  'plan-to-exec',
]);
const LOOPX_INSTALLATION_IDENTITY = 'loopx';
const LOOPX_MANAGED_SCRIPT_ITEMS = [
  // v0.8 docs-first: no per-turn workflow hooks. The working agreement is the
  // discipline channel and travels in the managed guidance block below.
];
const LOOPX_AGENT_GUIDANCE_BLOCK_ID = 'specs-and-memory-context';
const LOOPX_AGENT_GUIDANCE_HEADING = '## loopx Specs And Memory';
const LOOPX_AGENT_GUIDANCE_CONTENT = [
  LOOPX_AGENT_GUIDANCE_HEADING,
  '',
  'When working in a repository that uses loopx:',
  '',
  '- If `docs/loopx/specs/` exists, inspect relevant specs before clarify, spec, plan2exec, implementation, or review. Use `docs/loopx/specs/index.md` as a map when present, but do not require it.',
  '- If `.loopx/memory/MEMORY.md` exists, read it as curated project memory.',
  '- If `.loopx/memory/index.jsonl` exists, use it only to find relevant active memory cards.',
  '- Treat current user instructions and named source documents as highest priority, repo specs as binding long-lived rules, and memory as advisory context.',
].join('\n');
const LOOPX_ROUTING_GUIDANCE_BLOCK_ID = 'prompt-first-routing';
const LOOPX_ROUTING_GUIDANCE_CONTENT = readFileSync(
  join(PROJECT_ROOT, 'templates', 'working-agreement.md'),
  'utf8',
).trim();
const TEMPLATE_BASELINE_SCHEMA_VERSION = Number.parseInt('1', 10);
const LOOPX_GOVERNED_SOURCE_ITEMS = [
  {
    name: 'loopx-plugin-manifest',
    kind: 'plugin',
    sourceRelativePath: 'plugins/loopx/.codex-plugin/plugin.json',
  },
  {
    name: 'loopx-plugin-install-script',
    kind: 'plugin',
    sourceRelativePath: 'plugins/loopx/scripts/plugin-install.mjs',
  },
  {
    name: 'workflow-template-spec',
    kind: 'workflow-template',
    sourceRelativePath: 'templates/spec.md',
  },
];

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isoNow() {
  return new Date().toISOString();
}

export function getProjectRoot(env = process.env) {
  return resolve(env.LOOPX_PROJECT_ROOT || PROJECT_ROOT);
}

export function getAgentsRoot(env = process.env) {
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  return resolve(env.LOOPX_AGENTS_ROOT || join(home, '.agents'));
}

export function getInstalledSkillsRoot(env = process.env) {
  return resolve(env.LOOPX_SKILLS_ROOT || join(getAgentsRoot(env), 'skills'));
}

export function getClaudeSkillsRoot(env = process.env) {
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  return resolve(env.LOOPX_CLAUDE_SKILLS_ROOT || join(home, '.claude', 'skills'));
}

export function getClaudeSettingsPath(env = process.env) {
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  return resolve(env.LOOPX_CLAUDE_SETTINGS_PATH || join(home, '.claude', 'settings.json'));
}

export function getCodexAgentsPath(env = process.env) {
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  return resolve(env.LOOPX_CODEX_AGENTS_PATH || join(home, '.codex', 'AGENTS.md'));
}

export function getClaudeAgentsPath(env = process.env, options = {}) {
  if (options.project === true) {
    return resolve(env.LOOPX_INSTALL_CWD || process.cwd(), 'CLAUDE.md');
  }
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  return resolve(env.LOOPX_CLAUDE_AGENTS_PATH || join(home, '.claude', 'CLAUDE.md'));
}

export function getSkillLockPath(env = process.env) {
  return resolve(env.LOOPX_SKILL_LOCK_PATH || join(getAgentsRoot(env), '.skill-lock.json'));
}

export function getSkillSourceRoot(env = process.env) {
  return resolve(env.LOOPX_SKILL_SOURCE_ROOT || join(getProjectRoot(env), 'skills'));
}

export function getTemplateBaselinePath(env = process.env) {
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  return resolve(env.LOOPX_TEMPLATE_BASELINE_PATH || join(home, '.loopx', 'template-hashes.json'));
}

function getInstallOptions(options = {}, env = process.env) {
  return {
    installationIdentity: options.installationIdentity || env.LOOPX_INSTALLATION_IDENTITY || LOOPX_INSTALLATION_IDENTITY,
    distributionChannel: options.distributionChannel || env.LOOPX_DISTRIBUTION_CHANNEL || 'npm',
    sourceUrl: resolve(options.sourceUrl || env.LOOPX_SOURCE_URL || getProjectRoot(env)),
    skillSourceRoot: resolve(options.skillSourceRoot || getSkillSourceRoot(env)),
    installMethod: options.installMethod || env.LOOPX_INSTALL_METHOD || 'copy',
  };
}

function skillSourceDir(skillName, env = process.env, skillSourceRoot = getSkillSourceRoot(env)) {
  return join(skillSourceRoot, skillName);
}

function projectSourceEntry(relativePath, env = process.env) {
  const configuredPath = join(getProjectRoot(env), relativePath);
  if (existsSync(configuredPath)) {
    return configuredPath;
  }
  return join(PROJECT_ROOT, relativePath);
}

function skillSourceEntry(skillName, env = process.env, skillSourceRoot = getSkillSourceRoot(env)) {
  return join(skillSourceDir(skillName, env, skillSourceRoot), 'SKILL.md');
}

function installedSkillDir(skillName, env = process.env) {
  return join(getInstalledSkillsRoot(env), skillName);
}

function sharedContractsSourceDir(env = process.env, skillSourceRoot = getSkillSourceRoot(env)) {
  return join(skillSourceRoot, 'shared');
}

function installedSharedContractsDir(env = process.env) {
  return join(getInstalledSkillsRoot(env), 'shared');
}

function installedManagedScriptPath(item, env = process.env) {
  return join(installTemplateRoot(env), item.targetRelativePath);
}

function managedScriptItemsForTarget(target) {
  return LOOPX_MANAGED_SCRIPT_ITEMS.filter((item) => !Array.isArray(item.targets) || item.targets.includes(target || 'codex'));
}

async function fileHash(path) {
  const hash = createHash('sha1');
  const stat = await lstat(path);
  if (stat.isDirectory()) {
    const entries = (await readdir(path)).sort();
    hash.update(path);
    for (const entry of entries) {
      hash.update(await fileHash(join(path, entry)));
    }
    return hash.digest('hex');
  }

  hash.update(await readFile(path));
  return hash.digest('hex');
}

async function sharedContractsHash(path) {
  const hash = createHash('sha1');
  async function visit(currentPath, relativePath) {
    const metadata = await lstat(currentPath);
    const normalized = relativePath.split('\\').join('/');
    if (metadata.isDirectory()) {
      hash.update(`directory\0${normalized}\0`);
      for (const entry of (await readdir(currentPath)).sort()) {
        await visit(join(currentPath, entry), normalized ? `${normalized}/${entry}` : entry);
      }
      return;
    }
    if (metadata.isSymbolicLink()) {
      hash.update(`symlink\0${normalized}\0${await readlink(currentPath)}\0`);
      return;
    }
    hash.update(`file\0${normalized}\0`);
    hash.update(await readFile(currentPath));
    hash.update('\0');
  }
  await visit(path, '');
  return hash.digest('hex');
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function readSkillLock(env = process.env) {
  const path = getSkillLockPath(env);
  if (!existsSync(path)) {
    return {
      path,
      data: {
        version: 3,
        skills: {},
      },
    };
  }

  return {
    path,
    data: JSON.parse(await readFile(path, 'utf8')),
  };
}

async function writeSkillLock(data, env = process.env) {
  const path = getSkillLockPath(env);
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function readJsonFile(path, fallback) {
  if (!existsSync(path)) {
    return jsonClone(fallback);
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return jsonClone(fallback);
  }
}

async function removeInstalledSkill(path) {
  if (!existsSync(path)) {
    return;
  }
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    await unlink(path);
    return;
  }
  await rm(path, { recursive: true, force: true });
}

async function materializeSkill(skillName, env = process.env, options = {}) {
  const sourceDir = skillSourceDir(skillName, env, options.skillSourceRoot);
  if (!existsSync(sourceDir) || !existsSync(skillSourceEntry(skillName, env, options.skillSourceRoot))) {
    throw new Error(`missing_skill_source:${skillName}`);
  }

  const targetDir = installedSkillDir(skillName, env);
  await ensureDir(dirname(targetDir));
  await removeInstalledSkill(targetDir);

  let installMethod = options.installMethod === 'symlink' ? 'symlink' : 'copy';
  if (installMethod === 'symlink') {
    try {
      await symlink(sourceDir, targetDir, 'dir');
    } catch {
      installMethod = 'copy';
      await cp(sourceDir, targetDir, { recursive: true });
    }
  } else {
    await cp(sourceDir, targetDir, { recursive: true });
  }

  return {
    skillName,
    sourceDir,
    targetDir,
    installMethod,
    skillFolderHash: await fileHash(sourceDir),
  };
}

function installTemplateRoot(env = process.env) {
  return resolve(env.LOOPX_HOME || env.HOME || process.cwd());
}

function templateItemKey(item) {
  return `${item.kind || 'file'}:${item.path}`;
}

function skillTemplatePaths(skillName, env = process.env, options = {}) {
  return {
    targetPath: skillSourceEntry(skillName, env, getInstalledSkillsRoot(env)),
    sourcePath: skillSourceEntry(skillName, env, options.skillSourceRoot),
  };
}

function managedScriptTemplatePaths(item, env = process.env) {
  return {
    targetPath: installedManagedScriptPath(item, env),
    sourcePath: projectSourceEntry(item.sourceRelativePath, env),
  };
}

function governedSourceTemplatePaths(item, env = process.env) {
  const sourcePath = projectSourceEntry(item.sourceRelativePath, env);
  return {
    targetPath: sourcePath,
    sourcePath,
  };
}

async function createSkillTemplateItem(skillName, env = process.env, options = {}) {
  const { targetPath, sourcePath } = skillTemplatePaths(skillName, env, options);
  const baseline = await createTemplateBaseline(installTemplateRoot(env), [{
    path: targetPath,
    sourcePath,
    kind: 'skill',
  }], {
    registryRevision: options.sourceUrl || 'local',
  });
  return baseline.items[0];
}

async function createManagedScriptTemplateItem(item, env = process.env) {
  const { targetPath, sourcePath } = managedScriptTemplatePaths(item, env);
  if (!existsSync(sourcePath)) {
    return null;
  }
  const baseline = await createTemplateBaseline(installTemplateRoot(env), [{
    path: targetPath,
    sourcePath,
    kind: item.kind || 'file',
  }], {
    registryRevision: item.sourceRelativePath,
  });
  return baseline.items[0];
}

async function createGovernedSourceTemplateItem(item, env = process.env, options = {}) {
  const { targetPath, sourcePath } = governedSourceTemplatePaths(item, env);
  if (!existsSync(sourcePath)) {
    return null;
  }
  const baseline = await createTemplateBaseline(installTemplateRoot(env), [{
    path: targetPath,
    sourcePath,
    kind: item.kind || 'file',
  }], {
    registryRevision: options.sourceUrl || item.sourceRelativePath,
  });
  return baseline.items[0];
}

async function templateGovernanceBeforeInstall(skillName, baselineItemsByPath, env = process.env, options = {}) {
  const { targetPath, sourcePath } = skillTemplatePaths(skillName, env, options);
  const probe = await createSkillTemplateItem(skillName, env, options);
  const existing = baselineItemsByPath.get(templateItemKey(probe));
  if (!existing) {
    return { action: 'install', drift: { status: 'unknown', reason: 'missing_baseline_item' }, item: null };
  }
  const drift = await classifyTemplateDrift(existing, {
    root: installTemplateRoot(env),
    targetPath,
    sourcePath,
  });
  if (drift.status === 'user-modified' || drift.status === 'conflict') {
    return { action: 'skip-user-modified', drift, item: existing };
  }
  return { action: 'install', drift, item: existing };
}

async function mergedSkippedTemplateItem(skillName, existing, env = process.env, options = {}) {
  const latest = await createSkillTemplateItem(skillName, env, options);
  return {
    ...existing,
    source_path: latest.source_path,
    registry_hash: latest.registry_hash,
    registry_managed_block_hashes: latest.registry_managed_block_hashes,
  };
}

async function mergedSkippedManagedScriptItem(item, existing, env = process.env) {
  const latest = await createManagedScriptTemplateItem(item, env);
  if (!latest) {
    return existing;
  }
  return {
    ...existing,
    source_path: latest.source_path,
    registry_hash: latest.registry_hash,
    registry_managed_block_hashes: latest.registry_managed_block_hashes,
  };
}

function buildRegistryRow(record, env = process.env, options = {}) {
  return {
    source: 'loopx',
    sourceType: 'local',
    installationIdentity: options.installationIdentity,
    distributionChannel: options.distributionChannel,
    sourceUrl: options.sourceUrl,
    skillPath: `skills/${record.skillName}/SKILL.md`,
    installedPath: record.targetDir,
    installMethod: record.installMethod,
    installedAt: isoNow(),
    updatedAt: isoNow(),
    skillFolderHash: record.skillFolderHash,
    target: options.target || 'codex',
    provenance: [
      {
        distributionChannel: options.distributionChannel,
        sourceUrl: options.sourceUrl,
      },
    ],
  };
}

function isLoopxOwnedIdentity(skillName, row, env = process.env) {
  return Boolean(
    row
      && row.source === 'loopx'
      && row.sourceType === 'local'
      && (
        row.installationIdentity === LOOPX_INSTALLATION_IDENTITY
        || row.sourceUrl === getProjectRoot(env)
      )
      && row.skillPath === `skills/${skillName}/SKILL.md`
      && typeof row.installedPath === 'string',
  );
}

function isLoopxOwnedRow(skillName, row, env = process.env) {
  return Boolean(
    isLoopxOwnedIdentity(skillName, row, env)
      && typeof row.installedPath === 'string'
      && row.installedPath === installedSkillDir(skillName, env),
  );
}

async function removeRetiredOwnedSkills(skillRows, env = process.env) {
  const removed = [];
  for (const skillName of LOOPX_RETIRED_SKILLS) {
    const row = skillRows[skillName];
    if (!isLoopxOwnedRow(skillName, row, env)) {
      continue;
    }
    await removeInstalledSkill(row.installedPath);
    delete skillRows[skillName];
    removed.push({
      skillName,
      installedPath: row.installedPath,
    });
  }
  return removed;
}

async function removeStaleOwnedInstall(currentRow) {
  if (!currentRow?.installedPath || !existsSync(currentRow.installedPath)) {
    return;
  }
  await removeInstalledSkill(currentRow.installedPath);
}

async function removeInstalledFile(path) {
  if (!existsSync(path)) {
    return;
  }
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    await unlink(path);
    return;
  }
  await rm(path, { force: true });
}

function managedBlockMarkers(id) {
  return {
    start: `<!-- loopx:managed:block ${id} -->`,
    end: `<!-- /loopx:managed:block ${id} -->`,
  };
}

function renderManagedBlock(id, content) {
  const markers = managedBlockMarkers(id);
  return `${markers.start}\n${content.trim()}\n${markers.end}`;
}

function managedBlockPattern(id) {
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<!--\\s*loopx:managed:block\\s+${escaped}\\s*-->[\\s\\S]*?<!--\\s*\\/loopx:managed:block\\s+${escaped}\\s*-->`);
}

function upsertManagedBlock(existing, id, content) {
  const nextBlock = renderManagedBlock(id, content);
  const pattern = managedBlockPattern(id);
  if (pattern.test(existing)) {
    const nextContent = existing.replace(pattern, nextBlock);
    return {
      content: nextContent,
      changed: nextContent !== existing,
      existed: true,
    };
  }
  const trimmed = existing.trimEnd();
  const contentWithBlock = trimmed
    ? `${trimmed}\n\n${nextBlock}\n`
    : `${nextBlock}\n`;
  return {
    content: contentWithBlock,
    changed: true,
    existed: false,
  };
}

export async function installAgentGuidanceFile(path, options = {}) {
  const content = options.content || LOOPX_AGENT_GUIDANCE_CONTENT;
  const id = options.id || LOOPX_AGENT_GUIDANCE_BLOCK_ID;
  const existing = existsSync(path) ? await readFile(path, 'utf8') : '';
  const existed = existsSync(path);
  const next = upsertManagedBlock(existing, id, content);
  if (!next.changed) {
    return { status: 'already-current', path };
  }
  await ensureDir(dirname(path));
  await writeFile(path, `${next.content.replace(/\s+$/, '')}\n`);
  return {
    status: next.existed ? 'updated' : (existed ? 'installed' : 'created'),
    path,
  };
}

function contextGuidanceEnabled(options = {}) {
  return Boolean(options.agentGuidance || options.codexAgentsGuidance);
}

export async function installAgentGuidance(env = process.env, options = {}) {
  const target = options.target || env.LOOPX_INSTALL_TARGET || 'codex';
  const contextEnabled = contextGuidanceEnabled(options);
  const result = {};
  if (target === 'codex' || target === 'all') {
    const path = getCodexAgentsPath(env);
    result.codex = await installAgentGuidanceFile(path, {
      content: LOOPX_ROUTING_GUIDANCE_CONTENT,
      id: LOOPX_ROUTING_GUIDANCE_BLOCK_ID,
    });
    result.codex.context = contextEnabled
      ? await installAgentGuidanceFile(path)
      : { status: 'recommended', path };
  }
  if (target === 'claude' || target === 'all') {
    const path = getClaudeAgentsPath(env, options);
    result.claude = await installAgentGuidanceFile(path, {
      content: LOOPX_ROUTING_GUIDANCE_CONTENT,
      id: LOOPX_ROUTING_GUIDANCE_BLOCK_ID,
    });
    result.claude.context = contextEnabled
      ? await installAgentGuidanceFile(path)
      : { status: 'recommended', path };
  }
  return result;
}

async function canonicalTargetOwnership(skillName, env = process.env, options = {}) {
  const targetDir = installedSkillDir(skillName, env);
  const sourceDir = skillSourceDir(skillName, env, options.skillSourceRoot);
  if (!existsSync(targetDir)) {
    return { exists: false, owned: false };
  }

  const stat = await lstat(targetDir);
  if (stat.isSymbolicLink()) {
    const linkTarget = await readlink(targetDir);
    const resolvedLink = resolve(dirname(targetDir), linkTarget);
    return {
      exists: true,
      owned: resolvedLink === sourceDir,
    };
  }

  if (stat.isDirectory()) {
    return {
      exists: true,
      owned: await fileHash(targetDir) === await fileHash(sourceDir),
    };
  }

  return { exists: true, owned: false };
}

async function canonicalFileOwnership(targetPath, sourcePath) {
  if (!existsSync(targetPath)) {
    return { exists: false, owned: false };
  }

  const stat = await lstat(targetPath);
  if (stat.isSymbolicLink()) {
    const linkTarget = await readlink(targetPath);
    const resolvedLink = resolve(dirname(targetPath), linkTarget);
    return {
      exists: true,
      owned: resolvedLink === sourcePath,
    };
  }

  if (stat.isFile()) {
    return {
      exists: true,
      owned: await fileHash(targetPath) === await fileHash(sourcePath),
    };
  }

  return { exists: true, owned: false };
}

async function assertLoopxOwnedTarget(skillName, currentRow, env = process.env, options = {}) {
  const targetDir = installedSkillDir(skillName, env);
  const dirExists = existsSync(targetDir);
  const rowExists = currentRow !== null && currentRow !== undefined;

  if (!dirExists && !rowExists) {
    return { allowed: true, targetDir };
  }

  if (isLoopxOwnedIdentity(skillName, currentRow, env)) {
    if (currentRow.installedPath !== targetDir) {
      const canonicalTarget = await canonicalTargetOwnership(skillName, env, options);
      if (canonicalTarget.exists && !canonicalTarget.owned) {
        return {
          allowed: false,
          targetDir,
          reason: 'canonical_target_occupied',
        };
      }
      await removeStaleOwnedInstall(currentRow);
      return {
        allowed: true,
        targetDir,
        staleOwned: true,
      };
    }
    return { allowed: true, targetDir };
  }

  if (!isLoopxOwnedRow(skillName, currentRow, env)) {
    return {
      allowed: false,
      targetDir,
      reason: 'foreign_or_unowned_target',
    };
  }

  return { allowed: true, targetDir };
}

export async function inspectInstallState(env = process.env) {
  const { data } = await readSkillLock(env);
  const installedRoot = getInstalledSkillsRoot(env);
  const bySkill = {};

  for (const skillName of LOOPX_SKILLS) {
    const targetDir = installedSkillDir(skillName, env);
    const registryRow = data.skills?.[skillName] ?? null;
    bySkill[skillName] = {
      installedDirExists: existsSync(targetDir),
      registryRowExists: registryRow !== null,
      registryRow,
      discovered: existsSync(targetDir) && isLoopxOwnedRow(skillName, registryRow, env),
      loopxOwned: isLoopxOwnedIdentity(skillName, registryRow, env),
    };
  }

  const managedArtifacts = {};
  for (const item of managedScriptItemsForTarget(env.LOOPX_INSTALL_TARGET || 'codex')) {
    const targetPath = installedManagedScriptPath(item, env);
    const sourcePath = projectSourceEntry(item.sourceRelativePath, env);
    if (!existsSync(sourcePath)) {
      managedArtifacts[item.name] = {
        kind: item.kind,
        targetPath,
        sourcePath,
        installed: existsSync(targetPath),
        discovered: false,
        loopxOwned: false,
        available: false,
      };
      continue;
    }
    const ownership = await canonicalFileOwnership(targetPath, sourcePath);
    managedArtifacts[item.name] = {
      kind: item.kind,
      targetPath,
      sourcePath,
      installed: ownership.exists,
      discovered: ownership.exists && ownership.owned,
      loopxOwned: ownership.owned,
      available: true,
    };
  }

  const sharedSource = sharedContractsSourceDir(env);
  const sharedTarget = installedSharedContractsDir(env);
  const sharedContracts = {
    sourcePath: sharedSource,
    installedPath: sharedTarget,
    available: existsSync(sharedSource),
    installed: existsSync(sharedTarget),
    discovered: existsSync(sharedSource)
      && existsSync(sharedTarget)
      && await sharedContractsHash(sharedSource) === await sharedContractsHash(sharedTarget),
  };

  return {
    projectRoot: getProjectRoot(env),
    installedSkillsRoot: installedRoot,
    skillLockPath: getSkillLockPath(env),
    skills: bySkill,
    sharedContracts,
    managedArtifacts,
  };
}

export async function verifyInstallState(env = process.env) {
  const inspection = await inspectInstallState(env);
  const failures = [];

  for (const skillName of LOOPX_SKILLS) {
    const info = inspection.skills[skillName];
    if (!info.installedDirExists) {
      failures.push(`missing_installed_skill_dir:${skillName}`);
    }
    if (!info.registryRowExists) {
      failures.push(`missing_skill_lock_row:${skillName}`);
    }
    if (!info.discovered) {
      failures.push(`discovery_incomplete:${skillName}`);
    }
  }

  if (inspection.sharedContracts.available && !inspection.sharedContracts.installed) {
    failures.push('missing_shared_contracts');
  } else if (inspection.sharedContracts.available && !inspection.sharedContracts.discovered) {
    failures.push('shared_contracts_drifted');
  }

  for (const item of managedScriptItemsForTarget(env.LOOPX_INSTALL_TARGET || 'codex')) {
    const info = inspection.managedArtifacts?.[item.name];
    if (!info?.available) {
      continue;
    }
    if (!info?.installed) {
      failures.push(`missing_managed_artifact:${item.name}`);
    }
    if (!info?.discovered) {
      failures.push(`managed_artifact_unowned:${item.name}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    inspection,
  };
}

export async function installBundledSkills(env = process.env, options = {}) {
  const installOptions = getInstallOptions(options, env);
  const { data } = await readSkillLock(env);
  const nextData = jsonClone(data);
  nextData.version = nextData.version || 3;
  nextData.skills = nextData.skills || {};
  const baselinePath = getTemplateBaselinePath(env);
  const existingBaseline = await readTemplateBaseline(baselinePath);
  const baselineItemsByPath = new Map((existingBaseline?.items || []).map((item) => [templateItemKey(item), item]));

  const installed = [];
  const conflicts = [];
  const skipped = [];
  const removed = await removeRetiredOwnedSkills(nextData.skills, env);
  const nextTemplateItems = [];
  const sharedSource = sharedContractsSourceDir(env, installOptions.skillSourceRoot);
  const sharedTarget = installedSharedContractsDir(env);
  if (existsSync(sharedSource)) {
    if (existsSync(sharedTarget) && await sharedContractsHash(sharedTarget) !== await sharedContractsHash(sharedSource)) {
      conflicts.push({
        skillName: 'shared-contracts',
        reason: 'foreign_or_modified_shared_contracts',
        installedPath: sharedTarget,
      });
    } else {
      await removeInstalledSkill(sharedTarget);
      await ensureDir(dirname(sharedTarget));
      await cp(sharedSource, sharedTarget, { recursive: true });
    }
  }
  for (const skillName of LOOPX_SKILLS) {
    const current = nextData.skills[skillName];
    const ownership = await assertLoopxOwnedTarget(skillName, current, env, installOptions);
    if (!ownership.allowed) {
      conflicts.push({
        skillName,
        reason: ownership.reason,
        installedPath: ownership.targetDir,
      });
      continue;
    }
    const governance = await templateGovernanceBeforeInstall(skillName, baselineItemsByPath, env, installOptions);
    if (governance.action === 'skip-user-modified') {
      skipped.push({
        skillName,
        reason: governance.drift.status,
        installedPath: ownership.targetDir,
      });
      nextTemplateItems.push(await mergedSkippedTemplateItem(skillName, governance.item, env, installOptions));
      continue;
    }
    const record = await materializeSkill(skillName, env, installOptions);
    const row = buildRegistryRow(record, env, installOptions);
    if (current?.installedAt) {
      row.installedAt = current.installedAt;
    }
    if (Array.isArray(current?.provenance)) {
      const mergedProvenance = [
        ...current.provenance,
        ...row.provenance,
      ].filter((item, index, array) => array.findIndex((candidate) => candidate.distributionChannel === item.distributionChannel && candidate.sourceUrl === item.sourceUrl) === index);
      row.provenance = mergedProvenance;
    }
    nextData.skills[skillName] = row;
    nextTemplateItems.push(await createSkillTemplateItem(skillName, env, installOptions));
    installed.push(row);
  }

  for (const item of managedScriptItemsForTarget(options.target || env.LOOPX_INSTALL_TARGET || 'codex')) {
    const { targetPath, sourcePath } = managedScriptTemplatePaths(item, env);
    if (!existsSync(sourcePath)) {
      continue;
    }
    const probe = await createManagedScriptTemplateItem(item, env);
    if (!probe) {
      continue;
    }
    const existing = baselineItemsByPath.get(templateItemKey(probe));
    if (existing) {
      const drift = await classifyTemplateDrift(existing, {
        root: installTemplateRoot(env),
        targetPath,
        sourcePath,
      });
      if (drift.status === 'user-modified' || drift.status === 'conflict') {
        skipped.push({
          skillName: item.name,
          reason: drift.status,
          installedPath: targetPath,
        });
        nextTemplateItems.push(await mergedSkippedManagedScriptItem(item, existing, env));
        continue;
      }
    }
    await ensureDir(dirname(targetPath));
    await removeInstalledFile(targetPath);
    await cp(sourcePath, targetPath);
    nextTemplateItems.push(await createManagedScriptTemplateItem(item, env));
  }

  for (const item of LOOPX_GOVERNED_SOURCE_ITEMS) {
    const templateItem = await createGovernedSourceTemplateItem(item, env, installOptions);
    if (templateItem) {
      nextTemplateItems.push(templateItem);
    }
  }

  await writeSkillLock(nextData, env);
  await writeTemplateBaseline(baselinePath, {
    schema_version: TEMPLATE_BASELINE_SCHEMA_VERSION,
    generated_by: 'loopx',
    registry_revision: installOptions.sourceUrl || 'local',
    items: nextTemplateItems,
  });
  const templateGovernance = await inspectTemplateGovernance(baselinePath);
  const agentGuidance = await installAgentGuidance(env, {
    ...options,
    target: options.target || env.LOOPX_INSTALL_TARGET || 'codex',
  });
  return {
    ok: conflicts.length === 0,
    installed,
    conflicts,
    skipped,
    removed,
    agentGuidance,
    templateGovernance,
    inspection: await inspectInstallState(env),
  };
}

export async function repairBundledSkills(env = process.env) {
  return installBundledSkills(env);
}

function codexInstallEnv(env = process.env) {
  if (!env.LOOPX_INSTALL_CUSTOM_DIR) {
    return {
      ...env,
      LOOPX_INSTALL_TARGET: 'codex',
    };
  }
  const root = resolve(env.LOOPX_INSTALL_CUSTOM_DIR);
  return {
    ...env,
    LOOPX_INSTALL_TARGET: 'codex',
    LOOPX_SKILLS_ROOT: root,
    LOOPX_SKILL_LOCK_PATH: join(dirname(root), '.loopx-skill-lock.json'),
    LOOPX_TEMPLATE_BASELINE_PATH: join(dirname(root), '.loopx-template-hashes.json'),
  };
}

function claudeInstallEnv(env = process.env, options = {}) {
  const root = options.project === true
    ? join(resolve(env.LOOPX_INSTALL_CWD || process.cwd()), '.claude', 'skills')
    : getClaudeSkillsRoot(env);
  return {
    ...env,
    LOOPX_INSTALL_TARGET: 'claude',
    LOOPX_SKILLS_ROOT: options.dir || root,
    LOOPX_SKILL_LOCK_PATH: options.lockPath || join(dirname(root), '.loopx-skill-lock.json'),
    LOOPX_TEMPLATE_BASELINE_PATH: options.templateBaselinePath || join(dirname(root), '.loopx-template-hashes.json'),
    LOOPX_DISTRIBUTION_CHANNEL: options.distributionChannel || 'claude',
  };
}

// v0.8 docs-first: no per-turn Claude hook is registered; the working
// agreement travels in the managed guidance block instead.
function assertInstallTargetOptions(requestedTargets, options = {}) {
  const targets = new Set(requestedTargets);
  if (options.dir && targets.has('codex') && targets.has('claude')) {
    throw new Error('install_custom_dir_requires_single_target');
  }
}

export async function inspectInstallTargets(env = process.env, options = {}) {
  const requestedTargets = Array.isArray(options.targets) && options.targets.length > 0
    ? options.targets
    : ['codex', 'claude'];
  assertInstallTargetOptions(requestedTargets, options);
  const results = {};
  for (const target of requestedTargets) {
    if (target === 'codex') {
      results.codex = await inspectInstallState(codexInstallEnv({
        ...env,
        LOOPX_INSTALL_CUSTOM_DIR: options.dir,
      }));
      continue;
    }
    if (target === 'claude') {
      results.claude = await inspectInstallState(claudeInstallEnv(env, options));
      continue;
    }
    throw new Error(`unknown_install_target:${target}`);
  }
  return {
    ok: true,
    dryRun: true,
    targets: requestedTargets,
    results,
  };
}

export async function installSkillsForTargets(env = process.env, options = {}) {
  const requestedTargets = Array.isArray(options.targets) && options.targets.length > 0
    ? options.targets
    : ['codex', 'claude'];
  assertInstallTargetOptions(requestedTargets, options);
  const results = {};
  for (const target of requestedTargets) {
    if (target === 'codex') {
      const codexEnv = codexInstallEnv({
        ...env,
        LOOPX_INSTALL_CUSTOM_DIR: options.dir,
      });
      results.codex = await installBundledSkills(codexEnv, {
        ...options,
        dir: undefined,
        target: 'codex',
        distributionChannel: options.distributionChannel || env.LOOPX_DISTRIBUTION_CHANNEL || 'npm',
      });
      continue;
    }
    if (target === 'claude') {
      const claudeEnv = claudeInstallEnv(env, options);
      results.claude = await installBundledSkills(claudeEnv, {
        ...options,
        target: 'claude',
        distributionChannel: options.distributionChannel || 'claude',
      });
      continue;
    }
    throw new Error(`unknown_install_target:${target}`);
  }
  return {
    ok: Object.values(results).every((result) => result?.ok !== false),
    targets: requestedTargets,
    results,
  };
}

export async function verifyInstallTargets(env = process.env, options = {}) {
  const requestedTargets = Array.isArray(options.targets) && options.targets.length > 0
    ? options.targets
    : ['codex', 'claude'];
  assertInstallTargetOptions(requestedTargets, options);
  const results = {};
  for (const target of requestedTargets) {
    if (target === 'codex') {
      results.codex = await verifyInstallState(codexInstallEnv({
        ...env,
        LOOPX_INSTALL_CUSTOM_DIR: options.dir,
      }));
      continue;
    }
    if (target === 'claude') {
      results.claude = await verifyInstallState(claudeInstallEnv(env, options));
      continue;
    }
    throw new Error(`unknown_install_target:${target}`);
  }
  return {
    ok: Object.values(results).every((result) => result?.ok !== false),
    targets: requestedTargets,
    results,
  };
}

export const LOOPX_BUNDLED_SKILLS = LOOPX_SKILLS;
