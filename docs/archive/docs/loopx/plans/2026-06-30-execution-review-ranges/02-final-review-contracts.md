# Final Review Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-30-execution-review-ranges/需求设计文档.md`

**Goal:** Update final-review instructions, reviewer prompt, and templates to use start-anchored current-state review, canonical report updates, localized Chinese output, and actionable coverage blockers.

**Architecture:** `final-review` reads execution range identity when present, reviews `start_commit` plus current `HEAD` and tracked diffs when needed, and writes one canonical single/spec-level report per design/source. Multi-plan child reviews update state only and do not write report artifacts.

**Tech Stack:** Markdown skill files, final-review prompt/template files, Node governance tests.

**Support lenses:** `architecture-designer`, `cli-developer`

## Global Constraints

- `Ready for finish?`, `Yes`, `No`, and `With fixes` remain exact tokens.
- Chinese reports localize all other human-facing headings and labels.
- Coverage `missing` becomes Critical + blocking issue.
- Coverage `partial` becomes Important + blocking issue.
- `Ready for finish? Yes` is impossible while Critical/Important findings remain.
- Child plan-level final-review creates no `.loopx/final-review/*.md` report.
- Repeated final-review for the same design/source updates the same canonical report and appends an iteration entry.
- Bump only changed skill `metadata.version` values.

## Surface Inventory

- Public commands/API/routes/events/config: no new CLI in this child plan.
- Exported functions/types/modules: none.
- Runtime/generated artifacts and templates: `.loopx/final-review/<canonical>.md`; report templates.
- Installer/package/deployment surface: `skills/final-review/` is bundled.
- Hooks/background jobs/automation: none.
- Current product docs: `skills/final-review/SKILL.md`, `skills/final-review/final-reviewer.md`, report templates.
- Tests/governance checks: `test/skill-governance.test.mjs`.
- Compatibility/migration paths: old reports are not migrated; new reports use canonical path.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: Tasks cover AC-2, AC-3, AC-7, AC-8a, AC-9, AC-10, AC-11, AC-12 and D-003, D-004, D-005, D-006, D-007, D-009, D-011.
- Recheck evidence: Added explicit governance assertions so template wording and coverage blocker behavior are machine-checked.
- Residual risk: same-context plan review was not independent.

---

### T-001 / Task 1: Update final-review skill scope and report identity

**Files:**
- Modify: `skills/final-review/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: `.loopx/execution-ranges/<slug>.json`, source design/spec, current git `HEAD`, optional `git diff`, optional `git diff --cached`.
- Produces: canonical report path `.loopx/final-review/<design-date>-<design-slug>.md` for single/spec-level review; child plan state update only for plan-level review.

**Traceability:**
- Source AC: `AC-2`, `AC-3`, `AC-7`, `AC-8a`, `AC-9`, `AC-12`
- Design anchors: `D-003`, `D-004`, `D-005`, `D-009`
- Test cases: `TC-2`, `TC-3`, `TC-7`, `TC-7a`, `TC-10`, `TC-14`, `TC-15`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "final-review"`
- `evidence_summary`: governance tests find start-anchored scope, canonical report rule, child no-report rule, and diff command requirements.
- `remaining_risk`: none

**Review focus:**
- Verify no instruction requires an end commit before final-review.
- Verify child plan-level final-review says state update only and no report artifact.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Add governance assertions first**

In `test/skill-governance.test.mjs`, add assertions to the final-review governance test:

```js
assert.match(finalReviewSkill, /start_commit/);
assert.match(finalReviewSkill, /current `HEAD`/);
assert.match(finalReviewSkill, /git diff/);
assert.match(finalReviewSkill, /git diff --cached/);
assert.match(finalReviewSkill, /canonical final-review report/);
assert.match(finalReviewSkill, /same design|same design solution|same design\/source/);
assert.match(finalReviewSkill, /child plan-level final-review must not write/i);
assert.match(finalReviewSkill, /plan_review\.status/);
assert.doesNotMatch(finalReviewSkill, /concrete git range.*required/i);
```

- [ ] **Step 2: Bump final-review skill version**

