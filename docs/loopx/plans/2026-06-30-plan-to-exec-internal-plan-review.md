# Plan-To-Exec Internal Plan Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-30-plan-to-exec-internal-plan-review/需求设计文档.md`

**Goal:** Add an internal source-to-plan review gate to `plan-to-exec` using a new `plan-reviewer` support lens, without adding a main workflow stage.

**Architecture:** This is a bundled skill contract, docs, and governance-test change only. It adds `skills/plan-reviewer/` as a support lens, teaches `plan-to-exec` to run it on draft plans before final handoff, and updates package/docs governance so the new skill installs like other support skills. No runtime module, CLI command, hook behavior, or persistent state is introduced.

**Tech Stack:** Markdown skill contracts, Node.js ESM package metadata, `node:test`, `node:assert/strict`, `scripts/verify-skills.mjs`.

**Support lenses:** architecture-designer. Lancet should be used at implementation time because the change is documentation/contract-heavy and should avoid runtime expansion.

## Global Constraints

- Preserve source design:
  - `D-001`: `plan-to-exec` draft plans must receive internal source-to-plan review before final save/handoff.
  - `D-002`: use an independent reviewer subagent when subagents are available.
  - `D-003`: when subagents are unavailable, run the same rubric same-context and record degraded independence/residual risk.
  - `D-004`: add `plan-reviewer` as a support lens, not a core workflow skill.
  - `D-005`: `plan-reviewer` must check AC/D/TC coverage, scope drift, and task handoff readiness.
  - `D-006`: Critical/Important findings block final plan save/handoff until revised and rechecked; final plan/handoff records review evidence.
- Do not add a `plan-review` workflow stage, `loopx plan-review` command, runtime state, CLI behavior, hook behavior, artifact validator, database/schema, or historical plan migration.
- New rules apply only to new `plan-to-exec` outputs.
- Any scratch plan-review artifact, if documented, must live under `.loopx/plan-to-exec/` and remain local workflow state, not repo-tracked docs.
- Bump `skills/plan-to-exec/SKILL.md` `metadata.version` from `0.3.9` to `0.3.10`.
- Set new `skills/plan-reviewer/SKILL.md` `metadata.version` to `0.1.0`.
- Keep current public workflow handoff as `plan-to-exec -> subagent-exec/exec`.
- Preserve existing user edits. The current worktree already has unrelated modifications in runtime/hook/test files; read files before editing and only change files listed by this plan.

## Surface Inventory

- Public commands/API/routes/events/config:
  - No changes. Do not add a CLI command or runtime API.
- Exported functions/types/modules:
  - Add `plan-reviewer` to `LOOPX_BUNDLED_SKILLS` in `src/install-discovery.mjs`.
  - No new JavaScript exports.
- Runtime/generated artifacts and templates:
  - No runtime templates.
  - Optional scratch review artifact may be documented as `.loopx/plan-to-exec/<slug>-plan-review.md`.
- Installer/package/deployment surface:
  - Add `skills/plan-reviewer/` to `package.json.files`.
  - `scripts/verify-skills.mjs` should pass through existing bundled skill checks.
- Hooks/background jobs/automation:
  - No changes.
- Current product docs:
  - `README.md`
  - `README.zh-CN.md`
  - `docs/loopx/skills.md`
  - `docs/loopx/skills.zh-CN.md`
  - `skills/RESOLVER.md`
- Tests/governance checks:
  - `test/skill-governance.test.mjs`
- Compatibility/migration paths:
  - Historical plans are not migrated or rewritten.
  - `exec` and `subagent-exec` pre-flight review remains execution-readiness focused and unchanged.

Caller proof commands to run during implementation:

```bash
rg "LOOPX_BUNDLED_SKILLS|skills/plan-to-exec|skills/lancet|support skill|support lens|Core Workflow Skills|Support Skills" src scripts test package.json README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md skills/RESOLVER.md
rg "Plan review mode|Reviewer independence|source-to-plan|plan-reviewer|plan review" skills docs/loopx/plans docs/loopx/design test README.md README.zh-CN.md
```

Negative assertions:

