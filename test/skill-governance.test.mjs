import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
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
const removedStandaloneArtifactName = `${['test', 'cases'].join('-')}.md`;
const removedTestCasesPathKey = ['test', 'cases', 'path'].join('_');
const removedHumanTestCasesLabel = `${['test', 'cases'].join(' ')}:`;
const removedIntakeArtifactTemplate = `templates/intake-${['test-cases', 'md'].join('.')}`;
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
const removedPlanFinalReviewPattern = new RegExp(['plan', 'final', 'review'].join('_'));
const removedSchemaVersion1Pattern = new RegExp(['schema_version', '1'].join(':\\s*'));
const removedLegacyV1Pattern = new RegExp(['legacy', 'v1'].join('\\s+'), 'i');
const removedNormalizeOnReadPattern = new RegExp(['normalizes', 'on', 'read'].join('\\s+'), 'i');
const removedStandaloneArtifactPattern = new RegExp(escapeRegex(removedStandaloneArtifactName));
const removedRequirementsStandaloneArtifactOrderPattern = new RegExp([
  escapeRegex('requirements.md'),
  '.*',
  escapeRegex(removedStandaloneArtifactName),
  '|',
  escapeRegex(removedStandaloneArtifactName),
  '.*',
  escapeRegex('requirements.md'),
].join(''));

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

