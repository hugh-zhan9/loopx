# Clarify Intake Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-29-clarify-intake-package/需求设计文档.md`

**Goal:** Change new `clarify` workflows from a single intake markdown artifact to a directory-style intake package with `clarification.md`, `requirements.md`, and `test-cases.md`, while preserving old single-file read compatibility.

**Architecture:** Keep loopx skill-first: the CLI/runtime creates and displays the intake package, while skills define how agents fill and consume it. Runtime state gains package and child-artifact paths; `spec_artifact_path` remains as a compatibility alias to `requirements.md`. `spec` and `plan-to-exec` accept intake package directories and must read `requirements.md` plus `test-cases.md`.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, Markdown skill artifacts, existing `scripts/verify-skills.mjs`.

**Support lenses:** `cli-developer`, `architecture-designer`

## Global Constraints

- Preserve public CLI command signatures: `loopx clarify <slug> [--standard|--deep] [--json]`, `loopx status [slug] [--json]`, and `loopx next <slug> [--json]`.
- Complete runtime payloads still require explicit `--json`.
- New workflow intake output must be `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`, `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`, and `.loopx/intake/YYYY-MM-DD-<slug>/test-cases.md`.
- Do not migrate, rewrite, or delete historical `.loopx/intake/clarify-*.md` artifacts.
- Keep old single-file clarify source readable by `spec` and `plan-to-exec`.
- Keep `spec_artifact_path` in runtime state for compatibility, but set it to `requirements_path` for new workflows.
- Do not add a new `acceptance-testcase-generator` skill in this implementation.
- `test-cases.md` is a black-box acceptance/integration scenario document, not a unit test design document.
- Changing bundled skill behavior requires bumping only the changed skill `metadata.version` values.
- If bundled skill files change, run `node scripts/verify-skills.mjs`.

---

## Surface Inventory

- Public commands/API/routes/events/config:
  - `loopx clarify <slug> [--standard|--deep] [--json]`
  - `loopx status [slug] [--json]`
  - `loopx next <slug> [--json]`
  - Hook advisory scripts: `scripts/codex-workflow-hook.mjs`, `scripts/claude-workflow-hook.mjs`
- Exported functions/types/modules:
  - `clarifyStage`, `statusSummary`, `readState`, `resolveWorkflowRoot`, `resolveWorkspaceRoot` from `src/workflow.mjs`
  - `nextSkillCommand`, `nextSkillHint`, `withNextSkill` from `src/next-skill.mjs`
- Runtime/generated artifacts and templates:
  - `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`
  - `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`
  - `.loopx/intake/YYYY-MM-DD-<slug>/test-cases.md`
  - `.loopx/workflows/<slug>/state.json`
  - Existing `.loopx/workflows/<slug>/spec.md` status-summary artifact remains for compatibility unless this plan explicitly changes it.
  - Existing `.loopx/intake/clarify-*.md` artifacts remain readable historical artifacts.
- Installer/package/deployment surface:
  - `package.json.files` must include any new runtime templates explicitly and must not include broad `templates/`.
  - Normal and plugin installs consume canonical package-root `skills/`.
- Hooks/background jobs/automation:
  - Codex/Claude workflow hooks currently print `spec artifact: ...`; update to print intake package and child artifacts while preserving old fallback.
- Current product docs:
  - `README.md`
  - `README.zh-CN.md`
  - `docs/loopx/skills.md`
  - `docs/loopx/skills.zh-CN.md`
  - `docs/loopx/cli.md`
  - `docs/loopx/cli.zh-CN.md`
  - `docs/loopx/specs/installation.md`
  - `docs/loopx/design/loopx-skill-suite-v1-design.md`
- Tests/governance checks:
  - `test/workflow.test.mjs`
  - `test/trellis-hardening.test.mjs`
  - `test/skill-governance.test.mjs`
  - `node scripts/verify-skills.mjs`
- Compatibility/migration paths:
  - New workflows write intake package directories.
  - Old `.loopx/intake/clarify-*.md` paths stay valid source documents for skills.
  - `spec_artifact_path` remains in state and JSON output.

Caller proof commands to run before implementation:

```bash
rg "spec_artifact_path|clarify-<slug>-YYYY-MM-DD|intake/clarify|spec artifact|\\$plan-to-exec \\$?\\{?state\\.slug|\\$plan-to-exec [a-z-]+\" src scripts test skills docs README.md README.zh-CN.md package.json
```

Expected retained caller classes:

- `spec_artifact_path` remains as a compatibility field in runtime state and tests.
- Historical docs and old plans may reference `.loopx/intake/clarify-*.md`; do not edit historical plans.
- Current product docs, skills, hooks, and tests must describe new intake package output after this change.

Negative assertions after implementation:

```bash
! rg "\\.loopx/intake/clarify-<slug>-YYYY-MM-DD\\.md" skills docs/loopx README.md README.zh-CN.md
! rg "spec artifact:" scripts test/trellis-hardening.test.mjs docs/loopx README.md README.zh-CN.md
```

Expected: no matches in current product docs/scripts/tests. Historical `docs/loopx/design/*` and `docs/loopx/plans/*` may still mention old one-off intake files and should not be included in the strict command above except where they are current product docs.

## File Structure

- Modify `src/workflow.mjs`
  - Owns intake package path generation, file creation, state fields, status artifacts, and workspace README text.
- Modify `src/next-skill.mjs`
  - Owns skill handoff command selection; should prefer `intake_package_path` over slug for clarify-ready workflows.
- Modify `src/cli.mjs`
  - Owns human output for `clarify`, `status`, and `next`.
- Modify `scripts/codex-workflow-hook.mjs` and `scripts/claude-workflow-hook.mjs`
  - Own advisory output; should print intake package fields and keep old fallback.
- Modify `src/html-views.mjs`
  - Owns rendered intake view. It should render the three package artifacts when present and fall back to old spec artifact.
