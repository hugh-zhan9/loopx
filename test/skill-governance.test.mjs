import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd());
const resolverPath = join(repoRoot, 'skills', 'RESOLVER.md');
const verifyScriptPath = join(repoRoot, 'scripts', 'verify-skills.mjs');

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return {};
  }
  const end = text.indexOf('\n---\n', 4);
  assert.notEqual(end, -1, 'frontmatter must close with ---');
  const fields = {};
  let inMetadata = false;
  for (const line of text.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (line === 'metadata:') {
      inMetadata = true;
      continue;
    }
    if (inMetadata && line.startsWith('  version:')) {
      fields['metadata.version'] = line.split(':', 2)[1].trim().replace(/^"|"$/g, '');
      continue;
    }
    if (separator === -1 || line.startsWith(' ')) {
      continue;
    }
    inMetadata = false;
    const key = line.slice(0, separator).trim();
    fields[key] = line.slice(separator + 1).trim().replace(/^"|"$/g, '');
  }
  return fields;
}

async function recursiveFiles(root) {
  const { readdir } = await import('node:fs/promises');
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

function publicArchiveCommandLines(text) {
  return text
    .split('\n')
    .filter((line) => /^\s*(?:(?:[-*+]|\d+[.)])\s+)?`?loopx archive(?:\s|`|$)/.test(line));
}

function assertNoPublicArchiveCommandExposure(text, label) {
  assert.deepEqual(publicArchiveCommandLines(text), [], `${label} should not expose archive runtime command`);
}

