import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdtemp, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const repoRoot = resolve(process.cwd());
const resolverPath = join(repoRoot, 'skills', 'RESOLVER.md');
const verifyScriptPath = join(repoRoot, 'scripts', 'verify-skills.mjs');
const removedPluginPayloadDir = join(repoRoot, 'plugins', 'loopx', 'skills');
const removedPluginSyncScriptName = ['sync', 'plugin', 'skills'].join('-');
const removedSyncScriptPath = join(repoRoot, 'scripts', `${removedPluginSyncScriptName}.mjs`);
const removedRuntimeCommandPattern = /\bloopx\s+(?:approve|plan|build|review|archive|autopilot)\b/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
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
  it('keeps bundled skill frontmatter triggerable without a plugin payload directory', async () => {
    const resolver = await readFile(resolverPath, 'utf8');
    assert.equal(existsSync(removedPluginPayloadDir), false, 'plugin skill payload directory must be absent');
    assert.equal(existsSync(removedSyncScriptPath), false, 'removed plugin skill sync script must be absent');
    for (const skillName of LOOPX_BUNDLED_SKILLS) {
      const rootSkillPath = join(repoRoot, 'skills', skillName, 'SKILL.md');
      const rootSkill = await readFile(rootSkillPath, 'utf8');
      const fields = parseFrontmatter(rootSkill);

      assert.equal(fields.name, skillName);
      assert.ok(fields.description?.length >= 40, `${skillName} description is too short`);
      assert.match(fields.description, /not for/i, `${skillName} description must include a Not for exclusion`);
      assert.ok(fields.when_to_use?.length >= 20, `${skillName} needs when_to_use trigger metadata`);
      assert.match(fields['metadata.version'] ?? '', semverPattern, `${skillName} needs valid metadata.version`);
      assert.match(resolver, new RegExp(`skills/${skillName}/SKILL\\.md`), `${skillName} missing from resolver`);
    }
  });

  it('keeps package skill surface explicit and verifier packaged', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(existsSync(resolverPath), true, 'skills/RESOLVER.md must exist');
    assert.equal(existsSync(verifyScriptPath), true, 'scripts/verify-skills.mjs must exist');
    assert.equal(existsSync(removedPluginPayloadDir), false, 'plugin skill payload directory must be absent');
    assert.equal(existsSync(removedSyncScriptPath), false, 'removed plugin skill sync script must be absent');
    assert.equal(packageJson.files.includes('scripts/verify-skills.mjs'), true, 'npm package must include verify-skills.mjs');
    assert.equal(packageJson.files.includes(`scripts/${removedPluginSyncScriptName}.mjs`), false, 'npm package must exclude removed sync script');
    assert.equal(Object.hasOwn(packageJson.scripts ?? {}, removedPluginSyncScriptName), false);
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

  it('includes issue-driven workflow skills in the bundled skill set and package surface', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));

    assert.equal(LOOPX_BUNDLED_SKILLS.includes('issue'), true, 'issue must be bundled');
    assert.equal(LOOPX_BUNDLED_SKILLS.includes('fix'), true, 'fix must be bundled');
    assert.equal(packageJson.files.includes('skills/issue/'), true, 'npm package must include issue skill');
    assert.equal(packageJson.files.includes('skills/fix/'), true, 'npm package must include fix skill');
  });

  it('includes using-git-worktrees as a governed support skill', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const resolver = await readFile(resolverPath, 'utf8');
    const skill = await readFile(join(repoRoot, 'skills', 'using-git-worktrees', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(skill);

    assert.equal(LOOPX_BUNDLED_SKILLS.includes('using-git-worktrees'), true, 'using-git-worktrees must be bundled');
    assert.equal(packageJson.files.includes('skills/using-git-worktrees/'), true, 'npm package must include using-git-worktrees skill');
    assert.equal(fields.name, 'using-git-worktrees');
    assert.match(fields.description, /isolated workspace|git worktree/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /worktree|isolated workspace/i);
    assert.match(fields['metadata.version'] ?? '', semverPattern);
    assert.match(resolver, /skills\/using-git-worktrees\/SKILL\.md/);
    assert.match(skill, /support lens, not a workflow state/);
    assert.match(skill, /Native Worktree Tools/);
    assert.match(skill, /git worktree add/);
    assert.match(skill, /Do not use this skill for:/);
    assert.match(skill, /`fix` parallel subagent worktrees/);
    assert.match(skill, /`finish` owns branch placement/);
    assert.match(skill, /Do not commit the `.gitignore` change/);
  });

  it('governs issue skill as the issue-driven intake and diagnosis workflow', async () => {
    const issueSkill = await readFile(join(repoRoot, 'skills', 'issue', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(issueSkill);

    assert.equal(fields.name, 'issue');
    assert.match(fields.description, /bug-class/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /bug|regression|failing test|build failure|unexpected behavior/i);
    assert.equal(fields['metadata.version'], '0.3.5');
    assert.match(issueSkill, /\.loopx\/issues\/issue-<slug>-<timestamp>\.md/);
    assert.match(issueSkill, /phase/);
    assert.match(issueSkill, /status/);
    assert.match(issueSkill, /Triage Decision Matrix/);
    assert.match(issueSkill, /previously_worked/);
    assert.match(issueSkill, /documented_or_accepted_contract/);
    assert.match(issueSkill, /failing_existing_check/);
    assert.match(issueSkill, /new_or_changed_behavior/);
    assert.match(issueSkill, /Evidence Log/);
    assert.match(issueSkill, /Diagnosis Summary/);
    assert.match(issueSkill, /Diagnosis Minimum Standard/);
    assert.match(issueSkill, /root_cause_hypothesis/);
    assert.match(issueSkill, /at least one `hypotheses_rejected` entry with evidence/);
    assert.match(issueSkill, /Fix Brief/);
    assert.match(issueSkill, /Response Draft/);
    assert.match(issueSkill, /ready_for_fix/);
    assert.match(issueSkill, /Ready For Fix Gate/);
    assert.match(issueSkill, /Use `ready_for_fix` only when all conditions are true/);
    assert.match(issueSkill, /User confirmation is required before handoff/);
    assert.match(issueSkill, /needs_info/);
    assert.match(issueSkill, /not_a_bug/);
    assert.match(issueSkill, /duplicate/);
    assert.match(issueSkill, /already_fixed/);
    assert.match(issueSkill, /feature_request/);
    assert.match(issueSkill, /\$fix \.loopx\/issues\//);
    assert.match(issueSkill, /debug discipline/i);
    assert.match(issueSkill, /temporary diagnostic/i);
    assert.match(issueSkill, /baseline diff/i);
    assert.match(issueSkill, /explicitly allows/i);
    assert.match(issueSkill, /parallel_safe: false by default/);
    assert.match(issueSkill, /fix-review\? -> finish/);
    assert.doesNotMatch(issueSkill, /## Execution Reports/);
    assert.doesNotMatch(issueSkill, /## Reviews/);
    assert.doesNotMatch(issueSkill, /## Verification/);
    assert.doesNotMatch(issueSkill, /## Closeout/);
    assert.doesNotMatch(issueSkill, /fixed \| reviewed \| complete \| failed/);
    assert.doesNotMatch(issueSkill, /gh issue view|gh issue comment|gh issue close|gh pr create|gh pr merge/);
    assert.doesNotMatch(issueSkill, /durable code fix/i);
  });

  it('governs fix skill as the issue-driven execution workflow', async () => {
    const fixSkill = await readFile(join(repoRoot, 'skills', 'fix', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(fixSkill);

    assert.equal(fields.name, 'fix');
    assert.match(fields.description, /ready_for_fix/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /ready_for_fix|\.loopx\/issues|bug fix/i);
    assert.match(fields['metadata.version'] ?? '', semverPattern);
    assert.match(fixSkill, /status: ready_for_fix/);
    assert.match(fixSkill, /clean tracked baseline/i);
    assert.match(fixSkill, /Ignored local data is non-blocking/);
    assert.match(fixSkill, /git ls-files --others --exclude-standard/);
    assert.match(fixSkill, /unignored untracked files/);
    assert.doesNotMatch(fixSkill, /Require a clean worktree/i);
    assert.match(fixSkill, /expected_touched_files/);
    assert.match(fixSkill, /parallel_safe/);
    assert.match(fixSkill, /scope validation/i);
    assert.match(fixSkill, /actual_changed_files/);
    assert.match(fixSkill, /isolated `git worktree`/);
    assert.match(fixSkill, /patch\/report artifacts/);
    assert.match(fixSkill, /Never let multiple subagents directly edit the main worktree at the same time/);
    assert.match(fixSkill, /High-Risk Triggers/);
    assert.match(fixSkill, /scope_unclear/);
    assert.match(fixSkill, /public_surface/);
    assert.match(fixSkill, /no_repro/);
    assert.match(fixSkill, /defensive_fix/);
    assert.match(fixSkill, /status: needs_scope_change/);
    assert.match(fixSkill, /metadata `status: blocked`/);
    assert.match(fixSkill, /local review/i);
    assert.match(fixSkill, /whole diff review/i);
    assert.match(fixSkill, /fix-review/i);
    assert.match(fixSkill, /finish/i);
    assert.match(fixSkill, /Execution Reports/);
    assert.match(fixSkill, /Reviews/);
    assert.match(fixSkill, /Verification/);
    assert.match(fixSkill, /Closeout/);
    assert.match(fixSkill, /should not pre-fill execution, review, verification, or closeout content/);
    assert.match(fixSkill, /must not commit/i);
    assert.match(fixSkill, /must not push/i);
    assert.match(fixSkill, /must not close/i);
    assert.match(fixSkill, /Do not invoke `subagent-exec` or `loopx:exec`/);
    assert.doesNotMatch(fixSkill, /Use `subagent-exec`|Use `loopx:exec`|gh issue close|gh pr merge/);
  });

  it('debug exposes a structured diagnosis summary contract for issue workflow', async () => {
    const debugSkill = await readFile(join(repoRoot, 'skills', 'debug', 'SKILL.md'), 'utf8');

    assert.match(debugSkill, /Diagnosis Summary Contract/);
    assert.match(debugSkill, /classification: bug \| regression \| failing_test \| build_failure \| unexpected_behavior \| not_a_bug \| needs_info/);
    assert.match(debugSkill, /reproduction_status: reproduced \| intermittent \| not_reproduced \| not_attempted/);
    assert.match(debugSkill, /root_cause_status: confirmed \| likely \| unknown/);
    assert.match(debugSkill, /fix_mode: root_cause_fix \| defensive_fix \| blocked \| no_fix_needed/);
    assert.match(debugSkill, /regression_test_required/);
    assert.match(debugSkill, /risk_triggers/);
    assert.match(debugSkill, /issue workflow/i);
  });

  it('documents feature-driven and issue-driven workflows as parallel main flows', async () => {
    const resolver = await readFile(join(repoRoot, 'skills', 'RESOLVER.md'), 'utf8');
    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
    const skillsGuide = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsGuideZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');
    const installationSpec = await readFile(join(repoRoot, 'docs', 'loopx', 'specs', 'installation.md'), 'utf8');

    for (const text of [resolver, readme, readmeZh, skillsGuide, skillsGuideZh]) {
      assert.match(text, /issue-driven/i);
      assert.match(text, /\$issue|`issue`/);
      assert.match(text, /\$fix|`fix`/);
      assert.match(text, /bug-class|bug 类|bug-class issues/i);
    }
    assert.match(resolver, /skills\/issue\/SKILL\.md/);
    assert.match(resolver, /skills\/fix\/SKILL\.md/);
    assert.match(readme, /feature-driven/);
    assert.match(readme, /issue-driven/);
    assert.match(readmeZh, /feature-driven/);
    assert.match(readmeZh, /issue-driven/);
    assert.match(installationSpec, /issue/);
    assert.match(installationSpec, /fix/);
  });

  it('keeps current public docs and guidance free of removed runtime commands', async () => {
    const publicPaths = [
      'README.md',
      'README.zh-CN.md',
      'docs/loopx/cli.md',
      'docs/loopx/cli.zh-CN.md',
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
    const cliDoc = await readFile(join(repoRoot, 'docs', 'loopx', 'cli.md'), 'utf8');
    const cliDocZh = await readFile(join(repoRoot, 'docs', 'loopx', 'cli.zh-CN.md'), 'utf8');
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
      assert.match(cliDoc, pattern, `${command} missing from docs/loopx/cli.md`);
      assert.match(cliDocZh, pattern, `${command} missing from docs/loopx/cli.zh-CN.md`);
    }
    assert.match(readme, /clarify -> spec\? -> plan-to-exec -> \(exec \| subagent-exec\) -> review\/final-review -> fix-review\? -> finish/);
    assert.match(readme, /workflow happens by invoking skills inside the agent/);
    assert.match(readme, /\$clarify/);
    assert.match(readme, /\$finish/);
    assert.match(readme, /\.\/docs\/loopx\/cli\.md/);
    assert.match(readmeZh, /skill 调用完成/);
    assert.match(readmeZh, /\$clarify/);
    assert.match(readmeZh, /\$finish/);
    assert.match(readmeZh, /\.\/docs\/loopx\/cli\.zh-CN\.md/);
  });

  it('governs subagent-exec combined task review surface', async () => {
    const rootSkillDir = join(repoRoot, 'skills', 'subagent-exec');
    const removedSpecPrompt = ['spec', 'reviewer', 'prompt.md'].join('-');
    const removedQualityPrompt = ['code', 'quality', 'reviewer', 'prompt.md'].join('-');
    const removedTwoStagePhrase = ['two', 'stage review'].join('-');
    const removedPromptPattern = new RegExp(`${removedSpecPrompt}|${removedQualityPrompt}|${removedTwoStagePhrase}`, 'i');
    const rootSkill = await readFile(join(rootSkillDir, 'SKILL.md'), 'utf8');
    const taskReviewer = await readFile(join(rootSkillDir, 'task-reviewer-prompt.md'), 'utf8');
    const implementer = await readFile(join(rootSkillDir, 'implementer-prompt.md'), 'utf8');
    const codexReference = await readFile(join(rootSkillDir, 'codex-subagents.md'), 'utf8');

    assert.equal(existsSync(removedPluginPayloadDir), false, 'plugin skill payload directory must be absent');
    assert.equal(existsSync(join(rootSkillDir, 'task-reviewer-prompt.md')), true);
    assert.equal(existsSync(join(rootSkillDir, removedSpecPrompt)), false);
    assert.equal(existsSync(join(rootSkillDir, removedQualityPrompt)), false);

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
    assert.match(planSkill, /\*\*Support lenses:\*\*/);
    assert.match(planSkill, /Support lens coverage/);
    assert.match(planSkill, /combined task review|task reviewer/i);
  });

  it('spec requires boundary scenarios in proposal and detailed design', async () => {
    const specSkill = await readFile(join(repoRoot, 'skills', 'spec', 'SKILL.md'), 'utf8');
    const proposal = await readFile(join(repoRoot, 'skills', 'spec', 'references', 'design-proposal.md'), 'utf8');
    const template = await readFile(join(repoRoot, 'skills', 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');

    assert.match(specSkill, /boundary scenarios/i);
    assert.match(specSkill, /invalid inputs/);
    assert.match(specSkill, /unchanged behavior/);
    assert.match(specSkill, /Support Lens Activation/);
    assert.match(specSkill, /api-designer/);
    assert.match(specSkill, /architecture-designer/);
    assert.match(specSkill, /sql-style/);
    assert.match(specSkill, /cli-developer/);
    assert.match(specSkill, /go-style/);
    assert.match(specSkill, /kratos/);
    assert.match(proposal, /Boundary Scenarios/);
    assert.match(proposal, /Support Lens Checks/);
    assert.match(proposal, /invalid, missing, duplicated/);
    assert.match(proposal, /unchanged behavior that must not regress/);
    assert.match(template, /#### 4\.x\.4 边界条件/);
    assert.match(template, /非法输入/);
    assert.match(template, /重复请求/);
    assert.match(template, /#### 4\.x\.5 不变行为/);
    assert.match(template, /### 3\.6 专项设计检查/);
  });

  it('review and final-review actively trigger support lenses for domain-specific changes', async () => {
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');

    for (const skillText of [reviewSkill, finalReviewSkill]) {
      assert.match(skillText, /api-designer/);
      assert.match(skillText, /architecture-designer/);
      assert.match(skillText, /sql-style/);
      assert.match(skillText, /cli-developer/);
      assert.match(skillText, /go-style/);
      assert.match(skillText, /kratos/);
    }
    assert.match(reviewSkill, /Support Lens Triggers/);
    assert.match(reviewSkill, /Lens-specific checks/);
    assert.match(finalReviewSkill, /Support Lens Risk Scan/);
    assert.match(finalReviewSkill, /five phases/);
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

  it('finish wording avoids colliding with the assistant final channel', async () => {
    const finishSkill = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');
    const execSkill = await readFile(join(repoRoot, 'skills', 'exec', 'SKILL.md'), 'utf8');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');

    assert.doesNotMatch(finishSkill, /Final Response Contract/i);
    assert.doesNotMatch(finishSkill, /final response must/i);
    assert.match(finishSkill, /Completion Summary Contract/);
    assert.match(finishSkill, /completion summary must list/);
    assert.match(execSkill, /Only start `loopx:finish` after `loopx:final-review` is clean/);
    assert.match(subagentExecSkill, /Only start `loopx:finish` after `loopx:final-review` is clean/);
  });
});