```bash
! rg "loopx plan-review|\\$plan-review|/plan-review" src scripts package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md skills/RESOLVER.md
! rg "plan-review.*workflow stage|workflow stage.*plan-review|Core Workflow Skills[\\s\\S]*plan-reviewer" skills/RESOLVER.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md README.md README.zh-CN.md
! rg "runtime state|new CLI command|artifact validator|migrate historical plans|required historical plan migration" skills/plan-to-exec/SKILL.md skills/plan-reviewer/SKILL.md test/skill-governance.test.mjs
```

Historical paths under `docs/loopx/design/` and `docs/loopx/plans/` may mention rejected alternatives. Strict current product surfaces are `src/`, `scripts/`, `skills/`, `test/`, `README.md`, `README.zh-CN.md`, `docs/loopx/skills*.md`, and `docs/loopx/cli*.md`.

## Anchor Coverage Matrix

| Anchor | Source AC | Covered by |
|---|---|---|
| D-001 | AC-001 | T-001 failing assertions; T-003 `plan-to-exec` internal gate; T-005 verification |
| D-002 | AC-002 | T-001 assertions; T-003 subagent review instructions; T-004 docs |
| D-003 | AC-003 | T-001 assertions; T-003 same-context fallback; T-005 verification |
| D-004 | AC-004 | T-001/T-002 bundled support skill work; T-004 resolver/docs; T-005 negative assertions |
| D-005 | AC-005, AC-006 | T-001 assertions; T-002 `plan-reviewer` rubric; T-003 integration with `plan-to-exec` |
| D-006 | AC-007, AC-008 | T-001 assertions; T-002 findings severity; T-003 metadata and findings gate |

## Test Case Coverage Matrix

| TC | Source AC | Plan coverage |
|---|---|---|
| TC-001 | AC-001 | T-001 failing governance assertions; T-003 `plan-to-exec` update |
| TC-002 | AC-002 | T-001/T-003 subagent path assertions |
| TC-003 | AC-003 | T-001/T-003 degraded fallback assertions |
| TC-004 | AC-004 | T-001/T-002/T-004 support skill boundary assertions |
| TC-005 | AC-005 | T-001/T-002 coverage rubric assertions |
| TC-006 | AC-006 | T-001/T-002 scope drift and handoff readiness assertions |
| TC-007 | AC-007 | T-001/T-003 Critical/Important blocking assertions |
| TC-008 | AC-008 | T-001/T-003 metadata and scratch artifact assertions |

### T-001 / Task 1: Add Failing Governance Tests

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: existing `parseFrontmatter`, `repoRoot`, `LOOPX_BUNDLED_SKILLS`, `semverPattern`, `forbiddenRuntimeExpansionPattern`, `historicalPlanMigrationPattern`, and Node assert helpers.
- Produces: failing tests that define the `plan-reviewer` support skill boundary and `plan-to-exec` internal review contract before implementation.

**Traceability:**
- Source AC: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008
- Design anchors: D-001, D-002, D-003, D-004, D-005, D-006
- Test cases: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008
- Task anchor: T-001

**Expected execution evidence:**
- `commands_run`:
  - `node --test --test-name-pattern "includes plan-reviewer|governs plan-to-exec internal source-to-plan review" test/skill-governance.test.mjs`: fails before implementation because `plan-reviewer` is not bundled and `plan-to-exec` lacks the new review contract.
- `evidence_summary`: failing assertions identify the missing bundled skill and missing `plan-to-exec` review-gate contract.
- `remaining_risk`: none; this task is test-only.

**Review focus:**
- Verify tests fail for the intended reasons, not because of syntax errors.
- Verify tests lock support-skill boundary without requiring a public CLI command or workflow stage.

**Support lenses:** architecture-designer

- [ ] **Step 1: Add the `plan-reviewer` bundled support skill test**

In `test/skill-governance.test.mjs`, insert this test after `includes lancet as a governed bundled support skill` and before `governs clarify skill as incremental requirements intake`:

```js
  it('includes plan-reviewer as a governed bundled support skill', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    const resolver = await readFile(resolverPath, 'utf8');
    const skill = await readFile(join(repoRoot, 'skills', 'plan-reviewer', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(skill);

    assert.equal(LOOPX_BUNDLED_SKILLS.includes('plan-reviewer'), true, 'plan-reviewer must be bundled');
    assert.equal(packageJson.files.includes('skills/plan-reviewer/'), true, 'npm package must include plan-reviewer skill');
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
```