- Create exact runtime templates:
  - `templates/intake-clarification.md`
  - `templates/intake-requirements.md`
  - `templates/intake-test-cases.md`
- Modify `package.json`
  - Include new templates explicitly.
- Modify bundled skill docs:
  - `skills/clarify/SKILL.md`
  - `skills/spec/SKILL.md`
  - `skills/plan-to-exec/SKILL.md`
  - `skills/RESOLVER.md`
- Modify product docs:
  - `README.md`
  - `README.zh-CN.md`
  - `docs/loopx/skills.md`
  - `docs/loopx/skills.zh-CN.md`
  - `docs/loopx/cli.md`
  - `docs/loopx/cli.zh-CN.md`
  - `docs/loopx/specs/installation.md`
  - `docs/loopx/design/loopx-skill-suite-v1-design.md`
- Modify tests:
  - `test/workflow.test.mjs`
  - `test/trellis-hardening.test.mjs`
  - `test/skill-governance.test.mjs`

## Source Anchors

| Anchor | Requirement |
|---|---|
| AC-001 | New `clarify` workflows create `.loopx/intake/YYYY-MM-DD-<slug>/` with `clarification.md`, `requirements.md`, and `test-cases.md`. |
| AC-002 | `requirements.md` and `test-cases.md` share `AC-*` anchors; `test-cases.md` uses `TC-*` scenarios that reference `AC-*`. |
| AC-003 | `spec` and `plan-to-exec` accept an intake package directory and must read `requirements.md` and `test-cases.md`. |
| AC-004 | Runtime state exposes `intake_package_path`, `clarification_path`, `requirements_path`, `test_cases_path`, and retains `spec_artifact_path` pointing to `requirements.md`. |
| AC-005 | `loopx clarify/status/next` human and JSON output expose the intake package without changing command signatures. |
| AC-006 | Existing `.loopx/intake/clarify-*.md` files remain readable by skills and are not migrated. |
| AC-007 | No `acceptance-testcase-generator` skill is added in this implementation. |
| TC-001 | Create a new clarify workflow and assert all package files exist and state fields point at them. |
| TC-002 | Mark clarify ready and assert `nextSkillCommand`, `withNextSkill`, CLI `next`, and hooks use the intake package path. |
| TC-003 | Run status in human and JSON modes and assert intake, requirements, and test cases paths appear. |
| TC-004 | Run skill governance tests and assert updated skill contracts mention intake package, required child files, and old single-file compatibility. |

## Task 1: Add Runtime Templates And Clarify Package Creation Tests

**Files:**
- Create: `templates/intake-clarification.md`
- Create: `templates/intake-requirements.md`
- Create: `templates/intake-test-cases.md`
- Modify: `package.json`
- Modify: `test/workflow.test.mjs`
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: current `clarifyStage(cwd, slug, { profile })`.
- Produces: failing tests for new state fields and package files.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Add failing workflow test for intake package creation**

In `test/workflow.test.mjs`, update the existing test named `clarify creates a spec artifact and deep mode state` to the new behavior. Replace that test with:

```js
  it('clarify creates an intake package and deep mode state', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-clarify-'));
    const result = await clarifyStage(wd, 'deep-flow', { profile: 'deep' });

    assert.equal(result.state.clarify_profile, 'deep');
    assert.equal(result.state.clarify_max_rounds, 25);
    assert.equal(existsSync(join(result.root, 'spec.md')), true);

    assert.match(result.state.intake_package_path, /\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-deep-flow(?:-\d{6})?$/);
    assert.equal(existsSync(result.state.intake_package_path), true);
    assert.equal(result.state.clarification_path, join(result.state.intake_package_path, 'clarification.md'));
    assert.equal(result.state.requirements_path, join(result.state.intake_package_path, 'requirements.md'));
    assert.equal(result.state.test_cases_path, join(result.state.intake_package_path, 'test-cases.md'));
    assert.equal(result.state.spec_artifact_path, result.state.requirements_path);
    assert.equal(existsSync(result.state.clarification_path), true);
    assert.equal(existsSync(result.state.requirements_path), true);
    assert.equal(existsSync(result.state.test_cases_path), true);

    const requirements = await readFile(result.state.requirements_path, 'utf8');
    const testCases = await readFile(result.state.test_cases_path, 'utf8');
    assert.match(requirements, /## Acceptance Criteria/);
    assert.match(requirements, /### AC-001/);
    assert.match(testCases, /## Coverage Summary/);
    assert.match(testCases, /### TC-001/);
    assert.match(testCases, /Source AC: AC-001/);
  });
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
node --test --test-name-pattern "clarify creates an intake package" test/workflow.test.mjs
```

Expected: FAIL because `intake_package_path`, `requirements_path`, and the new package files do not exist.

- [ ] **Step 3: Add exact intake templates**

Create `templates/intake-clarification.md`:

```markdown
---
schema_version: 1
workflow_id: <workflow id>
stage: clarify
profile: <profile>
target_ambiguity_threshold: <target ambiguity threshold>
max_rounds: <max rounds>
current_round: 0
ambiguity_score: 1
non_goals_resolved: false
decision_boundaries_resolved: false
pressure_pass_complete: false
approval_status: requested
unresolved_ambiguity_count: 1
---

# Clarification Log: <task name>

## Source Inputs

- [PENDING] Record the user's original request, PRD, issue, or external source document.

## Q&A Rounds

- A-1 | open | What specific task should loopx execute in this workflow?

## User Wording

- [PENDING] Quote exact user wording when it captures a decision.

## Assumptions Challenged

- [PENDING] Record assumptions surfaced during clarification and how each was resolved.

## Rejected Alternatives

- [PENDING] Record alternatives explicitly rejected by the user.

## Brownfield Evidence

- [PENDING] Separate observed repo evidence from inference.

## Resume State

- current_round: 0
- unresolved_count: 1
- next_question: What specific task should loopx execute in this workflow?
```

