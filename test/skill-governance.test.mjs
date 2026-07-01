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
const removedPluginMirrorPattern = new RegExp(`${removedPluginSyncScriptName}|plugins/loopx/skills|plugin skill mirror|plugin-ready v1 skill mirror`, 'i');
const removedRuntimeCommandPattern = /\bloopx\s+(?:approve|plan|build|review|archive|autopilot)\b/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const forbiddenRuntimeExpansionPattern = new RegExp([
  ['runtime state', 'machine'].join(' '),
  ['new CLI', 'command'].join(' '),
  ['artifact', 'validator'].join(' '),
].join('|'), 'i');
const finalReviewGatePattern = new RegExp([
  ['final-review.*hard', 'gate'].join(' '),
  ['hard', 'gate.*final-review'].join(' '),
].join('|'), 'i');
const finalReviewMatrixGatePattern = new RegExp([
  ['AC -> D -> T -> verification.*hard', 'gate'].join(' '),
  ['hard', 'gate.*AC -> D -> T -> verification'].join(' '),
].join('|'), 'i');
const finalReviewMatrixHardPattern = new RegExp(
  ['final-review.*AC -> D -> T -> verification.*', 'hard'].join(''),
  'i',
);
const removedChildReviewPathPattern = new RegExp(['plan', 'final', 'review'].join('_'));
const genericArtifactValidatorPattern = new RegExp(['generic', 'artifact', 'validator'].join('\\s+'), 'i');
const historicalPlanMigrationPattern = new RegExp([
  ['historical plan', 'migration'].join(' '),
  ['migrate historical', 'plans'].join(' '),
].join('|'), 'i');
const requiredHistoricalMigrationPattern = new RegExp([
  ['migrate historical', 'plans'].join(' '),
  ['required historical plan', 'migration'].join(' '),
].join('|'), 'i');
const execFileAsync = promisify(execFile);
const activeMaintenanceDocs = [
  'README.md',
  'README.zh-CN.md',
  'AGENTS.md',
  'docs/loopx/cli.md',
  'docs/loopx/cli.zh-CN.md',
  'docs/loopx/specs/installation.md',
  'skills/RESOLVER.md',
];
const packageLoopxDocs = [
  'docs/loopx/cli.md',
  'docs/loopx/cli.zh-CN.md',
  'docs/loopx/skills.md',
  'docs/loopx/skills.zh-CN.md',
  'docs/loopx/specs/installation.md',
];

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

async function rgCurrentSurface(paths, patterns) {
  const outputs = [];
  for (const pattern of patterns) {
    try {
      const { stdout } = await execFileAsync('rg', ['-n', pattern, ...paths], { cwd: repoRoot });
      if (stdout.trim()) {
        outputs.push(stdout.trim());
      }
    } catch (error) {
      if (error?.code === 1) {
        continue;
      }
      throw error;
    }
  }
  return outputs.join('\n');
}

function assertNoRemovedRuntimeCommandExposure(text, label) {
  assert.doesNotMatch(text, removedRuntimeCommandPattern, `${label} should not expose removed runtime commands`);
}