- [ ] **Step 2: Add the internal plan review contract test**

Insert this test after `governs plan task anchors across planning execution and review` and before `governs upstream main-chain contract handoff across clarify planning and execution`:

```js
  it('governs plan-to-exec internal source-to-plan review', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const planReviewerSkill = await readFile(join(repoRoot, 'skills', 'plan-reviewer', 'SKILL.md'), 'utf8');
    const resolver = await readFile(resolverPath, 'utf8');
    const skillsDoc = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsDocZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');

    assert.equal(parseFrontmatter(planSkill)['metadata.version'], '0.3.10');
    assert.equal(parseFrontmatter(planReviewerSkill)['metadata.version'], '0.1.0');

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
    assert.match(planSkill, /Residual risk/);
    assert.match(planSkill, /\.loopx\/plan-to-exec\/<slug>-plan-review\.md/);
    assert.match(planSkill, /not repo-tracked|local workflow state/i);

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

    assert.match(resolver, /Plan artifact source-to-plan coverage audit|source-to-plan coverage audit/i);
    assert.match(resolver, /skills\/plan-reviewer\/SKILL\.md/);
    assert.match(resolver, /Treat .*plan-reviewer.* as support lenses/is);
    assert.match(skillsDoc, /\| `plan-reviewer` \|/);
    assert.match(skillsDocZh, /\| `plan-reviewer` \|/);

    assert.doesNotMatch(planSkill, /\$plan-review|\/plan-review|loopx plan-review/);
    assert.doesNotMatch(planReviewerSkill, /\$plan-review|\/plan-review|loopx plan-review/);
    assert.doesNotMatch(resolver, /Core Workflow Skills[\s\S]*plan-reviewer/);
    assert.doesNotMatch(planSkill, forbiddenRuntimeExpansionPattern);
    assert.doesNotMatch(planReviewerSkill, forbiddenRuntimeExpansionPattern);
    assert.doesNotMatch(planSkill, historicalPlanMigrationPattern);
    assert.doesNotMatch(planReviewerSkill, historicalPlanMigrationPattern);
  });
```

- [ ] **Step 3: Run the focused test and confirm it fails**

Run:

```bash
node --test --test-name-pattern "includes plan-reviewer|governs plan-to-exec internal source-to-plan review" test/skill-governance.test.mjs
```

Expected: FAIL. The output should show missing `skills/plan-reviewer/SKILL.md`, missing bundled package surface, and missing `plan-to-exec` internal review wording.

- [ ] **Step 4: Commit the failing tests**

Run:

```bash
git add test/skill-governance.test.mjs
git commit -m "test: specify plan-to-exec plan review governance"
```

Expected: commit succeeds with only `test/skill-governance.test.mjs`.

### T-002 / Task 2: Add `plan-reviewer` Support Skill And Package Surface

**Files:**
- Create: `skills/plan-reviewer/SKILL.md`
- Modify: `src/install-discovery.mjs`
- Modify: `package.json`
- Modify: `skills/RESOLVER.md`

**Interfaces:**
- Consumes: bundled skill governance from `LOOPX_BUNDLED_SKILLS`, package `files`, and resolver support skill table.
- Produces: installable `plan-reviewer` support lens that can be used by `plan-to-exec` and ad-hoc users.

**Traceability:**
- Source AC: AC-004, AC-005, AC-006
- Design anchors: D-004, D-005
- Test cases: TC-004, TC-005, TC-006
- Task anchor: T-002

**Expected execution evidence:**
- `commands_run`:
  - `node --test --test-name-pattern "includes plan-reviewer" test/skill-governance.test.mjs`: passes.
  - `node scripts/verify-skills.mjs`: passes after the new bundled skill and package surface are aligned.
- `evidence_summary`: new skill frontmatter is valid, resolver points to it, package surface includes it.
- `remaining_risk`: `plan-to-exec` still not integrated until T-003.

**Review focus:**
- Verify `plan-reviewer` is clearly a support lens, not a workflow state.
- Verify the rubric is narrow: source-to-plan coverage only, no implementation code review.

