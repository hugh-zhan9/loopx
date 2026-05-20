#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
const pluginManifest = JSON.parse(await readFile(join(repoRoot, 'plugins', 'loopx', '.codex-plugin', 'plugin.json'), 'utf8'));
const resolverPath = join(repoRoot, 'skills', 'RESOLVER.md');
const personalPathPattern = /\/(?:Users|home)\/[A-Za-z0-9._-]+\//;
const localRefPattern = /(?<![/.])\b(?:references|agents|scripts)\/[\w/.-]+\b/g;

function parseFrontmatter(path, text) {
  assert.equal(text.startsWith('---\n'), true, `${path} must start with YAML frontmatter`);
  const end = text.indexOf('\n---\n', 4);
  assert.notEqual(end, -1, `${path} frontmatter must close with ---`);

  const fields = {};
  let inMetadata = false;
  for (const line of text.slice(4, end).split('\n')) {
    if (line === 'metadata:') {
      inMetadata = true;
      continue;
    }
    if (inMetadata && line.startsWith('  version:')) {
      fields.version = line.split(':', 2)[1].trim().replace(/^"|"$/g, '');
      continue;
    }
    if (!line || line.startsWith(' ')) {
      continue;
    }
    inMetadata = false;
    const separator = line.indexOf(':');
    assert.notEqual(separator, -1, `${path} has invalid frontmatter line: ${line}`);
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    fields[key] = raw.replace(/^"|"$/g, '');
  }
  return fields;
}

function assertSkillDescription(skillName, description) {
  assert.ok(description, `${skillName} missing description`);
  assert.ok(description.length >= 40, `${skillName} description is too short`);
  assert.ok(description.length <= 500, `${skillName} description is too long`);
  assert.match(description, /not for/i, `${skillName} description must include a Not for exclusion`);
}

async function assertSkill(skillName, resolverText) {
  const rootPath = join(repoRoot, 'skills', skillName, 'SKILL.md');
  const pluginPath = join(repoRoot, 'plugins', 'loopx', 'skills', skillName, 'SKILL.md');
  assert.equal(existsSync(rootPath), true, `${skillName} root SKILL.md missing`);
  assert.equal(existsSync(pluginPath), true, `${skillName} plugin SKILL.md missing`);

  const rootText = await readFile(rootPath, 'utf8');
  const pluginText = await readFile(pluginPath, 'utf8');
  assert.equal(pluginText, rootText, `${skillName} plugin mirror drifted`);
  assert.equal(personalPathPattern.test(rootText), false, `${skillName} contains a personal absolute path`);

  const fields = parseFrontmatter(rootPath, rootText);
  assert.equal(fields.name, skillName, `${skillName} frontmatter name mismatch`);
  assert.equal(fields.version, packageJson.version, `${skillName} metadata.version must match package.json`);
  assert.ok(fields.when_to_use && fields.when_to_use.length >= 20, `${skillName} missing useful when_to_use metadata`);
  assertSkillDescription(skillName, fields.description);
  assert.match(resolverText, new RegExp(`skills/${skillName}/SKILL\\.md`), `${skillName} missing from skills/RESOLVER.md`);

  const refs = [...rootText.matchAll(localRefPattern)].map((match) => match[0]);
  for (const ref of refs) {
    const target = join(repoRoot, 'skills', skillName, ref);
    assert.equal(existsSync(target), true, `${skillName} references missing local file: ${ref}`);
  }
}

assert.equal(pluginManifest.version, packageJson.version, 'plugin manifest version must match package.json');
assert.equal(existsSync(resolverPath), true, 'skills/RESOLVER.md missing');

const resolverText = await readFile(resolverPath, 'utf8');
for (const skillName of LOOPX_BUNDLED_SKILLS) {
  await assertSkill(skillName, resolverText);
}

const staleRefs = [...resolverText.matchAll(/skills\/([a-z][a-z0-9-]*)\/SKILL\.md/g)]
  .map((match) => match[1])
  .filter((skillName) => !LOOPX_BUNDLED_SKILLS.includes(skillName));
assert.deepEqual([...new Set(staleRefs)], [], 'skills/RESOLVER.md contains stale bundled-skill refs');

console.log(`ok: verified ${LOOPX_BUNDLED_SKILLS.length} loopx bundled skills`);
