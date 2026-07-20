#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOOPX_BUNDLED_SKILLS,
  LOOPX_CANONICAL_WORKFLOW_SKILLS,
  LOOPX_COMPATIBILITY_ALIAS_SKILLS,
} from '../src/install-discovery.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
const pluginManifest = JSON.parse(await readFile(join(repoRoot, 'plugins', 'loopx', '.codex-plugin', 'plugin.json'), 'utf8'));
const resolverPath = join(repoRoot, 'skills', 'RESOLVER.md');
const contractMatrixPath = join(repoRoot, 'test', 'fixtures', 'skill-contract-matrix.json');
const pluginSkillsRoot = join(repoRoot, 'plugins', 'loopx', 'skills');
const removedPluginSyncScriptName = ['sync', 'plugin', 'skills'].join('-');
const removedSyncScriptPath = join(repoRoot, 'scripts', `${removedPluginSyncScriptName}.mjs`);
const removedPluginMirrorPattern = new RegExp(`${removedPluginSyncScriptName}|plugins/loopx/skills|plugin skill mirror|plugin-ready v1 skill mirror`, 'i');
const markdownPaths = [
  'README.md',
  'README.zh-CN.md',
  'AGENTS.md',
  'docs/loopx/cli.md',
  'docs/loopx/cli.zh-CN.md',
  'docs/loopx/design/loopx-skill-suite-v1-design.md',
  'docs/loopx/plans/loopx-skill-suite-v1-implementation.md',
  'skills/RESOLVER.md',
];
const packageLoopxDocs = [
  'docs/loopx/cli.md',
  'docs/loopx/cli.zh-CN.md',
  'docs/loopx/skills.md',
  'docs/loopx/skills.zh-CN.md',
  'docs/loopx/specs/installation.md',
];
const activeMaintenanceDocs = [
  'README.md',
  'README.zh-CN.md',
  'AGENTS.md',
  'docs/loopx/cli.md',
  'docs/loopx/cli.zh-CN.md',
  'docs/loopx/specs/installation.md',
  'skills/RESOLVER.md',
];
const personalPathPattern = /\/(?:Users|home)\/[A-Za-z0-9._-]+\//;
const localRefPattern = /(?<![/.])\b(?:references|agents|scripts)\/[\w/.-]+\b/g;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const obsoleteImplementationPaths = [
  'src/codex-exec-runtime.mjs',
  'src/finish-runtime.mjs',
  'skills/shared/parallel-plan-contract.md',
  'skills/shared/scripts/parallel-plan-contract.mjs',
  'skills/exec/references/checkpoints-and-resume.md',
  'skills/exec/references/multi-plan-package-mode.md',
  'skills/final-review/final-reviewer.md',
  'skills/final-review/references/report-template.en.md',
  'skills/final-review/references/report-template.zh-CN.md',
  'skills/finish/references/final-review-and-finish-gates.md',
  'skills/finish/references/memory-and-spec-candidates.md',
  'skills/plan-to-exec/references/internal-plan-review.md',
  'skills/plan-to-exec/references/plan-schema.md',
  'skills/plan-to-exec/references/surface-change-planning.md',
];

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

function markdownHeadings(text) {
  const headings = [];
  let fence = null;
  text.split('\n').forEach((line, index) => {
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence && marker[0] === fence.char && marker.length >= fence.length) {
        fence = null;
      } else if (!fence) {
        fence = { char: marker[0], length: marker.length };
      }
      return;
    }
    if (fence) {
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      headings.push({
        line: index + 1,
        level: headingMatch[1].length,
        title: headingMatch[2],
      });
    }
  });
  return headings;
}

function assertNoEmptyMarkdownSections(text, label) {
  const lines = text.split('\n');
  const headings = markdownHeadings(text);
  for (const [index, heading] of headings.entries()) {
    const nextPeerOrParent = headings
      .slice(index + 1)
      .find((nextHeading) => nextHeading.level <= heading.level);
    const sectionEnd = nextPeerOrParent?.line ?? lines.length + 1;
    const sectionBody = lines
      .slice(heading.line, sectionEnd - 1)
      .some((line) => line.trim() !== '');

    assert.equal(
      sectionBody,
      true,
      `${label}:${heading.line}: heading "${heading.title}" must have section content before the next peer heading`,
    );
  }
}