describe('loopx skill governance', () => {
  it('keeps a resolver and deterministic verifier for bundled skills', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));

    assert.equal(existsSync(resolverPath), true, 'skills/RESOLVER.md must exist');
    assert.equal(existsSync(verifyScriptPath), true, 'scripts/verify-skills.mjs must exist');
    assert.equal(packageJson.files.includes('scripts/verify-skills.mjs'), true, 'npm package must include verify-skills.mjs');
    assert.equal(packageJson.files.includes('scripts/claude-workflow-hook.mjs'), true, 'npm package must include claude-workflow-hook.mjs');

    const resolver = await readFile(resolverPath, 'utf8');
    for (const skillName of LOOPX_BUNDLED_SKILLS) {
      assert.match(resolver, new RegExp(`skills/${skillName}/SKILL\\.md`), `${skillName} missing from resolver`);
    }
  });

  it('makes bundled skill frontmatter triggerable and bounded', async () => {
    for (const skillName of LOOPX_BUNDLED_SKILLS) {
      const rootSkillPath = join(repoRoot, 'skills', skillName, 'SKILL.md');
      const pluginSkillPath = join(repoRoot, 'plugins', 'loopx', 'skills', skillName, 'SKILL.md');
      const rootSkill = await readFile(rootSkillPath, 'utf8');
      const pluginSkill = await readFile(pluginSkillPath, 'utf8');
      const fields = parseFrontmatter(rootSkill);

      assert.equal(fields.name, skillName);
      assert.ok(fields.description?.length >= 40, `${skillName} description is too short`);
      assert.match(fields.description, /not for/i, `${skillName} description must include a Not for exclusion`);
      assert.ok(fields.when_to_use?.length >= 20, `${skillName} needs when_to_use trigger metadata`);
      assert.ok(fields['metadata.version'], `${skillName} needs metadata.version`);
      assert.equal(pluginSkill, rootSkill, `${skillName} plugin mirror drifted`);

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
    }

    const specTemplate = await readFile(join(repoRoot, 'skills', 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');
    assert.match(specTemplate, /## 三、概要设计/);
    assert.match(specTemplate, /## 四、详细设计/);
    assert.match(specTemplate, /## 十一、QA/);
  });

  it('keeps public docs structurally valid and bilingual release docs aligned', async () => {
    for (const relativePath of ['README.md', 'README.zh-CN.md']) {
      const text = await readFile(join(repoRoot, relativePath), 'utf8');
      assert.equal(text.endsWith('\n'), true, `${relativePath} missing final newline`);
      assert.equal(/^(<<<<<<<|=======|>>>>>>>)($| )/m.test(text), false, `${relativePath} contains merge conflict markers`);

      const fences = [];
      for (const line of text.split('\n')) {
        const match = line.match(/^(`{3,}|~{3,})/);
        if (!match) continue;
        const marker = match[1];
        if (fences.length > 0 && marker[0] === fences.at(-1)[0] && marker.length >= fences.at(-1).length) {
          fences.pop();
        } else {
          fences.push(marker);
        }
      }
      assert.deepEqual(fences, [], `${relativePath} has unclosed fenced blocks`);
    }

    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
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
    for (const command of [
      'loopx init',
      'loopx clarify',
      'loopx approve',
      'loopx plan',
      'loopx build',
      'loopx review',
      'loopx autopilot',
      'loopx finish-start',
      'loopx finish-audit',
      'loopx finish-record',
      'loopx render',
      'loopx status',
      'loopx setup-context',
      'loopx doctor',
      'loopx migrate',
      'loopx repair-install',
      'loopx install-skills',
      'node scripts/verify-skills.mjs',
    ]) {
      assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${command} missing from README.md`);
      assert.match(readmeZh, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${command} missing from README.zh-CN.md`);
    }
    for (const required of [
      'final-review',
      'clarify -> spec? -> plan -> (subagent-exec | exec) -> final-review -> fix-review? -> finish',
    ]) {
      assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${required} missing from README.md`);
      assert.match(readmeZh, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${required} missing from README.zh-CN.md`);
    }
    for (const required of [
      '.loopx/memory/MEMORY.md',
      '.loopx/memory/index.jsonl',
      'docs/loopx/specs/',
      'baseline..HEAD',
      'change_window',
    ]) {
      assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${required} missing from README.md`);
      assert.match(readmeZh, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${required} missing from README.zh-CN.md`);
    }
    for (const required of [
      'Quick start',
      'Human output is the default',
      'loopx doctor --json',
      'loopx init --json',
      'loopx install-skills --target all --dry-run',
      'LOOPX_SKIP_POSTINSTALL=1',
      'LOOPX_POSTINSTALL=0',
      'LOOPX_HOOKS=0',
      'Archive compatibility',
      'archive is not part of the public v1 finish flow',
    ]) {
      assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${required} missing from README.md`);
    }
    for (const required of [
      '快速开始',
      '默认输出面向人类',
      'loopx doctor --json',
      'loopx init --json',
      'loopx install-skills --target all --dry-run',
      'LOOPX_SKIP_POSTINSTALL=1',
      'LOOPX_POSTINSTALL=0',
      'LOOPX_HOOKS=0',
      'Archive 兼容性',
      'archive 不属于公开 v1 finish 流程',
    ]) {
      assert.match(readmeZh, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${required} missing from README.zh-CN.md`);
    }
    assert.doesNotMatch(readme, /`loopx install-skills --dry-run`/, 'README.md should use explicit dry-run target');
    assert.doesNotMatch(readmeZh, /`loopx install-skills --dry-run`/, 'README.zh-CN.md should use explicit dry-run target');
  });

  it('publishes only bundled root skills plus resolver', async () => {
    const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], { cwd: repoRoot });
    const [pack] = JSON.parse(stdout);
    const paths = pack.files.map((file) => file.path);
    const packagedSkillDirs = [...new Set(
      paths
        .filter((path) => path.startsWith('skills/') && path.endsWith('/SKILL.md'))
        .map((path) => path.split('/')[1]),
    )].sort();

    assert.deepEqual(packagedSkillDirs, [...LOOPX_BUNDLED_SKILLS].sort());
    assert.equal(paths.includes('skills/RESOLVER.md'), true);
    assert.equal(paths.some((path) => path.startsWith('skills/deepsearch/')), false);
    assert.equal(paths.includes('plugins/loopx/scripts/plugin-install.test.mjs'), false);
  });

  it('keeps workflow skill handoff commands unambiguous', async () => {
    const clarify = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    assert.match(clarify, /needs_spec/);
    assert.match(clarify, /direct_to_plan/);
    assert.match(clarify, /docs\/loopx\/design\/<需求名>需求设计文档\.md/);
    assert.match(clarify, /docs\/loopx\/plans\/YYYY-MM-DD-<feature-name>\.md/);
    assert.doesNotMatch(clarify, /Recommended invocation: `\$spec/);
    assert.doesNotMatch(clarify, /Default handoff after normal loopx clarify: `\$plan <slug>`/);

    const plan = await readFile(join(repoRoot, 'skills', 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /Bite-Sized Task Granularity/);
    assert.match(plan, /No Placeholders/);
    assert.match(plan, /docs\/loopx\/plans\/YYYY-MM-DD-<feature-name>\.md/);
    assert.match(plan, /loopx:subagent-exec/);
    assert.match(plan, /loopx:exec/);
    assert.match(plan, /Subagent Exec \(recommended\)/);
    assert.doesNotMatch(plan, /Planner -> Architect -> Critic/);
    assert.doesNotMatch(plan, /consensus-first/i);

    const spec = await readFile(join(repoRoot, 'skills', 'spec', 'SKILL.md'), 'utf8');
    assert.match(spec, /docs\/loopx\/design\/<需求名>需求设计文档\.md/);
    assert.match(spec, /\$plan docs\/loopx\/design\/<需求名>需求设计文档\.md/);
    assert.doesNotMatch(spec, /\$plan --direct/);

    const review = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    assert.match(review, /Dispatch a code reviewer subagent/);
    assert.match(review, /code-reviewer\.md/);

    const fixReview = await readFile(join(repoRoot, 'skills', 'fix-review', 'SKILL.md'), 'utf8');
    assert.match(fixReview, /Verify before implementing/);
    assert.match(fixReview, /technical evaluation/i);

    const finish = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');
    assert.match(finish, /Learning Extraction/);
    assert.match(finish, /\.loopx\/memory\/MEMORY\.md/);
    assert.match(finish, /\.loopx\/memory\/index\.jsonl/);
    assert.match(finish, /docs\/loopx\/specs\/<domain>\.md/);
    assert.match(finish, /curated active index/);
    assert.match(finish, /Spec candidates/);
    assert.match(finish, /Learning extraction priority/);
    assert.match(finish, /Audit-First Learning Extraction/);
    assert.match(finish, /finish-start/);
    assert.match(finish, /finish-audit/);
    assert.match(finish, /finish-record/);
    assert.match(finish, /change_window/);
    assert.match(finish, /baseline\.\.HEAD/);
    assert.match(finish, /empty git diff/i);
    assert.match(finish, /\.loopx\/finish\/<audit-id>\/finish-state\.json/);
    assert.match(finish, /status` to `"audited"`/);
    assert.match(finish, /accepted_candidates` with evidence/);
    assert.match(finish, /no_candidates_reason/);
    assert.match(finish, /rejected candidates/);
    assert.match(finish, /choice recording/);
    assert.match(finish, /none/);
    assert.match(finish, /Durable behavior, contracts, or constraints proven by the implementation/);
    assert.match(finish, /State, file, CLI, API, install, migration, compatibility, or test invariants/);
    assert.match(finish, /Documentation changes when they define, correct, or preserve one of the above/);
    assert.equal(
      await readFile(join(repoRoot, 'plugins', 'loopx', 'skills', 'finish', 'SKILL.md'), 'utf8'),
      finish,
    );
  });

  it('bundles every loopx execution skill referenced by plan handoffs', async () => {
    const requiredExecutionSkills = [
      'subagent-exec',
      'exec',
      'final-review',
      'finish',
      'review',
      'fix-review',
      'refactor-plan',
    ];

    for (const skillName of requiredExecutionSkills) {
      assert.equal(LOOPX_BUNDLED_SKILLS.includes(skillName), true, `${skillName} missing from bundled install list`);
      assert.equal(existsSync(join(repoRoot, 'skills', skillName, 'SKILL.md')), true, `${skillName} root skill missing`);
      assert.equal(existsSync(join(repoRoot, 'plugins', 'loopx', 'skills', skillName, 'SKILL.md')), true, `${skillName} plugin skill missing`);
    }

    const subagentDriven = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    for (const skillName of ['plan', 'review', 'final-review', 'finish', 'tdd', 'exec']) {
      assert.match(subagentDriven, new RegExp(`loopx:${skillName}`), `subagent-exec must reference loopx:${skillName}`);
      assert.doesNotMatch(subagentDriven, new RegExp(`superpowers:${skillName}`), `subagent-exec still references superpowers:${skillName}`);
    }
    assert.match(subagentDriven, /finish-start/);
    assert.match(subagentDriven, /--source <plan-path>/);
    assert.doesNotMatch(subagentDriven, /using-git-worktrees/);
    assert.doesNotMatch(subagentDriven, /main\/master branch/);

    const executingPlans = await readFile(join(repoRoot, 'skills', 'exec', 'SKILL.md'), 'utf8');
    assert.match(executingPlans, /finish-start/);
    assert.match(executingPlans, /--source <plan-path>/);
    assert.doesNotMatch(executingPlans, /using-git-worktrees/);
    assert.doesNotMatch(executingPlans, /main\/master branch/);
    assert.equal(
      await readFile(join(repoRoot, 'plugins', 'loopx', 'skills', 'subagent-exec', 'SKILL.md'), 'utf8'),
      subagentDriven,
    );
    assert.equal(
      await readFile(join(repoRoot, 'plugins', 'loopx', 'skills', 'exec', 'SKILL.md'), 'utf8'),
      executingPlans,
    );

    const subagentProfile = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'agents', 'openai.yaml'), 'utf8');
    const pluginSubagentProfile = await readFile(join(repoRoot, 'plugins', 'loopx', 'skills', 'subagent-exec', 'agents', 'openai.yaml'), 'utf8');
    assert.match(subagentProfile, /display_name: "Subagent Exec"/);
    assert.match(subagentProfile, /short_description: "Execute loopx plans with staged subagent reviews"/);
    assert.equal(pluginSubagentProfile, subagentProfile);

    for (const relativePath of [
      'implementer-prompt.md',
      'spec-reviewer-prompt.md',
      'code-quality-reviewer-prompt.md',
    ]) {
      assert.equal(
        existsSync(join(repoRoot, 'skills', 'subagent-exec', relativePath)),
        true,
        `subagent-exec missing ${relativePath}`,
      );
      assert.equal(
        existsSync(join(repoRoot, 'plugins', 'loopx', 'skills', 'subagent-exec', relativePath)),
        true,
        `plugin subagent-exec missing ${relativePath}`,
      );
    }

    assert.equal(
      existsSync(join(repoRoot, 'skills', 'review', 'code-reviewer.md')),
      true,
      'review/code-reviewer.md missing',
    );
    assert.equal(
      existsSync(join(repoRoot, 'plugins', 'loopx', 'skills', 'review', 'code-reviewer.md')),
      true,
      'plugin review/code-reviewer.md missing',
    );
    assert.equal(
      existsSync(join(repoRoot, 'skills', 'final-review', 'final-reviewer.md')),
      true,
      'final-review/final-reviewer.md missing',
    );
    assert.equal(
      existsSync(join(repoRoot, 'plugins', 'loopx', 'skills', 'final-review', 'final-reviewer.md')),
      true,
      'plugin final-review/final-reviewer.md missing',
    );
  });

  it('keeps loopx skill and CLI handoff names separated', async () => {
    const nextSkill = await readFile(join(repoRoot, 'src', 'next-skill.mjs'), 'utf8');
    const workflow = await readFile(join(repoRoot, 'src', 'workflow.mjs'), 'utf8');
    const buildStopGate = await readFile(join(repoRoot, 'src', 'build-stop-gate.mjs'), 'utf8');
    const codexHook = await readFile(join(repoRoot, 'scripts', 'codex-workflow-hook.mjs'), 'utf8');
    const installDiscovery = await readFile(join(repoRoot, 'src', 'install-discovery.mjs'), 'utf8');

    for (const [label, text] of [
      ['next-skill', nextSkill],
      ['workflow', workflow],
      ['build-stop-gate', buildStopGate],
      ['codex-workflow-hook', codexHook],
    ]) {
      assert.doesNotMatch(text, /\$build\b/, `${label} must use loopx build for CLI handoffs, not $build`);
    }

    assert.match(nextSkill, /\$subagent-exec \.loopx\/plans\/requirements-snapshot-/);
    assert.match(nextSkill, /loopx build \.loopx\/plans\/requirements-snapshot-/);
    assert.doesNotMatch(installDiscovery, /LOOPX_PRUNED_LEGACY_OWNED_SKILLS/);
    assert.doesNotMatch(installDiscovery, /pruneLegacyLoopxOwnedSkills/);
    assert.doesNotMatch(installDiscovery, /const LOOPX_LEGACY_SKILLS/);
  });
});