Create `templates/intake-requirements.md`:

```markdown
# Requirements: <task name>

## Source Facts

- [PENDING] Record facts from user wording, PRDs, issues, repo evidence, or external documents. Do not mix in agent interpretation.

## Intent And Outcome

- [PENDING] Capture why this work matters and the end state the user wants.

## Scope

- [PENDING] Record the work that belongs in this loopx run.

## Non-goals

- [PENDING] Record what must stay out of scope.

## Decisions

- [PENDING] Record confirmed product, behavior, data, API, compatibility, rollout, or ownership decisions.

## Constraints

- [PENDING] Record technical, business, sequencing, platform, and verification constraints.

## Acceptance Criteria

### AC-001

WHEN the requirement is clarified
THEN this criterion must be rewritten into observable behavior
AND the evidence target must be named before handoff

Evidence target: manual
Risk: medium
Status: pending

## Open Questions

- [PENDING] What concrete task should loopx execute in this workflow?

## Handoff Recommendation

- handoff: blocked
- reason: material requirements remain unresolved
```

Create `templates/intake-test-cases.md`:

```markdown
# Test Cases: <task name>

## Coverage Summary

| AC | Test Cases | Coverage | Notes |
|---|---|---|---|
| AC-001 | TC-001 | pending | Replace with confirmed black-box acceptance or integration scenario before handoff. |

## Cases

### TC-001

Source AC: AC-001
Type: manual
Priority: P1
Preconditions:
- Requirement is clarified enough to describe external behavior.

Steps:
1. Execute the user-visible or system-visible behavior described by AC-001.

Expected:
- The observable result matches AC-001.

Automation target: manual until a concrete test layer is confirmed
Notes:
- This file records requirement-stage black-box acceptance or integration scenarios, not internal unit test implementation details.
```

- [ ] **Step 4: Update package file whitelist for new templates**

In `package.json`, add the new templates next to `templates/spec.md`:

```json
    "templates/spec.md",
    "templates/intake-clarification.md",
    "templates/intake-requirements.md",
    "templates/intake-test-cases.md",
```

Keep the existing broad-template guard intact; do not add `templates/`.

- [ ] **Step 5: Add governance assertions for exact template package entries**

In `test/skill-governance.test.mjs`, in the package-files governance test that currently asserts `templates/spec.md`, add:

```js
    assert.equal(packageJson.files.includes('templates/intake-clarification.md'), true, 'npm package must include clarify intake clarification template');
    assert.equal(packageJson.files.includes('templates/intake-requirements.md'), true, 'npm package must include clarify intake requirements template');
    assert.equal(packageJson.files.includes('templates/intake-test-cases.md'), true, 'npm package must include clarify intake test cases template');
```

- [ ] **Step 6: Run tests and confirm template/package assertions still fail only on runtime behavior**

Run:

```bash
node --test --test-name-pattern "clarify creates an intake package|package files" test/workflow.test.mjs test/skill-governance.test.mjs
```

Expected: package-file governance passes after `package.json` is updated; workflow intake package test still fails until runtime changes are implemented.

- [ ] **Step 7: Commit**

```bash
git add templates/intake-clarification.md templates/intake-requirements.md templates/intake-test-cases.md package.json test/workflow.test.mjs test/skill-governance.test.mjs
git commit -m "test: define clarify intake package templates"
```

## Task 2: Implement Intake Package Runtime State And Status Artifacts

**Files:**
- Modify: `src/workflow.mjs`
- Modify: `src/html-views.mjs`
- Modify: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: new templates from Task 1.
- Produces: runtime state fields and `statusSummary` artifact metadata for intake packages.

**Support lenses:** `cli-developer`, `architecture-designer`

- [ ] **Step 1: Add path helpers in `src/workflow.mjs`**

After `resolveIntakeRoot`, replace `canonicalClarifySpecPath` with helpers:

```js
function intakeDateStamp() {
  return nowIso().slice(0, 10);
}

function intakeTimeSuffix() {
  return nowIso().slice(11, 19).replaceAll(':', '');
}

function intakePackageName(slug, suffix = null) {
  const base = `${intakeDateStamp()}-${normalizeSlug(slug)}`;
  return suffix ? `${base}-${suffix}` : base;
}

function intakePackagePath(cwd, slug, suffix = null) {
  return join(resolveIntakeRoot(cwd), intakePackageName(slug, suffix));
}

function intakeChildPaths(packagePath) {
  return {
    clarification_path: join(packagePath, 'clarification.md'),
    requirements_path: join(packagePath, 'requirements.md'),
    test_cases_path: join(packagePath, 'test-cases.md'),
  };
}

function legacyClarifySpecPath(cwd, slug, stamp) {
  return join(resolveIntakeRoot(cwd), `clarify-${normalizeSlug(slug)}-${stamp}.md`);
}
```

Keep `nowStamp()` because existing code may still use it for compatibility or future suffixes.

- [ ] **Step 2: Add a generic template writer**

Replace `writeTemplateArtifact` with two helpers or extend it. Use this exact shape:

```js
async function renderTemplate(name, replacements) {
  const templatePath = resolve(MODULE_DIR, '..', 'templates', name);
  let text = await readFile(templatePath, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    text = text.replaceAll(`<${key}>`, String(value));
  }
  return text;
}

async function writeTemplateArtifact(root, name, replacements) {
  await writeText(join(root, name), await renderTemplate(name, replacements));
}

async function writeTemplateToPath(target, templateName, replacements) {
  await writeText(target, await renderTemplate(templateName, replacements));
}
```

- [ ] **Step 3: Add unique package creation helper**

Add this helper near the intake path helpers:

```js
async function createIntakePackage(cwd, slug, replacements) {
  let packagePath = intakePackagePath(cwd, slug);
  if (existsSync(packagePath)) {
    packagePath = intakePackagePath(cwd, slug, intakeTimeSuffix());
  }
  let counter = 2;
  while (existsSync(packagePath)) {
    packagePath = intakePackagePath(cwd, slug, `${intakeTimeSuffix()}-${counter}`);
    counter += 1;
  }

  await ensureDir(packagePath);
  const childPaths = intakeChildPaths(packagePath);
  await writeTemplateToPath(childPaths.clarification_path, 'intake-clarification.md', replacements);
  await writeTemplateToPath(childPaths.requirements_path, 'intake-requirements.md', replacements);
  await writeTemplateToPath(childPaths.test_cases_path, 'intake-test-cases.md', replacements);

  return {
    intake_package_path: packagePath,
    ...childPaths,
  };
}
```

- [ ] **Step 4: Update workspace README generated by `buildWorkspaceReadme`**

Replace the old retained runtime line:

```js
    '- `intake/clarify-*.md` clarify snapshots',
```

with:

```js
    '- `intake/YYYY-MM-DD-<slug>/` clarify intake packages (`clarification.md`, `requirements.md`, `test-cases.md`)',
    '- historical `intake/clarify-*.md` clarify snapshots may exist from older loopx versions',
```

- [ ] **Step 5: Update `createInitialState` fields**

In `createInitialState`, replace:

```js
    spec_artifact_path: null,
```

with:

```js
    intake_package_path: null,
    clarification_path: null,
    requirements_path: null,
    test_cases_path: null,
    spec_artifact_path: null,
```

- [ ] **Step 6: Update `clarifyStage` to create package files**

Inside `clarifyStage`, keep writing `root/spec.md` for current status frontmatter compatibility, but remove copying it into `.loopx/intake/clarify-*.md` for new workflows.

Replace:

```js
  const specArtifactPath = canonicalClarifySpecPath(cwd, normalized, stamp);
  await copyArtifact(root, specArtifactPath, 'spec.md');
```

with:

```js
  const replacements = {
    'task name': normalized,
    'workflow id': normalized,
    profile: clarifyProfile,
    'target ambiguity threshold': CLARIFY_PROFILES[clarifyProfile].threshold,
    'max rounds': CLARIFY_PROFILES[clarifyProfile].maxRounds,
  };
  const intakePackage = await createIntakePackage(cwd, normalized, replacements);
```

Then update the state object:

```js
    intake_package_path: intakePackage.intake_package_path,
    clarification_path: intakePackage.clarification_path,
    requirements_path: intakePackage.requirements_path,
    test_cases_path: intakePackage.test_cases_path,
    spec_artifact_path: intakePackage.requirements_path,
```

The earlier `writeTemplateArtifact(root, 'spec.md', ...)` can reuse `replacements` to avoid duplicate literal objects:

```js
  const replacements = {
    'task name': normalized,
    'workflow id': normalized,
    profile: clarifyProfile,
    'target ambiguity threshold': CLARIFY_PROFILES[clarifyProfile].threshold,
    'max rounds': CLARIFY_PROFILES[clarifyProfile].maxRounds,
  };
  if (!existsSync(join(root, 'spec.md'))) {
    await writeTemplateArtifact(root, 'spec.md', replacements);
  }
```

Ensure `stamp` is removed if unused.

- [ ] **Step 7: Expand artifact status reporting**

Replace `workflowArtifactStatus` with:

```js
function workflowArtifactStatus(root, state) {
  const specPath = state?.spec_artifact_path || join(root, 'spec.md');
  const intakePackagePath = state?.intake_package_path || null;
  const clarificationPath = state?.clarification_path || null;
  const requirementsPath = state?.requirements_path || specPath;
  const testCasesPath = state?.test_cases_path || null;
  return {
    'spec.md': existsSync(join(root, 'spec.md')),
    intake_package_path: intakePackagePath,
    intake_package_exists: intakePackagePath ? existsSync(intakePackagePath) : false,
    clarification_path: clarificationPath,
    clarification_exists: clarificationPath ? existsSync(clarificationPath) : false,
    requirements_path: requirementsPath,
    requirements_exists: requirementsPath ? existsSync(requirementsPath) : false,
    test_cases_path: testCasesPath,
    test_cases_exists: testCasesPath ? existsSync(testCasesPath) : false,
    spec_artifact_path: specPath,
    spec_artifact_exists: existsSync(specPath),
  };
}
```

Then update missing artifact calculation in `statusSummary` so it catches the new `*_exists` fields:

```js
  const missing = Object.entries(artifacts)
    .filter(([key, present]) => key.endsWith('_exists') && present === false)
    .map(([name]) => name.replace(/_exists$/, ''));
```

- [ ] **Step 8: Expose relative package paths in `statusSummary`**

In the object returned by `statusSummary(cwd, slug)`, add:

```js
    intake_package_path: statusState?.intake_package_path ? relativeOrAbsolute(cwd, statusState.intake_package_path) : null,
    clarification_path: statusState?.clarification_path ? relativeOrAbsolute(cwd, statusState.clarification_path) : null,
    requirements_path: statusState?.requirements_path ? relativeOrAbsolute(cwd, statusState.requirements_path) : null,
    test_cases_path: statusState?.test_cases_path ? relativeOrAbsolute(cwd, statusState.test_cases_path) : null,
```

Keep existing `spec_artifact_path`.

- [ ] **Step 9: Update `src/html-views.mjs` to render intake package children**

Replace `WORKFLOW_ARTIFACTS` with:

```js
const WORKFLOW_ARTIFACTS = [
  { id: 'clarification', stateKey: 'clarification_path', name: 'clarification.md', label: '澄清记录', page: 'intake.html' },
  { id: 'requirements', stateKey: 'requirements_path', name: 'requirements.md', label: '需求契约', page: 'intake.html' },
  { id: 'test-cases', stateKey: 'test_cases_path', name: 'test-cases.md', label: '验收测试场景', page: 'intake.html' },
  { id: 'spec', name: 'spec.md', label: '需求工作副本', page: 'intake.html', legacy: true },
];
```