**Support lenses:** architecture-designer

- [ ] **Step 1: Create `skills/plan-reviewer/SKILL.md`**

Create the file with this content:

```markdown
---
name: plan-reviewer
description: "Reviews draft implementation plans for source-to-plan coverage, scope drift, verification gaps, and task handoff readiness. Not for writing plans, reviewing implementation code, changing workflow state, or redesigning approved requirements."
when_to_use: "plan review, source-to-plan review, plan artifact audit, coverage audit, implementation plan quality, draft plan review, 计划审核, 计划覆盖检查"
metadata:
  version: "0.1.0"
---

# Plan Reviewer

`plan-reviewer` is a support lens, not a workflow state. It reviews a draft implementation plan against its approved source artifact before execution starts.

Use it inside `plan-to-exec` after a draft plan exists and before the final plan is saved or execution handoff is offered. It may also be invoked directly for an ad-hoc plan audit.

## Do Not Use This Skill For:

- Writing or rewriting the implementation plan from scratch.
- Reviewing implementation code or git diffs.
- Running `exec`, `subagent-exec`, `review`, `final-review`, or `finish`.
- Creating a new workflow state, CLI command, or required user handoff.
- Redesigning approved product, architecture, data, API, permission, or workflow decisions.
- Migrating historical plans.

If the source is missing required decisions, contradictory, or not testable, report that the work must return to `clarify` or `spec`. Do not invent decisions inside the review.

## Inputs

Read:

1. Source artifact:
   - intake package directory with `requirements.md` and `test-cases.md`, or
   - design spec with `AC-*`, `D-*`, `TC-*`, and verification strategy.
2. Draft implementation plan.
3. Relevant repo specs or memory summaries already selected by the caller.

Do not inspect implementation code unless the caller explicitly asked for an ad-hoc audit after implementation; even then, route code review to `review` or `final-review`.

## Review Rubric

Build a source-to-plan coverage matrix:

- Every Source AC maps to a task, verification step, review focus, expected execution evidence, or deferred-with-rationale row.
- Every Design anchor maps to a task, verification step, review focus, expected execution evidence, or deferred-with-rationale row.
- Every Test case maps to an automated command, integration/e2e/API/CLI/manual check, or deferred-with-rationale row.
- Non-goals, compatibility rules, surface boundaries, and unchanged behaviors from the source remain preserved in the plan.
- The plan does not add product, API, data, permission, workflow, runtime, or compatibility behavior not justified by the source.
- Each task has enough interfaces, context, support lenses, and expected evidence for an `exec` or `subagent-exec` implementer and reviewer to work independently.

## Severity

Use these severities:

- Critical: a required Source AC, Design anchor, or Test case is absent from the plan; the plan contradicts the source; or the plan invents behavior that would change product, API, data, permission, workflow, runtime, or compatibility semantics.
- Important: coverage is partial, verification is too weak to prove the source requirement, task handoff context is insufficient for isolated execution, or support-lens/surface-change evidence is missing.
- Minor: clarity or organization issue that does not risk missed implementation, extra behavior, weak verification, or failed handoff.

Critical and Important findings block final plan save and execution handoff until revised and rechecked.

## Output

Return findings in this shape:

```markdown
## Plan Review Result

- Review mode: subagent | same-context
- Reviewer independence: independent | degraded
- Verdict: approved | needs_revision | return_to_clarify | return_to_spec
- Unresolved findings: none | <count>
- Residual risk: none | <concrete risk>

## Coverage Matrix

| Source anchor | Plan coverage | Status | Notes |
|---|---|---|---|
| AC-001 | T-001 verification | covered | |

## Findings

### Critical

1. <finding or none>

### Important

1. <finding or none>

### Minor

1. <finding or none>

## Recheck Notes

For each fixed Critical or Important finding, state what changed and whether the affected source anchor is now covered.
```

For each finding, include:

- source anchor or source section
- draft plan location
- what is missing, extra, contradictory, or unverifiable
- why it matters
- what change or evidence would resolve it

## Boundary Rules

- Same-context review is allowed only as a degraded fallback when subagent review is unavailable.
- A same-context review must still use this exact rubric and must record the independence risk.
- Minor findings may remain if the final plan records residual risk and they do not affect execution correctness.
- Scratch review artifacts may live under `.loopx/plan-to-exec/<slug>-plan-review.md`; they are local workflow state and not repo-tracked docs by default.
```