function assertNoRemovedPluginMirrorWorkflow(text, label) {
  assert.doesNotMatch(text, removedPluginMirrorPattern, `${label} should not reference removed plugin skill mirror workflow`);
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

function assertSkillHandoffFormat(text, label) {
  assert.match(text, /## Skill Handoff Format/, `${label} must document agent-native handoff rendering`);
  assert.match(text, /Codex: `\$<skill> <args>`/, `${label} missing Codex handoff form`);
  assert.match(text, /Claude Code: `\/<skill> <args>`/, `${label} missing Claude Code handoff form`);
  assert.match(text, /Cursor Agent Skills: `\/<skill> <args>`/, `${label} missing Cursor Agent Skills handoff form`);
  assert.match(text, /Generic: `Use the <skill> skill with <args>`/, `${label} missing generic handoff form`);
  assert.match(text, /Do not present Codex `\$\.\.\.` syntax as the only handoff/, `${label} must prevent Codex-only handoff`);
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

  it('keeps package files skill surface explicit and verifier packaged', async () => {
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
    assert.equal(packageJson.files.includes('templates/intake-clarification.md'), true, 'npm package must include clarify intake clarification template');
    assert.equal(packageJson.files.includes('templates/intake-requirements.md'), true, 'npm package must include clarify intake requirements template');
    assert.equal(packageJson.files.includes('templates/intake-test-cases.md'), true, 'npm package must include clarify intake test cases template');
    assert.equal(packageJson.files.includes('templates/'), false, 'npm package must not include broad runtime templates surface');
    assert.equal(packageJson.files.includes('docs/loopx/'), false, 'npm package must not include broad docs/loopx surface');
    assert.deepEqual(
      packageJson.files.filter((path) => path.startsWith('docs/loopx/')).sort(),
      [...packageLoopxDocs].sort(),
      'npm package docs/loopx surface must exactly match public docs whitelist',
    );
    assert.equal(packageJson.files.includes('skills/'), false, 'npm package must not include broad skills/ surface');
    assert.deepEqual(
      packageJson.files.filter((path) => path.startsWith('skills/')).sort(),
      ['skills/RESOLVER.md', ...LOOPX_BUNDLED_SKILLS.map((skillName) => `skills/${skillName}/`)].sort(),
    );
  });

  it('keeps active maintainer docs off the removed plugin skill mirror workflow', async () => {
    for (const relativePath of activeMaintenanceDocs) {
      const text = await readFile(join(repoRoot, relativePath), 'utf8');
      assertNoRemovedPluginMirrorWorkflow(text, relativePath);
    }
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

  it('includes lancet as a governed bundled support skill', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const resolver = await readFile(resolverPath, 'utf8');
    const skill = await readFile(join(repoRoot, 'skills', 'lancet', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(skill);

    assert.equal(LOOPX_BUNDLED_SKILLS.includes('lancet'), true, 'lancet must be bundled');
    assert.equal(packageJson.files.includes('skills/lancet/'), true, 'npm package must include lancet skill');
    assert.equal(fields.name, 'lancet');
    assert.match(fields.description, /support lens|implementation-layer minimization/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /over-engineering|yagni|implementation/i);
    assert.match(fields['metadata.version'] ?? '', semverPattern);
    assert.match(resolver, /skills\/lancet\/SKILL\.md/);
    assert.match(skill, /support lens, not a workflow state/);
    assert.match(skill, /Codex-only automatic activation/);
    assert.match(skill, /implementation and review layers/i);
    assert.match(skill, /Do not use this skill for:/);
    assert.match(skill, /`clarify` or `spec` planning/);
  });

  it('includes plan-reviewer as a governed bundled support skill', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const resolver = await readFile(resolverPath, 'utf8');

    assert.equal(LOOPX_BUNDLED_SKILLS.includes('plan-reviewer'), true, 'plan-reviewer must be bundled');
    assert.equal(packageJson.files.includes('skills/plan-reviewer/'), true, 'npm package must include plan-reviewer skill');

    const skill = await readFile(join(repoRoot, 'skills', 'plan-reviewer', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(skill);

    assert.equal(fields.name, 'plan-reviewer');
    assert.match(fields.description, /source-to-plan|plan artifact|coverage/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /plan review|source-to-plan|plan audit|coverage/i);
    assert.match(fields['metadata.version'] ?? '', semverPattern);
    assert.match(resolver, /skills\/plan-reviewer\/SKILL\.md/);
    assert.match(skill, /support lens, not a workflow state/i);
    assert.match(skill, /Do not use this skill for:/);
    assert.match(skill, /implementation code|code review/i);
    assert.match(skill, /must not create a workflow state/i);
    assert.match(skill, /ad-hoc plan audit/i);
  });

  it('governs clarify skill as incremental requirements intake', async () => {
    const clarifySkill = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(clarifySkill);

    assert.equal(fields.name, 'clarify');
    assert.match(fields.description, /ambiguous loopx work/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /requirements|unclear scope|需求澄清/i);
    assert.match(fields['metadata.version'] ?? '', semverPattern);
    assert.match(clarifySkill, /Write the clarify intake package \*\*incrementally\*\*/);
    assert.match(clarifySkill, /Do not wait until all questions are resolved/);
    assert.match(clarifySkill, /\.loopx\/intake\/YYYY-MM-DD-<slug>\//);
    assert.match(clarifySkill, /clarification\.md/);
    assert.match(clarifySkill, /requirements\.md/);
    assert.match(clarifySkill, /test-cases\.md/);
    assert.match(clarifySkill, /AC-\*/);
    assert.match(clarifySkill, /TC-\*/);
    assert.match(clarifySkill, /`requirements\.md` and `test-cases\.md` must share the same `AC-\*` anchors/);
    assert.match(clarifySkill, /black-box acceptance\/integration/i);
    assert.match(clarifySkill, /first material answer/);
    assert.match(clarifySkill, /\[PENDING\]/);
    assert.match(clarifySkill, /## Resume State/);
    assert.match(clarifySkill, /current_round/);
    assert.match(clarifySkill, /unresolved_count/);
    assert.match(clarifySkill, /next_question/);
    assert.match(clarifySkill, /`spec` or `plan-to-exec` needs/);
    assertSkillHandoffFormat(clarifySkill, 'clarify');
    assert.match(clarifySkill, /skill: plan-to-exec/);
    assert.match(clarifySkill, /Codex: \$plan-to-exec/);
    assert.match(clarifySkill, /Claude Code: \/plan-to-exec/);
    assert.match(clarifySkill, /Cursor Agent Skills: \/plan-to-exec/);
    assert.match(clarifySkill, /Generic: Use the plan-to-exec skill/);
    assert.match(clarifySkill, /needs_spec/);
    assert.match(clarifySkill, /direct_to_plan/);
    assert.match(clarifySkill, /blocked/);
  });

  it('governs issue skill as the issue-driven intake and diagnosis workflow', async () => {
    const issueSkill = await readFile(join(repoRoot, 'skills', 'issue', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(issueSkill);

    assert.equal(fields.name, 'issue');
    assert.match(fields.description, /bug-class/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /bug|regression|failing test|build failure|unexpected behavior/i);
    assert.equal(fields['metadata.version'], '0.3.5');
    assert.match(issueSkill, /\.loopx\/issues\/issue-<slug>-YYYY-MM-DD\.md/);
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
    const platformReference = await readFile(join(rootSkillDir, 'platform-subagents.md'), 'utf8');
    const codexReference = await readFile(join(rootSkillDir, 'codex-subagents.md'), 'utf8');
    const claudeReference = await readFile(join(rootSkillDir, 'claude-subagents.md'), 'utf8');
    const cursorReference = await readFile(join(rootSkillDir, 'cursor-subagents.md'), 'utf8');

    assert.equal(existsSync(removedPluginPayloadDir), false, 'plugin skill payload directory must be absent');
    assert.equal(existsSync(join(rootSkillDir, 'task-reviewer-prompt.md')), true);
    assert.equal(existsSync(join(rootSkillDir, 'platform-subagents.md')), true);
    assert.equal(existsSync(join(rootSkillDir, 'claude-subagents.md')), true);
    assert.equal(existsSync(join(rootSkillDir, 'cursor-subagents.md')), true);
    assert.equal(existsSync(join(rootSkillDir, removedSpecPrompt)), false);
    assert.equal(existsSync(join(rootSkillDir, removedQualityPrompt)), false);

    assert.match(rootSkill, /task-reviewer-prompt\.md/);
    assert.match(rootSkill, /platform-subagents\.md/);
    assert.match(rootSkill, /claude-subagents\.md/);
    assert.match(rootSkill, /cursor-subagents\.md/);
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
    assert.doesNotMatch(implementer, /Native Codex subagent/);
    assert.match(platformReference, /Codex/);
    assert.match(platformReference, /Claude Code/);
    assert.match(platformReference, /Cursor/);
    assert.match(platformReference, /Generic Requirements/);
    assert.match(codexReference, /task-reviewer-prompt\.md/);
    assert.match(rootSkill, /Confirm Subagent Capability/);
    assert.match(rootSkill, /deferred tool\s+discovery/i);
    assert.match(codexReference, /deferred-loaded tools/i);
    assert.match(codexReference, /tool_search/);
    assert.match(codexReference, /multi_agent_v1\.spawn_agent/);
    assert.match(codexReference, /Only after direct lookup and available discovery both fail/);
    assert.match(claudeReference, /Agent tool/);
    assert.match(claudeReference, /\/agents/);
    assert.match(claudeReference, /@agent-/);
    assert.match(claudeReference, /loopx:exec/);
    assert.match(cursorReference, /Cursor Cloud Agents/);
    assert.match(cursorReference, /asynchronous Cloud Agent branch or PR workflow/);
    assert.match(cursorReference, /loopx:review/);
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
      '### T-001 / Task 1: Add greeting',
      'Task anchor: T-001',
      '',
      '',
      '**Interfaces:**',
      '- Consumes: none',
      '- Produces: `greet(name)` returns `Hello, <name>`.',
      '',
      '- [ ] **Step 1: Write file**',
      '',
      '### T-002 / Task 2: Use greeting',
      'Task anchor: T-002',
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
    assert.match(brief, /T-001 \/ Task 1: Add greeting/);
    assert.match(brief, /Task anchor: T-001/);
    assert.match(brief, /Runtime: Node\.js ESM/);
    assert.match(brief, /Produces: `greet\(name\)`/);
    assert.doesNotMatch(brief, /T-002 \/ Task 2: Use greeting/);
    assert.doesNotMatch(brief, /Self-Review/);
    assert.doesNotMatch(brief, /Execution Handoff/);

    const finalBriefPath = (await execFileAsync(join(scriptsDir, 'task-brief'), ['plan.md', '2'], { cwd: wd })).stdout.trim();
    const finalBrief = await readFile(finalBriefPath, 'utf8');
    assert.match(finalBrief, /# Task 2 Brief/);
    assert.match(finalBrief, /T-002 \/ Task 2: Use greeting/);
    assert.match(finalBrief, /Task anchor: T-002/);
    assert.doesNotMatch(finalBrief, /Self-Review/);
    assert.doesNotMatch(finalBrief, /Execution Handoff/);

    await writeFile(join(wd, 'legacy-plan.md'), [
      '# Legacy Plan',
      '',
      '## Global Constraints',
      '',
      '- Runtime: Node.js ESM.',
      '',
      '### Task 1: Legacy greeting',
      '',
      '- [ ] **Step 1: Keep legacy heading support**',
      '',
    ].join('\n'));
    const legacyBriefPath = (await execFileAsync(join(scriptsDir, 'task-brief'), ['legacy-plan.md', '1'], { cwd: wd })).stdout.trim();
    const legacyBrief = await readFile(legacyBriefPath, 'utf8');
    assert.match(legacyBrief, /# Task 1 Brief/);
    assert.match(legacyBrief, /Task 1: Legacy greeting/);

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
    const clarifySkill = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const resolver = await readFile(join(repoRoot, 'skills', 'RESOLVER.md'), 'utf8');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const finishSkill = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');
    assert.match(planSkill, /## Global Constraints/);
    assert.match(planSkill, /\*\*Interfaces:\*\*/);
    assert.match(planSkill, /Consumes:/);
    assert.match(planSkill, /Produces:/);
    assert.match(planSkill, /\*\*Support lenses:\*\*/);
    assert.match(planSkill, /Support lens coverage/);
    assert.match(planSkill, /combined task review|task reviewer/i);
    assert.match(planSkill, /Single plan: `docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\.md`/);
    assert.match(planSkill, /Multiple plans from one source: `docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\/`/);
    assert.match(planSkill, /`00-overview\.md`/);
    assert.match(planSkill, /execution order/);
    assert.match(planSkill, /can run in parallel/);
    assert.match(clarifySkill, /Multiple plans from one source: `docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\/`/);
    assert.match(planSkill, /\.loopx\/multi-plan\/<feature-slug>\/state\.json/);
    assert.match(planSkill, /plan-level `final-review`/);
    assert.match(planSkill, /plan_review\.status/);
    assert.match(planSkill, /child plan.*does not create a final-review report/is);
    assert.match(planSkill, /spec-level `final-review`/);
    assert.doesNotMatch(planSkill, removedChildReviewPathPattern);
    assert.match(subagentExecSkill, /Direct Child Plan Mode/);
    assert.match(subagentExecSkill, /not execute sibling child plans from direct child plan mode/);
    assert.match(subagentExecSkill, /Do not proceed to\s+package-level spec review or `finish` after the child plan completes/);
    assert.match(subagentExecSkill, /loopx execution-start <slug> --source <plan-path>/);
    assert.match(subagentExecSkill, /loopx finish-start <slug> --source <plan-path>/);
    assert.match(subagentExecSkill, /plan_review\.status/);
    assert.match(subagentExecSkill, /ready_for_spec_review/);
    assert.match(subagentExecSkill, /must not write.*final-review.*report/is);
    assert.doesNotMatch(subagentExecSkill, removedChildReviewPathPattern);
    assert.match(finalReviewSkill, /Plan-level final-review/);
    assert.match(finalReviewSkill, /Spec-level final-review/);
    assert.match(finalReviewSkill, /\.loopx\/multi-plan\/<feature-slug>\/state\.json/);
    assert.match(finishSkill, /Step 4\.5: Check Multi-Plan Finish Gate/);
    assert.match(finishSkill, /plan_review\.status/);
    assert.match(finishSkill, /spec_final_review\.ready_for_finish/);
    assert.doesNotMatch(finishSkill, removedChildReviewPathPattern);
    assert.match(resolver, /multiple plans from one source under `docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\/`/);
    assert.match(resolver, /plan_review\.status|plan-level final-review/);
    assert.match(resolver, /package receives one spec-level final-review report/);
  });

  it('governs multi-plan package execution mode across execution skills', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const execSkill = await readFile(join(repoRoot, 'skills', 'exec', 'SKILL.md'), 'utf8');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const finishSkill = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');
    const resolver = await readFile(join(repoRoot, 'skills', 'RESOLVER.md'), 'utf8');

    assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.12');
    assert.equal(parseFrontmatter(execSkill)['metadata.version'], '0.3.8');
    assert.equal(parseFrontmatter(subagentExecSkill)['metadata.version'], '0.3.10');
    assert.equal(parseFrontmatter(finishSkill)['metadata.version'], '0.3.8');

    assert.match(planSkill, /package mode/i);
    assert.match(planSkill, /\$subagent-exec docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\/00-overview\.md/);
    assert.match(planSkill, /\$exec docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\/00-overview\.md/);
    assert.match(planSkill, /primary handoff/i);
    assert.match(planSkill, /targeted\/resume\/manual-control/i);
    assert.match(planSkill, /strictly sequential/i);
    assert.doesNotMatch(planSkill, /Do not ask one agent to execute the whole directory/);

    assert.match(subagentExecSkill, /Multi-Plan Package Mode/);
    assert.match(subagentExecSkill, /package directory/i);
    assert.match(subagentExecSkill, /00-overview\.md/);
    assert.match(subagentExecSkill, /schema v2/i);
    assert.match(subagentExecSkill, /plan_review\.status/);
    assert.match(subagentExecSkill, /strictly sequential/i);
    assert.match(subagentExecSkill, /fresh implementer subagent per task/i);
    assert.match(subagentExecSkill, /task reviewer subagent/i);
    assert.match(subagentExecSkill, /spec-level `loopx:final-review`/);
    assert.match(subagentExecSkill, /enter `loopx:finish`|start `loopx:finish`/i);
    assert.match(subagentExecSkill, /Direct child plan mode|Targeted child plan mode/i);
    assert.match(subagentExecSkill, /execute only that child plan/i);

    assert.match(execSkill, /Multi-Plan Package Mode/);
    assert.match(execSkill, /package directory/i);
    assert.match(execSkill, /00-overview\.md/);
    assert.match(execSkill, /same-context/i);
    assert.match(execSkill, /without subagents/i);
    assert.match(execSkill, /schema v2/i);
    assert.match(execSkill, /strictly sequential/i);
    assert.match(execSkill, /Direct child plan mode|Targeted child plan mode/i);
    assert.match(execSkill, /plan-level `loopx:final-review`/);
    assert.match(execSkill, /spec-level `loopx:final-review`/);

    assert.match(finishSkill, /plan_review\.status/);
    assert.match(finishSkill, /non-empty `plan_review\.reviewed_at`/);
    assert.match(finishSkill, /non-empty `plan_review\.summary`/);
    assert.doesNotMatch(finishSkill, removedChildReviewPathPattern);

    assert.match(resolver, /package mode/i);
    assert.match(resolver, /call `subagent-exec` or `exec`/);
    assert.match(resolver, /Package mode executes child plans strictly sequentially/);
    assert.match(resolver, /one spec-level `final-review` and `finish` only when clean/);
    assert.match(resolver, /00-overview\.md/);
    assert.match(resolver, /Direct numbered child plan execution is targeted\/resume\/manual-control mode/);
    assert.match(resolver, /targeted\/resume\/manual-control/i);

    const forbiddenSurface = await rgCurrentSurface([
      'skills',
      'templates',
      'README.md',
      'README.zh-CN.md',
      'docs/loopx/skills.md',
      'docs/loopx/skills.zh-CN.md',
      'docs/loopx/cli.md',
      'docs/loopx/cli.zh-CN.md',
      'docs/loopx/specs',
      'src',
      'scripts',
      'package.json',
    ], [
      'multi-plan-exec',
      '\\bloopx\\s+multi-plan\\b',
    ]);
    assert.equal(forbiddenSurface, '');
  });

  it('spec requires boundary scenarios in proposal and detailed design', async () => {
    const specSkill = await readFile(join(repoRoot, 'skills', 'spec', 'SKILL.md'), 'utf8');
    const clarifySkill = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const planToExecSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const proposal = await readFile(join(repoRoot, 'skills', 'spec', 'references', 'design-proposal.md'), 'utf8');
    const template = await readFile(join(repoRoot, 'skills', 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');
    const skillsDoc = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsDocZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');

    assert.match(specSkill, /boundary scenarios/i);
    assert.match(specSkill, /Default to producing one detailed design document/);
    assert.match(specSkill, /proposal trigger applies/);
    assert.match(specSkill, /skip the proposal to reduce token use and review overhead/);
    assert.doesNotMatch(specSkill, /Default to producing two documents/);
    assert.match(specSkill, /invalid inputs/);
    assert.match(specSkill, /unchanged behavior/);
    assert.match(specSkill, /intake package directory/);
    assert.match(specSkill, /requirements\.md/);
    assert.match(specSkill, /test-cases\.md/);
    assert.match(planToExecSkill, /intake package directory/);
    assert.match(planToExecSkill, /requirements\.md/);
    assert.match(planToExecSkill, /test-cases\.md/);
    assert.match(specSkill, /Support Lens Activation/);
    assert.match(specSkill, /api-designer/);
    assert.match(specSkill, /architecture-designer/);
    assert.match(specSkill, /sql-style/);
    assert.match(specSkill, /cli-developer/);
    assert.match(specSkill, /go-style/);
    assert.match(specSkill, /kratos/);
    assert.match(proposal, /Boundary Scenarios/);
    assert.match(proposal, /Support Lens Checks/);
    assert.match(proposal, /Do not treat generic requests for `spec`, `design doc`, `详细设计`, `设计方案`, or `技术方案` as proposal requests by themselves/);
    assert.match(proposal, /invalid, missing, duplicated/);
    assert.match(proposal, /unchanged behavior that must not regress/);
    assert.match(template, /#### 4\.x\.4 边界条件/);
    assert.match(template, /非法输入/);
    assert.match(template, /重复请求/);
    assert.match(template, /#### 4\.x\.5 不变行为/);
    assert.match(template, /### 3\.6 专项设计检查/);
    const currentProductSurfaces = [
      ['skills/spec/SKILL.md', specSkill],
      ['skills/clarify/SKILL.md', clarifySkill],
      ['skills/plan-to-exec/SKILL.md', planToExecSkill],
      ['skills/spec/DESIGN_SPEC_TEMPLATE.md', template],
      ['docs/loopx/skills.md', skillsDoc],
      ['docs/loopx/skills.zh-CN.md', skillsDocZh],
    ];

    for (const [, text] of currentProductSurfaces) {
      assert.match(text, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/需求设计文档\.md/);
    }
    assert.match(specSkill, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/设计提案\.md/);
    assert.match(specSkill, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/设计提案\.html/);
    assert.match(specSkill, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/需求设计文档\.html/);
    assert.match(specSkill, /Derive `<kebab-slug>`/);
    const oldCurrentProductPathPatterns = [
      /docs\/loopx\/design\/<需求名>设计提案\.md/,
      /docs\/loopx\/design\/<需求名>需求设计文档\.md/,
      /docs\/loopx\/design\/<需求名>(?:\s|$|[`'")，。；、])/,
    ];
    for (const [label, text] of currentProductSurfaces) {
      for (const pattern of oldCurrentProductPathPatterns) {
        assert.doesNotMatch(text, pattern, `${label} should not reference old current-product spec path ${pattern}`);
      }
    }
  });

  it('governs design contract anchors across spec planning and review', async () => {
    const specSkill = await readFile(join(repoRoot, 'skills', 'spec', 'SKILL.md'), 'utf8');
    const template = await readFile(join(repoRoot, 'skills', 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const specFields = parseFrontmatter(specSkill);
    const planFields = parseFrontmatter(planSkill);
    const reviewFields = parseFrontmatter(reviewSkill);

    assert.equal(specFields['metadata.version'], '0.3.9');
    assert.equal(planFields['metadata.version'], '0.3.12');
    assert.equal(reviewFields['metadata.version'], '0.3.7');

    assert.match(specSkill, /D-\*/);
    assert.match(specSkill, /implementation-relevant/i);
    assert.match(specSkill, /human-reviewed design document|human-readable design document/i);
    assert.match(specSkill, /Design anchors: not applicable/);
    assert.match(specSkill, /inline/i);
    assert.match(specSkill, /final complete index table|complete index table/i);
    assert.match(specSkill, /Source AC/);
    assert.match(specSkill, /contract type/i);
    assert.match(specSkill, /Boundary or non-goal|Boundary \/ non-goal/i);
    assert.match(specSkill, /downstream expectation/i);
    assert.match(specSkill, /support lenses/i);
    assert.match(specSkill, /separate authoritative contract files/i);
    assert.match(specSkill, /TC-\*/);

    assert.match(template, /Design Contract Index \/ D-\*/);
    assert.match(template, /\| D anchor \| Source AC \| Contract type \| Decision summary \| Boundary \/ non-goal \| Downstream expectation \|/);
    assert.match(template, /Verification Strategy \/ TC/);
    assert.match(template, /Design anchors: not applicable/);

    assert.match(planSkill, /D-\*/);
    assert.match(planSkill, /Design anchors/);
    assert.match(planSkill, /design anchor coverage/i);
    assert.match(planSkill, /deferred-with-rationale/);
    assert.match(planSkill, /return to `spec`/);

    assert.match(reviewSkill, /D-\*/);
    assert.match(reviewSkill, /AC-\*/);
    assert.match(reviewSkill, /Stage 1 spec compliance/i);
    assert.match(reviewSkill, /deferred rationale/i);
    assert.match(reviewSkill, /code quality/i);

    assert.doesNotMatch(specSkill, /design-contract\.json|contracts\.md/);
    assert.doesNotMatch(planSkill, /design-contract\.json|contracts\.md/);
    assert.doesNotMatch(reviewSkill, /design-contract\.json|contracts\.md/);
    assert.doesNotMatch(specSkill, forbiddenRuntimeExpansionPattern);
    assert.doesNotMatch(planSkill, forbiddenRuntimeExpansionPattern);
    assert.doesNotMatch(reviewSkill, forbiddenRuntimeExpansionPattern);
    assert.doesNotMatch(reviewSkill, finalReviewGatePattern);
  });

  it('governs plan task anchors across planning execution and review', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const execSkill = await readFile(join(repoRoot, 'skills', 'exec', 'SKILL.md'), 'utf8');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const implementerPrompt = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'), 'utf8');
    const taskReviewerPrompt = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'), 'utf8');
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const planFields = parseFrontmatter(planSkill);
    const execFields = parseFrontmatter(execSkill);
    const subagentExecFields = parseFrontmatter(subagentExecSkill);
    const reviewFields = parseFrontmatter(reviewSkill);

    assert.equal(planFields['metadata.version'], '0.3.12');
    assert.equal(execFields['metadata.version'], '0.3.8');
    assert.equal(subagentExecFields['metadata.version'], '0.3.10');
    assert.equal(reviewFields['metadata.version'], '0.3.7');

    assert.match(planSkill, /T-\*/);
    assert.match(planSkill, /### T-001 \/ Task 1:/);
    assert.match(planSkill, /plan-local/i);
    assert.match(planSkill, /append new `T-\*` anchors/i);
    assert.match(planSkill, /child plan slug|child plan path/i);
    assert.match(planSkill, /Review focus/);
    assert.match(planSkill, /not_applicable/);
    assert.match(planSkill, /Task anchor coverage|T-\*.*coverage/i);

    assert.match(execSkill, /T-\*/);
    assert.match(execSkill, /loopx execution-start <slug> --source <plan-path>/);
    assert.match(execSkill, /loopx finish-start <slug> --source <plan-path>/);
    assert.match(execSkill, /checkpoint/i);
    assert.match(execSkill, /checkpoint reviews rather than mandatory per-task reviews|checkpoint review/i);
    assert.match(execSkill, /review request/i);
    assert.match(execSkill, /T-001 \/ Task 1/);
    assert.match(execSkill, /Mandatory Review Checkpoints/);
    assert.match(execSkill, /These checkpoints are mandatory, not suggestions/);
    assert.match(execSkill, /3 consecutive tasks without a review/);
    assert.match(execSkill, /Before announcing all tasks complete or starting `loopx:final-review`/);
    assert.match(execSkill, /final checkpoint.*loopx:review/is);
    assert.match(execSkill, /does not replace `loopx:final-review`/);
    assert.match(execSkill, /git diff/);
    assert.match(execSkill, /git diff --cached/);
    assert.match(execSkill, /small mechanical tasks only when no checkpoint condition applies/);
    assert.doesNotMatch(execSkill, /after every task, before moving to the next task/);

    assert.match(subagentExecSkill, /T-\*/);
    assert.match(subagentExecSkill, /task brief/i);
    assert.match(subagentExecSkill, /progress ledger/i);
    assert.match(subagentExecSkill, /task_anchor/);
    assert.match(implementerPrompt, /task_anchor/);
    assert.match(implementerPrompt, /T-\*/);
    assert.match(taskReviewerPrompt, /task_anchor/);
    assert.match(taskReviewerPrompt, /T-\*/);

    assert.match(reviewSkill, /T-\*/);
    assert.match(reviewSkill, /coverage notes/i);
    assert.match(reviewSkill, /Stage 1 spec compliance/i);

    for (const [label, text] of [
      ['plan-to-exec', planSkill],
      ['exec', execSkill],
      ['subagent-exec', subagentExecSkill],
      ['review', reviewSkill],
    ]) {
      assert.doesNotMatch(text, forbiddenRuntimeExpansionPattern, `${label} should not expand task anchors into runtime scope`);
      assert.doesNotMatch(text, historicalPlanMigrationPattern, `${label} should not require historical migration scope`);
    }
    assert.doesNotMatch(finalReviewSkill, finalReviewMatrixGatePattern);
    assert.doesNotMatch(planSkill, finalReviewGatePattern);
    assert.doesNotMatch(execSkill, finalReviewMatrixHardPattern);
    assert.doesNotMatch(subagentExecSkill, finalReviewMatrixHardPattern);
    assert.doesNotMatch(reviewSkill, finalReviewMatrixHardPattern);
    assert.doesNotMatch(planSkill, requiredHistoricalMigrationPattern);
    assert.match(planSkill, /Do not migrate historical `### Task N: \.\.\.` plans|Do not migrate historical/i);
  });

  it('governs plan-to-exec internal source-to-plan review', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const resolver = await readFile(resolverPath, 'utf8');
    const skillsDoc = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsDocZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');

    assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.12');

    assert.match(planSkill, /Internal Plan Review/);
    assert.match(planSkill, /draft plan/i);
    assert.match(planSkill, /source-to-plan review/i);
    assert.match(planSkill, /plan-reviewer/);
    assert.match(planSkill, /subagent/i);
    assert.match(planSkill, /same-context/i);
    assert.match(planSkill, /Reviewer independence/);
    assert.match(planSkill, /degraded/);
    assert.match(planSkill, /Critical\/Important|Critical or Important/);
    assert.match(planSkill, /revise.*re-check|re-check.*revise/is);
    assert.match(planSkill, /Plan review mode/);
    assert.match(planSkill, /Review evidence/);
    assert.match(planSkill, /Recheck evidence/);
    assert.match(planSkill, /Residual risk/);
    assert.match(planSkill, /\.loopx\/plan-to-exec\/<slug>-plan-review\.md/);
    assert.match(planSkill, /not repo-tracked|local workflow state/i);

    const planReviewerSkill = await readFile(join(repoRoot, 'skills', 'plan-reviewer', 'SKILL.md'), 'utf8');
    assert.equal(parseFrontmatter(planReviewerSkill)['metadata.version'], '0.1.0');

    assert.match(planReviewerSkill, /Source AC/);
    assert.match(planReviewerSkill, /Design anchors/);
    assert.match(planReviewerSkill, /Test cases/);
    assert.match(planReviewerSkill, /scope drift/i);
    assert.match(planReviewerSkill, /handoff readiness/i);
    assert.match(planReviewerSkill, /Critical/);
    assert.match(planReviewerSkill, /Important/);
    assert.match(planReviewerSkill, /Minor/);
    assert.match(planReviewerSkill, /must not redesign|Do not redesign/i);
    assert.match(planReviewerSkill, /must not review implementation code|Do not review implementation code/i);
    assert.doesNotMatch(planReviewerSkill, /unless[^.\n]*implementation code|ad-hoc audit after implementation/i);

    assert.match(resolver, /Plan artifact source-to-plan coverage audit|source-to-plan coverage audit/i);
    assert.match(resolver, /skills\/plan-reviewer\/SKILL\.md/);
    assert.match(resolver, /Treat .*plan-reviewer.* as support lenses/is);
    assert.match(skillsDoc, /\| `plan-reviewer` \|/);
    assert.match(skillsDocZh, /\| `plan-reviewer` \|/);

    assert.doesNotMatch(planSkill, /\$plan-review|\/plan-review|loopx plan-review/);
    assert.doesNotMatch(planReviewerSkill, /\$plan-review|\/plan-review|loopx plan-review/);
    assert.doesNotMatch(resolver, /Core Workflow Skills[\s\S]*plan-reviewer[\s\S]*Support Skills/);
    assert.doesNotMatch(planSkill, forbiddenRuntimeExpansionPattern);
    assert.doesNotMatch(planReviewerSkill, forbiddenRuntimeExpansionPattern);
    assert.doesNotMatch(planSkill, historicalPlanMigrationPattern);
    assert.doesNotMatch(planReviewerSkill, historicalPlanMigrationPattern);
  });

  it('governs upstream main-chain contract handoff across clarify planning and execution', async () => {
    const clarifySkill = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const specSkill = await readFile(join(repoRoot, 'skills', 'spec', 'SKILL.md'), 'utf8');
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const execSkill = await readFile(join(repoRoot, 'skills', 'exec', 'SKILL.md'), 'utf8');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const implementerPrompt = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'), 'utf8');
    const taskReviewerPrompt = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'), 'utf8');

    assert.equal(parseFrontmatter(clarifySkill)['metadata.version'], '0.3.10');
    assert.equal(parseFrontmatter(specSkill)['metadata.version'], '0.3.9');
    assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.12');
    assert.equal(parseFrontmatter(execSkill)['metadata.version'], '0.3.8');
    assert.equal(parseFrontmatter(subagentExecSkill)['metadata.version'], '0.3.10');

    assert.match(clarifySkill, /`requirements\.md` and `test-cases\.md` are the canonical `AC-\*`\/`TC-\*` source/);
    assert.match(clarifySkill, /Downstream skills must not invent replacement `AC-\*` or `TC-\*` identifiers/);

    for (const contractName of [
      'Behavior Contract',
      'Data Contract',
      'Interface Contract',
      'Workflow Contract',
      'Operational Contract',
    ]) {
      assert.match(specSkill, new RegExp(contractName));
    }
    assert.match(specSkill, /Workflow Contract.*workflow handoffs, artifact fields, stage gates, or downstream skill consumption/is);
    assert.match(specSkill, /D-\*.*inside contract blocks.*downstream skill consumes a decision/is);

    for (const field of [
      'Source AC',
      'Design anchors',
      'Test cases',
      'Review focus',
      'Expected execution evidence',
      'Task anchor',
    ]) {
      assert.match(planSkill, new RegExp(field));
    }
    assert.match(planSkill, /### T-001 \/ Task 1:/);
    assert.match(planSkill, /Expected execution evidence.*`exec`.*`subagent-exec`.*`review`/is);

    const taskEvidenceFields = [
      'task_anchor',
      'source_ac',
      'design_anchors',
      'test_cases',
      'commands_run',
      'evidence_summary',
      'remaining_risk',
    ];
    const exactEvidenceBlockPattern = /task_anchor:\s*<[^>]+>\s*source_ac:\s*<[^>]+>\s*design_anchors:\s*<[^>]+>\s*test_cases:\s*<[^>]+>\s*commands_run:\s*<[^>]+>\s*evidence_summary:\s*<[^>]+>\s*remaining_risk:\s*<[^>]+>/;

    assert.match(execSkill, exactEvidenceBlockPattern);
    assert.match(execSkill, /Task completion evidence fields are exactly/);
    assert.match(execSkill, /before marking a `T-\*` task done/);
    assert.match(execSkill, /checkpoint.*review handoff.*task completion evidence/is);

    for (const [label, text] of [
      ['subagent-exec', subagentExecSkill],
      ['implementer prompt', implementerPrompt],
      ['task reviewer prompt', taskReviewerPrompt],
    ]) {
      for (const field of taskEvidenceFields) {
        assert.match(text, new RegExp(`${field}:|${field}`), `${label} must require ${field}`);
      }
    }
    assert.match(subagentExecSkill, /Expected execution evidence/);
    assert.match(subagentExecSkill, /merged task reports.*preserve `task_anchor`/is);
    assert.match(implementerPrompt, /Preserve any `T-\*` task anchor.*task_anchor/is);
    assert.match(taskReviewerPrompt, /Source AC.*Design anchors.*Test cases.*Expected execution evidence/is);
  });

  it('governs downstream main-chain review final-review and finish contracts', async () => {
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const finalReviewerPrompt = await readFile(join(repoRoot, 'skills', 'final-review', 'final-reviewer.md'), 'utf8');
    const enTemplate = await readFile(
      join(repoRoot, 'skills', 'final-review', 'references', 'report-template.en.md'),
      'utf8',
    );
    const zhTemplate = await readFile(
      join(repoRoot, 'skills', 'final-review', 'references', 'report-template.zh-CN.md'),
      'utf8',
    );
    const finishSkill = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');

    assert.equal(parseFrontmatter(reviewSkill)['metadata.version'], '0.3.7');
    assert.equal(parseFrontmatter(finalReviewSkill)['metadata.version'], '0.3.10');
    assert.equal(parseFrontmatter(finishSkill)['metadata.version'], '0.3.8');

    assert.match(reviewSkill, /Check spec compliance first, then code quality/);
    assert.match(reviewSkill, /Do not skip stage 1/);
    assert.match(reviewSkill, /execution evidence.*first-class Stage 1 input/is);
    assert.match(reviewSkill, /AC-\*.*D-\*.*T-\*.*task verification evidence/is);
    assert.match(reviewSkill, /missing or weak task evidence.*finding/is);
    assert.match(reviewSkill, /commands, outputs, or evidence summaries.*do not support claimed `AC-\*`\/`D-\*`\/`T-\*` completion/is);

    const phaseMatches = [...finalReviewSkill.matchAll(/^### Phase \d+:/gm)];
    assert.equal(phaseMatches.length, 6);
    assert.match(finalReviewSkill, /six phases/);
    assert.match(finalReviewSkill, /### Phase 5: Test Trust/);
    assert.match(finalReviewSkill, /independent `Test Trust`/);
    assert.match(finalReviewSkill, /High.*Medium.*Low/is);
    assert.match(finalReviewSkill, /evidence freshness.*command specificity.*coverage relevance.*unexplained skips/is);
    assert.doesNotMatch(finalReviewSkill, genericArtifactValidatorPattern);
    assert.match(finalReviewSkill, /whole-feature review/i);

    assert.match(finalReviewerPrompt, /Test Trust/);
    assert.match(finalReviewerPrompt, /concrete commands, outputs, skipped checks, and residual risk/);
    assert.match(enTemplate, /## Test Trust/);
    assert.match(zhTemplate, /## 测试可信度/);

    assert.match(finishSkill, /Spec Delta Candidates/);
    for (const label of ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED']) {
      assert.match(finishSkill, new RegExp(label));
    }
    assert.match(finishSkill, /preserve accepted and rejected `final-review` gates/i);
    assert.match(finishSkill, /must not bypass the review outcome/i);
  });

  it('keeps main-chain exclusions out of current skill contracts', async () => {
    const currentContractPaths = [
      join(repoRoot, 'skills', 'clarify', 'SKILL.md'),
      join(repoRoot, 'skills', 'spec', 'SKILL.md'),
      join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'),
      join(repoRoot, 'skills', 'exec', 'SKILL.md'),
      join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'),
      join(repoRoot, 'skills', 'review', 'SKILL.md'),
      join(repoRoot, 'skills', 'final-review', 'SKILL.md'),
      join(repoRoot, 'skills', 'finish', 'SKILL.md'),
    ];
    const excludedCommitmentPatterns = [
      new RegExp(['\\.loopx', 'metrics', 'events\\.jsonl'].join('/'), 'i'),
      new RegExp(['local', 'metrics'].join('\\s+'), 'i'),
      new RegExp(['generic', 'workflow', 'artifact', 'validator'].join('\\s+'), 'i'),
      new RegExp(['通用', 'workflow', 'artifact', 'validator'].join('\\s+'), 'i'),
      new RegExp(['migrate', 'historical', 'artifacts'].join('\\s+'), 'i'),
      new RegExp(['historical', 'artifact', 'migration'].join('\\s+'), 'i'),
    ];

    for (const filePath of currentContractPaths) {
      const text = await readFile(filePath, 'utf8');
      for (const pattern of excludedCommitmentPatterns) {
        assert.doesNotMatch(text, pattern, `${filePath} should not commit excluded main-chain scope`);
      }
    }

    const governanceTest = await readFile(join(repoRoot, 'test', 'skill-governance.test.mjs'), 'utf8');
    assert.doesNotMatch(governanceTest, new RegExp(['generic', 'workflow', 'artifact', 'validator'].join('\\s+'), 'i'));
    assert.doesNotMatch(governanceTest, new RegExp(['required', 'historical', 'artifact', 'migration'].join('\\s+'), 'i'));
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
    assert.match(finalReviewSkill, /six phases/);
  });

  it('final-review persists a human-reviewable report artifact before finish', async () => {
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const finishSkill = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');
    const zhTemplate = await readFile(
      join(repoRoot, 'skills', 'final-review', 'references', 'report-template.zh-CN.md'),
      'utf8',
    );
    const enTemplate = await readFile(
      join(repoRoot, 'skills', 'final-review', 'references', 'report-template.en.md'),
      'utf8',
    );

    assert.match(finalReviewSkill, /\.loopx\/final-review\/YYYY-MM-DD-<slug>\.md/);
    assert.match(finalReviewSkill, /Write the canonical final-review report/);
    assert.match(finalReviewSkill, /human/i);
    assert.match(finalReviewSkill, /Ready for finish\?/);
    assert.match(finalReviewSkill, /Match the user's language/);
    assert.match(finalReviewSkill, /If the user asked in Chinese/);
    assert.match(finalReviewSkill, /write the final-review report in Chinese/);
    assert.match(finalReviewSkill, /references\/report-template\.zh-CN\.md/);
    assert.match(finalReviewSkill, /references\/report-template\.en\.md/);
    assert.match(finalReviewSkill, /read the report template matching the user's language/i);
    assert.match(finalReviewSkill, /before writing the final-review artifact/i);
    assert.match(finalReviewSkill, /start_commit/);
    assert.match(finalReviewSkill, /current `HEAD`/);
    assert.match(finalReviewSkill, /git diff/);
    assert.match(finalReviewSkill, /git diff --cached/);
    assert.match(finalReviewSkill, /canonical final-review report/);
    assert.match(finalReviewSkill, /same design|same design solution|same design\/source/);
    assert.match(finalReviewSkill, /child plan-level final-review must not write/i);
    assert.match(finalReviewSkill, /plan_review\.status/);
    assert.doesNotMatch(finalReviewSkill, /concrete git range.*required/i);

    assert.match(zhTemplate, /# 最终评审报告/);
    assert.match(zhTemplate, /## 修改摘要/);
    assert.match(zhTemplate, /## 需求 \/ 设计一致性/);
    assert.match(zhTemplate, /## 需求覆盖矩阵/);
    assert.match(zhTemplate, /## 测试可信度/);
    assert.match(zhTemplate, /## 总体结论/);
    assert.match(zhTemplate, /\*\*Ready for finish\?\*\* \[Yes \| No \| With fixes\]/);

    assert.match(enTemplate, /# Final Review Report/);
    assert.match(enTemplate, /## Change Summary/);
    assert.match(enTemplate, /## Requirements \/ Design Alignment/);
    assert.match(enTemplate, /## Requirements Coverage Matrix/);
    assert.match(enTemplate, /## Test Trust/);
    assert.match(enTemplate, /## Overall Assessment/);
    assert.match(enTemplate, /\*\*Ready for finish\?\*\* \[Yes \| No \| With fixes\]/);

    assert.doesNotMatch(finalReviewSkill, /^# 最终评审报告/m);
    assert.doesNotMatch(finalReviewSkill, /^# Final Review Report/m);
    assert.doesNotMatch(finalReviewSkill, /^## 修改摘要/m);
    assert.doesNotMatch(finalReviewSkill, /^## Change Summary/m);

    assert.match(finishSkill, /latest `.loopx\/final-review\/YYYY-MM-DD-<slug>\.md`/);
    assert.match(finishSkill, /Final review:/);
    assert.match(finishSkill, /report path/);
    assert.match(finishSkill, /blocking issues/);
    assert.match(finishSkill, /must not generate/i);
  });

  it('threads lancet through implementation and review contracts without collapsing planning freedom', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const execSkill = await readFile(join(repoRoot, 'skills', 'exec', 'SKILL.md'), 'utf8');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const fixSkill = await readFile(join(repoRoot, 'skills', 'fix', 'SKILL.md'), 'utf8');
    const implementerPrompt = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'), 'utf8');
    const reviewerPrompt = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'), 'utf8');

    assert.match(planSkill, /lancet activates at implementation time/i);
    assert.match(planSkill, /not collapse planning-stage analysis/i);
    assert.match(execSkill, /Use `lancet` discipline/i);
    assert.match(execSkill, /deletion, repo reuse, stdlib, native platform/i);
    assert.match(subagentExecSkill, /Use `lancet` discipline/i);
    assert.match(subagentExecSkill, /LANCET_CONTEXT/);
    assert.match(reviewSkill, /over-engineering/i);
    assert.match(reviewSkill, /stdlib\/native alternatives/i);
    assert.match(finalReviewSkill, /over-engineering/i);
    assert.match(finalReviewSkill, /deletable abstractions/i);
    assert.match(fixSkill, /smallest root-cause fix/i);
    assert.match(fixSkill, /Use `lancet` discipline/i);
    assert.match(implementerPrompt, /LANCET_CONTEXT/);
    assert.match(implementerPrompt, /smallest correct diff/);
    assert.match(reviewerPrompt, /over-engineering/);
    assert.match(reviewerPrompt, /repo reuse, stdlib\/native\s+alternatives/);
  });

  it('documents lancet as bundled but Codex-only auto activation', async () => {
    const readme = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');
    const installationSpec = await readFile(join(repoRoot, 'docs', 'loopx', 'specs', 'installation.md'), 'utf8');
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));

    assert.match(readme, /lancet/);
    assert.match(readme, /Codex-only automatic activation/i);
    assert.match(readme, /\$lancet on/);
    assert.match(readmeZh, /lancet/);
    assert.match(readmeZh, /仅 Codex 自动启用/);
    assert.match(readmeZh, /\$lancet status/);
    assert.match(installationSpec, /lancet/);
    assert.match(installationSpec, /~\/.loopx\/lancet/);
    assert.match(installationSpec, /LOOPX_LANCET=0/);
    assert.equal(packageJson.files.includes('skills/lancet/'), true);
  });

  it('execution review ranges plan anchors preserve source anchors', async () => {
    const planRoot = join(repoRoot, 'docs', 'loopx', 'plans', '2026-06-30-execution-review-ranges');
    const files = await Promise.all([
      readFile(join(planRoot, '00-overview.md'), 'utf8'),
      readFile(join(planRoot, '01-runtime-state-and-finish.md'), 'utf8'),
      readFile(join(planRoot, '02-final-review-contracts.md'), 'utf8'),
      readFile(join(planRoot, '03-skill-workflow-contracts.md'), 'utf8'),
      readFile(join(planRoot, '04-governance-and-verification.md'), 'utf8'),
    ]);
    const combined = files.join('\n');

    for (const anchor of ['AC-1', 'AC-2', 'AC-2a', 'AC-3', 'AC-4', 'AC-5', 'AC-6', 'AC-7', 'AC-8', 'AC-8a', 'AC-9', 'AC-10', 'AC-11', 'AC-12']) {
      assert.match(combined, new RegExp(`\\b${anchor}\\b`));
    }
    for (const anchor of ['D-001', 'D-002', 'D-003', 'D-004', 'D-005', 'D-006', 'D-007', 'D-008', 'D-009', 'D-010', 'D-011']) {
      assert.match(combined, new RegExp(`\\b${anchor}\\b`));
    }
    for (const anchor of ['TC-1', 'TC-2', 'TC-3', 'TC-4', 'TC-5', 'TC-6', 'TC-7', 'TC-7a', 'TC-8', 'TC-9', 'TC-9a', 'TC-9b', 'TC-10', 'TC-11', 'TC-12', 'TC-13', 'TC-14', 'TC-15']) {
      assert.match(combined, new RegExp(`\\b${anchor}\\b`));
    }
  });

  it('does not expose old execution range contracts in current surface', async () => {
    const currentSurface = [
      'src',
      'scripts',
      'skills',
      'templates',
      'test',
      'README.md',
      'README.zh-CN.md',
      'docs/loopx/specs',
    ];
    const output = await rgCurrentSurface(currentSurface, [
      ['plan', 'final', 'review'].join('_'),
      ['execution', 'end'].join('-'),
      ['execution', 'end', 'commit'].join('_'),
      ['reviewed', 'end commit'].join(' '),
      ['child plan', 'final-review', 'report'].join(' '),
      ['child plan', 'final review', 'report'].join(' '),
    ]);
    assert.equal(output.trim(), '');
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
    assert.match(subagentExecSkill, /Only start `loopx:finish` after single-plan `loopx:final-review` is clean/);
    assert.match(subagentExecSkill, /for multi-plan packages after the spec-level `loopx:final-review` is clean/);
  });
});
