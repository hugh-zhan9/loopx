# Multi-Plan Execution Package Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-01-multi-plan-execution-package-mode/需求设计文档.md`

**Goal:** Update loopx execution skill contracts so `exec` and `subagent-exec` support whole-package multi-plan execution from `00-overview.md` or a package directory while preserving child-plan direct execution.

**Architecture:** This is a skill-contract and governance change, not a new public CLI. `plan-to-exec` makes package execution the primary multi-plan handoff; `subagent-exec` and `exec` share the same package input scope, run child plans strictly sequentially, initialize missing schema v2 multi-plan state from `00-overview.md`, run spec-level `final-review` after all child plans are ready, and enter `finish` only after the spec-level review is clean.

**Tech Stack:** Markdown skill contracts, Node.js ESM tests with `node:test`, local JSON workflow state under `.loopx/multi-plan/`.

**Support lenses:** `architecture-designer`

## Global Constraints

- Keep single-plan workflow behavior unchanged.
- Keep `.loopx/multi-plan/<feature-slug>/state.json` as local workflow state.
- New multi-plan state written by package mode uses schema v2 with `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review`; do not reintroduce `plan_final_review` as a new contract.
- Do not add a `multi-plan-exec` skill.
- Do not add a public `loopx multi-plan` CLI command or any other runtime command.
- Do not automatically parallelize child plan execution.
- Preserve numbered child plan direct execution for targeted, resume, and manual-control runs.
- Preserve plan-level `final-review` and spec-level `final-review` scope separation.
- Preserve the `finish` gate: finish only after clean spec-level `final-review`.
- Historical plans and release notes may keep old wording; strict current product surfaces must use the new package-mode contract.
- When changing bundled skill docs, edit `skills/` as canonical source and bump only changed skill `metadata.version`.
- Validate with targeted `node --test`, `node scripts/verify-skills.mjs`, and `npm test`.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: same-context source-to-plan review against `AC-001` through `AC-009`, `TC-001` through `TC-007`, and `D-001` through `D-011`.
- Recheck evidence: Plan includes governance-first assertions, package-first handoff updates, `subagent-exec` and `exec` package-mode contracts, schema v2 state wording, finish/resolver alignment, negative assertions, and verify-skills release gate.
- Residual risk: same-context review was not independently reviewed by a separate subagent.

---

## Surface Inventory

- Public commands/API/routes/events/config:
  - No new public `loopx` command.
  - No new CLI flag.
  - No change to `loopx finish-*` command signatures.
- Exported functions/types/modules:
  - No required exported runtime function changes in this plan.
  - Existing finish runtime schema v2 validation remains the authoritative finish gate.
- Runtime/generated artifacts and templates:
  - Package mode contract writes or updates `.loopx/multi-plan/<feature-slug>/state.json`.
  - New package mode state examples must use schema v2.
  - No mutable state is written under `docs/loopx/plans/.../`.
- Installer/package/deployment surface:
  - Bundled skill docs under `skills/`.
  - `scripts/verify-skills.mjs` remains package/plugin skill surface validation.
- Hooks/background jobs/automation:
  - No hook changes.
  - No background job changes.
- Current product docs:
  - `skills/plan-to-exec/SKILL.md`
  - `skills/subagent-exec/SKILL.md`
  - `skills/exec/SKILL.md`
  - `skills/finish/SKILL.md`
  - `skills/RESOLVER.md`
  - README/docs only if current product guidance mentions old multi-plan handoff wording.
- Tests/governance checks:
  - `test/skill-governance.test.mjs`
  - `node scripts/verify-skills.mjs`
  - `npm test`
- Compatibility/migration paths:
  - Single-plan execution remains unchanged.
  - Numbered child plan direct execution remains unchanged except the docs must clarify it is targeted/resume/manual-control.
  - Existing runtime v1 state compatibility remains read-only; new package-mode writing uses schema v2.

Caller proof commands to run while implementing:

```bash
rg "Do not ask one agent|execute the whole directory|Do not execute sibling child plans|package mode|00-overview\\.md|multi-plan package" README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md skills
rg "plan_final_review|plan_review|spec_final_review|multi-plan package|00-overview\\.md" src scripts test skills README.md README.zh-CN.md docs/loopx
rg "metadata.version" test/skill-governance.test.mjs skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/finish/SKILL.md
```

Decision rule:

- Current source/runtime caller exists -> keep and update wording to the new package-mode contract.
- Only historical docs, release notes, old plans, or frozen external content reference old behavior -> do not count that as current product surface.
- No current caller or product surface needs old wording -> remove old wording or add a negative assertion.

Negative assertions:

```bash
! rg "Do not ask one agent to execute the whole directory|offer execution per child plan" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs
! rg "multi-plan-exec|loopx multi-plan" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs src scripts package.json
! rg "plan_final_review" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs src templates
node scripts/verify-skills.mjs
npm test
```

Strict current product surfaces are `src/`, `scripts/`, `skills/`, `templates/`, `README.md`, `README.zh-CN.md`, `docs/loopx/cli*.md`, `docs/loopx/skills*.md`, and `docs/loopx/specs/`. Historical paths under `docs/loopx/plans/`, `docs/loopx/design/`, and `docs/release-notes/` may mention old behavior.