Change frontmatter in `skills/final-review/SKILL.md`:

```yaml
metadata:
  version: "0.3.10"
```

- [ ] **Step 3: Replace scope section**

Update the multi-plan/scope section to state:

```markdown
Final review uses a start-anchored current-state model:

- Read `start_commit` from `.loopx/execution-ranges/<slug>.json` when present.
- If execution range state is missing, derive the start from approved source context or finish baseline fallback and state the fallback in the report.
- Review current `HEAD` at review time.
- If tracked staged or unstaged changes exist, include both `git diff` and `git diff --cached` in review inputs and mark `tracked_diff_included: yes`.
- Do not require or invent an execution end commit before final-review.
```

- [ ] **Step 4: Define canonical report identity**

Replace old naming instructions with:

```markdown
Single-plan and spec-level final-review write one canonical report per design/source:

```text
.loopx/final-review/<design-date>-<design-slug>.md
```

If a `design_artifact` exists, derive `<design-date>-<design-slug>` from that design directory. If no design artifact exists, derive the slug from the source artifact. Repeated final-review for the same design/source updates this same file and appends a `Review Iterations` / `复审记录` entry; do not create `re-review` sibling files.
```

- [ ] **Step 5: Define child plan no-report behavior**

Add:

```markdown
For multi-plan child plan-level final-review, run the review process but do not write a `.loopx/final-review/*.md` report. Update `.loopx/multi-plan/<feature-slug>/state.json` for the child row:

```json
{
  "plan_review": {
    "status": "passed",
    "reviewed_at": "2026-06-30T00:00:00.000Z",
    "summary": "No blocking issues"
  },
  "ready_for_spec_review": true
}
```

Child plan state must not record child `start_commit`, current `HEAD`, or end commit metadata. Only spec-level final-review writes the persisted package report.
```

- [ ] **Step 6: Run focused governance test**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "final-review"
```

Expected: focused tests pass.

- [ ] **Step 7: Commit**

```bash
git add skills/final-review/SKILL.md test/skill-governance.test.mjs
git commit -m "Update final-review scope contract"
```

### T-002 / Task 2: Update final-reviewer prompt for coverage blockers

**Files:**
- Modify: `skills/final-review/final-reviewer.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: requirements coverage matrix and reviewer findings.
- Produces: reviewer output where missing/partial coverage is duplicated in findings and blocking issues.

**Traceability:**
- Source AC: `AC-11`
- Design anchors: `D-006`, `D-011`
- Test cases: `TC-12`, `TC-13`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "coverage"`
- `evidence_summary`: tests assert missing -> Critical and partial -> Important, both blocking.
- `remaining_risk`: none

**Review focus:**
- Verify partial requirement implementation is never optional for finish.
- Verify `Ready for finish? Yes` is forbidden when missing or partial exists.

**Support lenses:** none

- [ ] **Step 1: Write prompt governance assertions**

Add:

```js
assert.match(finalReviewerPrompt, /missing.*Critical/is);
assert.match(finalReviewerPrompt, /partial.*Important/is);
assert.match(finalReviewerPrompt, /Blocking issues/is);
assert.match(finalReviewerPrompt, /Ready for finish\?.*must not be `?Yes`?/is);
```

- [ ] **Step 2: Add prompt rule**

In `skills/final-review/final-reviewer.md`, add a mandatory rule near findings generation:

```markdown
Coverage gaps are blocking findings:

- Any requirement marked missing must produce a Critical finding and a matching Blocking issues entry.
- Any requirement marked partial must produce an Important finding and a matching Blocking issues entry.
- If any missing or partial requirement exists, `Ready for finish?` must be `No` or `With fixes`, never `Yes`.
- Do not leave coverage gaps only in the coverage matrix; `fix-review` consumes findings and blocking issues.
```

- [ ] **Step 3: Run focused governance test**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "coverage|final-review"
```

Expected: focused tests pass.

- [ ] **Step 4: Commit**

```bash
git add skills/final-review/final-reviewer.md test/skill-governance.test.mjs
git commit -m "Make final-review coverage gaps blocking"
```

### T-003 / Task 3: Update report templates for scope metadata and localization

**Files:**
- Modify: `skills/final-review/references/report-template.en.md`
- Modify: `skills/final-review/references/report-template.zh-CN.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: final-review scope metadata.
- Produces: template fields for `start_commit`, `review_head`, `tracked_diff_included`, `diff commands used`, `Review Iterations` / `复审记录`.

**Traceability:**
- Source AC: `AC-7`, `AC-9`, `AC-10`, `AC-11`
- Design anchors: `D-003`, `D-004`, `D-006`, `D-007`
- Test cases: `TC-7`, `TC-7a`, `TC-10`, `TC-11`, `TC-12`, `TC-13`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "template|Chinese|final-review"`
- `evidence_summary`: template tests prove scope metadata exists and zh-CN template only retains allowed English gate tokens.
- `remaining_risk`: none

**Review focus:**
- Verify Chinese template has no English human labels such as `Coverage`, `Runtime`, `Regression`, `Blocking issues`, `Critical`, `Important`, `Minor`.
- Verify allowed English tokens are preserved exactly.

**Support lenses:** none

- [ ] **Step 1: Add template assertions**

Add a helper assertion:

```js
for (const required of ['start_commit', 'review_head', 'tracked_diff_included', 'git diff', 'git diff --cached']) {
  assert.match(finalReviewTemplateEn, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(finalReviewTemplateZh, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(finalReviewTemplateEn, /Review Iterations/);
assert.match(finalReviewTemplateZh, /复审记录/);
for (const forbidden of ['Blocking issues', 'Coverage:', 'Runtime', 'Regression', 'Critical', 'Important', 'Minor']) {
  assert.doesNotMatch(finalReviewTemplateZh, new RegExp(forbidden));
}
for (const token of ['Ready for finish?', 'Yes', 'No', 'With fixes']) {
  assert.match(finalReviewTemplateZh, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
```

- [ ] **Step 2: Update English template**

Ensure `report-template.en.md` includes:

```markdown
## Review Scope

- start_commit: `<sha>`
- review_head: `<sha>`
- tracked_diff_included: `yes|no`
- diff commands used:
  - `git diff`
  - `git diff --cached`

## Review Iterations

| reviewed_at | reviewed_head | previous verdict | current verdict | fixed findings summary |
|---|---|---|---|---|
| `<timestamp>` | `<sha>` | `<Yes|No|With fixes>` | `<Yes|No|With fixes>` | `<summary>` |
```

- [ ] **Step 3: Update Chinese template**

Ensure `report-template.zh-CN.md` uses Chinese headings:

```markdown
## 评审范围

- start_commit: `<sha>`
- review_head: `<sha>`
- tracked_diff_included: `yes|no`
- 使用的 diff 命令:
  - `git diff`
  - `git diff --cached`

## 复审记录

| 评审时间 | review_head | 上次结论 | 本次结论 | 已修复问题摘要 |
|---|---|---|---|---|
| `<timestamp>` | `<sha>` | `<Yes|No|With fixes>` | `<Yes|No|With fixes>` | `<摘要>` |
```

Replace human labels:

```text
Blocking issues -> 阻塞问题
Coverage -> 覆盖情况
Runtime -> 运行时验证
Regression -> 回归评估
Critical -> 严重
Important -> 重要
Minor -> 次要
```

- [ ] **Step 4: Run focused governance test**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "template|Chinese|final-review"
```

Expected: focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/final-review/references/report-template.en.md skills/final-review/references/report-template.zh-CN.md test/skill-governance.test.mjs
git commit -m "Update final-review report templates"
```

## Plan-Level Verification

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "final-review|template|coverage"
node scripts/verify-skills.mjs
```

Expected: focused governance and skill verification pass.

## Execution Handoff

Implement this child plan after `01-runtime-state-and-finish.md` defines the execution range field names. After all tasks pass, run plan-level `final-review` for this child plan and update `.loopx/multi-plan/2026-06-30-execution-review-ranges/state.json` with `plan_review.status: "passed"` and `ready_for_spec_review: true`. Do not write a child `.loopx/final-review/*.md` report.