function assertContains(text, value, label) {
  assert.match(text, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${label} missing ${value}`);
}

const removedRuntimeCommandPattern = /\bloopx\s+(?:approve|plan|build|review|archive|autopilot)\b/;

function assertNoRemovedRuntimeCommandExposure(text, label) {
  assert.doesNotMatch(text, removedRuntimeCommandPattern, `${label} should not expose removed runtime commands`);
}

function assertNoRemovedPluginMirrorWorkflow(text, label) {
  assert.doesNotMatch(text, removedPluginMirrorPattern, `${label} should not reference removed plugin skill mirror workflow`);
}

async function assertPublicDocsAligned() {
  const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
  const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
  const cliDoc = await readFile(join(repoRoot, 'docs', 'loopx', 'cli.md'), 'utf8');
  const cliDocZh = await readFile(join(repoRoot, 'docs', 'loopx', 'cli.zh-CN.md'), 'utf8');
  const installationSpec = await readFile(join(repoRoot, 'docs', 'loopx', 'specs', 'installation.md'), 'utf8');
  const commands = [
    'loopx install-skills',
    'loopx init',
    'loopx clarify',
    'loopx render',
    'loopx status',
    'loopx next',
    'loopx setup-context',
    'loopx doctor',
    'loopx repair-install',
    'node scripts/verify-skills.mjs',
  ];
  for (const command of commands) {
    assertContains(cliDoc, command, 'docs/loopx/cli.md');
    assertContains(cliDocZh, command, 'docs/loopx/cli.zh-CN.md');
  }
  assertNoRemovedRuntimeCommandExposure(readme, 'README.md');
  assertNoRemovedRuntimeCommandExposure(readmeZh, 'README.zh-CN.md');
  assertNoRemovedRuntimeCommandExposure(cliDoc, 'docs/loopx/cli.md');
  assertNoRemovedRuntimeCommandExposure(cliDocZh, 'docs/loopx/cli.zh-CN.md');
  assertContains(readme, 'Skill-first workflow suite', 'README.md');
  assertContains(readme, 'six canonical workflow intents', 'README.md');
  assertContains(readme, 'prompt-first', 'README.md');
  assertContains(readme, './docs/loopx/cli.md', 'README.md');
  assertContains(readme, '$clarify', 'README.md');
  assertContains(readme, '$finish', 'README.md');
  assertContains(readme, 'explicit-only compatibility', 'README.md');
  assert.match(readme, /does not write a local audit ledger/i, 'README.md must contract finish audit state');
  assertContains(readme, 'docs/loopx/specs/', 'README.md');
  assertContains(cliDoc, 'remove loopx-managed user-level artifacts', 'docs/loopx/cli.md');
  assertContains(installationSpec, 'Undo installed files', 'docs/loopx/specs/installation.md');
  assertContains(readme, 'pre-v2', 'README.md');
  assertContains(readme, 'leaf worker', 'README.md');
  assert.doesNotMatch(readme, /Golden path|finish-audit|finish-start|finish-record|execution-start/i);

  assertContains(readmeZh, '六个 canonical workflow intents', 'README.zh-CN.md');
  assertContains(readmeZh, 'prompt-first', 'README.zh-CN.md');
  assertContains(readmeZh, './docs/loopx/cli.zh-CN.md', 'README.zh-CN.md');
  assertContains(readmeZh, '$clarify', 'README.zh-CN.md');
  assertContains(readmeZh, '$finish', 'README.zh-CN.md');
  assertContains(readmeZh, 'explicit-only compatibility aliases', 'README.zh-CN.md');
  assertContains(readmeZh, '不会写本地', 'README.zh-CN.md');
  assertContains(readmeZh, 'docs/loopx/specs/', 'README.zh-CN.md');
  assertContains(cliDocZh, '移除 loopx 管理的用户级 artifacts', 'docs/loopx/cli.zh-CN.md');
  assertContains(readmeZh, 'pre-v2', 'README.zh-CN.md');
  assertContains(readmeZh, 'leaf worker', 'README.zh-CN.md');
  assert.doesNotMatch(readmeZh, /黄金路径|finish-audit|finish-start|finish-record|execution-start/i);
  assertContains(cliDoc, 'top-level controller', 'docs/loopx/cli.md');
  assertContains(cliDocZh, '顶层 controller', 'docs/loopx/cli.zh-CN.md');
  for (const required of [
    'Quick start',
    'Human output is the default',
    'loopx install-skills --target all --dry-run',
    'LOOPX_SKIP_POSTINSTALL=1',
    'LOOPX_POSTINSTALL=0',
    'LOOPX_HOOKS=0',
  ]) {
    assertContains(cliDoc, required, 'docs/loopx/cli.md');
  }
  for (const required of [
    '快速开始',
    '默认输出面向人类',
    'loopx install-skills --target all --dry-run',
    'LOOPX_SKIP_POSTINSTALL=1',
    'LOOPX_POSTINSTALL=0',
    'LOOPX_HOOKS=0',
  ]) {
    assertContains(cliDocZh, required, 'docs/loopx/cli.zh-CN.md');
  }
  assert.doesNotMatch(readme, /`loopx install-skills --dry-run`/, 'README.md should use explicit dry-run target');
  assert.doesNotMatch(readmeZh, /`loopx install-skills --dry-run`/, 'README.zh-CN.md should use explicit dry-run target');
  assert.doesNotMatch(cliDoc, /`loopx install-skills --dry-run`/, 'docs/loopx/cli.md should use explicit dry-run target');
  assert.doesNotMatch(cliDocZh, /`loopx install-skills --dry-run`/, 'docs/loopx/cli.zh-CN.md should use explicit dry-run target');
  assert.doesNotMatch(readme, /Public finish audit commands:/, 'README.md should not promote finish runtime commands as public primary flow');
  assert.doesNotMatch(readmeZh, /公开的 finish audit 命令：/, 'README.zh-CN.md should not promote finish runtime commands as public primary flow');
  assert.doesNotMatch(cliDoc, /Public finish audit commands:/, 'docs/loopx/cli.md should not promote finish runtime commands as public primary flow');
  assert.doesNotMatch(cliDocZh, /公开的 finish audit 命令：/, 'docs/loopx/cli.zh-CN.md should not promote finish runtime commands as public primary flow');

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
  assert.equal(existsSync(rootPath), true, `${skillName} root SKILL.md missing`);

  const rootText = await readFile(rootPath, 'utf8');
  assert.equal(personalPathPattern.test(rootText), false, `${skillName} contains a personal absolute path`);
  assertNoEmptyMarkdownSections(rootText, `skills/${skillName}/SKILL.md`);

  const fields = parseFrontmatter(rootPath, rootText);
  assert.equal(fields.name, skillName, `${skillName} frontmatter name mismatch`);
  assert.match(fields.version ?? '', semverPattern, `${skillName} metadata.version must be valid semver`);
  assert.ok(fields.when_to_use && fields.when_to_use.length >= 20, `${skillName} missing useful when_to_use metadata`);
  assertSkillDescription(skillName, fields.description);
  assert.match(resolverText, new RegExp(`skills/${skillName}/SKILL\\.md`), `${skillName} missing from skills/RESOLVER.md`);

  const refs = [...rootText.matchAll(localRefPattern)].map((match) => match[0]);
  for (const ref of refs) {
    const target = join(repoRoot, 'skills', skillName, ref);
    assert.equal(existsSync(target), true, `${skillName} references missing local file: ${ref}`);
  }
}

async function assertContractMatrix() {
  assert.equal(existsSync(contractMatrixPath), true, 'skill contract matrix missing');
  const matrix = JSON.parse(await readFile(contractMatrixPath, 'utf8'));
  assert.equal(matrix.schema_version, 1, 'skill contract matrix schema must be 1');
  assert.equal(Array.isArray(matrix.skills), true, 'skill contract matrix skills must be an array');

  const names = matrix.skills.map((entry) => entry.skill);
  assert.deepEqual([...names].sort(), [...LOOPX_BUNDLED_SKILLS].sort(), 'skill contract matrix must cover every bundled skill exactly once');
  assert.equal(new Set(names).size, names.length, 'skill contract matrix contains duplicate skills');
  const workflowNames = matrix.skills.filter((entry) => entry.role === 'workflow').map((entry) => entry.skill).sort();
  assert.deepEqual(Object.keys(matrix.workflow_root_line_limits ?? {}).sort(), workflowNames, 'workflow root line guards must cover every workflow skill exactly once');

  for (const entry of matrix.skills) {
    assert.match(entry.role ?? '', /^(workflow|support)$/, `${entry.skill} matrix role must be workflow or support`);
    for (const field of ['boundary', 'required_outputs', 'safety_invariants', 'integrations', 'required_references', 'version']) {
      assert.equal(Object.hasOwn(entry, field), true, `${entry.skill} matrix missing ${field}`);
    }
    for (const field of ['required_outputs', 'safety_invariants', 'integrations', 'required_references']) {
      assert.equal(Array.isArray(entry[field]), true, `${entry.skill} matrix ${field} must be an array`);
    }
    assert.ok(entry.boundary.length > 0, `${entry.skill} matrix boundary must not be empty`);
    assert.ok(entry.required_outputs.length > 0, `${entry.skill} matrix required_outputs must not be empty`);
    assert.ok(entry.safety_invariants.length > 0, `${entry.skill} matrix safety_invariants must not be empty`);
    assert.ok(entry.integrations.length > 0, `${entry.skill} matrix integrations must not be empty`);

    const skillPath = join(repoRoot, 'skills', entry.skill, 'SKILL.md');
    const skillText = await readFile(skillPath, 'utf8');
    const frontmatter = parseFrontmatter(skillPath, skillText);
    assert.equal(frontmatter.version, entry.version, `${entry.skill} matrix version drift`);
    for (const [field, markers] of Object.entries({
      boundary: [entry.boundary],
      required_outputs: entry.required_outputs,
      safety_invariants: entry.safety_invariants,
      integrations: entry.integrations,
    })) {
      for (const marker of markers) {
        assert.ok(skillText.toLowerCase().includes(marker.toLowerCase()), `${entry.skill} matrix ${field} marker missing from SKILL.md: ${marker}`);
      }
    }
    for (const reference of entry.required_references) {
      assert.equal(existsSync(resolve(repoRoot, 'skills', entry.skill, reference)), true, `${entry.skill} matrix reference missing: ${reference}`);
    }
    if (entry.role === 'workflow') {
      const guard = matrix.workflow_root_line_limits[entry.skill];
      const lineCount = skillText.trimEnd().split('\n').length;
      assert.ok(lineCount <= guard.max, `${entry.skill} root SKILL.md has ${lineCount} lines; guard is ${guard.max}`);
      if (guard.max > 220) {
        assert.ok(guard.reason?.length >= 40, `${entry.skill} root line exception requires an operational reason`);
      }
    }
  }
}

assert.equal(pluginManifest.version, packageJson.version, 'plugin manifest version must match package.json');
assert.equal(existsSync(resolverPath), true, 'skills/RESOLVER.md missing');
assert.equal(packageJson.files.includes('scripts/claude-workflow-hook.mjs'), true, 'npm package must include claude-workflow-hook.mjs');
assert.equal(packageJson.files.includes('scripts/run-agent-evals.mjs'), true, 'npm package must include agent eval runner');
assert.equal(packageJson.files.includes('scripts/normalize-codex-agent-trace.mjs'), true, 'npm package must include Codex trace normalizer');
assert.equal(packageJson.files.includes('scripts/run-codex-live-agent-evals.mjs'), true, 'npm package must include Codex live eval runner');
assert.equal(packageJson.files.includes('scripts/aggregate-agent-evals.mjs'), true, 'npm package must include agent eval aggregator');
assert.equal(packageJson.files.includes('evals/gpt-5.6/'), true, 'npm package must include GPT-5.6 eval contracts');
assert.equal(existsSync(pluginSkillsRoot), false, 'plugin skill payload directory must be absent');
assert.equal(existsSync(removedSyncScriptPath), false, 'removed plugin skill sync script must be absent');
assert.equal(packageJson.files.includes(`scripts/${removedPluginSyncScriptName}.mjs`), false, 'npm package must exclude removed sync script');
assert.equal(Object.hasOwn(packageJson.scripts ?? {}, removedPluginSyncScriptName), false, 'npm scripts must exclude removed sync script');
assert.equal(packageJson.files.includes('docs/loopx/'), false, 'npm package must not include broad docs/loopx surface');
assert.deepEqual(
  packageJson.files.filter((path) => path.startsWith('docs/loopx/')).sort(),
  [...packageLoopxDocs].sort(),
  'npm package docs/loopx surface must exactly match public docs whitelist',
);
assert.equal(packageJson.files.includes('skills/'), false, 'npm package must not include broad skills/ surface');
assert.equal(packageJson.files.includes('skills/RESOLVER.md'), true, 'npm package must include skills/RESOLVER.md');
assert.equal(packageJson.files.includes('skills/shared/'), true, 'npm package must include shared skill contracts');
assert.equal(packageJson.files.includes('test/fixtures/skill-contract-matrix.json'), true, 'npm package must include skill contract matrix');
assert.deepEqual(LOOPX_CANONICAL_WORKFLOW_SKILLS, ['clarify', 'spec', 'plan', 'exec', 'review', 'finish']);
assert.deepEqual(
  LOOPX_COMPATIBILITY_ALIAS_SKILLS,
  ['plan-to-exec', 'subagent-exec', 'parallel-subagent-exec', 'final-review', 'fix-review'],
);
for (const skillName of LOOPX_BUNDLED_SKILLS) {
  assert.equal(packageJson.files.includes(`skills/${skillName}/`), true, `npm package missing bundled skill ${skillName}`);
}
for (const skillName of LOOPX_COMPATIBILITY_ALIAS_SKILLS) {
  const entries = (await readdir(join(repoRoot, 'skills', skillName)))
    .filter((entry) => entry !== '.DS_Store')
    .sort();
  assert.deepEqual(entries, ['SKILL.md'], `${skillName} must contain only its compatibility forwarding skill`);
}
for (const relativePath of obsoleteImplementationPaths) {
  assert.equal(existsSync(join(repoRoot, relativePath)), false, `${relativePath} must remain removed`);
}
assert.deepEqual(
  packageJson.files.filter((path) => path.startsWith('skills/')).sort(),
  ['skills/RESOLVER.md', 'skills/shared/', ...LOOPX_BUNDLED_SKILLS.map((skillName) => `skills/${skillName}/`)].sort(),
  'npm package skills/ surface must exactly match bundled skills plus resolver and shared contracts',
);

for (const relativePath of markdownPaths) {
  await assertMarkdownStructure(relativePath);
}
for (const relativePath of activeMaintenanceDocs) {
  const text = await readFile(join(repoRoot, relativePath), 'utf8');
  assertNoRemovedPluginMirrorWorkflow(text, relativePath);
}
await assertPublicDocsAligned();

const resolverText = await readFile(resolverPath, 'utf8');
await assertContractMatrix();
for (const skillName of LOOPX_BUNDLED_SKILLS) {
  await assertSkill(skillName, resolverText);
}

const staleRefs = [...resolverText.matchAll(/skills\/([a-z][a-z0-9-]*)\/SKILL\.md/g)]
  .map((match) => match[1])
  .filter((skillName) => !LOOPX_BUNDLED_SKILLS.includes(skillName));
assert.deepEqual([...new Set(staleRefs)], [], 'skills/RESOLVER.md contains stale bundled-skill refs');

console.log(`ok: verified ${LOOPX_BUNDLED_SKILLS.length} loopx bundled skills`);
