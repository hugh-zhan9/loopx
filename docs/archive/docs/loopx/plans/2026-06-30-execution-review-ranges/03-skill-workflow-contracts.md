# Skill Workflow Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-30-execution-review-ranges/需求设计文档.md`

**Goal:** Update execution and finish orchestration skills so agents initialize execution ranges, preserve checkpoint review behavior, record child `plan_review`, and finish only after spec-level final-review.

**Architecture:** Runtime owns state commands; skills own when agents call them and how local state is updated. `exec` and `subagent-exec` call `execution-start` plus `finish-start`; `finish` reads canonical final-review and v2 multi-plan gates; `plan-to-exec` describes the updated package gate for future plans.

**Tech Stack:** Markdown skill contracts and Node governance tests.

**Support lenses:** `architecture-designer`, `cli-developer`

## Global Constraints

- Do not change `subagent-exec` subagent launching behavior.
- Do not require a code review after every `exec` task.
- Preserve `exec` checkpoint review and final checkpoint review before final-review.
- Every execution run records both `execution-start` and `finish-start`.
- Child plan final-review is process-only state, not a report artifact.
- Finish does not generate final-review reports.
- Bump only changed skill `metadata.version` values.

## Surface Inventory

- Public commands/API/routes/events/config: skill docs call `loopx execution-start`; `finish-start` remains.
- Exported functions/types/modules: none.
- Runtime/generated artifacts and templates: `.loopx/execution-ranges/`, `.loopx/multi-plan/` v2.
- Installer/package/deployment surface: changed bundled skills install through existing package surface.
- Hooks/background jobs/automation: no hook changes unless current hook text contains obsolete fields.
- Current product docs: `skills/exec/SKILL.md`, `skills/subagent-exec/SKILL.md`, `skills/finish/SKILL.md`, `skills/plan-to-exec/SKILL.md`, `skills/RESOLVER.md`.
- Tests/governance checks: `test/skill-governance.test.mjs`.
- Compatibility/migration paths: docs must mention baseline fallback and no historical artifact migration.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: Tasks cover AC-1 through AC-12 where skill contracts govern behavior, especially D-002, D-005, D-008, D-009, D-010, D-011.
- Recheck evidence: Added explicit no per-task mandatory review and no child report assertions to prevent regression against user-confirmed decisions.
- Residual risk: same-context plan review was not independent.

---

### T-001 / Task 1: Update `exec` startup and review loop contract

**Files:**
- Modify: `skills/exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: implementation plan path and slug.
- Produces: instructions to run `loopx execution-start <slug> --source <plan-path> [--design <design-path>]` and `loopx finish-start <slug> --source <plan-path>`.

**Traceability:**
- Source AC: `AC-1`, `AC-2`, `AC-2a`, `AC-6`, `AC-8a`
- Design anchors: `D-001`, `D-002`, `D-003`, `D-010`
- Test cases: `TC-1`, `TC-2`, `TC-6`, `TC-9a`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "exec"`
- `evidence_summary`: governance confirms `exec` calls both startup commands, keeps checkpoint review model, and runs final-review after final checkpoint.
- `remaining_risk`: none

**Review focus:**
- Verify this does not require review after every task.
- Verify final checkpoint review remains distinct from final-review.

**Support lenses:** none

- [ ] **Step 1: Add governance assertions**

Add:

```js
assert.match(execSkill, /loopx execution-start <slug> --source <plan-path>/);
assert.match(execSkill, /loopx finish-start <slug> --source <plan-path>/);
assert.match(execSkill, /checkpoint reviews rather than mandatory per-task reviews|checkpoint review/i);
assert.match(execSkill, /final checkpoint.*loopx:review/is);
assert.match(execSkill, /does not replace `loopx:final-review`/);
assert.match(execSkill, /git diff/);
assert.match(execSkill, /git diff --cached/);
```

- [ ] **Step 2: Bump `exec` skill version**

Change:

```yaml
metadata:
  version: "0.3.7"
```

- [ ] **Step 3: Update startup instructions**

Replace the startup command block with:

```markdown
Before implementation starts, record both requirement identity and finish audit baseline:

```bash
loopx execution-start <slug> --source <plan-path> [--design <design-path>]
loopx finish-start <slug> --source <plan-path>
```

`execution-start` records the requirement start commit and canonical final-review report identity. `finish-start` remains the committed audit baseline for `finish-audit`; do not merge these responsibilities.
```

- [ ] **Step 4: Preserve checkpoint review wording**

Ensure the review section says:

```markdown
Use checkpoint reviews, not mandatory review after every task. Before announcing all tasks complete or starting `loopx:final-review`, run a final checkpoint `loopx:review` unless the latest clean checkpoint review already covers every change since the previous review.
```

- [ ] **Step 5: Run focused governance test**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "exec"
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add skills/exec/SKILL.md test/skill-governance.test.mjs
git commit -m "Update exec execution range contract"
```

### T-002 / Task 2: Update `subagent-exec` multi-plan child state contract

**Files:**
- Modify: `skills/subagent-exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: child plan completion and plan-level final-review result.
- Produces: child row with `plan_review.status`, `reviewed_at`, `summary`, and `ready_for_spec_review`.

**Traceability:**
- Source AC: `AC-1`, `AC-3`, `AC-5`, `AC-12`
- Design anchors: `D-001`, `D-002`, `D-005`, `D-009`, `D-010`
- Test cases: `TC-1`, `TC-3`, `TC-5`, `TC-14`, `TC-15`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "subagent-exec|multi-plan"`
- `evidence_summary`: governance confirms no `plan_final_review`, child no report, startup calls both commands, spec-level report remains package artifact.
- `remaining_risk`: none

**Review focus:**
- Verify subagent launching behavior is untouched.
- Verify child plan final-review process still exists but report artifact does not.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Add governance assertions**

Add:

```js
assert.match(subagentExecSkill, /loopx execution-start <slug> --source <plan-path>/);
assert.match(subagentExecSkill, /loopx finish-start <slug> --source <plan-path>/);
assert.match(subagentExecSkill, /plan_review\.status/);
assert.match(subagentExecSkill, /ready_for_spec_review/);
assert.match(subagentExecSkill, /must not write.*final-review.*report/is);
assert.doesNotMatch(subagentExecSkill, /plan_final_review/);
```

- [ ] **Step 2: Bump `subagent-exec` version**

```yaml
metadata:
  version: "0.3.9"
```

- [ ] **Step 3: Update preflight command block**

Use:

```bash
loopx execution-start <slug> --source <plan-path> [--design <design-path>]
loopx finish-start <slug> --source <plan-path>
```

State that `subagent-exec` subagent capability detection/launching is unchanged.

- [ ] **Step 4: Replace child state example**

Replace `plan_final_review` example with:

```json
{
  "path": "docs/loopx/plans/2026-06-30-feature/01-core.md",
  "status": "complete",
  "plan_review": {
    "status": "passed",
    "reviewed_at": "2026-06-30T00:00:00.000Z",
    "summary": "No blocking issues"
  },
  "ready_for_spec_review": true
}
```

Add:

```markdown
For child plans, run plan-level `loopx:final-review` as a process gate but do not write a `.loopx/final-review/*.md` report. The child review result is represented only by the matching `plans[]` row in `.loopx/multi-plan/<feature-slug>/state.json`.
```

- [ ] **Step 5: Run focused tests**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "subagent-exec|multi-plan"
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add skills/subagent-exec/SKILL.md test/skill-governance.test.mjs
git commit -m "Update subagent-exec child review state"
```

### T-003 / Task 3: Update `finish` skill gate and report evidence contract

**Files:**
- Modify: `skills/finish/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: canonical final-review report, execution range state, finish audit state, multi-plan v2 state.
- Produces: finish guidance requiring tracked clean state before done and reporting start commit/final HEAD evidence.

**Traceability:**
- Source AC: `AC-4`, `AC-7`, `AC-8`, `AC-8a`, `AC-12`
- Design anchors: `D-004`, `D-008`, `D-009`, `D-010`
- Test cases: `TC-4`, `TC-8`, `TC-9`, `TC-9b`, `TC-15`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "finish"`
- `evidence_summary`: governance confirms `finish` reads canonical report, checks `plan_review.status`, blocks tracked dirty, ignores untracked files, and records start/final evidence.
- `remaining_risk`: none

**Review focus:**
- Verify `finish` still does not generate final-review reports.
- Verify `finish` does not require reviewed end commit equality.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Add governance assertions**

Add:

```js
assert.match(finishSkill, /canonical final-review report/);
assert.match(finishSkill, /requirement start commit/);
assert.match(finishSkill, /final `HEAD`/);
assert.match(finishSkill, /commit list/);
assert.match(finishSkill, /changed files/);
assert.match(finishSkill, /tracked changes.*commit/is);
assert.match(finishSkill, /untracked files.*clean/is);
assert.match(finishSkill, /plan_review\.status/);
assert.doesNotMatch(finishSkill, /plan_final_review/);
assert.doesNotMatch(finishSkill, /reviewed end commit.*current HEAD/is);
```