---

### T-001 / Task 1: Add Failing Governance Assertions For Package Mode

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes:
  - Existing helper `parseFrontmatter(text)`.
  - Existing helper `rgCurrentSurface(paths, patterns)`.
  - Existing constants `repoRoot` and `removedChildReviewPathPattern`.
- Produces:
  - A new governance test named `governs multi-plan package execution mode across execution skills`.
  - Updated exact version assertions for changed skill metadata.

**Traceability:**
- Source AC: `AC-001`, `AC-002`, `AC-003`, `AC-004`, `AC-005`, `AC-006`, `AC-007`, `AC-008`, `AC-009`
- Design anchors: `D-001`, `D-002`, `D-003`, `D-004`, `D-005`, `D-006`, `D-007`, `D-008`, `D-009`, `D-010`, `D-011`
- Test cases: `TC-001`, `TC-002`, `TC-003`, `TC-004`, `TC-005`, `TC-006`, `TC-007`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode"`
  - `node --test test/skill-governance.test.mjs --test-name-pattern "plan-to-exec requires|plan task anchors|upstream main-chain|downstream main-chain|finish wording"`
- `evidence_summary`: the new test fails before contract updates and passes after the skill docs are updated.
- `remaining_risk`: none

**Review focus:**
- Verify `T-001` creates failing assertions for every package-mode design boundary before docs are updated.
- Verify the assertions scan only current product surfaces for forbidden new skill/CLI names and do not fail on historical design/plan artifacts.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Add the package-mode governance test**

Add this test after the existing `plan-to-exec requires global constraints and task interfaces for subagent handoff` test in `test/skill-governance.test.mjs`:

```js
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
    assert.match(finishSkill, /plan_review\.reviewed_at/);
    assert.match(finishSkill, /plan_review\.summary/);
    assert.doesNotMatch(finishSkill, removedChildReviewPathPattern);

    assert.match(resolver, /package mode/i);
    assert.match(resolver, /00-overview\.md/);
    assert.match(resolver, /targeted\/resume\/manual-control/i);

    const forbiddenSurface = await rgCurrentSurface([
      'skills',
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
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode"
```

Expected before implementation: FAIL with missing `package mode`, version mismatch, old handoff wording, and/or missing `exec` package mode assertions.

- [ ] **Step 3: Update existing exact version assertions**

In `test/skill-governance.test.mjs`, update exact assertions for changed skills:

```js
assert.equal(planFields['metadata.version'], '0.3.12');
assert.equal(execFields['metadata.version'], '0.3.8');
assert.equal(subagentExecFields['metadata.version'], '0.3.10');
```

Update direct `parseFrontmatter(...)` assertions:

```js
assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.12');
assert.equal(parseFrontmatter(execSkill)['metadata.version'], '0.3.8');
assert.equal(parseFrontmatter(subagentExecSkill)['metadata.version'], '0.3.10');
assert.equal(parseFrontmatter(finishSkill)['metadata.version'], '0.3.8');
```

Keep unchanged versions for `clarify`, `spec`, `review`, and `final-review`.

- [ ] **Step 4: Run version-adjacent governance tests and confirm they fail only on missing implementation**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "plan task anchors|upstream main-chain|downstream main-chain|finish wording"
```

Expected before implementation: FAIL only where exact versions or new package-mode wording are not updated yet. Existing unrelated governance assertions should not newly fail.

- [ ] **Step 5: Commit**

```bash
git add test/skill-governance.test.mjs
git commit -m "test: cover multi-plan package execution mode"
```

---

### T-002 / Task 2: Make `plan-to-exec` Handoff Package-First

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/RESOLVER.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes:
  - Multi-plan package output path: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md`.
  - Local state path convention: `.loopx/multi-plan/<feature-slug>/state.json`.
- Produces:
  - `plan-to-exec` contract that makes package mode the primary multi-plan handoff.
  - Resolver guidance that routes whole-package multi-plan execution through `subagent-exec` or `exec` with `00-overview.md`.

**Traceability:**
- Source AC: `AC-005`, `AC-007`, `AC-008`
- Design anchors: `D-005`, `D-007`, `D-008`, `D-010`, `D-011`
- Test cases: `TC-004`, `TC-006`, `TC-007`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|plan-to-exec requires"`
- `evidence_summary`: governance proves package-first handoff, no old "do not execute whole directory" wording, and no new `multi-plan-exec`/`loopx multi-plan` surface.
- `remaining_risk`: none

**Review focus:**
- Verify `plan-to-exec` no longer contradicts the approved design by asking users to execute the directory per child plan as the primary path.
- Verify the plan still preserves child plan direct execution as targeted/resume/manual-control mode.
- Verify no public CLI or new skill is introduced.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Bump `plan-to-exec` metadata version**

In `skills/plan-to-exec/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.11"
```

to:

```yaml
metadata:
  version: "0.3.12"
```

- [ ] **Step 2: Update the multi-plan `00-overview.md` required fields**