Replace `PAGE_GROUPS` with:

```js
const PAGE_GROUPS = [
  { file: 'intake.html', title: '需求澄清', artifacts: ['clarification', 'requirements', 'test-cases', 'spec'] },
];
```

Update `resolveArtifactPath` so state keys win:

```js
  if (artifact.stateKey) {
    const candidate = state?.[artifact.stateKey] || null;
    if (candidate) {
      return isAbsolute(candidate) ? candidate : resolve(dirname(dirname(root)), candidate);
    }
  }
```

Leave the existing `artifact.id === 'spec'` fallback in place for old workflows.

- [ ] **Step 10: Run runtime tests and confirm Task 1 now passes**

Run:

```bash
node --test --test-name-pattern "clarify creates an intake package" test/workflow.test.mjs
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/workflow.mjs src/html-views.mjs test/workflow.test.mjs
git commit -m "feat: create clarify intake packages"
```

## Task 3: Route Next-Skill Handoffs Through Intake Package Paths

**Files:**
- Modify: `src/next-skill.mjs`
- Modify: `src/cli.mjs`
- Modify: `scripts/codex-workflow-hook.mjs`
- Modify: `scripts/claude-workflow-hook.mjs`
- Modify: `test/workflow.test.mjs`
- Modify: `test/trellis-hardening.test.mjs`

**Interfaces:**
- Consumes: state fields from Task 2.
- Produces: `$plan-to-exec <intake_package_path>` handoff when clarify is ready.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Update ready-flow test expectations first**

In `test/workflow.test.mjs`, update `status and next recommend plan-to-exec when clarify is handoff-ready`.

After `const status = await statusSummary(wd, 'ready-flow');`, add:

```js
    const expectedPlanCommand = `$plan-to-exec ${status.state.intake_package_path}`;
```

Replace expected command assertions:

```js
    assert.equal(status.state.next_skill_command, expectedPlanCommand);
    assert.equal(status.next_skill_command, expectedPlanCommand);
```

Update payload assertion:

```js
    assert.deepEqual(payload, {
      ok: true,
      next_skill_command: expectedPlanCommand,
      next_skill_hint: `Next skill: ${expectedPlanCommand}`,
    });
```

Update CLI assertion:

```js
    assert.match(stdout, new RegExp(`^next skill: \\$plan-to-exec ${status.state.intake_package_path.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'));
```

If escaping inside a template literal is too hard to read, add this helper near the top of `test/workflow.test.mjs`:

```js
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

Then use:

```js
    assert.match(stdout, new RegExp(`^next skill: \\$plan-to-exec ${escapeRegExp(status.state.intake_package_path)}$`, 'm'));
```

- [ ] **Step 2: Update hook hardening test expectations**

In `test/trellis-hardening.test.mjs`, replace:

```js
      assert.match(stdout, /next skill: \$plan-to-exec hook-flow/);
      assert.match(stdout, /spec artifact:/);
```

with:

```js
      assert.match(stdout, /next skill: \$plan-to-exec .*\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-hook-flow/);
      assert.match(stdout, /intake package:/);
      assert.match(stdout, /requirements:/);
      assert.match(stdout, /test cases:/);
      assert.doesNotMatch(stdout, /spec artifact:/);
```

- [ ] **Step 3: Run focused tests and confirm they fail**

Run:

```bash
node --test --test-name-pattern "status and next recommend|workflow hooks recommend" test/workflow.test.mjs test/trellis-hardening.test.mjs
```

Expected: FAIL because `nextSkillCommand` and hooks still use slug/spec artifact output.

- [ ] **Step 4: Update `src/next-skill.mjs`**

Add helper:

```js
function clarifyHandoffArg(state) {
  return state.intake_package_path || state.requirements_path || state.spec_artifact_path || state.slug;
}
```

Replace the clarify-ready branch:

```js
    return `$plan-to-exec ${state.slug}`;
```

with:

```js
    return `$plan-to-exec ${clarifyHandoffArg(state)}`;
```

Leave review rollback branches using `state.slug` because they route existing workflows back to planning/clarification context, not new intake package creation.

- [ ] **Step 5: Update `src/cli.mjs` human clarify output**

In `printHumanClarify`, replace:

```js
  console.log(`intake: ${displayPathFromCwd(state.spec_artifact_path)}`);
```

with:

```js
  console.log(`intake: ${displayPathFromCwd(state.intake_package_path || state.spec_artifact_path)}`);
  if (state.requirements_path) {
    console.log(`requirements: ${displayPathFromCwd(state.requirements_path)}`);
  }
  if (state.test_cases_path) {
    console.log(`test cases: ${displayPathFromCwd(state.test_cases_path)}`);
  }
```

Update `humanNextAction` clarify branch:

```js
    if (nextSkillCommand(state)?.startsWith('$plan-to-exec ')) {
      return `Follow ${nextSkillCommand(state)}.`;
    }
```

Do not print a separate legacy `$plan-to-exec ${state.slug}` hint for new package-ready states.

- [ ] **Step 6: Update hooks to prefer intake package paths**

In both `scripts/codex-workflow-hook.mjs` and `scripts/claude-workflow-hook.mjs`, add:

```js
function clarifyHandoffArg(state) {
  return state.intake_package_path || state.requirements_path || state.spec_artifact_path || state.slug;
}
```

Replace clarify-ready next skill:

```js
    return `$plan-to-exec ${state.slug}`;
```

with:

```js
    return `$plan-to-exec ${clarifyHandoffArg(state)}`;
```

Replace advisory lines that print `spec artifact` with:

```js
        stateLine('intake package', state.intake_package_path || 'none'),
        stateLine('requirements', state.requirements_path || state.spec_artifact_path || join(runtimeRoot, 'workflows', workflow, 'spec.md')),
        stateLine('test cases', state.test_cases_path || 'none'),
```

For `scripts/claude-workflow-hook.mjs`, use string interpolation equivalent:

```js
    `intake package: ${state.intake_package_path || 'none'}`,
    `requirements: ${state.requirements_path || state.spec_artifact_path || join(runtimeRoot, 'workflows', workflow, 'spec.md')}`,
    `test cases: ${state.test_cases_path || 'none'}`,
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test --test-name-pattern "status and next recommend|workflow hooks recommend" test/workflow.test.mjs test/trellis-hardening.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/next-skill.mjs src/cli.mjs scripts/codex-workflow-hook.mjs scripts/claude-workflow-hook.mjs test/workflow.test.mjs test/trellis-hardening.test.mjs
git commit -m "feat: route clarify handoff through intake package"
```

## Task 4: Update Skill Contracts And Product Docs

**Files:**
- Modify: `skills/clarify/SKILL.md`
- Modify: `skills/spec/SKILL.md`
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/RESOLVER.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`
- Modify: `docs/loopx/cli.md`
- Modify: `docs/loopx/cli.zh-CN.md`
- Modify: `docs/loopx/specs/installation.md`
- Modify: `docs/loopx/design/loopx-skill-suite-v1-design.md`
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: runtime behavior from Tasks 2-3.
- Produces: governed skill/documentation contract for intake package directories.

**Support lenses:** `cli-developer`, `architecture-designer`

- [ ] **Step 1: Update governance assertions first**

In `test/skill-governance.test.mjs`, update `governs clarify skill as incremental requirements intake`:

Replace:

```js
    assert.match(clarifySkill, /\.loopx\/intake\/clarify-<slug>-YYYY-MM-DD\.md/);
```

with:

```js
    assert.match(clarifySkill, /\.loopx\/intake\/YYYY-MM-DD-<slug>\//);
    assert.match(clarifySkill, /clarification\.md/);
    assert.match(clarifySkill, /requirements\.md/);
    assert.match(clarifySkill, /test-cases\.md/);
    assert.match(clarifySkill, /AC-\*/);
    assert.match(clarifySkill, /TC-\*/);
```

Also add:

```js
    assert.match(clarifySkill, /requirements\.md and test-cases\.md must share the same `AC-\*` anchors/);
    assert.match(clarifySkill, /black-box acceptance\/integration/i);
```

In the same file, add assertions to `spec requires boundary scenarios in proposal and detailed design`:

```js
    assert.match(specSkill, /intake package directory/);
    assert.match(specSkill, /requirements\.md/);
    assert.match(specSkill, /test-cases\.md/);
    assert.match(planToExecSkill, /intake package directory/);
    assert.match(planToExecSkill, /requirements\.md/);
    assert.match(planToExecSkill, /test-cases\.md/);
```

- [ ] **Step 2: Run governance subset and confirm it fails**

Run:

```bash
node --test --test-name-pattern "governs clarify skill|spec requires boundary" test/skill-governance.test.mjs
```

Expected: FAIL because skill contracts still mention old single-file output.

- [ ] **Step 3: Update `skills/clarify/SKILL.md`**

Change `metadata.version` from `0.3.8` to `0.3.9`.

Replace the `## Output` section with the new package contract. The section must include these exact rules:

```markdown
Write the clarify intake package **incrementally**. Start the package after the first meaningful answer is confirmed, and update the relevant files after every Q&A round. Do not wait until all questions are resolved.

Write to:

- `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`
- `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`
- `.loopx/intake/YYYY-MM-DD-<slug>/test-cases.md`
```

Add file responsibility bullets:

```markdown
`clarification.md` records the Q&A process, exact user wording, assumptions challenged, rejected alternatives, brownfield evidence, and `## Resume State`.

`requirements.md` records the confirmed requirement contract: source facts, intent, scope, non-goals, decisions, constraints, acceptance criteria, open questions, and handoff recommendation.

`test-cases.md` records requirement-stage black-box acceptance/integration scenarios. It is not a unit test implementation plan.
```

Add AC/TC rules:

```markdown
Acceptance criteria in `requirements.md` must use stable `AC-*` anchors. Prefer `WHEN / THEN / AND` wording, and do not hand off `direct_to_plan` when material ACs are not testable.

Test cases in `test-cases.md` must use stable `TC-*` anchors. Every `TC-*` must reference at least one `AC-*`. High-risk `AC-*` items need at least one boundary or failure case unless the package records a concrete manual/deferred rationale.

`requirements.md and test-cases.md must share the same `AC-*` anchors. If they conflict, keep the package blocked and continue clarification.
```

The last sentence above has nested backticks that make Markdown awkward. Use this exact valid Markdown instead:

```markdown
`requirements.md` and `test-cases.md` must share the same `AC-*` anchors. If they conflict, keep the package blocked and continue clarification.
```

Update handoff text:

```markdown
For `needs_spec`, hand off to the `spec` skill with the intake package directory as the source:

skill: spec
args: .loopx/intake/YYYY-MM-DD-<slug>/
Codex: $spec .loopx/intake/YYYY-MM-DD-<slug>/
...

For `direct_to_plan`, hand off to the `plan-to-exec` skill with the intake package directory as the source:

skill: plan-to-exec
args: .loopx/intake/YYYY-MM-DD-<slug>/
Codex: $plan-to-exec .loopx/intake/YYYY-MM-DD-<slug>/
...
```

Keep the existing agent-native handoff format section.

- [ ] **Step 4: Update `skills/spec/SKILL.md`**

Change `metadata.version` from `0.3.5` to `0.3.6`.

In Inputs, add intake package directory support:

```markdown
The source may be an intake package directory:

- `.loopx/intake/YYYY-MM-DD-<slug>/`

When the source is an intake package directory, read:

1. `requirements.md` as the requirement contract.
2. `test-cases.md` as requirement-stage acceptance/integration scenarios.
3. `clarification.md` only as process evidence and exact user wording.

If `requirements.md` and `test-cases.md` disagree about `AC-*`, stop and route back to `clarify`.
```

Update output/handoff guidance so detailed design references the intake package and says verification strategy must preserve `TC-*` coverage.

- [ ] **Step 5: Update `skills/plan-to-exec/SKILL.md`**

Change `metadata.version` from `0.3.5` to `0.3.6`.

In source list, replace old clarify-only bullet with:

```markdown
- `.loopx/intake/YYYY-MM-DD-<slug>/` intake package directories
- legacy `.loopx/intake/clarify-<slug>-YYYY-MM-DD.md` clarify bundles
```

Add:

```markdown
When the source is an intake package directory, read `requirements.md` and `test-cases.md` before planning. Use `clarification.md` only for process evidence, exact user wording, and unresolved-history context.
```

Update anchor coverage rules:

```markdown
The plan must preserve `AC-*` anchors from `requirements.md` and cover `TC-*` scenarios from `test-cases.md` through tasks, verification commands, or deferred-with-rationale rows.
```

Add self-review item:

```markdown
9. **Test-case coverage:** If the source includes `test-cases.md`, does each `TC-*` map to a task verification step, integration/e2e/API/CLI/manual check, or deferred-with-rationale row?
```

- [ ] **Step 6: Update `skills/RESOLVER.md`**

Update route references so approved intake packages can go to `spec` or `plan-to-exec`:

```markdown
| Approved intake package, requirements, or design need a bite-sized implementation plan | `skills/plan-to-exec/SKILL.md` |
```

Mention `.loopx/intake/YYYY-MM-DD-<slug>/` where the resolver discusses `clarify` handoff.

- [ ] **Step 7: Update README and skills docs**

In `README.md`, `README.zh-CN.md`, `docs/loopx/skills.md`, and `docs/loopx/skills.zh-CN.md`, update the `clarify` description to say it produces an intake package with:

- `clarification.md`
- `requirements.md`
- `test-cases.md`

In the examples, keep `$clarify <feature>` usage unchanged. Where the docs mention continuing to `$plan-to-exec`, clarify that handoff may point to an intake package directory or a detailed design doc.

- [ ] **Step 8: Update CLI docs and stable specs**

In `docs/loopx/cli.md` and `docs/loopx/cli.zh-CN.md`, add a short paragraph under command overview:

```markdown
New `clarify` workflows write a local intake package under `.loopx/intake/YYYY-MM-DD-<slug>/` with `clarification.md`, `requirements.md`, and `test-cases.md`. Human output shows concise paths; use `--json` for full state fields.
```

In `docs/loopx/specs/installation.md`, add a public CLI surface rule:

```markdown
- `loopx clarify` writes local runtime intake packages under `.loopx/intake/YYYY-MM-DD-<slug>/`; `loopx status --json` exposes package and child artifact paths while preserving `spec_artifact_path` for compatibility.
```

In `docs/loopx/design/loopx-skill-suite-v1-design.md`, update Artifacts:

```markdown
Clarify runtime intake packages live under `.loopx/intake/YYYY-MM-DD-<slug>/` and contain `clarification.md`, `requirements.md`, and `test-cases.md`. Older `.loopx/intake/clarify-*.md` files are historical runtime artifacts.
```

- [ ] **Step 9: Run governance tests**

Run:

```bash
node --test --test-name-pattern "governs clarify skill|spec requires boundary|package files" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add skills/clarify/SKILL.md skills/spec/SKILL.md skills/plan-to-exec/SKILL.md skills/RESOLVER.md README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs/installation.md docs/loopx/design/loopx-skill-suite-v1-design.md test/skill-governance.test.mjs
git commit -m "docs: define clarify intake package contract"
```

## Task 5: Complete Runtime Status, Rendering, And Compatibility Tests

**Files:**
- Modify: `test/workflow.test.mjs`
- Modify: `test/trellis-hardening.test.mjs`
- Modify: `src/workflow.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/html-views.mjs`

**Interfaces:**
- Consumes: new runtime state fields and docs contract.
- Produces: final behavior coverage for human/JSON output, missing artifacts, old-state fallback, and rendered intake pages.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Add status JSON/human output tests**

In `test/workflow.test.mjs`, after the intake package creation test, add:

```js
  it('status exposes clarify intake package paths', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-status-intake-'));
    const clarified = await clarifyStage(wd, 'package-status');

    const status = await statusSummary(wd, 'package-status');
    assert.equal(status.intake_package_path, status.state.intake_package_path);
    assert.equal(status.requirements_path, status.state.requirements_path);
    assert.equal(status.test_cases_path, status.state.test_cases_path);
    assert.equal(status.spec_artifact_path, status.state.requirements_path);
    assert.equal(status.artifacts.intake_package_exists, true);
    assert.equal(status.artifacts.requirements_exists, true);
    assert.equal(status.artifacts.test_cases_exists, true);

    const { stdout } = await execFileAsync(process.execPath, [cliPath, 'clarify', 'package-status'], { cwd: wd });
    assert.match(stdout, /^intake: .*\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-package-status/m);
    assert.match(stdout, /^requirements: .*requirements\.md$/m);
    assert.match(stdout, /^test cases: .*test-cases\.md$/m);

    assert.equal(existsSync(clarified.state.requirements_path), true);
  });
```

Note: this runs `clarify` twice for the same slug. The assertion must still pass because repeated clarify creates a unique new package and updates state.

- [ ] **Step 2: Add unique directory collision test**

In `test/workflow.test.mjs`, add:

```js
  it('clarify does not overwrite an existing same-day intake package', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-intake-repeat-'));
    const first = await clarifyStage(wd, 'repeat-flow');
    const second = await clarifyStage(wd, 'repeat-flow');

    assert.notEqual(first.state.intake_package_path, second.state.intake_package_path);
    assert.equal(existsSync(first.state.requirements_path), true);
    assert.equal(existsSync(second.state.requirements_path), true);
  });
```

- [ ] **Step 3: Run tests and fix runtime/output misses**

Run:

```bash
node --test --test-name-pattern "intake package|status exposes|does not overwrite|status and next recommend|workflow hooks recommend" test/workflow.test.mjs test/trellis-hardening.test.mjs
```

Expected: PASS after completing Tasks 2-3. If human output path assertions fail because CLI displays relative paths, update assertions to accept either relative or absolute paths using `.*intake`.

- [ ] **Step 4: Update `humanMissingArtifactsText` behavior if needed**

If `statusSummary` now reports missing `intake_package`, `requirements`, or `test_cases`, make `humanMissingArtifactsText` print those names. Do not suppress them under clarify stage.

Keep:

```js
return missing.join(', ');
```

as the first branch.

- [ ] **Step 5: Update `html-views` rendering if tests or manual smoke reveal old-only behavior**

Run:

```bash
node src/cli.mjs init --slug render-intake --json
node src/cli.mjs render render-intake
```

Expected:

- CLI exits 0.
- `.loopx/workflows/render-intake/view/intake.html` exists.
- The page contains labels for `澄清记录`, `需求契约`, and `验收测试场景`.

If not, adjust `WORKFLOW_ARTIFACTS`, `PAGE_GROUPS`, or `resolveArtifactPath` according to Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/workflow.mjs src/cli.mjs src/html-views.mjs test/workflow.test.mjs test/trellis-hardening.test.mjs
git commit -m "test: cover clarify intake package status"
```

## Task 6: Final Governance, Verification, And Self-Review

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: completed implementation.
- Produces: verified plan-ready implementation branch.

**Support lenses:** `cli-developer`, `architecture-designer`

- [ ] **Step 1: Run caller proof command**

Run:

```bash
rg "spec_artifact_path|clarify-<slug>-YYYY-MM-DD|intake/clarify|spec artifact|\\$plan-to-exec \\$?\\{?state\\.slug|\\$plan-to-exec [a-z-]+\" src scripts test skills docs README.md README.zh-CN.md package.json
```

Expected:

- `spec_artifact_path` remains only as compatibility field in source/tests/docs where explicitly described.
- `.loopx/intake/clarify-*.md` remains only as legacy compatibility wording or historical design/plan references.
- No current product docs or scripts print `spec artifact:`.
- No clarify-ready handoff in current source still returns `$plan-to-exec ${state.slug}`.

- [ ] **Step 2: Run negative assertions**

Run:

```bash
! rg "\\.loopx/intake/clarify-<slug>-YYYY-MM-DD\\.md" skills docs/loopx README.md README.zh-CN.md
! rg "spec artifact:" scripts test/trellis-hardening.test.mjs docs/loopx README.md README.zh-CN.md
```

Expected: both commands exit 0.

- [ ] **Step 3: Run focused test suites**

Run:

```bash
node --test test/workflow.test.mjs
node --test test/trellis-hardening.test.mjs
node --test test/skill-governance.test.mjs
```

Expected: all pass.

- [ ] **Step 4: Run skill/package governance**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: exits 0.

- [ ] **Step 5: Run full repository test command**

Run:

```bash
npm test
```

Expected: exits 0.

- [ ] **Step 6: Self-review against source design**

Check:

- New workflow writes `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`.
- New workflow writes `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`.
- New workflow writes `.loopx/intake/YYYY-MM-DD-<slug>/test-cases.md`.
- `requirements.md` includes `AC-001`.
- `test-cases.md` includes `TC-001` and `Source AC: AC-001`.
- `spec_artifact_path` points to `requirements.md`.
- `nextSkillCommand` uses intake package path when clarify is ready.
- Hooks no longer print `spec artifact:`.
- `spec` and `plan-to-exec` skill docs require reading `requirements.md` and `test-cases.md`.
- No `acceptance-testcase-generator` skill was added.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: clarify intake package workflow"
```

If previous tasks already committed all changes, skip this commit and record that the working tree is clean.

## Self-Review

- **Spec coverage:** Tasks cover runtime package creation (AC-001), AC/TC templates (AC-002), downstream skill consumption (AC-003), state fields (AC-004), CLI/hook output (AC-005), old-format compatibility (AC-006), and no new generator skill (AC-007).
- **Placeholder scan:** The plan avoids `TODO` and `TBD`. Template files intentionally contain `[PENDING]` markers because the generated intake package must be incrementally filled by `clarify`.
- **Type consistency:** State fields are consistently named `intake_package_path`, `clarification_path`, `requirements_path`, `test_cases_path`, and `spec_artifact_path`.
- **Design drift:** The plan does not add a new skill, state machine, database, network call, or executable test generator.
- **Anchor coverage:** AC/TC coverage appears in Source Anchors and task verification steps.
- **Surface-change coverage:** Surface Inventory, Caller Proof, and Negative Assertions are included.
- **Support lens coverage:** `cli-developer` is applied to CLI/hook/JSON output. `architecture-designer` is applied to artifact boundaries and compatibility.
- **Subagent handoff readiness:** Each task lists exact files, interfaces, commands, and expected outcomes.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-29-clarify-intake-package.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?

If Subagent Exec is chosen:

- REQUIRED SUB-SKILL: Use `loopx:subagent-exec`
- Fresh subagent per task plus combined task review and final-review

If Inline Execution is chosen:

- REQUIRED SUB-SKILL: Use `loopx:exec`
- Batch execution with checkpoints for review
