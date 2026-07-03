# Simplify Clarify Intake Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-03-simplify-clarify-intake-artifacts/需求设计文档.md`

**Goal:** Make `requirements.md` the canonical clarify intake contract, keep `clarification.md` as supporting resume/process evidence, and remove standalone `test-cases.md` from current runtime, package, docs, and skill surfaces.

**Architecture:** This is a breaking workflow artifact contract change. Runtime intake packages continue to use `.loopx/intake/YYYY-MM-DD-<slug>/`, but new packages contain only `requirements.md` and `clarification.md`; `requirements.md` carries both `AC-*` and `TC-*`. Current CLI, hook, HTML, package, docs, tests, and skill contracts must stop exposing `test_cases_path`, `test cases:`, `test-cases.md`, and `templates/intake-test-cases.md`.

**Tech Stack:** Node.js ESM CLI, Markdown templates, bundled loopx skill markdown, Node `node:test`, package surface controlled by `package.json.files`.

**Support lenses:** `cli-developer`

## Global Constraints

- Use modern JavaScript ESM with `.mjs` files, two-space indentation, semicolons, single quotes, named helper functions, and async filesystem calls from `node:fs/promises`.
- Do not add runtime dependencies.
- Do not migrate historical `.loopx/`, `docs/loopx/design/`, or `docs/loopx/plans/` artifacts.
- This is an intentional breaking update. Do not add compatibility branches for old standalone `test-cases.md` intake packages.
- New `clarify` workflows create `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md` and `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md` only.
- `requirements.md` is the clarify intake package canonical contract and must include both `AC-*` acceptance criteria and `TC-*` acceptance scenarios.
- `clarification.md` remains supporting evidence and resume state only.
- `spec_artifact_path` continues to point to `requirements_path`.
- `plan-to-exec` stays detailed. For design document sources, it reads the design document; for intake package sources, it reads `requirements.md`.
- Preserve current user edits. At plan creation time, the worktree already contains local edits in `scripts/verify-skills.mjs`, `skills/clarify/SKILL.md`, `skills/spec/SKILL.md`, `test/skill-governance.test.mjs`, and the new design document. Do not revert those edits.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: Applied `plan-reviewer` rubric in this context after drafting. The plan maps AC-001 through AC-006, D-001 through D-008, and TC-001 through TC-006 to tasks and verification. Surface-change coverage includes runtime artifacts, templates, package files, CLI/hook/HTML output, current docs, skills, and governance tests.
- Recheck evidence: same-context recheck found no Critical or Important findings after adding explicit negative assertions and preserving the source-sensitive `plan-to-exec` rule for design document sources.
- Residual risk: source-to-plan coverage was not independently reviewed by a separate subagent because subagent delegation was not explicitly requested in this session.

---

## Surface Inventory

- Public commands/API/routes/events/config:
  - `loopx clarify <slug> [--standard|--deep] [--json]`
  - `loopx status [slug] [--json]`
  - `loopx init [--slug <slug>] [--json]`, because it can invoke `clarifyStage`
  - `loopx render [slug|--all]`, because `src/html-views.mjs` renders intake artifacts
- Exported functions/types/modules:
  - `clarifyStage(cwd, slug, options)` in `src/workflow.mjs`
  - `statusSummary(cwd, slug)` in `src/workflow.mjs`
  - `readState(cwd, slug)` state shape consumers in tests and hooks
  - `renderHtmlViews` indirectly via `src/html-views.mjs`
- Runtime/generated artifacts and templates:
  - `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`
  - `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`
  - `.loopx/workflows/<slug>/state.json`
  - `templates/intake-requirements.md`
  - `templates/intake-clarification.md`
  - deleted current template: `templates/intake-test-cases.md`
- Installer/package/deployment surface:
  - `package.json.files`
  - `scripts/verify-skills.mjs`
  - `npm pack --dry-run`
- Hooks/background jobs/automation:
  - `scripts/codex-workflow-hook.mjs`
  - `scripts/claude-workflow-hook.mjs`
- Current product docs:
  - `README.md`
  - `README.zh-CN.md`
  - `docs/loopx/cli.md`
  - `docs/loopx/cli.zh-CN.md`
  - `docs/loopx/skills.md`
  - `docs/loopx/skills.zh-CN.md`
  - `docs/loopx/specs/installation.md`
  - `docs/loopx/design/loopx-skill-suite-v1-design.md`
- Tests/governance checks:
  - `test/workflow.test.mjs`
  - `test/trellis-hardening.test.mjs`
  - `test/skill-governance.test.mjs`
  - `scripts/verify-skills.mjs`
- Compatibility/migration paths:
  - None. The source design explicitly rejects compatibility branches for standalone `test-cases.md`.

## Caller Proof Commands

Run these before editing to confirm current retained callers:

```bash
rg -n "test_cases_path|test cases:|test-cases\\.md|intake-test-cases\\.md|requirements\\.md.*test-cases|test-cases\\.md.*requirements\\.md" src scripts test package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md skills templates
```

Decision rule:

- Current runtime, hook, package, docs, skills, and tests references are active product surface and must be updated or deleted.
- Historical design and plan documents under `docs/loopx/design/YYYY-*` and `docs/loopx/plans/YYYY-*` may retain old references as historical context, except the new source design and this plan.
- No compatibility paths are retained.

## Negative Assertions

After implementation, these commands must pass:

```bash
test ! -e templates/intake-test-cases.md
! rg "test_cases_path|test cases:|test-cases\\.md|intake-test-cases\\.md" src scripts test package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md templates skills
! rg "requirements\\.md.*test-cases|test-cases\\.md.*requirements\\.md" skills README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md
node scripts/verify-skills.mjs
npm test
npm pack --dry-run
```

Historical docs may still contain old `test-cases.md` references:

```bash
rg -n "test-cases\\.md|test_cases_path|intake-test-cases\\.md" docs/loopx/design docs/loopx/plans
```

Expected: historical results may appear; do not treat them as current product surface unless they are in `docs/loopx/design/2026-07-03-simplify-clarify-intake-artifacts/需求设计文档.md`.

## Task Summary

| Task | Purpose | Source AC | Design anchors | Test cases |
|---|---|---|---|---|
| `T-001` | Runtime state, intake package creation, templates, package surface | `AC-001`, `AC-002`, `AC-005` | `D-001`, `D-002`, `D-004`, `D-006`, `D-007` | `TC-001`, `TC-002`, `TC-005` |
| `T-002` | CLI, hooks, HTML output surfaces | `AC-004` | `D-004`, `D-008` | `TC-004` |
| `T-003` | Skill contracts and current product docs | `AC-003`, `AC-006` | `D-001`, `D-003`, `D-005`, `D-006` | `TC-003`, `TC-006` |
| `T-004` | Governance tests, negative assertions, release verification | `AC-001` through `AC-006` | `D-001` through `D-008` | `TC-001` through `TC-006` |

### T-001 / Task 1: Runtime intake package and package surface

**Files:**
- Modify: `src/workflow.mjs`
- Modify: `templates/intake-requirements.md`
- Delete: `templates/intake-test-cases.md`
- Modify: `package.json`
- Test: `test/workflow.test.mjs`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes:
  - `clarifyStage(cwd, slug, { profile })`
  - `statusSummary(cwd, slug)`
  - `templates/intake-clarification.md`
  - `templates/intake-requirements.md`
- Produces:
  - `state.intake_package_path`
  - `state.clarification_path`
  - `state.requirements_path`
  - `state.spec_artifact_path = state.requirements_path`
  - No `state.test_cases_path`
  - `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`
  - `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`

