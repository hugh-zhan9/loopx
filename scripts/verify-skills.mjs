#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
const pluginManifest = JSON.parse(await readFile(join(repoRoot, 'plugins', 'loopx', '.codex-plugin', 'plugin.json'), 'utf8'));
const resolverPath = join(repoRoot, 'skills', 'RESOLVER.md');
const markdownPaths = [
  'README.md',
  'README.zh-CN.md',
  'AGENTS.md',
  'docs/loopx/design/loopx-skill-suite-v1-design.md',
  'docs/loopx/plans/loopx-skill-suite-v1-implementation.md',
  'skills/RESOLVER.md',
];
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

async function assertMarkdownStructure(relativePath) {
  const path = join(repoRoot, relativePath);
  assert.equal(existsSync(path), true, `${relativePath} missing`);
  const text = await readFile(path, 'utf8');
  assert.equal(text.endsWith('\n'), true, `${relativePath} missing final newline`);

  const fenceStack = [];
  text.split('\n').forEach((line, index) => {
    assert.equal(/^(<<<<<<<|=======|>>>>>>>)($| )/.test(line), false, `${relativePath}:${index + 1}: merge conflict marker`);
    const match = line.match(/^(`{3,}|~{3,})/);
    if (!match) {
      return;
    }
    const marker = match[1];
    if (fenceStack.length > 0 && marker[0] === fenceStack.at(-1).char && marker.length >= fenceStack.at(-1).length) {
      fenceStack.pop();
      return;
    }
    fenceStack.push({ char: marker[0], length: marker.length, line: index + 1 });
  });

  assert.deepEqual(fenceStack, [], `${relativePath} has unclosed fenced block`);
}

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
  await walk(root);
  return files.sort();
}

function assertContains(text, value, label) {
  assert.match(text, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${label} missing ${value}`);
}

function publicArchiveCommandLines(text) {
  return text
    .split('\n')
    .filter((line) => /^\s*(?:(?:[-*+]|\d+[.)])\s+)?`?loopx archive(?:\s|`|$)/.test(line));
}

function assertNoPublicArchiveCommandExposure(text, label) {
  assert.deepEqual(publicArchiveCommandLines(text), [], `${label} should not expose archive runtime command`);
}

async function assertPublicDocsAligned() {
  const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
  const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
  const commands = [
    'loopx install-skills',
    'loopx init',
    'loopx clarify',
    'loopx render',
    'loopx status',
    'loopx next',
    'loopx help advanced',
    'loopx setup-context',
    'loopx doctor',
    'loopx migrate',
    'loopx repair-install',
    'node scripts/verify-skills.mjs',
  ];
  for (const command of commands) {
    assertContains(readme, command, 'README.md');
    assertContains(readmeZh, command, 'README.zh-CN.md');
  }
  assert.deepEqual(
    publicArchiveCommandLines([
      'loopx archive <slug>',
      '- loopx archive <slug>',
      '- `loopx archive <slug>`',
      '1. loopx archive <slug>',
      'archive is not part of the public v1 finish flow. Older runtime state may still contain archive fields or a hidden `loopx archive <slug>` compatibility command.',
    ].join('\n')),
    [
      'loopx archive <slug>',
      '- loopx archive <slug>',
      '- `loopx archive <slug>`',
      '1. loopx archive <slug>',
    ],
    'archive command exposure guard should catch public command lines without rejecting prose compatibility notes',
  );
  assertNoPublicArchiveCommandExposure(readme, 'README.md');
  assertNoPublicArchiveCommandExposure(readmeZh, 'README.zh-CN.md');
  assertContains(readme, 'local audit ledger', 'README.md');
  assertContains(readme, '.loopx/finish/<audit-id>/', 'README.md');
  assert.match(readme, /`none` means|none means/i, 'README.md missing none means');
  assertContains(readme, 'docs/loopx/specs/', 'README.md');
  assertContains(readme, 'Advanced runtime commands', 'README.md');
  assertContains(readme, 'loopx help advanced', 'README.md');
  assertContains(readme, 'Undo installed files', 'README.md');
  assertContains(readme, 'Golden path', 'README.md');

  assertContains(readmeZh, '本地 audit ledger', 'README.zh-CN.md');
  assertContains(readmeZh, '.loopx/finish/<audit-id>/', 'README.zh-CN.md');
  assertContains(readmeZh, '`none` 表示', 'README.zh-CN.md');
  assertContains(readmeZh, 'docs/loopx/specs/', 'README.zh-CN.md');
  assertContains(readmeZh, '高级 runtime 命令', 'README.zh-CN.md');
  assertContains(readmeZh, 'loopx help advanced', 'README.zh-CN.md');
  assertContains(readmeZh, '撤销已安装文件', 'README.zh-CN.md');
  assertContains(readmeZh, '黄金路径', 'README.zh-CN.md');
  for (const required of [
    'Quick start',
    'Human output is the default',
    'loopx install-skills --target all --dry-run',
    'LOOPX_SKIP_POSTINSTALL=1',
    'LOOPX_POSTINSTALL=0',
    'LOOPX_HOOKS=0',
  ]) {
    assertContains(readme, required, 'README.md');
  }
  for (const required of [
    '快速开始',
    '默认输出面向人类',
    'loopx install-skills --target all --dry-run',
    'LOOPX_SKIP_POSTINSTALL=1',
    'LOOPX_POSTINSTALL=0',
    'LOOPX_HOOKS=0',
  ]) {
    assertContains(readmeZh, required, 'README.zh-CN.md');
  }
  assert.doesNotMatch(readme, /`loopx install-skills --dry-run`/, 'README.md should use explicit dry-run target');
  assert.doesNotMatch(readmeZh, /`loopx install-skills --dry-run`/, 'README.zh-CN.md should use explicit dry-run target');
  assert.doesNotMatch(readme, /Public finish audit commands:/, 'README.md should not promote finish runtime commands as public primary flow');
  assert.doesNotMatch(readmeZh, /公开的 finish audit 命令：/, 'README.zh-CN.md should not promote finish runtime commands as public primary flow');

  const releaseNotesRoot = join(repoRoot, 'docs', 'release-notes');
  const releaseNotes = existsSync(releaseNotesRoot)
    ? (await readdir(releaseNotesRoot)).filter((name) => name.endsWith('.md'))
    : [];
  assert.ok(releaseNotes.includes(`${packageJson.version}.md`), `docs/release-notes/${packageJson.version}.md missing`);
  for (const name of releaseNotes) {
    await assertMarkdownStructure(`docs/release-notes/${name}`);
  }
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

  const rootSkillDir = join(repoRoot, 'skills', skillName);
  const pluginSkillDir = join(repoRoot, 'plugins', 'loopx', 'skills', skillName);
  const rootFiles = await recursiveFiles(rootSkillDir);
  const pluginFiles = await recursiveFiles(pluginSkillDir);
  assert.deepEqual(pluginFiles, rootFiles, `${skillName} plugin mirror file list drifted`);
  for (const relativeFile of rootFiles) {
    const rootExtra = await readFile(join(rootSkillDir, relativeFile), 'utf8');
    const pluginExtra = await readFile(join(pluginSkillDir, relativeFile), 'utf8');
    assert.equal(pluginExtra, rootExtra, `${skillName}/${relativeFile} plugin mirror drifted`);
  }

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
assert.equal(packageJson.files.includes('scripts/claude-workflow-hook.mjs'), true, 'npm package must include claude-workflow-hook.mjs');
assert.equal(packageJson.files.includes('skills/'), false, 'npm package must not include broad skills/ surface');
assert.equal(packageJson.files.includes('skills/RESOLVER.md'), true, 'npm package must include skills/RESOLVER.md');
for (const skillName of LOOPX_BUNDLED_SKILLS) {
  assert.equal(packageJson.files.includes(`skills/${skillName}/`), true, `npm package missing bundled skill ${skillName}`);
}
assert.deepEqual(
  packageJson.files.filter((path) => path.startsWith('skills/')).sort(),
  ['skills/RESOLVER.md', ...LOOPX_BUNDLED_SKILLS.map((skillName) => `skills/${skillName}/`)].sort(),
  'npm package skills/ surface must exactly match bundled skills plus resolver',
);

for (const relativePath of markdownPaths) {
  await assertMarkdownStructure(relativePath);
}
await assertPublicDocsAligned();

const resolverText = await readFile(resolverPath, 'utf8');
for (const skillName of LOOPX_BUNDLED_SKILLS) {
  await assertSkill(skillName, resolverText);
}

const staleRefs = [...resolverText.matchAll(/skills\/([a-z][a-z0-9-]*)\/SKILL\.md/g)]
  .map((match) => match[1])
  .filter((skillName) => !LOOPX_BUNDLED_SKILLS.includes(skillName));
assert.deepEqual([...new Set(staleRefs)], [], 'skills/RESOLVER.md contains stale bundled-skill refs');

console.log(`ok: verified ${LOOPX_BUNDLED_SKILLS.length} loopx bundled skills`);