In `skills/plan-to-exec/SKILL.md`, keep the existing required fields and replace the final gate bullet with:

```markdown
- Package execution handoff: primary execution uses `$subagent-exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md`; inline fallback uses `$exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md`.
- Direct child plan execution is targeted/resume/manual-control mode only, such as `$subagent-exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/01-example.md`.
- Package mode executes child plans strictly sequentially even when `00-overview.md` says some child plans can run in parallel.
- Final gate: after each child plan, run plan-level `final-review` and update `.loopx/multi-plan/<feature-slug>/state.json` with `plan_review.status`, `reviewed_at`, `summary`, and `ready_for_spec_review`; child plan-level review does not create a final-review report artifact. After all child plans are ready, package mode runs one spec-level `final-review`, then `finish`.
```

Expected effect: `00-overview.md` remains a complete package manifest and becomes the default execution input for package mode.

- [ ] **Step 3: Replace the old Execution Handoff paragraph**

In `skills/plan-to-exec/SKILL.md`, replace the paragraph beginning:

```markdown
For multi-plan packages, offer execution per child plan. Do not ask one agent to execute the whole directory in a single run.
```

with:

```markdown
For multi-plan packages, offer package mode as the primary execution path. Package mode accepts either the package directory or `00-overview.md`, executes child plans strictly sequentially, runs plan-level `final-review` after each child plan, updates `.loopx/multi-plan/<feature-slug>/state.json` with `plan_review.status`, `reviewed_at`, `summary`, and `ready_for_spec_review`, then runs one spec-level `final-review` and enters `finish` only when the spec-level review is clean.

Direct numbered child plan execution remains available for targeted, resume, or manual-control runs. Do not present direct child plan execution as the primary handoff for a newly generated package.
```

- [ ] **Step 4: Replace the multi-plan handoff example**

In the execution choice block in `skills/plan-to-exec/SKILL.md`, include this package-specific text before the generic two-option list:

```text
For this multi-plan package, use package mode:

Recommended:
$subagent-exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md

Inline fallback:
$exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md

Direct child plan execution is reserved for targeted/resume/manual-control runs:
$subagent-exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/01-example.md
$exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/01-example.md
```

Expected effect: `plan-to-exec` now recommends the exact package mode inputs required by `D-008`.

- [ ] **Step 5: Update `skills/RESOLVER.md` multi-plan routing**

In `skills/RESOLVER.md`, update the flow rules around plan execution so they include this contract:

```markdown
5. `plan-to-exec` writes a single plan to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`, or multiple plans from one source under `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`.
6. For single plans, use `subagent-exec` when subagents are available and tasks are independent; use `exec` for inline execution or when subagents are unavailable.
7. For multi-plan packages, use package mode with `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` or the package directory. `subagent-exec` is recommended; `exec` is the same-context fallback.
8. Direct numbered child plan execution is targeted/resume/manual-control mode and must not be presented as the primary package handoff.
9. Use `final-review` after the whole feature is implemented and before `finish`; for multi-plan packages, child plans receive plan-level final-review state with `plan_review.status`, and the package receives one spec-level final-review report before finish.
```

Adjust numbering of the following resolver rules so the list remains coherent.

- [ ] **Step 6: Run targeted governance**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|plan-to-exec requires"
```

Expected after this task: `plan-to-exec` and resolver assertions pass. Assertions for `exec` and `subagent-exec` may still fail until later tasks.

- [ ] **Step 7: Commit**

```bash
git add skills/plan-to-exec/SKILL.md skills/RESOLVER.md test/skill-governance.test.mjs
git commit -m "Update multi-plan package handoff"
```

---

### T-003 / Task 3: Add `subagent-exec` Package Mode Contract

**Files:**
- Modify: `skills/subagent-exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes:
  - Package directory: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`.
  - Package overview: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md`.
  - Child plans: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md`.
  - Local state: `.loopx/multi-plan/<feature-slug>/state.json`.
- Produces:
  - `subagent-exec` package mode contract.
  - Preserved child plan direct mode.
  - Schema v2 state initialization instructions.

**Traceability:**
- Source AC: `AC-001`, `AC-002`, `AC-003`, `AC-005`, `AC-006`, `AC-008`, `AC-009`
- Design anchors: `D-001`, `D-002`, `D-004`, `D-005`, `D-006`, `D-007`, `D-009`, `D-010`
- Test cases: `TC-001`, `TC-002`, `TC-004`, `TC-005`, `TC-007`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|plan-to-exec requires|plan task anchors|finish wording"`
- `evidence_summary`: governance proves `subagent-exec` supports package directory/overview input, strict sequential package mode, per-task subagents, schema v2 state, child direct mode, and spec-level review + finish after all children are ready.
- `remaining_risk`: none

**Review focus:**
- Verify package mode does not dispatch multiple child plans in parallel.
- Verify package mode does not replace per-task fresh implementer/reviewer subagent discipline.
- Verify child plan direct mode still executes only the selected child plan.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Bump `subagent-exec` metadata version**

In `skills/subagent-exec/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.9"
```

to:

```yaml
metadata:
  version: "0.3.10"
```

- [ ] **Step 2: Update the overview paragraph**

