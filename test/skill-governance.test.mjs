import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const repoRoot = resolve(process.cwd());
const resolverPath = join(repoRoot, 'skills', 'RESOLVER.md');
const verifyScriptPath = join(repoRoot, 'scripts', 'verify-skills.mjs');
const removedRuntimeCommandPattern = /\bloopx\s+(?:approve|plan|build|review|archive|autopilot)\b/;
const execFileAsync = promisify(execFile);

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

function assertNoRemovedRuntimeCommandExposure(text, label) {
  assert.doesNotMatch(text, removedRuntimeCommandPattern, `${label} should not expose removed runtime commands`);
}

function assertMarkdownStructure(text, label) {
  assert.equal(text.endsWith('\n'), true, `${label} missing final newline`);
  assert.equal(/^(<<<<<<<|=======|>>>>>>>)($| )/m.test(text), false, `${label} contains merge conflict markers`);
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
  assert.deepEqual(fences, [], `${label} has unclosed fenced blocks`);
}

describe('loopx skill governance', () => {
  it('keeps bundled skill frontmatter triggerable and plugin mirrors byte-identical', async () => {
    const resolver = await readFile(resolverPath, 'utf8');
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
      assert.match(resolver, new RegExp(`skills/${skillName}/SKILL\\.md`), `${skillName} missing from resolver`);
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
  });

  it('keeps package skill surface explicit and verifier packaged', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(existsSync(resolverPath), true, 'skills/RESOLVER.md must exist');
    assert.equal(existsSync(verifyScriptPath), true, 'scripts/verify-skills.mjs must exist');
    assert.equal(packageJson.files.includes('scripts/verify-skills.mjs'), true, 'npm package must include verify-skills.mjs');
    assert.equal(packageJson.files.includes('scripts/claude-workflow-hook.mjs'), true, 'npm package must include claude-workflow-hook.mjs');
    assert.equal(packageJson.files.includes('scripts/codex-stop-hook.mjs'), false, 'npm package must not include deleted codex stop hook');
    assert.equal(packageJson.files.includes('templates/spec.md'), true, 'npm package must include retained clarify spec template');
    assert.equal(packageJson.files.includes('templates/'), false, 'npm package must not include broad runtime templates surface');
    assert.equal(packageJson.files.includes('skills/'), false, 'npm package must not include broad skills/ surface');
    assert.deepEqual(
      packageJson.files.filter((path) => path.startsWith('skills/')).sort(),
      ['skills/RESOLVER.md', ...LOOPX_BUNDLED_SKILLS.map((skillName) => `skills/${skillName}/`)].sort(),
    );
  });

  it('keeps current public docs and guidance free of removed runtime commands', async () => {
    const publicPaths = [
      'README.md',
      'README.zh-CN.md',
      'docs/loopx/design/loopx-skill-suite-v1-design.md',
      'docs/loopx/specs/installation.md',
      'src/cli.mjs',
      'src/next-skill.mjs',
      'scripts/codex-workflow-hook.mjs',
      'scripts/claude-workflow-hook.mjs',
      'scripts/verify-skills.mjs',
    ];
    for (const relativePath of publicPaths) {
      const text = await readFile(join(repoRoot, relativePath), 'utf8');
      if (relativePath.endsWith('.md')) {
        assertMarkdownStructure(text, relativePath);
      }
      assertNoRemovedRuntimeCommandExposure(text, relativePath);
    }

    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
    for (const command of [
      'loopx init',
      'loopx clarify',
      'loopx render',
      'loopx status',
      'loopx next',
      'loopx setup-context',
      'loopx doctor',
      'loopx repair-install',
      'loopx install-skills',
      'node scripts/verify-skills.mjs',
    ]) {
      const pattern = new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      assert.match(readme, pattern, `${command} missing from README.md`);
      assert.match(readmeZh, pattern, `${command} missing from README.zh-CN.md`);
    }
    assert.match(readme, /clarify -> spec\? -> plan-to-exec -> \(exec \| subagent-exec\) -> review\/final-review -> fix-review\? -> finish/);
  });

  it('governs subagent-exec combined task review surface', async () => {
    const rootSkillDir = join(repoRoot, 'skills', 'subagent-exec');
    const pluginSkillDir = join(repoRoot, 'plugins', 'loopx', 'skills', 'subagent-exec');
    const removedSpecPrompt = ['spec', 'reviewer', 'prompt.md'].join('-');
    const removedQualityPrompt = ['code', 'quality', 'reviewer', 'prompt.md'].join('-');
    const removedTwoStagePhrase = ['two', 'stage review'].join('-');
    const removedPromptPattern = new RegExp(`${removedSpecPrompt}|${removedQualityPrompt}|${removedTwoStagePhrase}`, 'i');
    const rootSkill = await readFile(join(rootSkillDir, 'SKILL.md'), 'utf8');
    const pluginSkill = await readFile(join(pluginSkillDir, 'SKILL.md'), 'utf8');
    const taskReviewer = await readFile(join(rootSkillDir, 'task-reviewer-prompt.md'), 'utf8');
    const implementer = await readFile(join(rootSkillDir, 'implementer-prompt.md'), 'utf8');
    const codexReference = await readFile(join(rootSkillDir, 'codex-subagents.md'), 'utf8');

    assert.equal(pluginSkill, rootSkill, 'subagent-exec SKILL.md mirror drifted');
    assert.equal(existsSync(join(rootSkillDir, 'task-reviewer-prompt.md')), true);
    assert.equal(existsSync(join(pluginSkillDir, 'task-reviewer-prompt.md')), true);
    assert.equal(existsSync(join(rootSkillDir, removedSpecPrompt)), false);
    assert.equal(existsSync(join(rootSkillDir, removedQualityPrompt)), false);
    assert.equal(existsSync(join(pluginSkillDir, removedSpecPrompt)), false);
    assert.equal(existsSync(join(pluginSkillDir, removedQualityPrompt)), false);

    assert.match(rootSkill, /task-reviewer-prompt\.md/);
    assert.match(rootSkill, /progress ledger/);
    assert.match(rootSkill, /Pre-Flight Plan Review/);
    assert.match(rootSkill, /review package/);
    assert.doesNotMatch(rootSkill, removedPromptPattern);
    assert.match(taskReviewer, /Spec Compliance/);
    assert.match(taskReviewer, /Task quality/);
    assert.match(taskReviewer, /Anchor traceability/);
    assert.match(taskReviewer, /Surface-change compliance/);
    assert.match(taskReviewer, /read-only/i);
    assert.match(taskReviewer, /Do Not Trust the Report/);
    assert.match(taskReviewer, /Cannot verify from diff/);
    assert.match(implementer, /Read your task brief first/);
    assert.match(implementer, /REPORT_FILE/);
    assert.match(codexReference, /task-reviewer-prompt\.md/);
    assert.doesNotMatch(codexReference, /spec reviewer, and code quality reviewer/);
  });

  it('subagent-exec helper scripts create gitignored file handoff artifacts', async () => {
    const wd = await realpath(await mkdtemp(join(tmpdir(), 'loopx-subagent-exec-')));
    await execFileAsync('git', ['init'], { cwd: wd });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: wd });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: wd });
    await writeFile(join(wd, 'plan.md'), [
      '# Example Plan',
      '',
      '## Global Constraints',
      '',
      '- Runtime: Node.js ESM.',
      '',
      '### Task 1: Add greeting',
      '',
      '**Interfaces:**',
      '- Consumes: none',
      '- Produces: `greet(name)` returns `Hello, <name>`.',
      '',
      '- [ ] **Step 1: Write file**',
      '',
      '### Task 2: Use greeting',
      '',
      '- [ ] **Step 1: Import function**',
      '',
      '## Self-Review',
      '',
      'This section is not part of Task 2.',
      '',
      '## Execution Handoff',
      '',
      'This section is not part of Task 2.',
      '',
    ].join('\n'));
    await writeFile(join(wd, 'app.txt'), 'one\n');
    await execFileAsync('git', ['add', '.'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: wd });
    const base = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: wd })).stdout.trim();
    await writeFile(join(wd, 'app.txt'), 'one\ntwo\n');
    await execFileAsync('git', ['add', '.'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'change app'], { cwd: wd });
    const head = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: wd })).stdout.trim();

    const scriptsDir = join(repoRoot, 'skills', 'subagent-exec', 'scripts');
    for (const scriptName of ['subagent-workspace', 'task-brief', 'review-package']) {
      const mode = (await stat(join(scriptsDir, scriptName))).mode;
      assert.notEqual(mode & 0o111, 0, `${scriptName} should be executable`);
    }

    const workspace = (await execFileAsync(join(scriptsDir, 'subagent-workspace'), [], { cwd: wd })).stdout.trim();
    assert.equal(workspace, join(wd, '.loopx', 'subagent-exec'));
    assert.equal(await readFile(join(workspace, '.gitignore'), 'utf8'), '*\n');
    const progressPath = join(workspace, 'progress.md');
    assert.equal(await readFile(progressPath, 'utf8'), '');
    await appendFile(progressPath, 'Task 1: complete (commits base..head, review clean)\n');
    assert.equal(
      await readFile(progressPath, 'utf8'),
      'Task 1: complete (commits base..head, review clean)\n',
    );

    const briefPath = (await execFileAsync(join(scriptsDir, 'task-brief'), ['plan.md', '1'], { cwd: wd })).stdout.trim();
    const brief = await readFile(briefPath, 'utf8');
    assert.match(brief, /# Task 1 Brief/);
    assert.match(brief, /Runtime: Node\.js ESM/);
    assert.match(brief, /Produces: `greet\(name\)`/);
    assert.doesNotMatch(brief, /Task 2: Use greeting/);

    const finalBriefPath = (await execFileAsync(join(scriptsDir, 'task-brief'), ['plan.md', '2'], { cwd: wd })).stdout.trim();
    const finalBrief = await readFile(finalBriefPath, 'utf8');
    assert.match(finalBrief, /# Task 2 Brief/);
    assert.match(finalBrief, /Task 2: Use greeting/);
    assert.doesNotMatch(finalBrief, /Self-Review/);
    assert.doesNotMatch(finalBrief, /Execution Handoff/);

    const packagePath = (await execFileAsync(join(scriptsDir, 'review-package'), [base, head], { cwd: wd })).stdout.trim();
    const reviewPackage = await readFile(packagePath, 'utf8');
    assert.match(reviewPackage, /# Review Package/);
    assert.match(reviewPackage, /## Commits/);
    assert.match(reviewPackage, /change app/);
    assert.match(reviewPackage, /## Diff Stat/);
    assert.match(reviewPackage, /## Diff/);
    assert.match(reviewPackage, /two/);
  });

  it('plan-to-exec requires global constraints and task interfaces for subagent handoff', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    assert.match(planSkill, /## Global Constraints/);
    assert.match(planSkill, /\*\*Interfaces:\*\*/);
    assert.match(planSkill, /Consumes:/);
    assert.match(planSkill, /Produces:/);
    assert.match(planSkill, /combined task review|task reviewer/i);
  });

  it('finish presents branch placement for normal repos and worktree choices only for worktrees', async () => {
    const finishSkill = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');
    assert.match(finishSkill, /Match the user's language/);
    assert.match(finishSkill, /If the user asked in Chinese/);
    assert.match(finishSkill, /`GIT_DIR == GIT_COMMON` \(normal repo\) \| 2 commit-placement options/);
    assert.match(finishSkill, /`GIT_DIR != GIT_COMMON`, named branch \| Standard 4 worktree options/);
    assert.match(finishSkill, /Where should I commit this work\?/);
    assert.match(finishSkill, /你想把这次改动提交到哪里/);
    assert.match(finishSkill, /Create a new branch and commit there/);
    assert.match(finishSkill, /finish-record <audit-id-or-path> --action keep --status done --summary "Committed on <current-branch>/);
    assert.match(finishSkill, /finish-record <audit-id-or-path> --action keep --status done --summary "Committed on new branch <branch-name>/);
    assert.match(finishSkill, /Present exactly 2 options for normal repos, 4 for named git worktrees, or 3 for detached HEAD/);
    assert.doesNotMatch(finishSkill, /Normal repo and named-branch worktree — present exactly these 4 options/);
  });
});
