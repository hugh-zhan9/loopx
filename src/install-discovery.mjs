import { cp, lstat, mkdir, readFile, readdir, readlink, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, '..');
const LOOPX_SKILLS = [
  'clarify',
  'plan',
  'build',
  'review',
  'autopilot',
];
const LOOPX_INSTALLATION_IDENTITY = 'loopx';

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

export function getSkillLockPath(env = process.env) {
  return resolve(env.LOOPX_SKILL_LOCK_PATH || join(getAgentsRoot(env), '.skill-lock.json'));
}

export function getSkillSourceRoot(env = process.env) {
  return resolve(env.LOOPX_SKILL_SOURCE_ROOT || join(getProjectRoot(env), 'skills'));
}

function getInstallOptions(options = {}, env = process.env) {
  return {
    installationIdentity: options.installationIdentity || env.LOOPX_INSTALLATION_IDENTITY || LOOPX_INSTALLATION_IDENTITY,
    distributionChannel: options.distributionChannel || env.LOOPX_DISTRIBUTION_CHANNEL || 'npm',
    sourceUrl: resolve(options.sourceUrl || env.LOOPX_SOURCE_URL || getProjectRoot(env)),
    skillSourceRoot: resolve(options.skillSourceRoot || getSkillSourceRoot(env)),
  };
}

function skillSourceDir(skillName, env = process.env, skillSourceRoot = getSkillSourceRoot(env)) {
  return join(skillSourceRoot, skillName);
}

function skillSourceEntry(skillName, env = process.env, skillSourceRoot = getSkillSourceRoot(env)) {
  return join(skillSourceDir(skillName, env, skillSourceRoot), 'SKILL.md');
}

function installedSkillDir(skillName, env = process.env) {
  return join(getInstalledSkillsRoot(env), skillName);
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

  let installMethod = 'symlink';
  try {
    await symlink(sourceDir, targetDir, 'dir');
  } catch {
    installMethod = 'copy';
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

async function removeStaleOwnedInstall(currentRow) {
  if (!currentRow?.installedPath || !existsSync(currentRow.installedPath)) {
    return;
  }
  await removeInstalledSkill(currentRow.installedPath);
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

  return {
    projectRoot: getProjectRoot(env),
    installedSkillsRoot: installedRoot,
    skillLockPath: getSkillLockPath(env),
    skills: bySkill,
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

  const installed = [];
  const conflicts = [];
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
    installed.push(row);
  }

  await writeSkillLock(nextData, env);
  return {
    ok: conflicts.length === 0,
    installed,
    conflicts,
    inspection: await inspectInstallState(env),
  };
}

export async function repairBundledSkills(env = process.env) {
  return installBundledSkills(env);
}

export const LOOPX_BUNDLED_SKILLS = LOOPX_SKILLS;