- [ ] **Step 2: Bump `finish` version**

```yaml
metadata:
  version: "0.3.7"
```

- [ ] **Step 3: Update final-review artifact lookup**

Change latest arbitrary report language to:

```markdown
Before presenting completion options, look for the canonical final-review report recorded by `.loopx/execution-ranges/<slug>.json` or derived from the design/source identity:

```text
.loopx/final-review/<design-date>-<design-slug>.md
```

If no report exists, do not generate one inside `finish`.
```

- [ ] **Step 4: Update multi-plan gate**

Replace child gate bullets with:

```markdown
- every child plan has `status: complete`
- every child plan has `plan_review.status: passed`
- every child plan has `ready_for_spec_review: true`
- `spec_final_review.path` exists
- `spec_final_review.ready_for_finish === "Yes"`
```

- [ ] **Step 5: Update dirty/evidence wording**

Add:

```markdown
Before recording completion with `done`, tracked staged or unstaged changes must be committed into final `HEAD`. Untracked files count as clean and do not block finish. The finish report must include requirement start commit, final `HEAD`, commit list, changed files, tracked status summary, and untracked summary.
```

- [ ] **Step 6: Run focused tests**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "finish"
```

Expected: tests pass.

- [ ] **Step 7: Commit**

```bash
git add skills/finish/SKILL.md test/skill-governance.test.mjs
git commit -m "Update finish execution range contract"
```

### T-004 / Task 4: Synchronize planning and resolver workflow contracts

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/RESOLVER.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: approved design source.
- Produces: future multi-plan package guidance using child `plan_review` and spec-level final-review.

**Traceability:**
- Source AC: `AC-3`, `AC-5`, `AC-12`
- Design anchors: `D-005`, `D-009`, `D-011`
- Test cases: `TC-3`, `TC-5`, `TC-14`, `TC-15`
- Task anchor: `T-004`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "plan-to-exec|resolver|multi-plan"`
- `evidence_summary`: governance confirms future plans describe child no-report state and spec-level final-review gate.
- `remaining_risk`: none

**Review focus:**
- Verify plan-to-exec remains planning-only and does not claim to run `execution-start`.
- Verify resolver text routes users to child final-review process and package spec-level report.

**Support lenses:** none

- [ ] **Step 1: Add governance assertions**

Add:

```js
assert.match(planSkill, /plan_review\.status/);
assert.match(planSkill, /child plan.*does not create final-review report/is);
assert.match(planSkill, /spec-level `final-review`/);
assert.match(resolver, /plan_review\.status|plan-level final-review/);
assert.doesNotMatch(planSkill, /plan_final_review/);
```

- [ ] **Step 2: Bump `plan-to-exec` version**

```yaml
metadata:
  version: "0.3.11"
```

- [ ] **Step 3: Update multi-plan package section**

Ensure `skills/plan-to-exec/SKILL.md` says:

```markdown
After each child plan, run plan-level `final-review` and update `.loopx/multi-plan/<feature-slug>/state.json` with `plan_review.status`, `reviewed_at`, `summary`, and `ready_for_spec_review`. Child plan-level review does not create a final-review report artifact. After all child plans are ready, run one spec-level `final-review`, then `finish`.
```

- [ ] **Step 4: Update resolver**

In `skills/RESOLVER.md`, update multi-plan handoff text so it says child plans receive plan-level final-review state and the package receives one spec-level final-review report.

- [ ] **Step 5: Run focused tests**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "plan-to-exec|resolver|multi-plan"
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add skills/plan-to-exec/SKILL.md skills/RESOLVER.md test/skill-governance.test.mjs
git commit -m "Synchronize multi-plan workflow contracts"
```

## Plan-Level Verification

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "exec|subagent-exec|finish|plan-to-exec|resolver|multi-plan"
node scripts/verify-skills.mjs
```

Expected: focused governance and skill verification pass.

## Execution Handoff

Implement this child plan after `01-runtime-state-and-finish.md` defines the CLI/runtime names. It can run in parallel with `02-final-review-contracts.md` if both agents keep the shared `skills/final-review` and governance test edits coordinated. After all tasks pass, run plan-level `final-review` for this child plan and update `.loopx/multi-plan/2026-06-30-execution-review-ranges/state.json` with `plan_review.status: "passed"` and `ready_for_spec_review: true`. Do not write a child `.loopx/final-review/*.md` report.
