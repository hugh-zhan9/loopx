#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootSkillsRoot = join(repoRoot, 'skills');
const pluginSkillsRoot = join(repoRoot, 'plugins', 'loopx', 'skills');
const checkOnly = process.argv.includes('--check');

async function recursiveFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(relative(root, path));
      }
    }
  }
  if (existsSync(root)) {
    await walk(root);
  }
  return files.sort();
}

async function skillDrift(skillName) {
  const rootSkillDir = join(rootSkillsRoot, skillName);
  const pluginSkillDir = join(pluginSkillsRoot, skillName);
  const rootFiles = await recursiveFiles(rootSkillDir);
  const pluginFiles = await recursiveFiles(pluginSkillDir);
  const drifts = [];

  if (JSON.stringify(pluginFiles) !== JSON.stringify(rootFiles)) {
    drifts.push(`${skillName}: file list differs`);
    return drifts;
  }

  for (const path of rootFiles) {
    const rootText = await readFile(join(rootSkillDir, path), 'utf8');
    const pluginText = await readFile(join(pluginSkillDir, path), 'utf8');
    if (rootText !== pluginText) {
      drifts.push(`${skillName}/${path}: content differs`);
    }
  }

  return drifts;
}

async function checkPluginSkills() {
  const drifts = [];
  for (const skillName of LOOPX_BUNDLED_SKILLS) {
    drifts.push(...await skillDrift(skillName));
  }
  return drifts;
}

async function syncPluginSkills() {
  await rm(pluginSkillsRoot, { recursive: true, force: true });
  await mkdir(pluginSkillsRoot, { recursive: true });
  for (const skillName of LOOPX_BUNDLED_SKILLS) {
    await cp(join(rootSkillsRoot, skillName), join(pluginSkillsRoot, skillName), { recursive: true });
  }
}

if (checkOnly) {
  const drifts = await checkPluginSkills();
  if (drifts.length > 0) {
    console.error([
      'plugin skill mirrors are out of sync with canonical skills/',
      'run: npm run sync-plugin-skills',
      '',
      ...drifts,
    ].join('\n'));
    process.exitCode = 1;
  }
} else {
  await syncPluginSkills();
  console.log(`synced ${LOOPX_BUNDLED_SKILLS.length} plugin skill mirrors`);
}