function assertExplicitCompatibilityAlias(text, alias, canonical) {
  const fields = parseFrontmatter(text);
  assert.equal(fields.name, alias);
  assert.equal(fields['disable-model-invocation'], 'true');
  assert.match(fields.description, /compatibility alias/i);
  assert.match(text, new RegExp(`canonical ${escapeRegex(`\`${canonical}\``)} intent`, 'i'));
  assert.match(text, /same (?:arguments|input)/i);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIncludesLiteral(text, literal, label) {
  assert.match(text, new RegExp(escapeRegex(literal)), `${label} missing ${literal}`);
}

async function readSkillSurface(skillName, referenceFiles = []) {
  const parts = [
    await readFile(join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8'),
  ];
  for (const referenceFile of referenceFiles) {
    parts.push(await readFile(join(repoRoot, 'skills', skillName, 'references', referenceFile), 'utf8'));
  }
  return parts.join('\n\n');
}

async function relativeFilesUnder(root) {
  const files = [];
  async function visit(path, prefix = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const relativePath = join(prefix, entry.name);
      if (entry.isDirectory()) await visit(join(path, entry.name), relativePath);
      else if (entry.isFile() && entry.name !== '.DS_Store') files.push(relativePath);
    }
  }
  await visit(root);
  return files.sort();
}

async function rgCurrentSurface(paths, patterns) {
  const outputs = [];
  const files = new Set();
  async function collectFiles(path) {
    const absolutePath = join(repoRoot, path);
    const pathStat = await stat(absolutePath);
    if (pathStat.isFile()) {
      files.add(path);
      return;
    }
    if (!pathStat.isDirectory()) {
      return;
    }
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = join(path, entry.name);
      if (childPath.startsWith('test/fixtures/claude-sessions/')) {
        continue;
      }
      if (entry.isDirectory()) {
        await collectFiles(childPath);
      } else if (entry.isFile()) {
        files.add(childPath);
      }
    }
  }
  for (const path of paths) {
    await collectFiles(path);
  }
  for (const pattern of patterns) {
    const regex = new RegExp(pattern);
    for (const file of files) {
      let text;
      try {
        text = await readFile(join(repoRoot, file), 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (const [index, line] of lines.entries()) {
        regex.lastIndex = 0;
        if (regex.test(line)) {
          outputs.push(`${file}:${index + 1}:${line}`);
        }
      }
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

function assertSkillHandoffFormat(text, label) {
  assert.match(text, /## Skill Handoff Format/, `${label} must document agent-native handoff rendering`);
  assert.match(text, /Codex: `\$<skill> <args>`/, `${label} missing Codex handoff form`);
  assert.match(text, /Claude Code: `\/<skill> <args>`/, `${label} missing Claude Code handoff form`);
  assert.match(text, /Cursor Agent Skills: `\/<skill> <args>`/, `${label} missing Cursor Agent Skills handoff form`);
  assert.match(text, /Generic: `Use the <skill> skill with <args>`/, `${label} missing generic handoff form`);
  assert.match(text, /Do not present Codex `\$\.\.\.` syntax as the only handoff/, `${label} must prevent Codex-only handoff`);
}

describe('loopx skill governance', () => {
  it('governs every bundled skill through one semantic contract matrix entry', async () => {
    const matrix = JSON.parse(await readFile(join(repoRoot, 'test', 'fixtures', 'skill-contract-matrix.json'), 'utf8'));
    const names = matrix.skills.map((entry) => entry.skill);

    assert.deepEqual([...names].sort(), [...LOOPX_BUNDLED_SKILLS].sort());
    assert.equal(new Set(names).size, names.length);
    for (const entry of matrix.skills) {
      assert.match(entry.role, /^(workflow|support)$/);
      assert.ok(entry.boundary);
      assert.ok(entry.required_outputs.length > 0);
      assert.ok(entry.safety_invariants.length > 0);
      assert.ok(entry.integrations.length > 0);
      assert.ok(Array.isArray(entry.required_references));
      assert.match(entry.version, /^\d+\.\d+\.\d+/);
    }
  });

  it('packages the GPT-5.6 trace-first agent eval harness', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const cases = JSON.parse(await readFile(join(repoRoot, 'evals', 'gpt-5.6', 'cases.json'), 'utf8'));
    const schema = await readFile(join(repoRoot, 'evals', 'gpt-5.6', 'TRACE_SCHEMA.md'), 'utf8');
    const guide = await readFile(join(repoRoot, 'evals', 'gpt-5.6', 'README.md'), 'utf8');

    assert.equal(cases.cases.length, 14);
    assert.equal(new Set(cases.cases.map((item) => item.id)).size, 14);
    for (const item of cases.cases) {
      const machineCheckable = typeof item.expected_pattern === 'string' || item.expected_review_result;
      assert.equal(
        machineCheckable || item.machine_check === 'pending-live-harness',
        true,
        `${item.id} needs expected_pattern/expected_review_result or an explicit pending machine_check marker`,
      );
    }
    assert.match(schema, /parent_actor_id.*controller/is);
    assert.match(guide, /Change one prompt group at a time/);
    assert.match(guide, /Synthetic traces.*not for claiming GPT-5\.6 performance/is);
    assert.equal(packageJson.files.includes('scripts/run-agent-evals.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/normalize-codex-agent-trace.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/run-codex-live-agent-evals.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/run-darwin-simple-evals.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/run-req-demo-evals.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/aggregate-agent-evals.mjs'), true);
    assert.equal(packageJson.files.includes('evals/gpt-5.6/'), true);
    assert.equal(packageJson.files.includes('evals/darwin-simple/'), true);
    assert.equal(packageJson.files.includes('evals/req-demo/'), true);
    assert.equal(packageJson.files.includes('test/fixtures/darwin-simple/repository/'), true);
    assert.equal(packageJson.files.includes('test/fixtures/darwin-simple/spec-repository/'), true);
    assert.equal(packageJson.files.includes('test/fixtures/darwin-simple/memory-repository/'), true);
    assert.equal(packageJson.files.includes('test/fixtures/req-demo/harness/'), true);
    assert.equal(packageJson.files.includes('test/fixtures/req-demo/sources/fitpulse/'), true);
    assert.equal(packageJson.files.includes('test/fixtures/req-demo/starter/'), false);
    assert.equal(packageJson.scripts['eval:agent'], 'node scripts/run-agent-evals.mjs');
    assert.equal(packageJson.scripts['eval:codex-normalize'], 'node scripts/normalize-codex-agent-trace.mjs');
    assert.equal(packageJson.scripts['eval:codex-live'], 'node scripts/run-codex-live-agent-evals.mjs');
    assert.equal(packageJson.scripts['eval:darwin-simple'], 'node scripts/run-darwin-simple-evals.mjs');
    assert.equal(packageJson.scripts['eval:req-demo'], 'node scripts/run-req-demo-evals.mjs');
    assert.equal(packageJson.scripts['eval:aggregate'], 'node scripts/aggregate-agent-evals.mjs');
  });

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

  it('keeps bundled skill sections operationally non-empty', async () => {
    for (const skillName of LOOPX_BUNDLED_SKILLS) {
      const rootSkill = await readFile(join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
      assertNoEmptyMarkdownSections(rootSkill, `skills/${skillName}/SKILL.md`);
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
    assert.equal(packageJson.files.includes(removedIntakeArtifactTemplate), false, 'npm package must exclude deleted clarify intake test cases template');
    assert.equal(existsSync(join(repoRoot, removedIntakeArtifactTemplate)), false, 'deleted clarify intake test cases template must not exist');
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
      ['skills/RESOLVER.md', 'skills/shared/', ...LOOPX_BUNDLED_SKILLS.map((skillName) => `skills/${skillName}/`)].sort(),
    );
  });

  it('governs shared agent review and evidence contracts', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const agentTopology = await readFile(join(repoRoot, 'skills', 'shared', 'agent-topology.md'), 'utf8');
    const reviewContract = await readFile(join(repoRoot, 'skills', 'shared', 'review-contract.md'), 'utf8');
    const evidenceContract = await readFile(join(repoRoot, 'skills', 'shared', 'evidence-contract.md'), 'utf8');

    assert.equal(packageJson.files.includes('skills/shared/'), true);
    assert.match(agentTopology, /controller is the only orchestration owner/i);
    assert.match(agentTopology, /leaf worker/i);
    assert.match(agentTopology, /Agent Budget And Stop Rule/);
    assert.match(agentTopology, /default shared worker budget is four/i);
    assert.match(agentTopology, /Implementers,\s+reviewers, fixers.*same budget/is);
    assert.match(agentTopology, /Do not create\s+exploratory helpers, duplicate reviewers, speculative parallel workers/is);
    assert.match(agentTopology, /required capabilities.*create.*await/is);
    assert.match(agentTopology, /optional capabilities.*inspect.*message.*release/is);
    assert.match(reviewContract, /Inline work requires independent review.*explicit review intent.*security-sensitive or destructive.*public compatibility.*cross-scope interaction.*conflict reconciliation/is);
    assert.match(reviewContract, /delegated-serial-v1.*parallel-strict-v1.*independent task review.*final Spec and Standards/is);
    assert.match(reviewContract, /read-only leaf worker/i);
    assert.match(reviewContract, /separate\s+fixer.*fresh focused and combined verification.*independent re-review/is);
    assert.match(reviewContract, /Critical.*Important.*Minor/is);
    for (const field of ['command', 'cwd', 'timestamp', 'exit_code', 'scope', 'result', 'output_summary', 'skipped_checks', 'environment_constraints']) {
      assert.match(evidenceContract, new RegExp(`\\b${field}\\b`), `evidence contract missing ${field}`);
    }
  });

  it('keeps every loopx-dispatched worker as a leaf worker', async () => {
    const dispatchSurfaces = [
      'skills/plan-reviewer/SKILL.md',
      'skills/exec/scripts/adaptive-exec.mjs',
      'skills/review/code-reviewer.md',
      'skills/fix/SKILL.md',
    ];
    for (const relativePath of dispatchSurfaces) {
      const text = await readFile(join(repoRoot, relativePath), 'utf8');
      assert.match(text, /leaf worker/i, `${relativePath} must identify dispatched workers as leaf workers`);
      assert.match(text, /Do not spawn, delegate to, or wait for (?:other |any )?agents/i, `${relativePath} must prohibit nested delegation`);
    }
  });

  it('keeps workflow recovery and planning detail in owned contracts', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const execSkill = await readFile(join(repoRoot, 'skills', 'exec', 'SKILL.md'), 'utf8');
    const fixReview = await readFile(join(repoRoot, 'skills', 'fix-review', 'SKILL.md'), 'utf8');
    const finishRecording = await readFile(join(repoRoot, 'skills', 'finish', 'references', 'branch-worktree-and-recording.md'), 'utf8');
    assert.equal(existsSync(join(repoRoot, 'skills', 'plan2exec', 'references', 'plan-schema.md')), true);
    assert.match(planSkill, /plan-schema\.md/);
    assert.match(planSkill, /interruption recovery/i);
    assert.match(execSkill, /temporary graph/i);
    assert.match(execSkill, /implementation seam.*adaptive-exec\.mjs/is);
    assert.match(execSkill, /manifest\s+state.*resume/is);
    assertExplicitCompatibilityAlias(fixReview, 'fix-review', 'review');
    assert.match(fixReview, /does not require a feedback ledger or report artifact/i);
    assert.match(finishRecording, /prepare -> perform -> record -> reconcile/);
    assert.match(finishRecording, /Git or remote action succeeded.*Do not\s+repeat/is);
  });

  it('governs diagnosis TDD verification and worktree safety', async () => {
    const diagnosis = await readFile(join(repoRoot, 'skills', 'debug', 'references', 'diagnosis-contract.md'), 'utf8');
    const debugSkill = await readFile(join(repoRoot, 'skills', 'debug', 'SKILL.md'), 'utf8');
    const issue = await readFile(join(repoRoot, 'skills', 'issue', 'SKILL.md'), 'utf8');
    const tdd = await readFile(join(repoRoot, 'skills', 'tdd', 'SKILL.md'), 'utf8');
    const verify = await readFile(join(repoRoot, 'skills', 'verify', 'SKILL.md'), 'utf8');
    const worktrees = await readFile(join(repoRoot, 'skills', 'using-git-worktrees', 'SKILL.md'), 'utf8');
    for (const field of ['classification', 'reproduction_status', 'root_cause_status', 'root_cause', 'hypotheses_rejected', 'fix_mode', 'regression_test_required', 'risk_triggers']) {
      assert.match(diagnosis, new RegExp(`\\b${field}\\b`));
      assert.match(issue, new RegExp(`\\b${field}\\b`));
    }
    assert.doesNotMatch(issue, /root_cause_hypothesis/);
    assert.doesNotMatch(tdd, /Delete it\. Start over/i);
    assert.doesNotMatch(tdd, /Delete means delete|All of these mean:\s*Delete code/i);
    assert.doesNotMatch(tdd, /Delete and rewrite with TDD|Never fix bugs without a test|skipped TDD\. Start over/i);
    assert.match(tdd, /preserve it.*characterization or regression/is);
    assert.match(tdd, /Never delete user-owned code merely to simulate a red phase/i);
    assert.match(tdd, /Do not claim strict test-first TDD when the implementation predates the test/i);
    for (const supportSkill of [debugSkill, tdd, verify]) {
      assert.match(supportSkill, /explicitly invoked|explicit .*invocation/i);
      assert.match(supportSkill, /owning .*workflow|issue or implementation workflow/i);
    }
    assert.match(debugSkill, /Not for automatic routing of ordinary prompt-first defects/i);
    assert.match(tdd, /Not for automatic routing of ordinary prompt-first work/i);
    assert.match(verify, /Not for automatic workflow selection/i);
    assert.doesNotMatch(debugSkill, /\benv\s*\|\s*grep\b|\bprintenv\b/i);
    assert.match(debugSkill, /remain in diagnosis unless the user explicitly\s+requested a fix/i);
    assert.match(debugSkill, /do not implement them from a diagnosis-only call/i);
    assert.match(verify, /shared\/evidence-contract\.md/);
    assert.doesNotMatch(worktrees, /npm install/);
    assert.doesNotMatch(worktrees, /Auto-detect and run project setup/i);
    assert.match(worktrees, /Run only repository-documented project setup/i);
    assert.match(worktrees, /postinstall hooks/);
  });

  it('guards domain and analysis skills against factual and boundary regressions', async () => {
    const api = await readFile(join(repoRoot, 'skills', 'api-designer', 'SKILL.md'), 'utf8');
    const apiVersioning = await readFile(join(repoRoot, 'skills', 'api-designer', 'references', 'versioning.md'), 'utf8');
    const architecturePatterns = await readFile(join(repoRoot, 'skills', 'architecture-designer', 'references', 'architecture-patterns.md'), 'utf8');
    const cliSkill = await readFile(join(repoRoot, 'skills', 'cli-developer', 'SKILL.md'), 'utf8');
    const cliRefs = await Promise.all(['design-patterns.md', 'node-cli.md', 'python-cli.md', 'go-cli.md'].map((name) => readFile(join(repoRoot, 'skills', 'cli-developer', 'references', name), 'utf8')));
    const kratosRefs = await Promise.all(['http-customization.md', 'troubleshooting.md'].map((name) => readFile(join(repoRoot, 'skills', 'kratos', 'references', name), 'utf8')));
    const requirements = await readFile(join(repoRoot, 'skills', 'requirement-analyzer', 'SKILL.md'), 'utf8');
    const readability = await readFile(join(repoRoot, 'skills', 'doc-readability', 'SKILL.md'), 'utf8');
    assert.doesNotMatch(api, /nullable:\s*true/);
    assert.match(api, /type: \[string, 'null'\]/);
    assert.match(api, /Decide pagination, rate limiting, and endpoint versioning from product needs/);
    assert.doesNotMatch(api, /Implement pagination for all collection/);
    assert.doesNotMatch(api, /validate with `npx|use a mock server such as `npx/);
    assert.doesNotMatch(apiVersioning, /URI versioning is recommended for most APIs/);
    assert.match(apiVersioning, /Do not add endpoint versions by default/);
    assert.doesNotMatch(architecturePatterns, /Quick Decision Guide/);
    for (const text of cliRefs) {
      assert.doesNotMatch(text, /(?:exit|code|DENIED|NOT_FOUND)[^\n]*(?:77|127)/i);
    }
    assert.doesNotMatch(cliSkill, /preserve mirror expectations/i);
    assert.match(cliSkill, /canonical\s+package-root skill source/i);
    for (const text of kratosRefs) {
      assert.doesNotMatch(text, /find .*\.pb\.go.*sed/);
      assert.match(text, /Do not (?:patch|edit) generated `\.pb\.go`/);
    }
    assert.match(requirements, /Optional maturity score/);
    assert.match(readability, /Ask only when competing document lenses/);
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
    assert.equal(fields['metadata.version'], '0.1.3');
    assert.match(resolver, /skills\/lancet\/SKILL\.md/);
    assert.match(skill, /support lens, not a workflow state/);
    assert.match(skill, /Codex-only automatic activation/);
    assert.match(skill, /implementation and review layers/i);
    assert.match(skill, /Do not use this skill for:/);
    assert.match(skill, /`clarify` or `spec` planning/);
    assert.match(skill, /Treat fallback, degradation, retry paths, compatibility shims, and silent\s+recovery as requirement-level behavior/is);
    assert.match(skill, /current user instruction, clarified source requirements, approved\s+design, implementation plan, or issue contract/is);
    assert.match(skill, /unanchored fallback, degradation, retry, silent recovery, or compatibility shim logic/is);
  });

  it('includes plan-reviewer as a governed bundled support skill', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const resolver = await readFile(resolverPath, 'utf8');

    assert.equal(LOOPX_BUNDLED_SKILLS.includes('plan-reviewer'), true, 'plan-reviewer must be bundled');
    assert.equal(packageJson.files.includes('skills/plan-reviewer/'), true, 'npm package must include plan-reviewer skill');

    const skill = await readFile(join(repoRoot, 'skills', 'plan-reviewer', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(skill);

    assert.equal(fields.name, 'plan-reviewer');
    assert.match(fields.description, /implementation plan.*authoritative execution graph.*approved source/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /plan review|source-to-plan|plan audit|coverage/i);
    assert.equal(fields['metadata.version'], '0.3.0');
    assert.match(resolver, /skills\/plan-reviewer\/SKILL\.md/);
    assert.match(skill, /support lens.*does not edit the plan, dispatch implementation, or advance workflow state/is);
    assert.match(skill, /## STOP Conditions/);
    assert.match(skill, /implementation or code review/i);
    assert.match(skill, /loopx\.execution-graph\.v1/);
    assert.match(skill, /parallel-strict-v1.*ready frontier.*independence evidence/is);
    assert.match(skill, /assessment: ready, ready after named fixes, or blocked/i);
  });

  it('governs clarify skill as incremental requirements intake', async () => {
    const clarifySkill = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(clarifySkill);

    assert.equal(fields.name, 'clarify');
    assert.match(fields.description, /concrete ambiguity/i);
    assert.match(fields.description, /clear bounded requests/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /requirements|unclear scope|需求澄清/i);
    assert.match(fields['metadata.version'] ?? '', semverPattern);
    assert.match(clarifySkill, /Write the clarify intake package \*\*incrementally\*\*/);
    assert.match(clarifySkill, /Do not wait until all questions are resolved/);
    assert.match(clarifySkill, /\.loopx\/intake\/YYYY-MM-DD-<slug>\//);
    assert.match(clarifySkill, /clarification\.md/);
    assert.match(clarifySkill, /requirements\.md/);
    assert.doesNotMatch(clarifySkill, removedStandaloneArtifactPattern);
    assert.match(clarifySkill, /AC-\*/);
    assert.match(clarifySkill, /TC-\*/);
    assert.match(clarifySkill, /Acceptance Scenarios/);
    assert.match(clarifySkill, /canonical requirement contract/i);
    assert.match(clarifySkill, /supporting process evidence/i);
    assert.doesNotMatch(clarifySkill, /shared the same `AC-\*` anchors|share the same `AC-\*` anchors/);
    assert.match(clarifySkill, /first material answer/);
    assert.match(clarifySkill, /\[PENDING\]/);
    assert.match(clarifySkill, /## Resume State/);
    assert.match(clarifySkill, /current_round/);
    assert.match(clarifySkill, /unresolved_count/);
    assert.match(clarifySkill, /next_question/);
    assert.match(clarifySkill, /`spec` or `plan2exec` needs/);
    assertSkillHandoffFormat(clarifySkill, 'clarify');
    assert.match(clarifySkill, /skill: plan2exec/);
    assert.match(clarifySkill, /Codex: \$plan2exec/);
    assert.match(clarifySkill, /Claude Code: \/plan2exec/);
    assert.match(clarifySkill, /Cursor Agent Skills: \/plan2exec/);
    assert.match(clarifySkill, /Generic: Use the plan2exec skill/);
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
    assert.equal(fields['metadata.version'], '0.3.9');
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
    assert.match(issueSkill, /root_cause/);
    assert.doesNotMatch(issueSkill, /root_cause_hypothesis/);
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
    assert.match(issueSkill, /prompt-first work or the justified canonical intent/i);
    assert.doesNotMatch(issueSkill, /plan-to-exec|subagent-exec|final-review|fix-review/);
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
    assert.match(fixSkill, /controller-owned scope and\s+integration check/i);
    assert.match(fixSkill, /independent reviewer only for an explicit review request/i);
    assert.match(fixSkill, /routine low-risk fix does\s+not require a local reviewer and whole-diff reviewer ceremony/i);
    assert.doesNotMatch(fixSkill, /Every code modification through `fix` requires:[\s\S]{0,200}local review/i);
    assert.doesNotMatch(fixSkill, /local_review:|whole_diff_review:/i);
    assert.match(fixSkill, /finish/i);
    assert.match(fixSkill, /shared\/completion-check\.md/);
    assert.match(fixSkill, /finish.*Git disposition.*active fix run/is);
    assert.doesNotMatch(fixSkill, /finish_handoff:\s*`?\$finish|hand off to `finish`/i);
    assert.match(fixSkill, /Execution Reports/);
    assert.match(fixSkill, /Reviews/);
    assert.match(fixSkill, /Verification/);
    assert.match(fixSkill, /Closeout/);
    assert.match(fixSkill, /should not pre-fill execution, review, verification, or closeout content/);
    assert.match(fixSkill, /must not commit/i);
    assert.match(fixSkill, /must not push/i);
    assert.match(fixSkill, /must not close/i);
    assert.match(fixSkill, /Do not invoke a separate `exec` workflow/);
    assert.doesNotMatch(fixSkill, /subagent-exec|parallel-subagent-exec|final-review|fix-review|gh issue close|gh pr merge/);
  });

  it('governs fix-review as an explicit compatibility alias', async () => {
    const fixReviewSkill = await readFile(join(repoRoot, 'skills', 'fix-review', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(fixReviewSkill);

    assertExplicitCompatibilityAlias(fixReviewSkill, 'fix-review', 'review');
    assert.match(fields.description, /existing review feedback/i);
    assert.match(fields.when_to_use, /existing review feedback/i);
    assert.equal(fields['metadata.version'], '0.4.0');
    assert.match(fixReviewSkill, /active context.*focused fixes.*fresh\s+verification.*independent re-review/is);
    assert.match(fixReviewSkill, /does not require a feedback ledger or report artifact/i);
    assert.doesNotMatch(fixReviewSkill, /Feedback Ledger|FR-001|Closure Gate/);
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

  it('keeps issue workflows available beside prompt-first canonical intents', async () => {
    const resolver = await readFile(join(repoRoot, 'skills', 'RESOLVER.md'), 'utf8');
    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
    const skillsGuide = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsGuideZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');
    const installationSpec = await readFile(join(repoRoot, 'docs', 'loopx', 'specs', 'installation.md'), 'utf8');

    for (const text of [resolver, readme]) {
      assert.match(text, /issue-driven/i);
      assert.match(text, /\$issue|`issue`/);
      assert.match(text, /\$fix|`fix`/);
      assert.match(text, /bug-class/i);
    }
    assert.match(skillsGuide, /Issue Workflows/);
    assert.match(skillsGuide, /\$issue/);
    assert.match(skillsGuide, /\$fix/);
    for (const text of [readmeZh, skillsGuideZh]) {
      assert.match(text, /Issue-driven|Issue Workflows/);
      assert.match(text, /\$issue|`issue`/);
      assert.match(text, /\$fix|`fix`/);
      assert.match(text, /bug 类|bug-class/i);
    }
    assert.match(resolver, /skills\/issue\/SKILL\.md/);
    assert.match(resolver, /skills\/fix\/SKILL\.md/);
    assert.match(readme, /prompt-first/i);
    assert.match(readmeZh, /prompt-first/i);
    for (const canonical of ['clarify', 'spec', 'plan', 'exec', 'review', 'finish']) {
      assert.match(readme, new RegExp(`\\b${canonical}\\b`));
      assert.match(readmeZh, new RegExp(`\\b${canonical}\\b`));
    }
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
    assert.match(readme, /six canonical workflow intents/i);
    assert.match(readme, /prompt-first/i);
    assert.match(readme, /explicit-only compatibility/i);
    assert.doesNotMatch(readme, /Golden path/i);
    assert.match(readme, /\$clarify/);
    assert.match(readme, /\$finish/);
    assert.match(readme, /\.\/docs\/loopx\/cli\.md/);
    assert.match(readmeZh, /六个 canonical workflow intents/);
    assert.match(readmeZh, /prompt-first/i);
    assert.match(readmeZh, /仅显式兼容别名|显式兼容别名/);
    assert.doesNotMatch(readmeZh, /Golden path/i);
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
    if (parseFrontmatter(rootSkill)['metadata.version'] === '0.5.0') {
      const taskReviewer = await readFile(join(rootSkillDir, 'task-reviewer-prompt.md'), 'utf8');
      const implementer = await readFile(join(rootSkillDir, 'implementer-prompt.md'), 'utf8');
      const handoff = await readFile(join(rootSkillDir, 'references', 'task-handoff-and-review.md'), 'utf8');
      const reviewResultContract = await readFile(join(rootSkillDir, 'references', 'review-result-contract.md'), 'utf8');

      assert.equal(parseFrontmatter(rootSkill)['disable-model-invocation'], 'true');
      assert.match(rootSkill, /explicit `delegated-serial-v1` profile entry point/i);
      assert.match(rootSkill, /mandatory independent read-only task review/i);
      assert.match(rootSkill, /separate leaf fixer.*independently re-review/is);
      assert.match(rootSkill, /Spec and Standards final reviewers/i);
      assert.match(taskReviewer, /spec_compliance/);
      assert.match(taskReviewer, /code_quality/);
      assert.match(taskReviewer, /read-only work/i);
      assert.match(taskReviewer, /leaf worker/i);
      assert.match(implementer, /leaf worker/i);
      assert.match(handoff, /verification hash/i);
      assert.match(reviewResultContract, /loopx\.task-review-result\.v1/);
      assert.match(reviewResultContract, /stale|hash/i);
      assert.doesNotMatch(rootSkill, /compatibility alias/i);
      return;
    }
    if (parseFrontmatter(rootSkill)['disable-model-invocation'] === 'true') {
      assertExplicitCompatibilityAlias(rootSkill, 'subagent-exec', 'exec');
      assert.match(rootSkill, /Not for automatic routing/i);
      assert.deepEqual(await relativeFilesUnder(rootSkillDir), ['SKILL.md']);
      return;
    }
    const taskReviewer = await readFile(join(rootSkillDir, 'task-reviewer-prompt.md'), 'utf8');
    const implementer = await readFile(join(rootSkillDir, 'implementer-prompt.md'), 'utf8');
    const platformReference = await readFile(join(rootSkillDir, 'platform-subagents.md'), 'utf8');
    const codexReference = await readFile(join(rootSkillDir, 'codex-subagents.md'), 'utf8');
    const claudeReference = await readFile(join(rootSkillDir, 'claude-subagents.md'), 'utf8');
    const cursorReference = await readFile(join(rootSkillDir, 'cursor-subagents.md'), 'utf8');
    const reviewResultContract = await readFile(join(rootSkillDir, 'references', 'review-result-contract.md'), 'utf8');

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
    assert.match(rootSkill, /Expected execution evidence/);
    assert.match(rootSkill, /review package/);
    assert.doesNotMatch(rootSkill, removedPromptPattern);
    assert.match(taskReviewer, /Spec Compliance/);
    assert.match(taskReviewer, /Task quality/);
    assert.match(taskReviewer, /Anchor traceability/);
    assert.match(taskReviewer, /Surface-change compliance/);
    assert.match(taskReviewer, /read-only/i);
    assert.match(taskReviewer, /Do Not Trust the Report/);
    assert.match(taskReviewer, /Cannot verify from (diff|review package)/);
    assert.match(taskReviewer, /Review Output Self-Check/);
    assert.match(taskReviewer, /loopx\.review-result\.v1/);
    assert.match(taskReviewer, /loopx-review-result/);
    assert.match(taskReviewer, /finding.*stable.*F-001/is);
    assert.match(rootSkill, /canonical review result.*source of truth/is);
    assert.match(rootSkill, /preserve.*verbatim/is);
    assert.match(rootSkill, /must not reconstruct.*status.*severity/is);
    assert.match(rootSkill, /scripts\/review-result/);
    assert.match(reviewResultContract, /unknown schema versions are invalid/i);
    assert.match(reviewResultContract, /writes atomically/i);
    assert.match(reviewResultContract, /native rollout/i);
    assert.match(reviewResultContract, /root thread owns the named reviewer invocation/i);
    assert.match(reviewResultContract, /raw-message hash/i);
    assert.match(reviewResultContract, /NEEDS_CONTEXT.*Needs fixes/is);
    assert.match(reviewResultContract, /new schema identifier/i);
    assert.match(taskReviewer, /Do not review only the code/);
    assert.match(taskReviewer, /source design anchors, implementation plan/);
    assert.match(taskReviewer, /Remove duplicate, preference-only, unactionable, speculative, or\s+plan-contradicting findings/is);
    assert.match(implementer, /Read your task brief first/);
    assert.match(implementer, /# Goal/);
    assert.match(implementer, /# Success Criteria/);
    assert.match(implementer, /# Stop Rules/);
    assert.match(implementer, /Once the success criteria have fresh evidence.*stop/is);
    assert.match(implementer, /REPORT_FILE/);
    assert.match(implementer, /leaf worker/i);
    assert.match(implementer, /Do not spawn, delegate to, or wait for (?:other |any )?agents/i);
    assert.doesNotMatch(implementer, /Native Codex subagent/);
    assert.match(taskReviewer, /leaf worker/i);
    assert.match(taskReviewer, /Do not spawn, delegate to, or wait for (?:other |any )?agents/i);
    assert.match(platformReference, /Codex/);
    assert.match(platformReference, /Claude Code/);
    assert.match(platformReference, /Cursor/);
    assert.match(platformReference, /Generic Requirements/);
    assert.match(codexReference, /task-reviewer-prompt\.md/);
    assert.match(rootSkill, /Confirm subagent capability/i);
    assert.match(rootSkill, /deferred tool\s+discovery/i);
    assert.match(codexReference, /deferred-loaded tools/i);
    assert.match(codexReference, /tool_search/);
    assert.match(codexReference, /multi_agent_v1\.spawn_agent/);
    assert.match(codexReference, /Only after direct lookup and available discovery both fail/);
    assert.match(codexReference, /controller is the only orchestration owner/i);
    assert.match(codexReference, /leaf workers/i);
    assert.match(codexReference, /include this leaf-worker constraint in every dispatch/i);
    assert.match(codexReference, /No agents completed yet.*not\s+a\s+failure/is);
    assert.match(codexReference, /Do not form an unbounded.*wait/is);
    assert.match(codexReference, /Do not spawn a replacement.*still running/is);
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
    await writeFile(join(wd, 'app.txt'), 'one\ntwo\n');

    const scriptsDir = join(repoRoot, 'skills', 'subagent-exec', 'scripts');
    if (existsSync(join(scriptsDir, 'review-result')) && !existsSync(join(scriptsDir, 'subagent-workspace'))) {
      for (const scriptName of ['review-result', 'review-artifact-verify']) {
        const mode = (await stat(join(scriptsDir, scriptName))).mode;
        assert.notEqual(mode & 0o111, 0, `${scriptName} should be executable`);
      }
      const contract = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'references', 'review-result-contract.md'), 'utf8');
      assert.match(contract, /canonical artifact/i);
      assert.match(contract, /diff-package SHA-256/i);
      assert.match(contract, /verification SHA-256/i);
      assert.match(contract, /invalid|stale/i);
      return;
    }
    if (!existsSync(join(scriptsDir, 'subagent-workspace'))) {
      assert.deepEqual(await relativeFilesUnder(join(repoRoot, 'skills', 'subagent-exec')), ['SKILL.md']);
      return;
    }
    for (const scriptName of ['subagent-workspace', 'task-brief', 'review-package', 'review-result', 'review-artifact-verify']) {
      const mode = (await stat(join(scriptsDir, scriptName))).mode;
      assert.notEqual(mode & 0o111, 0, `${scriptName} should be executable`);
    }

    const workspace = (await execFileAsync(join(scriptsDir, 'subagent-workspace'), [], { cwd: wd })).stdout.trim();
    assert.equal(workspace, join(wd, '.loopx', 'subagent-exec'));
    assert.equal(await readFile(join(workspace, '.gitignore'), 'utf8'), '*\n');
    const progressPath = join(workspace, 'progress.md');
    assert.equal(await readFile(progressPath, 'utf8'), '');
    await appendFile(progressPath, 'Task 1: complete (review clean, brief brief.md, report report.md, review review.diff)\n');
    assert.equal(
      await readFile(progressPath, 'utf8'),
      'Task 1: complete (review clean, brief brief.md, report report.md, review review.diff)\n',
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

    const packagePath = (await execFileAsync(join(scriptsDir, 'review-package'), ['--worktree', 'T-001'], { cwd: wd })).stdout.trim();
    const reviewPackage = await readFile(packagePath, 'utf8');
    assert.match(reviewPackage, /# Review Package/);
    assert.match(reviewPackage, /Mode: worktree/);
    assert.match(reviewPackage, /Task: T-001/);
    assert.match(reviewPackage, /## Git Status/);
    assert.match(reviewPackage, /## Diff Stat/);
    assert.match(reviewPackage, /## Diff/);
    assert.match(reviewPackage, /two/);
    assert.doesNotMatch(reviewPackage, /## Commits/);

    const reviewerMessage = join(wd, 'reviewer-message.md');
    const implementerReportPath = join(wd, 'implementer-report.md');
    await writeFile(implementerReportPath, 'implementation evidence\n');
    await writeFile(reviewerMessage, [
      '### Spec Compliance',
      '- Status: SPEC_COMPLIANT',
      '',
      '```loopx-review-result',
      JSON.stringify({
        schema: 'loopx.review-result.v1',
        status: 'SPEC_COMPLIANT',
        task_quality: 'Approved',
        task_anchor: 'T-001',
        cannot_verify: [],
        findings: [],
      }, null, 2),
      '```',
    ].join('\n'));
    const commonArgs = ['--task', 'T-001', '--reviewer-thread', 'reviewer-1', '--model', 'gpt-5.6-sol', '--attempt', '1', '--brief', briefPath, '--review-package', packagePath, '--implementer-report', implementerReportPath];
    const resultPath = (await execFileAsync(join(scriptsDir, 'review-result'), [...commonArgs, '--input', reviewerMessage, '--platform', 'test'], { cwd: wd })).stdout.trim();
    assert.equal(resultPath, join(workspace, 'reviews', 'T-001', 'review-artifact.json'));
    const artifact = JSON.parse(await readFile(resultPath, 'utf8'));
    assert.equal(artifact.schema, 'loopx.review-artifact.v1');
    assert.equal(artifact.review_result.status, 'SPEC_COMPLIANT');
    assert.equal(artifact.provenance.reviewer_thread_id, 'reviewer-1');
    assert.equal(artifact.provenance.model, 'gpt-5.6-sol');
    assert.equal(artifact.provenance.review_attempt, 1);
    assert.match(artifact.provenance.raw_message_sha256, /^[a-f0-9]{64}$/);
    assert.match(artifact.provenance.brief_sha256, /^[a-f0-9]{64}$/);
    assert.match(artifact.provenance.review_package_sha256, /^[a-f0-9]{64}$/);
    assert.match(artifact.provenance.implementer_report_sha256, /^[a-f0-9]{64}$/);
    const verifyArgs = ['--artifact', resultPath, ...commonArgs];
    assert.equal((await execFileAsync(join(scriptsDir, 'review-artifact-verify'), verifyArgs, { cwd: wd })).stdout.trim(), resultPath);
    await writeFile(implementerReportPath, 'changed evidence\n');
    await assert.rejects(
      execFileAsync(join(scriptsDir, 'review-artifact-verify'), verifyArgs, { cwd: wd }),
      /review_artifact_implementer_report_sha256_mismatch/,
    );
    await writeFile(implementerReportPath, 'implementation evidence\n');
    await assert.rejects(
      execFileAsync(join(scriptsDir, 'review-result'), [...commonArgs.map((value) => value === 'T-001' ? 'T-999' : value), '--input', reviewerMessage, '--platform', 'test'], { cwd: wd }),
      /review_result_task_anchor_mismatch:T-001:T-999/,
    );

    const invalidMessage = join(wd, 'invalid-reviewer-message.md');
    await writeFile(invalidMessage, '```loopx-review-result\n{"schema":"loopx.review-result.v2"}\n```\n');
    await assert.rejects(
      execFileAsync(join(scriptsDir, 'review-result'), [...commonArgs, '--input', invalidMessage, '--platform', 'test'], { cwd: wd }),
      /review_result_schema_unsupported/,
    );

    const codexRolloutPath = join(wd, 'codex-review-rollout.jsonl');
    const nativeMessage = await readFile(reviewerMessage, 'utf8');
    await writeFile(codexRolloutPath, [
      JSON.stringify({ timestamp: '2026-07-14T00:00:00Z', type: 'session_meta', payload: { session_id: 'root-native' } }),
      JSON.stringify({ timestamp: '2026-07-14T00:00:01Z', type: 'event_msg', payload: { type: 'sub_agent_activity', kind: 'started', agent_thread_id: 'reviewer-native', agent_path: '/root/task_reviewer' } }),
      JSON.stringify({ timestamp: '2026-07-14T00:00:02Z', type: 'response_item', payload: { type: 'agent_message', author: '/root/task_reviewer', recipient: '/root', content: [{ type: 'input_text', text: `Message Type: FINAL_ANSWER\nTask name: /root\nPayload:\n${nativeMessage}` }] } }),
    ].join('\n'));
    const nativePath = join(wd, 'native-review-artifact.json');
    await execFileAsync(join(scriptsDir, 'review-result'), [
      '--task', 'T-001', '--reviewer-thread', 'reviewer-native', '--model', 'gpt-5.6-sol', '--attempt', '2',
      '--brief', briefPath, '--review-package', packagePath, '--implementer-report', implementerReportPath,
      '--codex-rollout', codexRolloutPath, '--root-thread', 'root-native', nativePath,
    ], { cwd: wd });
    const nativeArtifact = JSON.parse(await readFile(nativePath, 'utf8'));
    assert.equal(nativeArtifact.provenance.source_platform, 'codex');
    assert.equal(nativeArtifact.provenance.root_thread_id, 'root-native');
    assert.equal(nativeArtifact.provenance.reviewer_thread_id, 'reviewer-native');
    assert.match(nativeArtifact.provenance.source_rollout_sha256, /^[a-f0-9]{64}$/);
  });

  it('governs boundary commit policy and task review worktree evidence', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const execSkill = await readSkillSurface('exec');
    const subagentSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const implementerPrompt = existsSync(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'))
      ? await readFile(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'), 'utf8') : '';
    const reviewerPrompt = existsSync(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'))
      ? await readFile(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'), 'utf8') : '';
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const resolver = await readFile(resolverPath, 'utf8');
    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');

    if (parseFrontmatter(planSkill)['metadata.version'] === '0.3.0') {
      assert.match(subagentSkill, /explicit `delegated-serial-v1` profile entry point/i);
      assert.match(execSkill, /Only a clean candidate may integrate/i);
      assert.match(execSkill, /separate read-only reviewer/i);
      assert.match(planSkill, /Do not add.*per-slice commit\s+commands/is);
      assert.match(implementerPrompt, /Do not stage, commit/i);
      assert.match(reviewerPrompt, /read-only work/i);
      assert.doesNotMatch(subagentSkill, /compatibility alias/i);
      return;
    }

    for (const text of [planSkill, execSkill, subagentSkill, implementerPrompt, reviewerPrompt]) {
      assert.doesNotMatch(text, /Frequent commits|Commit your work|Commits created|Step 5: Commit|"Commit" is a step/);
      assert.doesNotMatch(text, /scripts\/review-package BASE HEAD|commits <base7>\.\.<head7>/);
      assert.doesNotMatch(text, /per-task staging/i);
    }

    assert.match(planSkill, /single-plan.*one.*commit|one.*commit.*single-plan/is);
    assert.match(planSkill, /multi-plan.*child plan.*one.*commit|one.*commit.*child plan/is);
    assert.match(subagentSkill, /current worktree|worktree evidence/i);
    assert.match(implementerPrompt, /Do not commit|must not commit/i);
    assert.match(implementerPrompt, /Do not stage|must not stage|do not run `git add`/i);
    assert.match(reviewerPrompt, /current code|worktree evidence/i);
    assert.match(reviewSkill, /task.*current code|worktree evidence/is);
    assert.doesNotMatch(resolver, /staged review/i);
    assert.doesNotMatch(readme, /concrete git range needs independent code review/i);
    assert.doesNotMatch(readmeZh, /具体 git range 需要独立代码评审/);
  });

  it('plan2exec requires global constraints and slice interfaces for exec handoff', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const clarifySkill = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const resolver = await readFile(join(repoRoot, 'skills', 'RESOLVER.md'), 'utf8');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const finishSkill = await readSkillSurface('finish');
    if (parseFrontmatter(planSkill).name === 'plan2exec') {
      const canonicalPlan = await readSkillSurface('plan2exec', ['plan-schema.md']);
      assert.match(subagentExecSkill, /explicit `delegated-serial-v1` profile entry point/i);
      assert.match(canonicalPlan, /Boundaries And Global Constraints/);
      assert.match(canonicalPlan, /Execution Slices/);
      assert.match(canonicalPlan, /Interfaces consumed:/);
      assert.match(canonicalPlan, /Interfaces produced:/);
      assert.match(canonicalPlan, /Depends on:/);
      assert.match(canonicalPlan, /Expected evidence:/);
      assert.match(canonicalPlan, /Authoritative Execution Graph/);
      assert.match(canonicalPlan, /selected_profile/);
      assert.match(canonicalPlan, /parallel_safe/);
      assert.match(canonicalPlan, /Do not add.*task microsteps/is);
      return;
    }
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
    assert.match(subagentExecSkill, /Do not\s+execute sibling child plans|Do not\s+execute sibling plans from direct child plan mode/i);
    assert.match(subagentExecSkill, /do not\s+proceed to\s+package(?:-level)?\s+spec review\s+or\s+`finish`/i);
    assert.match(subagentExecSkill, /loopx execution-start <slug> --source <plan-path>/);
    assert.match(subagentExecSkill, /loopx finish-start <slug> --source <plan-path>/);
    assert.match(subagentExecSkill, /plan_review\.status/);
    assert.match(subagentExecSkill, /plan_review\.reviewed_at/);
    assert.match(subagentExecSkill, /plan_review\.summary/);
    assert.match(subagentExecSkill, /ready_for_spec_review/);
    assert.match(subagentExecSkill, /schema_version/);
    assert.match(subagentExecSkill, /2/);
    assert.match(subagentExecSkill, /spec_final_review/);
    assert.doesNotMatch(subagentExecSkill, removedPlanFinalReviewPattern);
    assert.doesNotMatch(subagentExecSkill, removedSchemaVersion1Pattern);
    assert.doesNotMatch(subagentExecSkill, removedLegacyV1Pattern);
    assert.doesNotMatch(subagentExecSkill, removedNormalizeOnReadPattern);
    assert.match(subagentExecSkill, /updates multi-plan state only|must not\s+write\s+`?\.loopx\/final-review/is);
    assert.doesNotMatch(subagentExecSkill, removedChildReviewPathPattern);
    assert.match(finalReviewSkill, /Plan-level final-review/);
    assert.match(finalReviewSkill, /Spec-level final-review/);
    assert.match(finalReviewSkill, /\.loopx\/multi-plan\/<feature-slug>\/state\.json/);
    assert.match(finishSkill, /Check the multi-plan finish gate/i);
    assert.match(finishSkill, /plan_review\.status/);
    assert.match(finishSkill, /plan_review\.reviewed_at/);
    assert.match(finishSkill, /plan_review\.summary/);
    assert.match(finishSkill, /ready_for_spec_review/);
    assert.match(finishSkill, /schema_version/);
    assert.match(finishSkill, /2/);
    assert.match(finishSkill, /spec_final_review/);
    assert.match(finishSkill, /spec_final_review\.ready_for_finish/);
    assert.doesNotMatch(finishSkill, removedPlanFinalReviewPattern);
    assert.doesNotMatch(finishSkill, removedSchemaVersion1Pattern);
    assert.doesNotMatch(finishSkill, removedLegacyV1Pattern);
    assert.doesNotMatch(finishSkill, removedNormalizeOnReadPattern);
    assert.doesNotMatch(finishSkill, removedChildReviewPathPattern);
    assert.match(resolver, /multiple plans from one source under `docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\/`/);
    assert.match(resolver, /plan_review\.status|plan-level final-review/);
    assert.match(resolver, /package receives one spec-level final-review report/);
  });

  it('governs multi-plan package execution mode across execution skills', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const execSkill = await readSkillSurface('exec');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const finishSkill = await readSkillSurface('finish');
    const resolver = await readFile(join(repoRoot, 'skills', 'RESOLVER.md'), 'utf8');

    if (parseFrontmatter(planSkill).name === 'plan2exec') {
      const canonicalPlan = await readSkillSurface('plan2exec', ['plan-schema.md']);
      assert.match(subagentExecSkill, /explicit `delegated-serial-v1` profile entry point/i);
      assert.match(execSkill, /delegated-serial-v1.*default for planned work/is);
      assert.match(canonicalPlan, /one authoritative.*loopx\.execution-graph\.v1/is);
      assert.match(canonicalPlan, /selected_profile/);
      assert.match(resolver, /Execution Profiles/);
      assert.doesNotMatch(canonicalPlan, /multi-plan package|00-overview\.md/i);
      return;
    }

    assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.20');
    assert.equal(parseFrontmatter(execSkill)['metadata.version'], '0.3.12');
    assert.equal(parseFrontmatter(subagentExecSkill)['metadata.version'], '0.3.22');
    assert.equal(parseFrontmatter(finishSkill)['metadata.version'], '0.3.11');

    assert.match(planSkill, /package mode/i);
    assert.match(planSkill, /\$subagent-exec docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\/00-overview\.md/);
    assert.match(planSkill, /\$exec docs\/loopx\/plans\/YYYY-MM-DD-<feature-slug>\/00-overview\.md/);
    assert.match(planSkill, /primary handoff/i);
    assert.match(planSkill, /targeted\/resume\/manual-control/i);
    assert.match(planSkill, /strictly sequential/i);
    assert.match(planSkill, /Execution strategy/);
    assert.match(planSkill, /Selection rationale/);
    assert.match(planSkill, /Subagent availability\s+alone is not a reason to\s+prefer `subagent-exec`/i);
    assert.match(planSkill, /tightly coupled|context-continuous/i);
    assert.match(planSkill, /dispatch cost/i);
    assert.doesNotMatch(planSkill, /subagent-exec \(recommended\)/i);
    assert.doesNotMatch(planSkill, /Subagent Exec \(recommended\)/i);
    assert.doesNotMatch(planSkill, /Inline fallback:/i);
    assert.doesNotMatch(planSkill, /`either`|\| `either`/i);
    assert.doesNotMatch(planSkill, /Do not ask one agent to execute the whole directory/);

    assert.match(subagentExecSkill, /Multi-Plan Package Mode/);
    assert.match(subagentExecSkill, /package directory/i);
    assert.match(subagentExecSkill, /00-overview\.md/);
    assert.match(subagentExecSkill, /schema v2/i);
    assert.match(subagentExecSkill, /schema_version/);
    assert.match(subagentExecSkill, /2/);
    assert.match(subagentExecSkill, /plan_review\.status/);
    assert.match(subagentExecSkill, /plan_review\.reviewed_at/);
    assert.match(subagentExecSkill, /plan_review\.summary/);
    assert.match(subagentExecSkill, /ready_for_spec_review/);
    assert.match(subagentExecSkill, /spec_final_review/);
    assert.match(subagentExecSkill, /strictly sequential/i);
    assert.match(subagentExecSkill, /fresh implementer subagent per task/i);
    assert.match(subagentExecSkill, /dispatch the task reviewer/i);
    assert.match(subagentExecSkill, /spec-level `loopx:final-review`|`spec-level final-review`/);
    assert.match(subagentExecSkill, /then `finish`|before\s+`finish`|start `loopx:finish`/i);
    assert.match(subagentExecSkill, /Direct child plan mode|Targeted child plan mode/i);
    assert.match(subagentExecSkill, /execute only that child plan/i);
    assert.doesNotMatch(subagentExecSkill, removedPlanFinalReviewPattern);
    assert.doesNotMatch(subagentExecSkill, removedSchemaVersion1Pattern);
    assert.doesNotMatch(subagentExecSkill, removedLegacyV1Pattern);
    assert.doesNotMatch(subagentExecSkill, removedNormalizeOnReadPattern);

    assert.match(execSkill, /Multi-Plan Package Mode/);
    assert.match(execSkill, /package directory/i);
    assert.match(execSkill, /00-overview\.md/);
    assert.match(execSkill, /same-context/i);
    assert.match(execSkill, /does not use subagents/i);
    assert.match(execSkill, /schema v2/i);
    assert.match(execSkill, /schema_version/);
    assert.match(execSkill, /2/);
    assert.match(execSkill, /strictly sequential/i);
    assert.match(execSkill, /Direct child plan mode|Targeted child plan mode/i);
    assert.match(execSkill, /plan-level `loopx:final-review`/);
    assert.match(execSkill, /spec-level `loopx:final-review`/);
    assert.doesNotMatch(execSkill, removedPlanFinalReviewPattern);
    assert.doesNotMatch(execSkill, removedSchemaVersion1Pattern);
    assert.doesNotMatch(execSkill, removedLegacyV1Pattern);
    assert.doesNotMatch(execSkill, removedNormalizeOnReadPattern);

    assert.match(finishSkill, /plan_review\.status/);
    assert.match(finishSkill, /non-empty `plan_review\.reviewed_at`/);
    assert.match(finishSkill, /non-empty `plan_review\.summary`/);
    assert.match(finishSkill, /schema_version/);
    assert.match(finishSkill, /2/);
    assert.match(finishSkill, /ready_for_spec_review/);
    assert.match(finishSkill, /spec_final_review/);
    assert.doesNotMatch(finishSkill, removedPlanFinalReviewPattern);
    assert.doesNotMatch(finishSkill, removedSchemaVersion1Pattern);
    assert.doesNotMatch(finishSkill, removedLegacyV1Pattern);
    assert.doesNotMatch(finishSkill, removedNormalizeOnReadPattern);
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
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
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
    assert.doesNotMatch(specSkill, removedStandaloneArtifactPattern);
    assert.match(planSkill, /intake package/);
    assert.doesNotMatch(planSkill, removedStandaloneArtifactPattern);
    assert.match(specSkill, /Acceptance Scenarios/);
    assert.match(planSkill, /source `AC-\*`, `D-\*`, and `TC-\*`/);
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
      ['skills/spec/DESIGN_SPEC_TEMPLATE.md', template],
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
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const specFields = parseFrontmatter(specSkill);
    const planFields = parseFrontmatter(planSkill);
    const reviewFields = parseFrontmatter(reviewSkill);

    assert.equal(specFields['metadata.version'], '0.3.15');
    assert.equal(planFields['metadata.version'], '0.3.0');
    assert.equal(reviewFields['metadata.version'], '0.4.0');

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
    assert.match(planSkill, /Every implementation-relevant source `AC-\*`, `D-\*`, and `TC-\*` anchor must map/i);
    assert.match(planSkill, /route to `clarify` or `spec`/i);

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
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const execSkill = await readSkillSurface('exec');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const implementerPrompt = existsSync(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'))
      ? await readFile(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'), 'utf8') : '';
    const taskReviewerPrompt = existsSync(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'))
      ? await readFile(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'), 'utf8') : '';
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const planFields = parseFrontmatter(planSkill);
    const execFields = parseFrontmatter(execSkill);
    const subagentExecFields = parseFrontmatter(subagentExecSkill);
    const reviewFields = parseFrontmatter(reviewSkill);

    if (planFields.name === 'plan2exec') {
      const canonicalPlan = await readSkillSurface('plan2exec', ['plan-schema.md']);
      assert.match(subagentExecSkill, /explicit `delegated-serial-v1` profile entry point/i);
      for (const section of ['Source And Goal', 'Boundaries And Global Constraints', 'Execution Slices', 'Integration And Final Verification', 'Handoff And Residual Risks']) {
        assert.match(canonicalPlan, new RegExp(section));
      }
      assert.match(canonicalPlan, /### P-001:/);
      assert.match(canonicalPlan, /source_anchors/);
      assert.match(canonicalPlan, /review_focus/);
      assert.match(execSkill, /loopx\.execution-graph\.v1/);
      assert.match(execSkill, /temporary graph/i);
      return;
    }

    assert.equal(planFields['metadata.version'], '0.3.20');
    assert.equal(execFields['metadata.version'], '0.3.12');
    assert.equal(subagentExecFields['metadata.version'], '0.3.22');
    assert.equal(reviewFields['metadata.version'], '0.3.13');

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
    assert.match(execSkill, /checkpoint review/i);
    assert.match(execSkill, /T-001 \/ Task 1|task_anchor: <T-\* or Task N>/);
    assert.match(execSkill, /Required Review Gates|Mandatory Checkpoint Review/);
    assert.match(execSkill, /Use checkpoint reviews, not mandatory review after every task|Mandatory Checkpoint Review/);
    assert.match(execSkill, /3 consecutive tasks without a review/);
    assert.match(execSkill, /Before announcing all tasks complete or starting `loopx:final-review`/);
    assert.match(execSkill, /final checkpoint.*loopx:review/is);
    assert.match(execSkill, /`loopx:final-review`/);
    assert.match(execSkill, /git diff/);
    assert.match(execSkill, /git diff --cached/);
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
      ['plan2exec', planSkill],
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

  it('keeps plan2exec source coverage and graph review obligations self-contained', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const resolver = await readFile(resolverPath, 'utf8');
    const skillsDoc = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsDocZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');

    if (parseFrontmatter(planSkill).name === 'plan2exec') {
      const canonicalPlan = await readSkillSurface('plan2exec', ['plan-schema.md']);
      assert.match(canonicalPlan, /Acceptance/);
      assert.match(canonicalPlan, /Verification/);
      assert.match(canonicalPlan, /Source anchors/);
      assert.match(canonicalPlan, /deferred-with-rationale/);
      assert.match(canonicalPlan, /Review focus/);
      assert.match(canonicalPlan, /Authoritative Execution Graph/);
      assert.match(canonicalPlan, /independent reviewer/i);
      assert.doesNotMatch(canonicalPlan, /Internal Plan Review/i);
      return;
    }

    assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.20');

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
    assert.equal(parseFrontmatter(planReviewerSkill)['metadata.version'], '0.1.5');

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

  it('makes current plans carry an authoritative execution graph for qualitative profile selection', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const planSchema = await readFile(join(repoRoot, 'skills', 'plan2exec', 'references', 'plan-schema.md'), 'utf8');
    const execSelection = await readFile(join(repoRoot, 'skills', 'exec', 'references', 'execution-selection.md'), 'utf8');
    const matrix = JSON.parse(await readFile(join(repoRoot, 'test', 'fixtures', 'skill-contract-matrix.json'), 'utf8'));

    assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.0');
    assert.equal(matrix.skills.find(({ skill }) => skill === 'plan2exec').version, '0.3.0');
    assert.equal(matrix.skills.some(({ skill }) => skill === 'plan'), false);
    assert.equal(matrix.skills.some(({ skill }) => skill === 'plan-to-exec'), false);

    assert.match(planSkill, /loopx\.execution-graph\.v1/);
    for (const field of ['selected_profile', 'max_parallel', 'depends_on', 'write_scope', 'relevant_paths', 'parallel_safe']) {
      assert.match(planSchema, new RegExp(field));
    }
    assert.match(planSchema, /default selected profile for a persistent plan\s+is `delegated-serial-v1`/i);
    assert.match(planSchema, /Select parallel only when.*ready.*independent/is);

    assert.match(execSelection, /dependency/i);
    assert.match(execSelection, /write scopes/i);
    assert.match(execSelection, /decisions/i);
    assert.match(execSelection, /verification/i);
    assert.match(execSelection, /baseline reads/i);
    assert.match(execSelection, /verification outcomes/i);
    assert.match(execSelection, /default shared worker budget is four/i);
    assert.match(execSelection, /uncertain.*serial/is);
  });

  it('governs upstream main-chain contract handoff across clarify planning and execution', async () => {
    const clarifySkill = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const specSkill = await readFile(join(repoRoot, 'skills', 'spec', 'SKILL.md'), 'utf8');
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const execSkill = await readSkillSurface('exec');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const implementerPrompt = existsSync(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'))
      ? await readFile(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'), 'utf8') : '';
    const taskReviewerPrompt = existsSync(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'))
      ? await readFile(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'), 'utf8') : '';

    if (parseFrontmatter(planSkill).name === 'plan2exec') {
      const canonicalPlan = await readSkillSurface('plan2exec', ['plan-schema.md']);
      assert.match(subagentExecSkill, /explicit `delegated-serial-v1` profile entry point/i);
      assert.match(canonicalPlan, /source `AC-\*`, `D-\*`, and `TC-\*`/);
      assert.match(canonicalPlan, /Execution Slices/);
      assert.match(execSkill, /clear request or persistent plan/i);
      assert.match(implementerPrompt, /source anchors/i);
      assert.match(taskReviewerPrompt, /source anchors/i);
      return;
    }

    assert.equal(parseFrontmatter(clarifySkill)['metadata.version'], '0.3.15');
    assert.equal(parseFrontmatter(specSkill)['metadata.version'], '0.3.13');
    assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.20');
    assert.equal(parseFrontmatter(execSkill)['metadata.version'], '0.3.12');
    assert.equal(parseFrontmatter(subagentExecSkill)['metadata.version'], '0.3.22');

    assert.match(clarifySkill, /`requirements\.md` is the canonical `AC-\*`\/`TC-\*` source/);
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
    assert.match(execSkill, /Task completion evidence fields are:/);
    assert.match(execSkill, /Record task completion evidence before marking the task complete/);
    assert.match(execSkill, /checkpoint.*task completion evidence|task completion evidence.*checkpoint/is);

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
    assert.match(subagentExecSkill, /task brief.*must preserve[\s\S]*`Task anchor`/is);
    assert.match(implementerPrompt, /Preserve any `T-\*` task anchor.*task_anchor/is);
    assert.match(taskReviewerPrompt, /Source AC.*Design anchors.*Test cases.*Expected execution evidence/is);
  });

  it('governs canonical proportional review and legacy forwarding aliases', async () => {
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const codeReviewerPrompt = await readFile(join(repoRoot, 'skills', 'review', 'code-reviewer.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const fixReviewSkill = await readFile(join(repoRoot, 'skills', 'fix-review', 'SKILL.md'), 'utf8');
    const reviewContract = await readFile(join(repoRoot, 'skills', 'shared', 'review-contract.md'), 'utf8');

    assert.equal(parseFrontmatter(reviewSkill)['metadata.version'], '0.4.0');
    assert.equal(parseFrontmatter(finalReviewSkill)['metadata.version'], '0.4.0');
    assert.equal(parseFrontmatter(fixReviewSkill)['metadata.version'], '0.4.0');

    assert.match(reviewSkill, /Check spec compliance first, then code quality/);
    assert.match(reviewSkill, /execution evidence.*first-class Stage 1\s+input/is);
    assert.match(reviewSkill, /AC-\*.*D-\*.*T-\*.*task verification evidence/is);
    assert.match(reviewSkill, /missing or weak task evidence.*finding/is);
    assert.match(reviewSkill, /commands, outputs,.*evidence\s+summaries.*do not support claimed `AC-\*`\/`D-\*`\/`T-\*` completion/is);
    assert.match(reviewSkill, /Review Output Self-Check/);
    assert.match(reviewSkill, /Do not dispatch a code-only review for plan-driven work/);
    assert.match(reviewSkill, /design proposal, detailed design, implementation plan/);
    assert.match(reviewSkill, /every Critical or\s+Important finding names the plan\/design\/requirement basis/is);
    assert.match(reviewSkill, /Do not prescribe broad fallback logic, degraded modes, retry\s+paths, wrappers, compatibility shims/is);
    assert.match(reviewSkill, /current user instruction, clarified source requirements, approved design,\s+implementation plan, or issue contract explicitly requires that behavior/is);
    assert.match(reviewSkill, /treat unanchored fallback, degradation, retry, silent recovery, or compatibility\s+shim logic as a finding/is);
    assert.match(reviewSkill, /unsupported, duplicate, or overbuilt findings were removed/);
    assert.match(codeReviewerPrompt, /Review Output Self-Check/);
    assert.match(codeReviewerPrompt, /Do not review only the code/);
    assert.match(codeReviewerPrompt, /design\s+proposal, detailed design, implementation plan/is);
    assert.match(codeReviewerPrompt, /Do not prescribe broad fallback logic, degraded modes, retry paths,\s+wrappers, compatibility shims/is);
    assert.match(codeReviewerPrompt, /Treat unanchored fallback, degradation, retry, silent recovery, or\s+compatibility shim logic as a finding/is);
    assert.match(codeReviewerPrompt, /Remove duplicate, preference-only, unactionable, speculative, or\s+plan-contradicting findings/is);

    assert.match(reviewSkill, /Critical and Important findings remain blocking/i);
    assert.match(reviewSkill, /fresh focused verification.*combined verification/is);
    assert.match(reviewSkill, /independent re-review/i);
    assert.match(reviewContract, /delegated-serial-v1.*parallel-strict-v1.*independent task review/is);
    assertExplicitCompatibilityAlias(finalReviewSkill, 'final-review', 'review');
    assertExplicitCompatibilityAlias(fixReviewSkill, 'fix-review', 'review');
    assert.match(finalReviewSkill, /whole-feature review intent/i);
    assert.match(fixReviewSkill, /existing review feedback intent/i);
    assert.match(finalReviewSkill, /does not require a final-review report artifact/i);
    assert.match(fixReviewSkill, /does not require a feedback ledger or report artifact/i);
  });

  it('keeps main-chain exclusions out of current skill contracts', async () => {
    const currentContractPaths = [
      join(repoRoot, 'skills', 'clarify', 'SKILL.md'),
      join(repoRoot, 'skills', 'spec', 'SKILL.md'),
      join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'),
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

  it('canonical review actively triggers support lenses for domain-specific changes', async () => {
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');

    for (const lens of ['api-designer', 'architecture-designer', 'sql-style', 'cli-developer', 'go-style', 'kratos']) {
      assert.match(reviewSkill, new RegExp(lens));
    }
    assert.match(reviewSkill, /Support Lens Triggers/);
    assert.match(reviewSkill, /lens-specific checks/i);
    assertExplicitCompatibilityAlias(finalReviewSkill, 'final-review', 'review');
  });

  it('final-review forwards whole-feature intent without legacy artifacts', async () => {
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    assertExplicitCompatibilityAlias(finalReviewSkill, 'final-review', 'review');
    assert.match(finalReviewSkill, /whole-feature review intent/i);
    assert.match(finalReviewSkill, /does not require a final-review report artifact/i);
    assert.match(finalReviewSkill, /Do not create or look up legacy/i);
    assert.doesNotMatch(finalReviewSkill, /Ready for finish\?|report-template|plan_review\.status/);
  });

  it('threads lancet through implementation and review contracts without collapsing planning freedom', async () => {
    const resolver = await readFile(resolverPath, 'utf8');
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const execSkill = await readSkillSurface('exec', ['execution-selection.md']);
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const fixSkill = await readFile(join(repoRoot, 'skills', 'fix', 'SKILL.md'), 'utf8');
    const implementerPrompt = existsSync(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'))
      ? await readFile(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'), 'utf8') : '';
    const reviewerPrompt = existsSync(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'))
      ? await readFile(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'), 'utf8') : '';

    assert.match(resolver, /`lancet` is implementation\/review-only/i);
    assert.doesNotMatch(resolver, /`lancet` add[s]? domain discipline to `spec`/i);
    assert.doesNotMatch(planSkill, /lancet/i);
    assert.match(execSkill, /one coherent prompt\s+outcome/is);
    assert.match(subagentExecSkill, /explicit `delegated-serial-v1` profile entry point/i);
    assert.match(reviewSkill, /over-engineering/i);
    assert.match(reviewSkill, /stdlib\/native alternatives/i);
    assertExplicitCompatibilityAlias(finalReviewSkill, 'final-review', 'review');
    assert.match(fixSkill, /smallest root-cause fix/i);
    assert.match(fixSkill, /Use `lancet` discipline/i);
    if (implementerPrompt) {
      assert.match(implementerPrompt, /smallest complete vertical slice/);
      assert.match(reviewerPrompt, /maintainability/);
    }
  });

  it('documents lancet as bundled but Codex-only auto activation', async () => {
    const readme = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');
    const installationSpec = await readFile(join(repoRoot, 'docs', 'loopx', 'specs', 'installation.md'), 'utf8');
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));

    assert.match(readme, /lancet/);
    assert.match(readme, /lancet.*Implementation and review simplification/i);
    assert.match(readmeZh, /lancet/);
    assert.match(readmeZh, /lancet.*实现和评审阶段的简化/);
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
    const finishSkill = await readSkillSurface('finish', ['branch-worktree-and-recording.md']);
    assert.match(finishSkill, /Match the user's language/);
    assert.match(finishSkill, /Equal resolved Git and common directories indicate a normal repository/);
    assert.match(finishSkill, /Different directories with a branch indicate a named worktree/);
    assert.match(finishSkill, /create a new branch.*commit there/is);
    assert.match(finishSkill, /merge locally.*pull request.*keep as-is.*clean up.*discard/is);
    assert.match(finishSkill, /explicit typed confirmation.*exact branch\/worktree.*target/is);
    assert.match(finishSkill, /explicit `\$finish`.*active loopx `exec` or `fix` run/is);
    assert.match(finishSkill, /standalone Git request.*must not trigger `finish`/is);
    assert.match(finishSkill, /Do not require a review report, extraction candidate, audit artifact, or\s+additional persisted state/is);
    assert.doesNotMatch(finishSkill, /final-review-and-finish-gates|memory-and-spec-candidates/);
  });

  it('finish wording avoids colliding with the assistant final channel', async () => {
    const finishSkill = await readSkillSurface('finish', ['branch-worktree-and-recording.md']);
    const execSkill = await readSkillSurface('exec');
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');

    assert.doesNotMatch(finishSkill, /Final Response Contract/i);
    assert.doesNotMatch(finishSkill, /final response must/i);
    assert.match(finishSkill, /Report the chosen action, resulting branch and HEAD/i);
    assert.match(execSkill, /Review And Completion Gates/);
    assert.match(execSkill, /fresh verification/i);
    assert.match(subagentExecSkill, /explicit `delegated-serial-v1` profile entry point/i);
  });

  it('keeps standalone clarify test-cases artifact out of current surfaces', async () => {
    const currentSurface = [
      'src',
      'scripts',
      'test',
      'templates',
      'skills',
      'package.json',
      'README.md',
      'README.zh-CN.md',
      'docs/loopx/cli.md',
      'docs/loopx/cli.zh-CN.md',
      'docs/loopx/skills.md',
      'docs/loopx/skills.zh-CN.md',
      'docs/loopx/specs/installation.md',
      'docs/loopx/design/loopx-skill-suite-v1-design.md',
    ];
    const output = await rgCurrentSurface(currentSurface, [
      removedTestCasesPathKey,
      escapeRegex(removedHumanTestCasesLabel),
      escapeRegex(removedStandaloneArtifactName),
      escapeRegex(removedIntakeArtifactTemplate.replace('templates/', '')),
    ]);
    assert.equal(output.trim(), '');

    const requirementsContractOutput = await rgCurrentSurface([
      'skills',
      'README.md',
      'README.zh-CN.md',
      'docs/loopx/cli.md',
      'docs/loopx/cli.zh-CN.md',
      'docs/loopx/skills.md',
      'docs/loopx/skills.zh-CN.md',
      'docs/loopx/specs/installation.md',
    ], [
      removedRequirementsStandaloneArtifactOrderPattern.source,
    ]);
    assert.equal(requirementsContractOutput.trim(), '');
  });

  it('governs parallel-subagent-exec as a manual bounded controller', async () => {
    const referenceSurface = await readFile(join(repoRoot, 'skills', 'parallel-subagent-exec', 'SKILL.md'), 'utf8');
    const rootDir = join(repoRoot, 'skills', 'parallel-subagent-exec');
    const skill = referenceSurface;
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const resolver = await readFile(join(repoRoot, 'skills', 'RESOLVER.md'), 'utf8');
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan2exec', 'SKILL.md'), 'utf8');
    const cursorReference = '';
    const claudeReference = '';
    const exactLeaf = 'You are a leaf worker. Do not spawn, delegate to, or wait for other agents.';

    assert.equal(LOOPX_BUNDLED_SKILLS.includes('parallel-subagent-exec'), true);
    assert.equal(packageJson.files.includes('skills/parallel-subagent-exec/'), true);
    if (parseFrontmatter(referenceSurface)['metadata.version'] === '0.5.0') {
      assert.equal(parseFrontmatter(referenceSurface)['disable-model-invocation'], 'true');
      assert.match(skill, /explicit `parallel-strict-v1` profile entry point/i);
      assert.match(skill, /ready\s+frontier of at least two/is);
      assert.match(skill, /disjoint write scopes and exclusive resources/i);
      assert.match(skill, /shared worker budget.*implementers, reviewers, fixers/is);
      assert.match(skill, /separate read-only leaf reviewer for every candidate/i);
      assert.match(skill, /Spec and Standards final reviewers/i);
      assert.match(skill, /controller alone owns lifecycle, state, Git, integration, resume, and\s+cleanup/is);
      assert.match(resolver, /Execution Profiles[\s\S]*parallel-subagent-exec/);
      assert.doesNotMatch(skill, /compatibility alias/i);
      assert.deepEqual(await relativeFilesUnder(rootDir), ['SKILL.md']);
      return;
    }
    if (parseFrontmatter(referenceSurface)['disable-model-invocation'] === 'true') {
      assertExplicitCompatibilityAlias(referenceSurface, 'parallel-subagent-exec', 'exec');
      assert.match(resolver, /do not participate in automatic routing/i);
      assert.deepEqual(await relativeFilesUnder(rootDir), ['SKILL.md']);
      return;
    }
    assert.match(skill, /version:\s*"0\.3\.5"/);
    assert.match(skill, /\$parallel-subagent-exec <plan-or-package> \[--max-parallel N\]/);
    assert.match(skill, /scripts\/parallel-exec\.mjs/);
    assert.match(skill, new RegExp(exactLeaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(skill, /default.*4|defaults? to `4`/is);
    assert.match(skill, /review.*before.*integrat/is);
    assert.match(skill, /review prompt-verify/);
    assert.match(skill, /invalid review artifact after its one[\s\S]*replacement/i);
    assert.match(skill, /Critical or Important[\s\S]*needs_fix/);
    assert.match(skill, /controller alone|controller-only/is);
    assert.match(skill, /at most two reconciliation attempts|maximum of two reconciliation attempts/i);
    assert.match(skill, /\$subagent-exec <same-input-path>/);
    assert.match(skill, /exit `5`/);
    assert.match(skill, /zero dispatch/i);
    assert.match(skill, /cursor inspect/i);
    assert.match(skill, /cursor start/i);
    assert.match(skill, /cursor wait/i);
    assert.match(cursorReference, /cursor wait[\s\S]*--timeout-ms 900000 --format compact/i);
    assert.doesNotMatch(cursorReference, /--timeout-ms 30000|repeat it for the same reservation/i);
    assert.match(cursorReference, /reuse[\s\S]*same[\s\S]*wait[\s\S]*session/i);
    assert.match(skill, /--workspace/);
    assert.match(skill, /worker-local.*(?:inbox|outbox)|(?:inbox|outbox).*worker-local/is);
    assert.match(skill, /Cursor Agent CLI/);
    assert.match(skill, /Cursor App/);
    assert.match(skill, /does not require.*(?:Agent CLI|`agent`|`cursor-agent`)|do not require.*Cursor Agent CLI|不要求.*Agent CLI/is);
    assert.match(skill, /verified workspace|workspace probe|verified_workspace/is);
    assert.match(skill, /stale CLI-only record|another adapter.*earlier skill version/is);
    assert.match(skill, /prefer.*Cursor Agent CLI.*authenticated|authenticated.*Cursor Agent CLI.*prefer/is);
    assert.match(skill, /relaxed[- ]worktree|relaxed isolation/is);
    assert.match(skill, /temporary.*owned.*worktree|owned.*temporary.*worktree/is);
    assert.match(skill, /active batch.*(?:exclude|defer)|(?:exclude|defer).*active batch/is);
    assert.match(skill, /runtime:\s*cursor-app/);
    assert.match(skill, /create-with-controlled-workspace/);
    assert.match(skill, /Codex/);
    assert.match(skill, /Codex Agent CLI/);
    assert.match(skill, /codex inspect/);
    assert.match(skill, /codex run/);
    assert.match(skill, /codex wait[\s\S]*--format compact/i);
    assert.match(skill, /reuse[\s\S]*same[\s\S]*wait[\s\S]*session/i);
    assert.match(skill, /do not[\s\S]*(?:tail|wc|jq)[\s\S]*events\.ndjson/i);
    assert.match(skill, /state revision[\s\S]*terminal[\s\S]*(?:five|5)[ -]minute/i);
    assert.match(skill, /--disable multi_agent/);
    assert.match(skill, /never use.*dangerously-bypass|does not use.*dangerously-bypass/is);
    for (const field of [
      'role',
      'capability_path',
      'capability_sha256',
      'expected_agent_path',
      'expected_cli_version',
      'skill_source_sha256',
      'codex_home_config_fingerprint',
      'protected_worktrees',
      'prompt_sha256',
      'report_sha256',
      'report_size',
    ]) {
      assert.match(skill, new RegExp(`\\b${field}\\b`), `Codex strict contract missing ${field}`);
    }
    assert.match(skill, /review roles?.*read-only|reviewers? use `read-only`/is);
    assert.match(skill, /status: not_started|`not_started`/);
    assert.match(skill, /process-tree escalation/);
    assert.match(skill, /Claude Code/);
    assert.match(claudeReference, /reuse[\s\S]*same[\s\S]*Agent[\s\S]*(?:handle|id)[\s\S]*terminal/i);
    assert.match(claudeReference, /do not[\s\S]*(?:read|tail|poll)[\s\S]*(?:output|transcript|subagents)[\s\S]*progress/i);
    assert.match(cursorReference, /Cursor App[\s\S]*same[\s\S]*(?:agent handle|agent id)[\s\S]*terminal/i);
    assert.match(skill, /do not use.*--worktree|never use.*--worktree/is);
    assert.match(skill, /execution-start.*finish-start.*before the first reservation/is);
    assert.match(skill, /schema v2/);
    assert.match(skill, /byte-identical/);
    assert.match(skill, /one formal commit per child/i);
    assert.match(skill, /no package commit/i);
    assert.match(skill, /blocked.*interrupted.*preserve/is);
    assert.match(resolver, /Manual And Experimental Skills[\s\S]*parallel-subagent-exec/);
    assert.doesNotMatch(planSkill, /\$parallel-subagent-exec docs\/loopx\/plans/);
  });

  it('documents parallel-subagent-exec as an explicit execution profile', async () => {
    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
    const skills = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');
    const installation = await readFile(join(repoRoot, 'docs', 'loopx', 'specs', 'installation.md'), 'utf8');

    for (const text of [readme, skills]) {
      assert.match(text, /Execution Profiles/);
      assert.match(text, /parallel-subagent-exec/);
      assert.match(text, /mandatory review.*integration|review clean.*integration/is);
      assert.match(text, /final-review` \| `review/);
    }
    for (const text of [readmeZh, skillsZh]) {
      assert.match(text, /Execution Profiles/);
      assert.match(text, /parallel-subagent-exec/);
      assert.match(text, /review clean.*集成|review clean 后才集成/is);
      assert.match(text, /final-review` \| `review/);
    }
    assert.match(installation, /explicit execution profiles/i);
    assert.match(installation, /owned by `exec`/i);
    assert.match(installation, /None participates in automatic routing/i);
    assert.match(installation, /~\/\.agents\/skills\/\{[^\n}]*parallel-subagent-exec/);
    assert.match(installation, /~\/\.claude\/skills\/\{[^\n}]*parallel-subagent-exec/);
  });
});