Replace the opening description under `# Subagent Exec` with:

```markdown
Execute approved plans by dispatching a fresh implementer subagent per task, one combined task reviewer after each task, and final review according to input scope. For single-plan runs, proceed to `loopx:final-review` and `loopx:finish`. For numbered multi-plan child runs, execute only that child plan and stop after plan-level `loopx:final-review` updates multi-plan state. For multi-plan package inputs (`00-overview.md` or a package directory), run package mode: execute child plans strictly sequentially through the existing per-task subagent flow, run spec-level `loopx:final-review` after all children are ready, and enter `loopx:finish` only when the spec-level review is clean.
```

- [ ] **Step 3: Add an Input Scope section**

Add this section before `## Multi-Plan Child Plans`:

```markdown
## Input Scope

Classify the user-provided path before execution:

| Input | Scope | Behavior |
|---|---|---|
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` | single plan | Execute the plan with per-task subagents, then run `loopx:final-review` and `loopx:finish` when clean. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` | multi-plan package | Run package mode for the whole package. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/` | multi-plan package | Resolve `00-overview.md` and run package mode. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md` | direct child plan mode | Execute only that child plan, run plan-level `loopx:final-review`, update `.loopx/multi-plan/<feature-slug>/state.json`, and stop. |

If the input is missing, ambiguous, unreadable, a package directory without `00-overview.md`, or an overview without the required package fields, stop and report the concrete path defect. Do not guess a scope.
```

- [ ] **Step 4: Add a Multi-Plan Package Mode section**

Add this section after `## Input Scope`:

```markdown
## Multi-Plan Package Mode

Package mode applies when the input is `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` or the package directory.

Package mode steps:

1. Read `00-overview.md`.
2. Extract source spec path, package slug, local state path, child plan list, and execution order.
3. Prepare `.loopx/multi-plan/<feature-slug>/state.json`:
   - if missing, initialize schema v2 state from the overview and child plan list;
   - if present, validate feature slug, plan package path, source spec, unique child plan paths, and schema shape;
   - if JSON is invalid, duplicated, stale, or mismatched with the overview, stop and report the state defect.
4. Execute child plans strictly sequentially, even when the overview says some child plans can run in parallel.
5. For each pending child plan, run the existing direct child plan subagent flow. Keep the core rule: fresh implementer subagent per task plus task reviewer subagent after each task.
6. After each child plan is complete, run plan-level `loopx:final-review` and update the matching state row with `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review: true`. Child plan-level final-review must not write a `.loopx/final-review/*.md` report.
7. Skip child plans whose state row already has `status: "complete"`, `plan_review.status: "passed"`, and `ready_for_spec_review: true`.
8. After every child plan is ready, run one spec-level `loopx:final-review` for the source spec, `00-overview.md`, all child plans, and current repository state.
9. Only start `loopx:finish` when the spec-level review is clean and all Critical/Important feedback has been handled and rechecked.

Package mode is not automatic parallel scheduling. Do not dispatch multiple child plans concurrently in this version.
```

- [ ] **Step 5: Add the schema v2 initialization example**

Under the package mode state preparation bullet, include this exact schema v2 example:

```json
{
  "schema_version": 2,
  "feature_slug": "2026-07-01-feature",
  "plan_package": "docs/loopx/plans/2026-07-01-feature",
  "source_spec": "docs/loopx/design/2026-07-01-feature/需求设计文档.md",
  "status": "in_progress",
  "plans": [
    {
      "path": "docs/loopx/plans/2026-07-01-feature/01-core.md",
      "status": "pending",
      "plan_review": null,
      "ready_for_spec_review": false
    }
  ],
  "spec_final_review": null
}
```

Expected effect: governance can assert schema v2 and `plan_review` usage.

- [ ] **Step 6: Rename/reframe the existing child plan section**

Change `## Multi-Plan Child Plans` to:

```markdown
## Direct Child Plan Mode
```

Update the first paragraph to:

```markdown
When the input is a numbered child plan under `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`, execute only that child plan. Do not execute sibling child plans from direct child plan mode. Do not proceed to package-level spec review or `finish` after the child plan completes. Direct child plan mode is for targeted, resume, or manual-control runs.
```

Keep the existing schema v2 child completion example with `plan_review.status`, `reviewed_at`, `summary`, and `ready_for_spec_review`.

- [ ] **Step 7: Update process diagram wording**

In the process diagram, keep the per-task flow unchanged and add a package-mode branch label by replacing:

```dot
"Single-plan run?" [shape=diamond];
"Use loopx:finish after clean final-review" [shape=box style=filled fillcolor=lightgreen];
"For child plan: update .loopx/multi-plan state and stop" [shape=box];
```

with:

```dot
"Input scope?" [shape=diamond];
"Use loopx:finish after clean single-plan final-review" [shape=box style=filled fillcolor=lightgreen];
"For direct child plan: update .loopx/multi-plan state and stop" [shape=box];
"For package mode: continue to next child or spec-level final-review" [shape=box];
```

Update the outgoing labels so single plan, direct child plan, and package mode are all represented. The diagram does not need to include every package state validation detail; the prose section is authoritative.

- [ ] **Step 8: Run targeted governance**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|plan-to-exec requires|plan task anchors|finish wording"
```

Expected after this task: `subagent-exec` assertions pass. `exec` assertions may still fail until Task 4.

- [ ] **Step 9: Commit**

```bash
git add skills/subagent-exec/SKILL.md test/skill-governance.test.mjs
git commit -m "Add subagent multi-plan package mode contract"
```

---

### T-004 / Task 4: Add `exec` Package Mode Contract

**Files:**
- Modify: `skills/exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes:
  - Package directory: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`.
  - Package overview: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md`.
  - Local state: `.loopx/multi-plan/<feature-slug>/state.json`.
- Produces:
  - `exec` package mode contract for same-context execution without subagents.
  - Preserved single-plan `exec`.
  - Preserved direct child plan mode for targeted/resume/manual-control.

**Traceability:**
- Source AC: `AC-002`, `AC-004`, `AC-005`, `AC-006`, `AC-008`, `AC-009`
- Design anchors: `D-001`, `D-002`, `D-003`, `D-005`, `D-006`, `D-007`, `D-009`, `D-010`
- Test cases: `TC-002`, `TC-003`, `TC-004`, `TC-005`, `TC-007`
- Task anchor: `T-004`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|plan task anchors|upstream main-chain|finish wording"`
- `evidence_summary`: governance proves `exec` package mode accepts package directory/overview input, uses same-context execution without subagents, preserves checkpoint reviews, initializes schema v2 state, runs child plans strictly sequentially, and enters finish only after clean spec-level review.
- `remaining_risk`: none

**Review focus:**
- Verify `exec` package mode does not claim subagent use.
- Verify direct child plan mode does not accidentally run single-plan `finish`.
- Verify single-plan `exec` remains unchanged.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Bump `exec` metadata version**

In `skills/exec/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.7"
```

to:

```yaml
metadata:
  version: "0.3.8"
```

- [ ] **Step 2: Update the overview**

Replace the current overview sentence:

```markdown
Load plan, review critically, execute all tasks with spec verification and mandatory checkpoint reviews, report when complete.
```

with:

```markdown
Load a single plan, direct child plan, or multi-plan package input; review critically; execute tasks inline with spec verification and mandatory checkpoint reviews; then complete according to input scope. `exec` is the same-context execution lane and does not use subagents.
```

- [ ] **Step 3: Add an Input Scope section after the note**

Add this section after the existing note that prefers `subagent-exec` when available:

```markdown
## Input Scope

Classify the user-provided path before execution:

| Input | Scope | Behavior |
|---|---|---|
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` | single plan | Execute inline with checkpoint reviews, then run `loopx:final-review` and `loopx:finish` when clean. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` | multi-plan package | Run package mode for the whole package without subagents. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/` | multi-plan package | Resolve `00-overview.md` and run package mode without subagents. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md` | direct child plan mode | Execute only that child plan inline, run plan-level `loopx:final-review`, update `.loopx/multi-plan/<feature-slug>/state.json`, and stop. |

If the input is missing, ambiguous, unreadable, a package directory without `00-overview.md`, or an overview without the required package fields, stop and report the concrete path defect. Do not guess a scope.
```

- [ ] **Step 4: Add a Multi-Plan Package Mode section**

Add this section after `## Input Scope`:

```markdown
## Multi-Plan Package Mode

Package mode applies when the input is `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` or the package directory.

Package mode steps:

1. Read `00-overview.md`.
2. Extract source spec path, package slug, local state path, child plan list, and execution order.
3. Prepare `.loopx/multi-plan/<feature-slug>/state.json`:
   - if missing, initialize schema v2 state from the overview and child plan list;
   - if present, validate feature slug, plan package path, source spec, unique child plan paths, and schema shape;
   - if JSON is invalid, duplicated, stale, or mismatched with the overview, stop and report the state defect.
4. Execute child plans strictly sequentially, even when the overview says some child plans can run in parallel.
5. For each pending child plan, use the same-context task loop in Step 2, including spec verification, task completion evidence, checkpoints, and mandatory `loopx:review` gates.
6. After each child plan is complete and checkpoint review obligations are clean, run plan-level `loopx:final-review` and update the matching state row with `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review: true`. Child plan-level final-review must not write a `.loopx/final-review/*.md` report.
7. Skip child plans whose state row already has `status: "complete"`, `plan_review.status: "passed"`, and `ready_for_spec_review: true`.
8. After every child plan is ready, run one spec-level `loopx:final-review` for the source spec, `00-overview.md`, all child plans, and current repository state.
9. Only start `loopx:finish` when the spec-level review is clean and all Critical/Important feedback has been handled and rechecked.

Package mode is same-context orchestration. It does not use subagents and does not automatically parallelize child plans.
```

- [ ] **Step 5: Add the schema v2 initialization example**

Under the package mode state preparation bullet, include the same schema v2 example used in Task 3:

```json
{
  "schema_version": 2,
  "feature_slug": "2026-07-01-feature",
  "plan_package": "docs/loopx/plans/2026-07-01-feature",
  "source_spec": "docs/loopx/design/2026-07-01-feature/需求设计文档.md",
  "status": "in_progress",
  "plans": [
    {
      "path": "docs/loopx/plans/2026-07-01-feature/01-core.md",
      "status": "pending",
      "plan_review": null,
      "ready_for_spec_review": false
    }
  ],
  "spec_final_review": null
}
```

- [ ] **Step 6: Add a Direct Child Plan Mode section**

Add this section before `## The Process`:

```markdown
## Direct Child Plan Mode

When the input is a numbered child plan under `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`, execute only that child plan. Do not execute sibling child plans from direct child plan mode. Do not proceed to package-level spec review or `finish` after the child plan completes. Direct child plan mode is for targeted, resume, or manual-control runs.

After all tasks in the child plan pass required checkpoint reviews and verification, run plan-level `loopx:final-review` as a process gate. If the plan-level review passes, update the matching child row in `.loopx/multi-plan/<feature-slug>/state.json` with:

```json
{
  "status": "complete",
  "plan_review": {
    "status": "passed",
    "reviewed_at": "2026-07-01T00:00:00.000Z",
    "summary": "No blocking issues"
  },
  "ready_for_spec_review": true
}
```

Child plan-level final-review must not write a `.loopx/final-review/*.md` report.
```

- [ ] **Step 7: Scope Step 3 completion behavior**

In `### Step 3: Complete Development`, replace the opening sentence:

```markdown
After Step 2 is complete, including any required final checkpoint `loopx:review`, and all tasks are verified:
```

with:

```markdown
After Step 2 is complete, including any required final checkpoint `loopx:review`, and all tasks for the current scope are verified:
```

Then add this scope rule before the existing final-review bullets:

```markdown
- For direct child plan mode, run plan-level `loopx:final-review`, update `.loopx/multi-plan/<feature-slug>/state.json`, and stop. Do not run `loopx:finish` for a direct child plan.
- For package mode, repeat Step 2 and plan-level `loopx:final-review` for each child plan in strict sequence. After all child plans are ready, run spec-level `loopx:final-review`, then `loopx:finish` only when the spec-level review is clean.
- For single-plan mode, keep the existing single-plan behavior: run `loopx:final-review`, then `loopx:finish` only when clean.
```

- [ ] **Step 8: Run targeted governance**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|plan task anchors|upstream main-chain|finish wording"
```

Expected after this task: package mode assertions for `exec`, `subagent-exec`, `plan-to-exec`, and resolver pass. If finish wording assertions still fail, proceed to Task 5.

- [ ] **Step 9: Commit**

```bash
git add skills/exec/SKILL.md test/skill-governance.test.mjs
git commit -m "Add exec multi-plan package mode contract"
```

---

### T-005 / Task 5: Align Finish, Resolver, And Current Surface Wording

**Files:**
- Modify: `skills/finish/SKILL.md`
- Modify: `skills/RESOLVER.md`
- Modify: `test/skill-governance.test.mjs`
- Modify only if current product searches require it: `README.md`, `README.zh-CN.md`, `docs/loopx/skills.md`, `docs/loopx/skills.zh-CN.md`, `docs/loopx/cli.md`, `docs/loopx/cli.zh-CN.md`, `docs/loopx/specs/installation.md`

**Interfaces:**
- Consumes:
  - Existing finish gate language.
  - Existing resolver workflow rules.
- Produces:
  - Current product surfaces with schema v2 `plan_review` wording.
  - Negative assertions proving no new `multi-plan-exec` skill or `loopx multi-plan` CLI surface.

**Traceability:**
- Source AC: `AC-005`, `AC-007`, `AC-009`
- Design anchors: `D-006`, `D-007`, `D-008`, `D-010`, `D-011`
- Test cases: `TC-004`, `TC-005`, `TC-006`
- Task anchor: `T-005`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|downstream main-chain|finish wording"`
  - `! rg "plan_final_review" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs src templates`
  - `! rg "multi-plan-exec|loopx multi-plan" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs src scripts package.json`
- `evidence_summary`: finish and resolver wording aligns with package mode and schema v2; forbidden public surfaces are absent.
- `remaining_risk`: none

**Review focus:**
- Verify the task updates only current product surfaces and does not migrate historical design/plan/release-note content.
- Verify no final-review/finish gate is weakened.
- Verify no new public CLI or new skill appears.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Bump `finish` metadata version only if the file changes**

If `skills/finish/SKILL.md` needs wording edits, change:

```yaml
metadata:
  version: "0.3.7"
```

to:

```yaml
metadata:
  version: "0.3.8"
```

If the file already fully matches schema v2 wording before this task, leave the version unchanged and update the Task 1 version assertion back to `0.3.7`. Expected current state from repo evidence: `finish` already uses `plan_review.status`, but this task still verifies `plan_review.reviewed_at` and `plan_review.summary` are named.

- [ ] **Step 2: Update finish gate wording to include complete schema v2 child review fields**

In `skills/finish/SKILL.md`, under `### Step 4.5: Check Multi-Plan Finish Gate`, make sure completion is allowed only when these bullets are present:

```markdown
- `plans[]` is non-empty
- every child plan has `status: "complete"`
- every child plan has `plan_review.status: "passed"`
- every child plan has non-empty `plan_review.reviewed_at`
- every child plan has non-empty `plan_review.summary`
- every child plan has `ready_for_spec_review: true`
- `spec_final_review.path` is present
- `spec_final_review.ready_for_finish` is exactly `"Yes"`
```

Expected effect: finish skill docs match runtime schema v2 validation and no longer mention `plan_final_review`.

- [ ] **Step 3: Make resolver package-mode wording explicit**

In `skills/RESOLVER.md`, make sure current workflow rules include:

```markdown
For multi-plan packages, call `subagent-exec` or `exec` with `00-overview.md` or the package directory to run package mode. Package mode executes child plans strictly sequentially, then runs one spec-level `final-review` and `finish` only when clean.
```

Also make sure resolver keeps this boundary:

```markdown
Direct numbered child plan execution is targeted/resume/manual-control mode.
```

- [ ] **Step 4: Remove old current-surface handoff wording**

Run:

```bash
rg -n "Do not ask one agent to execute the whole directory|offer execution per child plan" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs
```

Expected after edits: no matches. If matches remain in current product surfaces, update them to package-mode wording. Do not edit historical plans, historical design docs, or release notes for this assertion.

- [ ] **Step 5: Run targeted governance and negative assertions**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|downstream main-chain|finish wording"
! rg "Do not ask one agent to execute the whole directory|offer execution per child plan" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs
! rg "plan_final_review" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs src templates
! rg "multi-plan-exec|loopx multi-plan" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs src scripts package.json
```

Expected: tests pass; all `! rg` commands have no matches.

- [ ] **Step 6: Commit**

```bash
git add skills/finish/SKILL.md skills/RESOLVER.md test/skill-governance.test.mjs README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs/installation.md
git commit -m "Align multi-plan finish and resolver wording"
```

If README/docs files were not modified, omit them from `git add`.

---

### T-006 / Task 6: Release Verification And Plan Coverage Audit

**Files:**
- Modify only if a release gate exposes a missing package surface: `package.json`, `scripts/verify-skills.mjs`, `test/skill-governance.test.mjs`
- Test-only verification: no required source file changes if all gates pass.

**Interfaces:**
- Consumes:
  - Updated skill contracts.
  - Governance test suite.
  - Package verification script.
- Produces:
  - Passing targeted tests.
  - Passing skill verification.
  - Passing full test suite.

**Traceability:**
- Source AC: `AC-001`, `AC-002`, `AC-003`, `AC-004`, `AC-005`, `AC-006`, `AC-007`, `AC-008`, `AC-009`
- Design anchors: `D-001`, `D-002`, `D-003`, `D-004`, `D-005`, `D-006`, `D-007`, `D-008`, `D-009`, `D-010`, `D-011`
- Test cases: `TC-001`, `TC-002`, `TC-003`, `TC-004`, `TC-005`, `TC-006`, `TC-007`
- Task anchor: `T-006`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|plan-to-exec requires|plan task anchors|upstream main-chain|downstream main-chain|finish wording"`
  - `node scripts/verify-skills.mjs`
  - `npm test`
  - all negative assertion commands from Surface Inventory
- `evidence_summary`: targeted and full tests pass; package skill verification passes; current surfaces no longer expose rejected old contracts or new skill/CLI names.
- `remaining_risk`: none

**Review focus:**
- Verify all AC/TC/D anchors are covered by passing tests or negative assertions.
- Verify the implementation did not add runtime/public CLI behavior outside the approved design.
- Verify dirty worktree changes are limited to expected skill docs, resolver/docs, and tests.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Run focused governance suite**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "multi-plan package execution mode|plan-to-exec requires|plan task anchors|upstream main-chain|downstream main-chain|finish wording"
```

Expected: PASS.

- [ ] **Step 2: Run negative assertions**

Run:

```bash
! rg "Do not ask one agent to execute the whole directory|offer execution per child plan" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs
! rg "multi-plan-exec|loopx multi-plan" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs src scripts package.json
! rg "plan_final_review" skills README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs src templates
```

Expected: all commands exit successfully with no matches. If any command finds matches in current product surfaces, update the relevant surface and rerun.

- [ ] **Step 3: Run skill package verification**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff scope**

Run:

```bash
git status --short
git diff --name-only
git log --oneline --name-only -n 6
```

Expected changed files from current uncommitted work or the task commits created during this implementation are limited to:

```text
skills/plan-to-exec/SKILL.md
skills/subagent-exec/SKILL.md
skills/exec/SKILL.md
skills/finish/SKILL.md
skills/RESOLVER.md
test/skill-governance.test.mjs
```

README/docs current surfaces may also appear only if old wording existed there and was updated:

```text
README.md
README.zh-CN.md
docs/loopx/skills.md
docs/loopx/skills.zh-CN.md
docs/loopx/cli.md
docs/loopx/cli.zh-CN.md
docs/loopx/specs/installation.md
```

If unrelated files appear, stop and inspect before proceeding. Do not revert user changes; only correct accidental edits from this implementation.

- [ ] **Step 6: Commit verification updates**

If Task 6 required source/test edits, run:

```bash
git add skills/plan-to-exec/SKILL.md skills/subagent-exec/SKILL.md skills/exec/SKILL.md skills/finish/SKILL.md skills/RESOLVER.md test/skill-governance.test.mjs README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs/installation.md package.json scripts/verify-skills.mjs
git commit -m "Verify multi-plan package mode contracts"
```

If no files changed in Task 6, record the verification commands and results in the execution report instead of creating an empty commit.

---

## Source-To-Plan Coverage Matrix

| Source anchor | Plan coverage | Status | Notes |
|---|---|---|---|
| `AC-001` | `T-001`, `T-003`, `T-006` | covered | `subagent-exec` package input and governance |
| `AC-002` | `T-001`, `T-003`, `T-004`, `T-006` | covered | direct child mode preserved |
| `AC-003` | `T-001`, `T-003`, `T-006` | covered | per-task subagent discipline preserved |
| `AC-004` | `T-001`, `T-004`, `T-006` | covered | `exec` package mode without subagents |
| `AC-005` | `T-001`, `T-003`, `T-004`, `T-005`, `T-006` | covered | spec-level review then finish |
| `AC-006` | `T-001`, `T-003`, `T-004`, `T-006` | covered | missing state initialization |
| `AC-007` | `T-001`, `T-002`, `T-005`, `T-006` | covered | package-first handoff |
| `AC-008` | `T-001`, `T-002`, `T-003`, `T-004`, `T-006` | covered | strictly sequential child plans |
| `AC-009` | `T-001`, `T-003`, `T-004`, `T-005`, `T-006` | covered | invalid/stale/conflicting state blocks |
| `D-001` | `T-001`, `T-003`, `T-004` | covered | shared input scope classifier |
| `D-002` | `T-001`, `T-003`, `T-004` | covered | direct child mode stop boundary |
| `D-003` | `T-001`, `T-004` | covered | same-context `exec` package mode |
| `D-004` | `T-001`, `T-003` | covered | per-task subagent package mode |
| `D-005` | `T-001`, `T-002`, `T-003`, `T-004` | covered | no automatic parallel scheduling |
| `D-006` | `T-001`, `T-003`, `T-004`, `T-005` | covered | schema v2 state and no new `plan_final_review` |
| `D-007` | `T-001`, `T-003`, `T-004`, `T-005` | covered | spec-level final-review then finish |
| `D-008` | `T-001`, `T-002`, `T-005` | covered | package-first `plan-to-exec` handoff |
| `D-009` | `T-001`, `T-003`, `T-004` | covered | child direct mode retained |
| `D-010` | `T-001`, `T-005`, `T-006` | covered | current surface old wording removed |
| `D-011` | `T-001`, `T-005`, `T-006` | covered | no new skill or public CLI |
| `TC-001` | `T-001`, `T-003`, `T-006` | covered | subagent package mode |
| `TC-002` | `T-001`, `T-003`, `T-004`, `T-006` | covered | direct child plan mode |
| `TC-003` | `T-001`, `T-004`, `T-006` | covered | exec package mode |
| `TC-004` | `T-001`, `T-003`, `T-004`, `T-005`, `T-006` | covered | final package gate |
| `TC-005` | `T-001`, `T-003`, `T-004`, `T-006` | covered | state init and invalid state blocking |
| `TC-006` | `T-001`, `T-002`, `T-005`, `T-006` | covered | handoff consistency |
| `TC-007` | `T-001`, `T-003`, `T-004`, `T-006` | covered | sequential child execution |

## Plan Review Result

- Review mode: same-context
- Reviewer independence: degraded
- Verdict: approved
- Unresolved findings: none
- Residual risk: same-context plan review lacks independent reviewer isolation, but coverage matrix maps every source AC, D anchor, and TC to concrete tasks and verification commands.

## Plan Review Coverage Matrix

| Source anchor | Plan coverage | Status | Notes |
|---|---|---|---|
| Source AC `AC-001` through `AC-009` | `T-001` through `T-006` and Source-To-Plan Coverage Matrix | covered | No uncovered ACs |
| Design anchors `D-001` through `D-011` | Task traceability, review focus, negative assertions, final coverage matrix | covered | No uncovered D anchors |
| Test cases `TC-001` through `TC-007` | Task expected evidence and final verification commands | covered | No deferred test cases |
| Non-goals | Surface Inventory and negative assertions | covered | No new skill, no public CLI, no parallel scheduling |
| Compatibility | `T-003`, `T-004`, `T-005`, `T-006` | covered | single plan and child direct modes preserved |

## Findings

### Critical

1. none

### Important

1. none

### Minor

1. none

## Recheck Notes

No Critical or Important findings were found in the same-context plan review. No recheck changes were required.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-07-01-multi-plan-execution-package-mode.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review.
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints.

Recommended command:

```text
$subagent-exec docs/loopx/plans/2026-07-01-multi-plan-execution-package-mode.md
```

Inline fallback:

```text
$exec docs/loopx/plans/2026-07-01-multi-plan-execution-package-mode.md
```