- [ ] **Step 2: Add `plan-reviewer` to bundled skill discovery**

In `src/install-discovery.mjs`, add `'plan-reviewer',` after `'plan-to-exec',` in `LOOPX_SKILLS`:

```js
  'plan-to-exec',
  'plan-reviewer',
  'subagent-exec',
```

- [ ] **Step 3: Add `plan-reviewer` to package files**

In `package.json`, add `"skills/plan-reviewer/",` immediately after `"skills/plan-to-exec/",`:

```json
    "skills/plan-to-exec/",
    "skills/plan-reviewer/",
    "skills/refactor-plan/",
```

- [ ] **Step 4: Add resolver support-skill route**

In `skills/RESOLVER.md`, add this row to the Support Skills table after `requirement-analyzer`:

```markdown
| Plan artifact source-to-plan coverage audit, plan review, draft implementation plan quality, or checking whether AC/D/TC anchors map to tasks and verification | `skills/plan-reviewer/SKILL.md` |
```

In the Disambiguation list, update item 17 to include `plan-reviewer`:

```markdown
17. Treat `tdd`, `debug`, `verify`, `using-git-worktrees`, `doc-readability`, `requirement-analyzer`, `plan-reviewer`, `go-style`, `kratos`, `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, and `lancet` as support lenses unless the user explicitly invokes them directly.
```

Add a new item after the `requirement-analyzer` item:

```markdown
19. `plan-reviewer` may audit a draft or existing implementation plan, but it must not advance loopx workflow state. `plan-to-exec` uses it internally before final plan handoff; direct user invocation is for ad-hoc plan audits only.
```

Renumber the following item about `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, and `lancet` to `20`.

- [ ] **Step 5: Run the focused bundled skill test**

Run:

```bash
node --test --test-name-pattern "includes plan-reviewer" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit support skill surface**

Run:

```bash
git add skills/plan-reviewer/SKILL.md src/install-discovery.mjs package.json skills/RESOLVER.md
git commit -m "feat: add plan reviewer support lens"
```

Expected: commit succeeds with only these four paths.

### T-003 / Task 3: Integrate Internal Plan Review Into `plan-to-exec`

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`

**Interfaces:**
- Consumes: `skills/plan-reviewer/SKILL.md` rubric.
- Produces: updated `plan-to-exec` contract with mandatory internal review, subagent-first behavior, same-context fallback, findings gate, and final plan review metadata.

**Traceability:**
- Source AC: AC-001, AC-002, AC-003, AC-007, AC-008
- Design anchors: D-001, D-002, D-003, D-006
- Test cases: TC-001, TC-002, TC-003, TC-007, TC-008
- Task anchor: T-003

**Expected execution evidence:**
- `commands_run`:
  - `node --test --test-name-pattern "governs plan-to-exec internal source-to-plan review" test/skill-governance.test.mjs`: passes.
- `evidence_summary`: `plan-to-exec` text requires internal review before final save/handoff and records review metadata.
- `remaining_risk`: same-context review remains less independent by design and is explicitly documented.

**Review focus:**
- Verify the normal execution handoff remains `subagent-exec` or `exec`.
- Verify the text blocks final handoff on unresolved Critical/Important findings.
- Verify no CLI/runtime state/artifact-validator scope entered the skill.

**Support lenses:** architecture-designer

- [ ] **Step 1: Bump `plan-to-exec` metadata version**

In `skills/plan-to-exec/SKILL.md`, change:

```yaml
  version: "0.3.9"
```

to:

```yaml
  version: "0.3.10"
```

- [ ] **Step 2: Add `plan-reviewer` to the Overview source-to-plan contract**

After the paragraph that begins `When a source design spec contains D-* design anchors`, add:

```markdown
## Internal Plan Review

After drafting the complete plan and before saving the final plan or offering execution handoff, run the `plan-reviewer` support lens as a source-to-plan review gate.

Use a reviewer subagent when the platform supports subagents. Give the reviewer only the source artifact, the draft plan, relevant repo spec or memory context already selected for planning, and the `plan-reviewer` rubric. The reviewer must not inspect implementation code, because implementation has not started.

If subagents are unavailable, run the same `plan-reviewer` rubric in the current context. Mark this as degraded independence in the final plan or handoff:

```text
Plan review mode: same-context
Reviewer independence: degraded
Residual risk: source-to-plan coverage was not independently reviewed by a separate subagent
```

Critical or Important plan-review findings block final plan save and execution handoff. Revise the draft plan, then re-check the affected findings before continuing. If the finding exposes missing or contradictory source decisions, return to `clarify` or `spec` instead of inventing the decision in the plan.

Minor findings may remain only when they do not risk missed implementation, extra behavior, weak verification, or failed handoff; record the residual risk.

Optional scratch review artifacts may be written to `.loopx/plan-to-exec/<slug>-plan-review.md`. They are local workflow state and not repo-tracked docs by default.
```

Use four-backtick fences if needed so the nested `text` block does not close the surrounding Markdown fence.

- [ ] **Step 3: Update the Plan Document Header template**

In the Plan Document Header template, after `## Global Constraints`, add:

```markdown
## Internal Plan Review

- Plan review mode: subagent | same-context
- Reviewer independence: independent | degraded
- Unresolved findings: none | <summary of unresolved findings, or none>
- Residual risk: none | <concrete residual risk>

---
```

Keep the existing `---` divider after the new section.

- [ ] **Step 4: Update Self-Review checklist**

In `## Self-Review`, add this item after the current test-case coverage item:

```markdown
10. **Internal plan review readiness:** Is the draft complete enough for `plan-reviewer` to audit source-to-plan coverage, and does the final plan record `Plan review mode`, `Reviewer independence`, `Unresolved findings`, and `Residual risk`?
```

If the current list already has 10 items because newer local content includes task-anchor coverage, append this as the next number instead of renumbering unrelated content.

- [ ] **Step 5: Update Execution Handoff text**

Before `After saving the plan, offer execution choice:`, add:

```markdown
Do not offer execution choice until the internal plan review gate is complete and no Critical or Important findings remain unresolved.
```

- [ ] **Step 6: Run the focused contract test**

Run:

```bash
node --test --test-name-pattern "governs plan-to-exec internal source-to-plan review" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit `plan-to-exec` integration**

Run:

```bash
git add skills/plan-to-exec/SKILL.md test/skill-governance.test.mjs
git commit -m "feat: require internal plan review before handoff"
```

Expected: commit succeeds. Include `test/skill-governance.test.mjs` only if Task 1's version assertion changed in this task; if it was already committed and unchanged, omit it.

### T-004 / Task 4: Update User-Facing Skill Docs

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`

**Interfaces:**
- Consumes: support skill surface and main workflow mental model.
- Produces: docs that mention `plan-reviewer` as a support lens without changing the recommended workflow.

**Traceability:**
- Source AC: AC-004, AC-008
- Design anchors: D-004, D-006
- Test cases: TC-004, TC-008
- Task anchor: T-004

**Expected execution evidence:**
- `commands_run`:
  - `node --test --test-name-pattern "governs plan-to-exec internal source-to-plan review|keeps bundled skill frontmatter" test/skill-governance.test.mjs`: passes.
  - Negative `rg` assertions from Surface Inventory pass.
- `evidence_summary`: docs list `plan-reviewer` as a support skill and preserve the normal workflow.
- `remaining_risk`: none.

**Review focus:**
- Verify docs do not imply users must run `$plan-reviewer` in the normal flow.
- Verify English and Chinese docs align.

**Support lenses:** architecture-designer

- [ ] **Step 1: Update `docs/loopx/skills.md`**

In the Support Skills table, add this row after `requirement-analyzer`:

```markdown
| `plan-reviewer` | A draft or existing implementation plan needs source-to-plan coverage, scope drift, verification, or task handoff audit. | Used internally by `plan-to-exec`; direct use is for ad-hoc plan audits and does not advance workflow state. |
```

In `Choosing The Next Skill`, keep the existing main flow and add this bullet after the `plan-to-exec` rule:

```markdown
`plan-to-exec` runs `plan-reviewer` internally before final plan handoff; users normally continue directly to `subagent-exec` or `exec`.
```