**Traceability:**
- Source AC: `AC-001`, `AC-002`, `AC-005`
- Design anchors: `D-001`, `D-002`, `D-004`, `D-006`, `D-007`
- Test cases: `TC-001`, `TC-002`, `TC-005`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/workflow.test.mjs`
  - `node --test test/skill-governance.test.mjs`
  - `test ! -e templates/intake-test-cases.md`
  - `! rg "test_cases_path|test-cases\\.md|intake-test-cases\\.md" src/workflow.mjs templates package.json test/workflow.test.mjs test/skill-governance.test.mjs`
- `evidence_summary`: New clarify runtime creates exactly `requirements.md` and `clarification.md`; package files no longer publish `templates/intake-test-cases.md`; `spec_artifact_path` still points to `requirements_path`.
- `remaining_risk`: none

**Review focus:**
- Verify `T-001` removes standalone `test-cases.md` from runtime creation and package surface without removing `TC-*` traceability from `requirements.md`.
- Verify `spec_artifact_path` still points to `requirements_path`.
- Verify no compatibility branch for old `test_cases_path` was added.

**Support lenses:** none

- [ ] **Step 1: Update the runtime test expectations first**

  In `test/workflow.test.mjs`, edit `clarify creates an intake package and deep mode state` so it asserts there is no standalone test-cases artifact.

  Replace the current `test_cases_path` assertions and separate `testCases` read with:

  ```js
  assert.equal(Object.hasOwn(result.state, 'test_cases_path'), false);
  assert.equal(existsSync(join(result.state.intake_package_path, 'test-cases.md')), false);

  const requirements = await readFile(result.state.requirements_path, 'utf8');
  assert.match(requirements, /## Acceptance Criteria/);
  assert.match(requirements, /### AC-001/);
  assert.match(requirements, /## Acceptance Scenarios/);
  assert.match(requirements, /TC-001/);
  assert.match(requirements, /AC-001/);
  ```

  In `status exposes clarify intake package paths`, replace `test_cases_path` and `test_cases_exists` assertions with:

  ```js
  assert.equal(Object.hasOwn(status, 'test_cases_path'), false);
  assert.equal(Object.hasOwn(status.state, 'test_cases_path'), false);
  assert.equal(Object.hasOwn(status.artifacts, 'test_cases_path'), false);
  assert.equal(Object.hasOwn(status.artifacts, 'test_cases_exists'), false);
  ```

  In the CLI output assertion block for `loopx clarify package-status`, replace:

  ```js
  assert.match(stdout, /^test cases: .*test-cases\.md$/m);
  ```

  with:

  ```js
  assert.doesNotMatch(stdout, /^test cases:/m);
  ```

  In `status and next recommend plan-to-exec when clarify is handoff-ready`, replace the `test cases:` and JSON field assertions with:

  ```js
  assert.doesNotMatch(statusStdout, /^test cases:/m);
  assert.equal(Object.hasOwn(statusJson.state, 'test_cases_path'), false);
  assert.equal(Object.hasOwn(statusJson, 'test_cases_path'), false);
  ```

- [ ] **Step 2: Run the workflow test to confirm it fails for the old runtime**

  Run:

  ```bash
  node --test test/workflow.test.mjs
  ```

  Expected before implementation: FAIL with assertions showing `test_cases_path` exists, `test-cases.md` exists, or `Acceptance Scenarios` is missing from `requirements.md`.

- [ ] **Step 3: Update `src/workflow.mjs` runtime state and package creation**

  In `intakeChildPaths(packagePath)`, remove `test_cases_path` so it returns:

  ```js
  function intakeChildPaths(packagePath) {
    return {
      clarification_path: join(packagePath, 'clarification.md'),
      requirements_path: join(packagePath, 'requirements.md'),
    };
  }
  ```

  In `buildWorkspaceReadme()`, replace the intake package bullet with:

  ```js
    '- `intake/YYYY-MM-DD-<slug>/` clarify intake packages (`clarification.md`, `requirements.md`)',
  ```

  In `createInitialState(slug, profile)`, remove:

  ```js
    test_cases_path: null,
  ```

  In `createIntakePackage(cwd, slug, replacements)`, remove:

  ```js
  await writeTemplateToPath(childPaths.test_cases_path, 'intake-test-cases.md', replacements);
  ```

  In `workflowArtifactStatus(root, state)`, remove:

  ```js
  const testCasesPath = state?.test_cases_path || null;
  ```

  and remove the later `if (testCasesPath) { ... }` block that writes `artifacts.test_cases_path` and `artifacts.test_cases_exists`.

  In `clarifyStage(cwd, slug, options)`, remove:

  ```js
    test_cases_path: intakePackage.test_cases_path,
  ```

  In `statusSummary(cwd, slug)`, remove the returned top-level field:

  ```js
    test_cases_path: statusState?.test_cases_path ?? null,
  ```

- [ ] **Step 4: Move acceptance scenarios into `templates/intake-requirements.md`**

  Add this section immediately after the existing `## Acceptance Criteria` block and before `## Open Questions`:

  ```markdown
  ## Acceptance Scenarios

  | TC | Covers AC | Scenario | Verification | Status |
  |---|---|---|---|---|
  | TC-001 | AC-001 | Replace with a confirmed black-box acceptance or integration scenario before handoff. | manual until a concrete test layer is confirmed | pending |
  ```

  Keep the existing `AC-001` section. Do not create a second template for test cases.

- [ ] **Step 5: Delete standalone test-cases template and package entry**

  Delete `templates/intake-test-cases.md`.

  In `package.json`, remove:

  ```json
    "templates/intake-test-cases.md",
  ```

- [ ] **Step 6: Update package surface governance for deleted template**

  In `test/skill-governance.test.mjs`, in `keeps package files skill surface explicit and verifier packaged`, replace:

  ```js
  assert.equal(packageJson.files.includes('templates/intake-test-cases.md'), true, 'npm package must include clarify intake test cases template');
  ```

  with:

  ```js
  assert.equal(packageJson.files.includes('templates/intake-test-cases.md'), false, 'npm package must not include removed clarify intake test cases template');
  assert.equal(existsSync(join(repoRoot, 'templates', 'intake-test-cases.md')), false, 'removed clarify intake test cases template must be absent');
  ```

- [ ] **Step 7: Verify runtime and package-surface behavior**

  Run:

  ```bash
  node --test test/workflow.test.mjs
  node --test test/skill-governance.test.mjs
  test ! -e templates/intake-test-cases.md
  ! rg "test_cases_path|test-cases\\.md|intake-test-cases\\.md" src/workflow.mjs templates package.json test/workflow.test.mjs test/skill-governance.test.mjs
  ```

  Expected after implementation: tests PASS; `test` command exits 0; `rg` negative assertion returns no matches.

- [ ] **Step 8: Record task evidence**

  Record:

  ```yaml
  task_anchor: T-001
  source_ac:
    - AC-001
    - AC-002
    - AC-005
  design_anchors:
    - D-001
    - D-002
    - D-004
    - D-006
    - D-007
  test_cases:
    - TC-001
    - TC-002
    - TC-005
  commands_run:
    - node --test test/workflow.test.mjs: PASS
    - node --test test/skill-governance.test.mjs: PASS
    - test ! -e templates/intake-test-cases.md: PASS
    - "! rg \"test_cases_path|test-cases\\\\.md|intake-test-cases\\\\.md\" src/workflow.mjs templates package.json test/workflow.test.mjs test/skill-governance.test.mjs: PASS"
  evidence_summary: runtime and package surface now use two-file clarify intake packages with TC scenarios inside requirements.md
  remaining_risk: none
  ```

### T-002 / Task 2: CLI, hook, and HTML output surfaces

**Files:**
- Modify: `src/cli.mjs`
- Modify: `scripts/codex-workflow-hook.mjs`
- Modify: `scripts/claude-workflow-hook.mjs`
- Modify: `src/html-views.mjs`
- Test: `test/workflow.test.mjs`
- Test: `test/trellis-hardening.test.mjs`

**Interfaces:**
- Consumes:
  - `status.state.requirements_path`
  - `status.state.intake_package_path`
  - `status.state.spec_artifact_path`
  - `WORKFLOW_ARTIFACTS` and `PAGE_GROUPS`
- Produces:
  - Human CLI output with no `test cases:` line
  - Hook advisory output with no `test cases:` line
  - Intake HTML page without `test-cases` artifact

**Traceability:**
- Source AC: `AC-004`
- Design anchors: `D-004`, `D-008`
- Test cases: `TC-004`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/workflow.test.mjs`
  - `node --test test/trellis-hardening.test.mjs`
  - `! rg "test cases:|test_cases_path|test-cases\\.md" src/cli.mjs scripts/codex-workflow-hook.mjs scripts/claude-workflow-hook.mjs src/html-views.mjs test/workflow.test.mjs test/trellis-hardening.test.mjs`
- `evidence_summary`: CLI, hooks, HTML, and related tests no longer expose the standalone test-cases surface.
- `remaining_risk`: none

**Review focus:**
- Verify human output remains concise and still prints intake and requirements paths.
- Verify hook output remains advisory-only and does not lose next skill handoff.
- Verify HTML intake page still renders clarification and requirements.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Update CLI and hook tests first**

  In `test/trellis-hardening.test.mjs`, in the hook advisory test, replace:

  ```js
  assert.match(stdout, /test cases:/);
  ```

  with:

  ```js
  assert.doesNotMatch(stdout, /test cases:/);
  ```

  In `test/workflow.test.mjs`, ensure all human output checks added in `T-001` use `assert.doesNotMatch(..., /^test cases:/m)`.

- [ ] **Step 2: Run the output tests to confirm they fail for old output**

  Run:

  ```bash
  node --test test/workflow.test.mjs
  node --test test/trellis-hardening.test.mjs
  ```

  Expected before implementation: FAIL because CLI or hooks still print `test cases:`.

- [ ] **Step 3: Remove `test cases:` from CLI human output**

  In `src/cli.mjs`, delete this block from `printHumanStatus(status)`:

  ```js
  if (status.state?.test_cases_path) {
    console.log(`test cases: ${displayPathFromCwd(status.state.test_cases_path)}`);
  }
  ```

  Delete this block from `printHumanClarify(result)`:

  ```js
  if (state.test_cases_path) {
    console.log(`test cases: ${displayPathFromCwd(state.test_cases_path)}`);
  }
  ```

  Do not remove `requirements:` output.

- [ ] **Step 4: Remove `test cases` from hook advisory output**

  In `scripts/codex-workflow-hook.mjs`, remove this entry from the `lines` array:

  ```js
  stateLine('test cases', state.test_cases_path || 'none'),
  ```

  In `scripts/claude-workflow-hook.mjs`, remove this entry from the `lines` array:

  ```js
  `test cases: ${state.test_cases_path || 'none'}`,
  ```

- [ ] **Step 5: Remove test-cases artifact from HTML view**

  In `src/html-views.mjs`, remove this object from `WORKFLOW_ARTIFACTS`:

  ```js
  { id: 'test-cases', stateKey: 'test_cases_path', name: 'test-cases.md', label: '验收测试场景', page: 'intake.html' },
  ```

  Change `PAGE_GROUPS` to:

  ```js
  const PAGE_GROUPS = [
    { file: 'intake.html', title: '需求澄清', artifacts: ['clarification', 'requirements', 'spec'] },
  ];
  ```

  Do not change the intake page intro.

- [ ] **Step 6: Verify current output surfaces**

  Run:

  ```bash
  node --test test/workflow.test.mjs
  node --test test/trellis-hardening.test.mjs
  ! rg "test cases:|test_cases_path|test-cases\\.md" src/cli.mjs scripts/codex-workflow-hook.mjs scripts/claude-workflow-hook.mjs src/html-views.mjs test/workflow.test.mjs test/trellis-hardening.test.mjs
  ```

  Expected after implementation: tests PASS; negative assertion returns no matches.

- [ ] **Step 7: Record task evidence**

  Record:

  ```yaml
  task_anchor: T-002
  source_ac:
    - AC-004
  design_anchors:
    - D-004
    - D-008
  test_cases:
    - TC-004
  commands_run:
    - node --test test/workflow.test.mjs: PASS
    - node --test test/trellis-hardening.test.mjs: PASS
    - "! rg \"test cases:|test_cases_path|test-cases\\\\.md\" src/cli.mjs scripts/codex-workflow-hook.mjs scripts/claude-workflow-hook.mjs src/html-views.mjs test/workflow.test.mjs test/trellis-hardening.test.mjs: PASS"
  evidence_summary: current CLI, hook, and HTML intake surfaces no longer expose standalone test-cases artifacts
  remaining_risk: none
  ```

### T-003 / Task 3: Skill contracts and current product docs

**Files:**
- Modify: `skills/clarify/SKILL.md`
- Modify: `skills/spec/SKILL.md`
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/plan-reviewer/SKILL.md`
- Modify: `skills/spec/DESIGN_SPEC_TEMPLATE.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/cli.md`
- Modify: `docs/loopx/cli.zh-CN.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`
- Modify: `docs/loopx/specs/installation.md`
- Modify: `docs/loopx/design/loopx-skill-suite-v1-design.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes:
  - Source design `D-001`, `D-003`, `D-005`, `D-006`
  - Existing skill frontmatter and `metadata.version`
- Produces:
  - Skill contract that names `requirements.md` as clarify intake canonical contract
  - Skill contract that names `clarification.md` as supporting log/resume state
  - Source-sensitive `plan-to-exec` rule: design document sources read design docs; intake package sources read `requirements.md`
  - Current docs with two-file intake package wording

**Traceability:**
- Source AC: `AC-003`, `AC-006`
- Design anchors: `D-001`, `D-003`, `D-005`, `D-006`
- Test cases: `TC-003`, `TC-006`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs`
  - `node scripts/verify-skills.mjs`
  - `! rg "test-cases\\.md|intake-test-cases\\.md|test_cases_path|test cases:" skills README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md docs/loopx/design/loopx-skill-suite-v1-design.md`
- `evidence_summary`: Current skill and product docs describe two-file intake packages and source-sensitive downstream reading.
- `remaining_risk`: none

**Review focus:**
- Verify the plan does not accidentally tell `plan-to-exec` to ignore design documents.
- Verify changed skill versions are bumped only for edited skills.
- Verify no current product doc still describes a three-file intake package.

**Support lenses:** none

- [ ] **Step 1: Update skill governance assertions first**

  In `test/skill-governance.test.mjs`, update `governs clarify skill as incremental requirements intake`:

  - Keep assertions for `clarification.md`, `requirements.md`, `AC-*`, `TC-*`, `black-box acceptance/integration`, `first material answer`, `[PENDING]`, and `## Resume State`.
  - Replace positive assertions for `test-cases.md` with negative assertions:

    ```js
    assert.doesNotMatch(clarifySkill, /test-cases\.md/);
    assert.doesNotMatch(clarifySkill, /`requirements\.md` and `test-cases\.md` must share/);
    assert.match(clarifySkill, /Acceptance Scenarios/);
    assert.match(clarifySkill, /canonical.*requirements\.md/i);
    assert.match(clarifySkill, /clarification\.md.*supporting|supporting.*clarification\.md/i);
    ```

  In `governs design contract anchors across spec planning and review`, replace `test-cases.md` assertions with:

  ```js
  assert.doesNotMatch(specSkill, /test-cases\.md/);
  assert.doesNotMatch(planToExecSkill, /test-cases\.md/);
  assert.match(specSkill, /Acceptance Scenarios|TC-\*/);
  assert.match(planToExecSkill, /Acceptance Scenarios|TC-\*/);
  assert.match(planToExecSkill, /design document source|source design spec|detailed design/i);
  ```

  In tests that assert exact `metadata.version` for edited skills, increment:

  - `clarify` from the current repository value by one patch version.
  - `spec` from the current repository value by one patch version.
  - `plan-to-exec` from `0.3.13` to `0.3.14`.
  - `plan-reviewer` from `0.1.0` to `0.1.1`.

  Use the actual current values in the files after accounting for earlier uncommitted changes in this worktree.

- [ ] **Step 2: Run skill governance to confirm old contracts fail**

  Run:

  ```bash
  node --test test/skill-governance.test.mjs
  ```

  Expected before skill/doc implementation: FAIL because skill text still mentions `test-cases.md` and old versions.

- [ ] **Step 3: Update `skills/clarify/SKILL.md`**

  Apply these contract changes:

  - Output files list becomes:

    ```markdown
    - `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`
    - `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`
    ```

  - Replace the `requirements.md` description with:

    ```markdown
    `requirements.md` records the confirmed canonical requirement contract: source facts, intent, scope, non-goals, decisions, constraints, acceptance criteria, acceptance scenarios, open questions, and handoff recommendation.
    ```

  - Replace the `test-cases.md` paragraph with:

    ```markdown
    `clarification.md` is supporting process evidence and resume state. Downstream skills read it only when they need exact user wording, unresolved-history context, or resume information.
    ```

  - Replace the standalone test-case rules with:

    ```markdown
    Acceptance scenarios in `requirements.md` must use stable `TC-*` anchors. Every `TC-*` must reference at least one `AC-*`. High-risk `AC-*` items need at least one boundary, failure, integration, CLI, API, manual, or deferred-with-rationale scenario.
    ```

  - Replace the main-chain handoff rule with:

    ```markdown
    Main-chain handoff rule: `requirements.md` is the canonical `AC-*`/`TC-*` source for downstream chain work. `spec`, `plan-to-exec`, `exec`, `subagent-exec`, `review`, `final-review`, and `finish` consume those anchors as source contract identifiers. Downstream skills must not invent replacement `AC-*` or `TC-*` identifiers; if the intake anchors are missing, contradictory, or not testable, route back to `clarify` instead of renaming or substituting them.
    ```

  - Add `acceptance scenarios` to the completed package preservation list.
  - Bump `metadata.version` by one patch version.

- [ ] **Step 4: Update `skills/spec/SKILL.md` and `skills/spec/DESIGN_SPEC_TEMPLATE.md`**

  In `skills/spec/SKILL.md`, change intake package reading rules to:

  ```markdown
  When the source is an intake package directory, read:

  1. `requirements.md` as the canonical requirement contract, including `AC-*` acceptance criteria and `TC-*` acceptance scenarios.
  2. `clarification.md` only when needed for process evidence, exact user wording, unresolved-history context, or resume information.
  ```

  Replace any `requirements.md` / `test-cases.md` conflict rule with:

  ```markdown
  If `requirements.md` lacks material `AC-*` or `TC-*` coverage, is internally contradictory, or marks material questions as pending, stop and route back to `clarify`.
  ```

  Replace the detailed-design verification strategy paragraph with:

  ```markdown
  When the source is an intake package directory, the detailed design must reference the intake package path and its canonical `requirements.md`. The verification strategy must preserve `TC-*` coverage from the `Acceptance Scenarios` section by mapping requirement-stage acceptance/integration scenarios to design-level test strategy, manual checks, or deferred-with-rationale items. If the detailed design also contains `D-*` anchors, the verification strategy should make the `AC-* -> D-* -> TC-*` relationship visible where that helps downstream planning.
  ```

  Bump `metadata.version` by one patch version.

  In `skills/spec/DESIGN_SPEC_TEMPLATE.md`, replace the `11.3 Verification Strategy / TC 覆盖映射` lead-in with:

  ```markdown
  当 source 是 intake package 时，列出 `requirements.md` 中每个相关 `TC-*` 如何映射到设计级验证策略、人工检查或 deferred-with-rationale。若本设计包含 `D-*`，在验证策略中体现 `AC-* -> D-* -> TC-*` 的关系。
  ```

- [ ] **Step 5: Update `skills/plan-to-exec/SKILL.md` and `skills/plan-reviewer/SKILL.md`**

  In `skills/plan-to-exec/SKILL.md`, replace the intake source sentence with:

  ```markdown
  When the source is an intake package directory, read `requirements.md` as the canonical contract, including `AC-*` acceptance criteria and `TC-*` acceptance scenarios. Use `clarification.md` only for process evidence, exact user wording, and unresolved-history context. When the source is a design document, read the design document and preserve its carried `D-*`, `AC-*`, and `TC-*` mappings.
  ```

  Replace the coverage paragraph with:

  ```markdown
  The plan must preserve `AC-*` anchors and cover `TC-*` scenarios from the source through tasks, verification commands, or deferred-with-rationale rows. For intake package sources, `AC-*` and `TC-*` come from `requirements.md`. For design specs, preserve and cover the anchors and verification strategy carried by the design. It must not introduce uncovered product/API/data/permission behavior; add explicit rationale for non-product infrastructure, docs-only, test-only, or refactor-only work that has no direct anchor.
  ```

  Replace self-review item 10 with:

  ```markdown
  10. **Test-case coverage:** Does each source `TC-*` map to a task verification step, integration/e2e/API/CLI/manual check, or deferred-with-rationale row?
  ```

  Bump `metadata.version` from `0.3.13` to `0.3.14`.

  In `skills/plan-reviewer/SKILL.md`, replace the input list entry:

  ```markdown
     - intake package directory with canonical `requirements.md`, or
     - design spec with Source AC, Design anchors, Test cases, `AC-*`, `D-*`, `TC-*`, and verification strategy.
  ```

  Bump `metadata.version` from `0.1.0` to `0.1.1`.

- [ ] **Step 6: Update current product docs**

  Replace current three-file intake wording with two-file wording in:

  - `README.md`
  - `README.zh-CN.md`
  - `docs/loopx/cli.md`
  - `docs/loopx/cli.zh-CN.md`
  - `docs/loopx/skills.md`
  - `docs/loopx/skills.zh-CN.md`
  - `docs/loopx/specs/installation.md`
  - `docs/loopx/design/loopx-skill-suite-v1-design.md`

  Use English wording:

  ```markdown
  produces `.loopx/intake/YYYY-MM-DD-<slug>/` with canonical `requirements.md` and supporting `clarification.md`
  ```

  Use Chinese wording:

  ```markdown
  产出 `.loopx/intake/YYYY-MM-DD-<slug>/`，包含 canonical `requirements.md` 和 supporting `clarification.md`
  ```

  In `docs/loopx/specs/installation.md`, update the public CLI surface bullet to say:

  ```markdown
  - `loopx clarify` writes local runtime intake packages under `.loopx/intake/YYYY-MM-DD-<slug>/`; `loopx status --json` exposes package, `requirements_path`, and `clarification_path` while preserving `spec_artifact_path` pointing to `requirements_path`.
  ```

- [ ] **Step 7: Verify skill/docs current surface**

  Run:

  ```bash
  node --test test/skill-governance.test.mjs
  node scripts/verify-skills.mjs
  ! rg "test-cases\\.md|intake-test-cases\\.md|test_cases_path|test cases:" skills README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md docs/loopx/design/loopx-skill-suite-v1-design.md
  ```

  Expected after implementation: tests PASS; verifier PASS; negative assertion returns no matches.

- [ ] **Step 8: Record task evidence**

  Record:

  ```yaml
  task_anchor: T-003
  source_ac:
    - AC-003
    - AC-006
  design_anchors:
    - D-001
    - D-003
    - D-005
    - D-006
  test_cases:
    - TC-003
    - TC-006
  commands_run:
    - node --test test/skill-governance.test.mjs: PASS
    - node scripts/verify-skills.mjs: PASS
    - "! rg \"test-cases\\\\.md|intake-test-cases\\\\.md|test_cases_path|test cases:\" skills README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md docs/loopx/design/loopx-skill-suite-v1-design.md: PASS"
  evidence_summary: current skill and product docs use requirements.md as canonical intake source and preserve source-sensitive plan-to-exec behavior
  remaining_risk: none
  ```

### T-004 / Task 4: Governance, release verification, and full negative assertions

**Files:**
- Modify: `test/skill-governance.test.mjs`
- Modify: `test/workflow.test.mjs`
- Modify: `test/trellis-hardening.test.mjs`
- Modify only if needed: `scripts/verify-skills.mjs`
- No implementation source files unless earlier tasks missed a release gate.

**Interfaces:**
- Consumes:
  - All task outputs from `T-001` through `T-003`
  - Existing `npm test` release gate
  - `node scripts/verify-skills.mjs`
  - `npm pack --dry-run`
- Produces:
  - Passing full test suite
  - Negative assertions proving removed current surface cannot return silently
  - Final execution handoff readiness

**Traceability:**
- Source AC: `AC-001`, `AC-002`, `AC-003`, `AC-004`, `AC-005`, `AC-006`
- Design anchors: `D-001`, `D-002`, `D-003`, `D-004`, `D-005`, `D-006`, `D-007`, `D-008`
- Test cases: `TC-001`, `TC-002`, `TC-003`, `TC-004`, `TC-005`, `TC-006`
- Task anchor: `T-004`

**Expected execution evidence:**
- `commands_run`:
  - `node scripts/verify-skills.mjs`
  - `node --test test/workflow.test.mjs`
  - `node --test test/trellis-hardening.test.mjs`
  - `node --test test/skill-governance.test.mjs`
  - `npm test`
  - `npm pack --dry-run`
  - `test ! -e templates/intake-test-cases.md`
  - `! rg "test_cases_path|test cases:|test-cases\\.md|intake-test-cases\\.md" src scripts test package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md templates skills`
- `evidence_summary`: Full release gate and package dry run pass; strict current surface has no standalone test-cases contract.
- `remaining_risk`: none

**Review focus:**
- Verify negative assertions exclude historical docs but include every current product surface.
- Verify test rewrites still guard against old behavior returning, not merely stop checking it.
- Verify `npm pack --dry-run` does not include deleted template.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Add or strengthen negative assertions in governance tests**

  In `test/skill-governance.test.mjs`, add a focused assertion inside an existing current-surface governance test or create a new test named:

  ```js
  it('keeps standalone clarify test-cases artifact out of current surfaces', async () => {
    const output = await rgCurrentSurface(
      [
        'src',
        'scripts',
        'test',
        'templates',
        'skills',
        'README.md',
        'README.zh-CN.md',
        'docs/loopx/cli.md',
        'docs/loopx/cli.zh-CN.md',
        'docs/loopx/skills.md',
        'docs/loopx/skills.zh-CN.md',
        'docs/loopx/specs/installation.md',
        'docs/loopx/design/loopx-skill-suite-v1-design.md',
      ],
      [
        'test_cases_path',
        'test cases:',
        'test-cases\\\\.md',
        'intake-test-cases\\\\.md',
      ],
    );
    assert.equal(output, '');
  });
  ```

  If `rgCurrentSurface` does not handle file paths like `README.md`, adjust its file collection helper to accept both files and directories. Preserve existing behavior for other tests.

- [ ] **Step 2: Run targeted governance and hardening tests**

  Run:

  ```bash
  node --test test/skill-governance.test.mjs
  node --test test/workflow.test.mjs
  node --test test/trellis-hardening.test.mjs
  ```

  Expected: PASS. If a current surface still includes removed terms, fix the owning task area rather than weakening the assertion.

- [ ] **Step 3: Run strict current-surface negative assertions**

  Run:

  ```bash
  test ! -e templates/intake-test-cases.md
  ! rg "test_cases_path|test cases:|test-cases\\.md|intake-test-cases\\.md" src scripts test package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md templates skills
  ! rg "requirements\\.md.*test-cases|test-cases\\.md.*requirements\\.md" skills README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md
  ```

  Expected: all commands exit 0.

- [ ] **Step 4: Run release gates**

  Run:

  ```bash
  node scripts/verify-skills.mjs
  npm test
  npm pack --dry-run
  ```

  Expected:

  - `node scripts/verify-skills.mjs` prints `ok: verified 27 loopx bundled skills`.
  - `npm test` passes all tests.
  - `npm pack --dry-run` completes without listing `templates/intake-test-cases.md`.

- [ ] **Step 5: Inspect changed files for accidental historical-doc churn**

  Run:

  ```bash
  git diff --stat
  git diff -- src/workflow.mjs src/cli.mjs src/html-views.mjs scripts/codex-workflow-hook.mjs scripts/claude-workflow-hook.mjs templates package.json skills README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md docs/loopx/design/loopx-skill-suite-v1-design.md test/workflow.test.mjs test/trellis-hardening.test.mjs test/skill-governance.test.mjs
  ```

  Expected: diff is limited to current product surfaces and tests named in this plan, plus the already-created design and implementation plan documents.

- [ ] **Step 6: Record task evidence**

  Record:

  ```yaml
  task_anchor: T-004
  source_ac:
    - AC-001
    - AC-002
    - AC-003
    - AC-004
    - AC-005
    - AC-006
  design_anchors:
    - D-001
    - D-002
    - D-003
    - D-004
    - D-005
    - D-006
    - D-007
    - D-008
  test_cases:
    - TC-001
    - TC-002
    - TC-003
    - TC-004
    - TC-005
    - TC-006
  commands_run:
    - node scripts/verify-skills.mjs: PASS
    - node --test test/workflow.test.mjs: PASS
    - node --test test/trellis-hardening.test.mjs: PASS
    - node --test test/skill-governance.test.mjs: PASS
    - npm test: PASS
    - npm pack --dry-run: PASS
    - test ! -e templates/intake-test-cases.md: PASS
    - "! rg \"test_cases_path|test cases:|test-cases\\\\.md|intake-test-cases\\\\.md\" src scripts test package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md templates skills: PASS"
  evidence_summary: full release gate and strict current-surface negative assertions prove the standalone clarify test-cases artifact is removed
  remaining_risk: none
  ```

## Source Coverage Matrix

| Source anchor | Plan coverage | Status | Notes |
|---|---|---|---|
| `AC-001` | `T-001`, `T-004` | covered | Runtime creates two-file package; negative assertions prevent file return |
| `AC-002` | `T-001`, `T-003`, `T-004` | covered | Requirements template contains AC and TC scenarios |
| `AC-003` | `T-003`, `T-004` | covered | Skills establish clarification as supporting only |
| `AC-004` | `T-002`, `T-004` | covered | CLI/hooks/HTML/state output removed |
| `AC-005` | `T-001`, `T-004` | covered | Package surface no longer includes deleted template |
| `AC-006` | `T-003`, `T-004` | covered | `plan-to-exec` source-sensitive TC coverage rule |
| `D-001` | `T-001`, `T-003`, `T-004` | covered | `requirements.md` canonical for intake package |
| `D-002` | `T-001`, `T-004` | covered | Runtime creates two files only |
| `D-003` | `T-003`, `T-004` | covered | Clarification supporting log only |
| `D-004` | `T-001`, `T-002`, `T-004` | covered | State/CLI/hooks/HTML remove test-cases surface |
| `D-005` | `T-003`, `T-004` | covered | Source-sensitive downstream skill behavior |
| `D-006` | `T-001`, `T-003`, `T-004` | covered | No compatibility branch |
| `D-007` | `T-001`, `T-004` | covered | `spec_artifact_path` remains `requirements_path` |
| `D-008` | `T-002`, `T-004` | covered | `status --json` child artifact contract updated |
| `TC-001` | `T-001`, `T-004` | covered | New package no `test-cases.md` |
| `TC-002` | `T-001`, `T-004` | covered | Requirements template embeds acceptance scenarios |
| `TC-003` | `T-003`, `T-004` | covered | Governance asserts canonical/supporting contract |
| `TC-004` | `T-002`, `T-004` | covered | Output surfaces remove old fields |
| `TC-005` | `T-001`, `T-004` | covered | Package surface removes template |
| `TC-006` | `T-003`, `T-004` | covered | `plan-to-exec` preserves TC coverage by source type |

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-07-03-simplify-clarify-intake-artifacts.md`.

Recommended:

```text
$subagent-exec docs/loopx/plans/2026-07-03-simplify-clarify-intake-artifacts.md
```

Inline fallback:

```text
$exec docs/loopx/plans/2026-07-03-simplify-clarify-intake-artifacts.md
```

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Commit policy: single-plan execution creates one implementation commit after all tasks and required reviews pass.