If this section is numbered, add it as explanatory text under the existing `plan-to-exec` item instead of creating a new numbered workflow step.

- [ ] **Step 2: Update `docs/loopx/skills.zh-CN.md`**

Add the Chinese support skill row after `requirement-analyzer`:

```markdown
| `plan-reviewer` | 草稿或既有实施计划需要检查 source-to-plan 覆盖、scope drift、验证路径或任务交接质量。 | 由 `plan-to-exec` 内部使用；直接调用只用于临时 plan audit，不推进 workflow state。 |
```

Add an explanatory sentence under the `plan-to-exec` routing rule:

```markdown
`plan-to-exec` 会在最终 handoff 前内部运行 `plan-reviewer`；普通用户仍然直接继续到 `subagent-exec` 或 `exec`。
```

- [ ] **Step 3: Update `README.md` support skills list**

In the paragraph that starts `Support skills are lenses, not workflow states:`, insert `plan-reviewer` after `requirement-analyzer`:

```markdown
`doc-readability`, `requirement-analyzer`, `plan-reviewer`, `go-style`, `kratos`,
```

Add this short sentence after that paragraph:

```markdown
`plan-reviewer` is used internally by `plan-to-exec` to audit draft plan coverage before the normal execution handoff.
```

- [ ] **Step 4: Update `README.zh-CN.md` support skills list**

Mirror the README update in Chinese. Insert `plan-reviewer` into the support skills list after `requirement-analyzer`, and add:

```markdown
`plan-reviewer` 由 `plan-to-exec` 内部使用，用于在正常执行 handoff 前审核草稿计划的覆盖质量。
```

- [ ] **Step 5: Run docs and resolver focused tests**

Run:

```bash
node --test --test-name-pattern "governs plan-to-exec internal source-to-plan review|keeps bundled skill frontmatter" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run negative workflow expansion checks**

Run:

```bash
! rg "loopx plan-review|\\$plan-review|/plan-review" src scripts package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md skills/RESOLVER.md
! rg "plan-review.*workflow stage|workflow stage.*plan-review|Core Workflow Skills[\\s\\S]*plan-reviewer" skills/RESOLVER.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md README.md README.zh-CN.md
```

Expected: no output and exit 0.

- [ ] **Step 7: Commit docs updates**

Run:

```bash
git add README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md
git commit -m "docs: document plan reviewer support lens"
```

Expected: commit succeeds with only docs changes.

### T-005 / Task 5: Final Verification And Scope Audit

**Files:**
- No planned source edits. Only fix files touched by T-001 through T-004 if verification exposes a defect.

**Interfaces:**
- Consumes: completed skill/docs/governance changes.
- Produces: final verification evidence for review/final-review.

**Traceability:**
- Source AC: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008
- Design anchors: D-001, D-002, D-003, D-004, D-005, D-006
- Test cases: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008
- Task anchor: T-005

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs`: pass.
  - `node scripts/verify-skills.mjs`: pass and verify the bundled skill surface includes `plan-reviewer`.
  - `npm test`: pass.
  - `git diff --check`: pass.
  - Negative scope `rg` commands: no output.
- `evidence_summary`: full package skill surface, governance, docs, and tests agree on `plan-reviewer` as support lens and `plan-to-exec` internal review gate.
- `remaining_risk`: same-context review independence is intentionally degraded and documented.

**Review focus:**
- Verify no runtime/CLI/hook changes were introduced for this feature.
- Verify untracked or pre-existing dirty files are not accidentally included.
- Verify package file count changes from 26 to 27 bundled skills.

**Support lenses:** architecture-designer

- [ ] **Step 1: Run full skill governance tests**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: PASS. If the test count changes, record the new count in the task report.

- [ ] **Step 2: Run bundled skill verifier**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: PASS. The verifier output should report successful bundled skill verification, and the governed bundled skill surface should include `plan-reviewer`.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Run whitespace sanity**

Run:

```bash
git diff --check
```

Expected: no output and exit 0.

- [ ] **Step 5: Run negative scope assertions**

Run:

```bash
! rg "loopx plan-review|\\$plan-review|/plan-review" src scripts package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md skills/RESOLVER.md
! rg "plan-review.*workflow stage|workflow stage.*plan-review|Core Workflow Skills[\\s\\S]*plan-reviewer" skills/RESOLVER.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md README.md README.zh-CN.md
! rg "runtime state|new CLI command|artifact validator|migrate historical plans|required historical plan migration" skills/plan-to-exec/SKILL.md skills/plan-reviewer/SKILL.md test/skill-governance.test.mjs
```

Expected: all commands exit 0 because `rg` finds no forbidden text.

- [ ] **Step 6: Audit changed files**

Run:

```bash
git diff --name-only HEAD
```

Expected changed files for this feature are limited to:

```text
README.md
README.zh-CN.md
docs/loopx/skills.md
docs/loopx/skills.zh-CN.md
package.json
skills/RESOLVER.md
skills/plan-reviewer/SKILL.md
skills/plan-to-exec/SKILL.md
src/install-discovery.mjs
test/skill-governance.test.mjs
```

If unrelated dirty files appear, do not revert them; report them as pre-existing or concurrent user work and do not stage them.

- [ ] **Step 7: Commit verification fixes only if needed**

If verification requires a correction, make the correction in the owning file, rerun the failing command plus `node scripts/verify-skills.mjs`, then commit:

```bash
git commit -m "fix: align plan reviewer governance"
```

If no source files changed during T-005, do not create an empty commit.

## Final Verification Package

Before declaring implementation complete, collect these results:

```bash
node --test test/skill-governance.test.mjs
node scripts/verify-skills.mjs
npm test
git diff --check
! rg "loopx plan-review|\\$plan-review|/plan-review" src scripts package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md skills/RESOLVER.md
! rg "plan-review.*workflow stage|workflow stage.*plan-review|Core Workflow Skills[\\s\\S]*plan-reviewer" skills/RESOLVER.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md README.md README.zh-CN.md
! rg "runtime state|new CLI command|artifact validator|migrate historical plans|required historical plan migration" skills/plan-to-exec/SKILL.md skills/plan-reviewer/SKILL.md test/skill-governance.test.mjs
```

Expected final state:

- `plan-reviewer` is bundled, packaged, and documented as a support lens.
- `plan-to-exec` requires internal source-to-plan review before final save/handoff.
- Subagent path and same-context degraded fallback are both documented.
- Critical/Important plan-review findings block final plan handoff until revised and rechecked.
- Final plan/handoff records plan review mode, reviewer independence, blocking findings, and residual risk.
- No new workflow stage, CLI command, runtime state, artifact validator, or historical migration exists.

## Self-Review

- Spec coverage: T-001 through T-005 cover AC-001 through AC-008 and D-001 through D-006.
- Placeholder scan: no TBD/TODO/fill-in placeholders are used in task instructions. Template placeholders appear only where the implementation must insert feature-specific runtime values in generated plans.
- Type consistency: no runtime types or APIs are introduced. Package surface uses existing `LOOPX_BUNDLED_SKILLS` and `package.json.files` patterns.
- Design drift: no main workflow stage, CLI command, runtime state, artifact validator, code review responsibility, or historical plan migration is planned.
- Anchor coverage: every D anchor maps to at least one task and verification path.
- Surface-change coverage: Surface Inventory, Caller Proof, Negative Assertions, and package/deployment checks are included.
- Support lens coverage: architecture-designer is recorded because the source design changes workflow skill boundaries; lancet is called out for implementation minimization.
- Subagent handoff readiness: each task lists files, interfaces, traceability, expected evidence, review focus, and exact commands.
- Test-case coverage: TC-001 through TC-008 map to governance tests, docs/resolver checks, package verification, and negative scope assertions.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Residual risk: source-to-plan coverage was reviewed in this context because no separate subagent tool is available in this session; implementation should still rely on T-001 failing tests and T-005 final verification to catch drift.

Review notes:

- AC/D/TC coverage is mapped in the matrices above.
- The plan avoids a new workflow stage and keeps `plan-reviewer` in Support Skills.
- The plan includes package and docs governance because `plan-reviewer` is a bundled support skill.
- The plan does not touch runtime/hook files, respecting current unrelated dirty worktree changes.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-30-plan-to-exec-internal-plan-review.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
