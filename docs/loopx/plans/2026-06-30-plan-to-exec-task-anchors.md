# Plan-To-Exec Task Anchors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-30-plan-to-exec-task-anchors/需求设计文档.md`

**Goal:** Add stable `T-*` task anchors to `plan-to-exec` output and preserve those anchors through `exec`, `subagent-exec`, and `review`.

**Architecture:** This is a markdown workflow contract change with one helper-script compatibility update. `T-*` anchors are plan-local documentation anchors, not runtime state; `Task N` stays for human readability and current numeric `task-brief` invocation compatibility. Downstream skills preserve `T-*` in progress, handoff, reports, checkpoints, and review findings without adding a `final-review` hard matrix gate.

**Tech Stack:** Node.js ESM package, Markdown skill contracts, Bash `task-brief` helper, `node:test`, `node:assert/strict`, `scripts/verify-skills.mjs`.

**Support lenses:** architecture-designer

## Global Constraints

- Preserve existing plan output paths: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` and `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/` for multi-plan packages.
- Preserve existing `task-brief PLAN_FILE TASK_NUMBER [OUTFILE]` invocation shape.
- Preserve historical `### Task N: ...` plan compatibility.
- Preserve existing `AC-*`, `D-*`, and `TC-*` traceability rules.
- Do not introduce runtime state machines, new CLI commands, artifact validators, historical plan migration, or `final-review` full `AC -> D -> T -> verification` hard gates.
- Do not rework the already landed `D-*` design anchor contract.
- Update only the confirmed skill contracts, governance tests, and necessary `task-brief` compatibility code/tests.
- Bump only changed bundled skill `metadata.version` values.
- Run `node --test test/skill-governance.test.mjs`.
- Run `node scripts/verify-skills.mjs`.

---

## Bootstrap Note

This plan is generated before `task-brief` understands the future `### T-001 / Task 1: ...` heading format. To remain executable by the current `subagent-exec` helper, this implementation plan keeps current `### Task N: ...` headings and places the future task anchor in each task's traceability block as `Task anchor: T-00N`.

Do not treat this bootstrap shape as the future output contract. The implementation target remains `### T-001 / Task 1: Add ledger validation` for new plans after this slice lands.

## File Structure

- Modify `test/skill-governance.test.mjs`: add failing governance assertions for `T-*` task anchors across `plan-to-exec`, `exec`, `subagent-exec`, `review`, and `task-brief` compatibility.
- Modify `skills/plan-to-exec/SKILL.md`: define `T-*` heading format, plan-local uniqueness, multi-plan cross-reference rules, required `Review focus`, and self-review checks. Bump `metadata.version` from `0.3.7` to `0.3.8`.
- Modify `skills/exec/SKILL.md`: require checkpoint, review request, and blocked escalation text to preserve `T-*` when present. Bump `metadata.version` from `0.3.3` to `0.3.4`.
- Modify `skills/subagent-exec/SKILL.md`: require pre-flight, task brief, reports, progress ledger, handoff context, and reviewer prompts to preserve `T-*`. Bump `metadata.version` from `0.3.6` to `0.3.7`.
- Modify `skills/subagent-exec/implementer-prompt.md`: update prompt wording and report block guidance to preserve the task anchor.
- Modify `skills/subagent-exec/task-reviewer-prompt.md`: update reviewer context and output guidance to verify task anchor preservation.
- Modify `skills/subagent-exec/scripts/task-brief`: support both old `### Task N: ...` and new `### T-001 / Task N: ...` headings while keeping numeric task selection.
- Modify `skills/review/SKILL.md`: require Stage 1 findings or coverage notes to reference `T-*` when a formal plan includes task anchors. Bump `metadata.version` from `0.3.5` to `0.3.6`.

## Surface Inventory

- Public commands/API/routes/events/config: no changes. `task-brief PLAN_FILE TASK_NUMBER [OUTFILE]` remains unchanged.
- Exported functions/types/modules: no changes.
- Runtime/generated artifacts and templates: no runtime state changes. `task-brief` may generate the same brief file paths as before.
- Installer/package/deployment surface: bundled skill content changes only; `skills/subagent-exec/scripts/task-brief` remains inside the bundled skill directory. `node scripts/verify-skills.mjs` must pass.
- Hooks/background jobs/automation: no hook changes.
- Current product docs: only skill docs and prompt/helper docs in `skills/` change.
- Tests/governance checks: update `test/skill-governance.test.mjs`.
- Compatibility/migration paths: historical `### Task N: ...` plans remain supported; no migration.

Caller Proof commands before implementation:

```bash
rg "### Task N|Task N: complete|scripts/task-brief PLAN_FILE N|Task [0-9]|task-N-report|Spec Compliance Check|D-\\*" skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec skills/review/SKILL.md test/skill-governance.test.mjs
rg "task-brief|subagent-exec/scripts" package.json scripts skills test
```

Expected before implementation:

- `skills/plan-to-exec/SKILL.md` still shows `### Task N: [Component Name]`.
- `skills/subagent-exec/scripts/task-brief` matches only `##/### Task N`.
- `exec`, `subagent-exec`, and `review` do not require `T-*` preservation.
- `package.json` already includes the `skills/subagent-exec/` directory through the package files list.

Negative Assertions after implementation:

```bash
! rg "runtime state machine|new CLI command|artifact validator" skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/review/SKILL.md test/skill-governance.test.mjs
! rg "final-review.*hard gate|hard gate.*final-review|full AC -> D -> T -> verification.*hard" skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/review/SKILL.md test/skill-governance.test.mjs
BASE=$(node -e 'const fs=require("fs"); const p=".loopx/finish/baselines/plan-to-exec-task-anchors.json"; console.log(JSON.parse(fs.readFileSync(p,"utf8")).head)')
git diff --name-only "$BASE"..HEAD | rg -v "^(skills/plan-to-exec/SKILL\\.md|skills/exec/SKILL\\.md|skills/subagent-exec/SKILL\\.md|skills/subagent-exec/implementer-prompt\\.md|skills/subagent-exec/task-reviewer-prompt\\.md|skills/subagent-exec/scripts/task-brief|skills/review/SKILL\\.md|test/skill-governance\\.test\\.mjs)$" && exit 1 || true
```

Expected after implementation:

- No runtime state, root CLI command, artifact validator, historical plan migration, or `final-review` hard matrix gate is introduced.
- Only the allowed files above appear in the implementation diff from finish baseline to HEAD.

Strict current product surface:

- `skills/plan-to-exec/SKILL.md`
- `skills/exec/SKILL.md`
- `skills/subagent-exec/SKILL.md`
- `skills/subagent-exec/implementer-prompt.md`
- `skills/subagent-exec/task-reviewer-prompt.md`
- `skills/subagent-exec/scripts/task-brief`
- `skills/review/SKILL.md`
- `test/skill-governance.test.mjs`
- `package.json`
- `scripts/verify-skills.mjs`

Historical context paths may mention old behavior:

- `docs/loopx/design/**`
- `docs/loopx/plans/**`
- `docs/release-notes/**`
- `docs/articles/**`

## Anchor Coverage Matrix

| Anchor | Source AC | Covered by |
|---|---|---|
| D-001 | AC-001 | Task 2 updates `plan-to-exec`; Task 1/5 governance; Task 6 verification |
| D-002 | AC-002 | Task 2 heading contract; Task 4 `task-brief` compatibility; Task 1/5 tests |
| D-003 | AC-005, AC-006 | Task 2 uniqueness and multi-plan rules; Task 5 assertions |
| D-004 | AC-004 | Task 2 required `Review focus`; Task 5 assertions |
| D-005 | AC-003 | Task 3 downstream `exec`/`subagent-exec`/`review` contracts; Task 5 assertions |
| D-006 | AC-007 | Task 4 `task-brief` compatibility; Task 1 helper test; Task 6 negative checks |
| D-007 | AC-007 | Task 5 negative scope assertions; Task 6 final verification |

## Test Case Coverage Matrix

| TC | Source AC | Plan coverage |
|---|---|---|
| TC-001 | AC-001 | Task 1 failing assertions; Task 2 plan-to-exec contract; Task 6 verification |
| TC-002 | AC-002 | Task 1/4 `task-brief` new-heading test; Task 2 heading contract |
| TC-003 | AC-003 | Task 3 downstream skill updates; Task 5 assertions |
| TC-004 | AC-004 | Task 2 `Review focus` field; Task 5 assertions |
| TC-005 | AC-005 | Task 2 uniqueness rule; Task 5 assertions |
| TC-006 | AC-006 | Task 2 multi-plan cross-reference rule; Task 5 assertions |
| TC-007 | AC-007 | Task 5 negative assertions; Task 6 verification |

### Task 1: Add Failing Governance And Compatibility Tests

**Task anchor:** T-001

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: existing helpers `parseFrontmatter`, `execFileAsync`, `readFile`, `writeFile`, `appendFile`, `join`, `repoRoot`.
- Produces: failing tests that define the `T-*` contract before implementation.

**Traceability:**
- Source AC: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
- Design anchors: D-001, D-002, D-003, D-004, D-005, D-006, D-007
- Test cases: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007

**Review focus:**
- Verify the tests fail against the current implementation for missing `T-*` task anchor support.
- Verify the helper-script test still proves old `Task N` headings remain supported.
- Verify no runtime/CLI/artifact-validator expectations are introduced.

**Support lenses:** architecture-designer

- [ ] **Step 1: Update the existing `subagent-exec helper scripts create gitignored file handoff artifacts` fixture to use new task headings**

In `test/skill-governance.test.mjs`, inside the existing `writeFile(join(wd, 'plan.md'), [...])` fixture, replace these two heading lines:

```js
      '### Task 1: Add greeting',
      '### Task 2: Use greeting',
```

with:

```js
      '### T-001 / Task 1: Add greeting',
      'Task anchor: T-001',
      '',
      '### T-002 / Task 2: Use greeting',
      'Task anchor: T-002',
```

Update the existing brief assertions in the same test from:

```js
    assert.match(brief, /# Task 1 Brief/);
    assert.match(brief, /Runtime: Node\.js ESM/);
    assert.match(brief, /Produces: `greet\(name\)`/);
    assert.doesNotMatch(brief, /Task 2: Use greeting/);
```

to:

```js
    assert.match(brief, /# Task 1 Brief/);
    assert.match(brief, /T-001 \/ Task 1: Add greeting/);
    assert.match(brief, /Task anchor: T-001/);
    assert.match(brief, /Runtime: Node\.js ESM/);
    assert.match(brief, /Produces: `greet\(name\)`/);
    assert.doesNotMatch(brief, /T-002 \/ Task 2: Use greeting/);
```

Update the final brief assertions from:

```js
    assert.match(finalBrief, /# Task 2 Brief/);
    assert.match(finalBrief, /Task 2: Use greeting/);
```

to:

```js
    assert.match(finalBrief, /# Task 2 Brief/);
    assert.match(finalBrief, /T-002 \/ Task 2: Use greeting/);
    assert.match(finalBrief, /Task anchor: T-002/);
```

- [ ] **Step 2: Add a legacy heading compatibility check in the same helper-script test**

Immediately after the final brief assertions and before the `review-package` assertions, add:

```js
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
```

- [ ] **Step 3: Add a failing governance test for task anchors**

Insert this test immediately after `governs design contract anchors across spec planning and review`:

```js
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

    assert.equal(planFields['metadata.version'], '0.3.8');
    assert.equal(execFields['metadata.version'], '0.3.4');
    assert.equal(subagentExecFields['metadata.version'], '0.3.7');
    assert.equal(reviewFields['metadata.version'], '0.3.6');

    assert.match(planSkill, /T-\*/);
    assert.match(planSkill, /### T-001 \/ Task 1:/);
    assert.match(planSkill, /plan-local/i);
    assert.match(planSkill, /append new `T-\*` anchors/i);
    assert.match(planSkill, /child plan slug|child plan path/i);
    assert.match(planSkill, /Review focus/);
    assert.match(planSkill, /not_applicable/);
    assert.match(planSkill, /Task anchor coverage|T-\*.*coverage/i);

    assert.match(execSkill, /T-\*/);
    assert.match(execSkill, /checkpoint/i);
    assert.match(execSkill, /review request/i);
    assert.match(execSkill, /T-001 \/ Task 1/);

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
      assert.doesNotMatch(text, /runtime state machine|new CLI command|artifact validator/i, `${label} should not expand task anchors into runtime scope`);
      assert.doesNotMatch(text, /historical plan migration|migrate historical plans/i, `${label} should not require historical plan migration`);
    }
    assert.doesNotMatch(finalReviewSkill, /AC -> D -> T -> verification.*hard gate|hard gate.*AC -> D -> T -> verification/i);
  });
```

- [ ] **Step 4: Run targeted governance tests and confirm failure**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: FAIL. One failure should show `task not found: Task 1 in plan.md` from `task-brief`, or the new governance test should fail on missing `0.3.8`, `T-*`, `Review focus`, `task_anchor`, or related contract text.

- [ ] **Step 5: Commit the failing tests**

Run:

```bash
git add test/skill-governance.test.mjs
git commit -m "test: cover plan task anchors"
```

Expected: commit succeeds.

### Task 2: Update Plan-To-Exec Task Anchor Contract

**Task anchor:** T-002

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: `AC-*`, `D-*`, and `TC-*` traceability already present in `plan-to-exec`.
- Produces: future plan task structure with stable `T-*`, compatible `Task N`, and required `Review focus`.

**Traceability:**
- Source AC: AC-001, AC-002, AC-004, AC-005, AC-006, AC-007
- Design anchors: D-001, D-002, D-003, D-004, D-007
- Test cases: TC-001, TC-002, TC-004, TC-005, TC-006, TC-007

**Review focus:**
- Verify the skill generates future task headings as `### T-001 / Task 1: ...`.
- Verify the task template requires `Review focus` without making every task trigger full review.
- Verify the skill preserves existing AC/D/TC rules and does not create runtime or validator scope.

**Support lenses:** architecture-designer

- [ ] **Step 1: Bump metadata version**

In `skills/plan-to-exec/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.7"
```

to:

```yaml
metadata:
  version: "0.3.8"
```

- [ ] **Step 2: Add a task anchor contract after the `D-*` design anchor paragraph**

Insert this text immediately after the paragraph beginning `When a source design spec contains`:

```markdown
## Task Anchor Contract

For new implementation plans, assign every implementation task a stable plan-local `T-*` task anchor such as `T-001`, `T-002`, and `T-003`. Use the heading format `### T-001 / Task 1: <task name>` so `T-*` is the stable downstream reference while `Task N` remains readable and compatible with numeric task selection.

`T-*` anchors are unique within one plan. If a plan is edited later, preserve existing `T-*` anchors and append new `T-*` anchors for inserted tasks instead of renumbering old anchors. Do not migrate historical `### Task N: ...` plans.

For multi-plan packages, each child plan may use plan-local `T-*` anchors starting at `T-001`. Cross-plan references must combine the child plan slug or path with the task anchor, such as `01-auth/T-001`, `01-auth::T-001`, or `docs/loopx/plans/YYYY-MM-DD-feature/01-auth.md#T-001`.

Every task must include `Review focus`. Use concrete bullets that tell reviewers which contract, behavior, surface, or regression risk to check. `Review focus: not_applicable` is allowed only with a concrete rationale such as docs-only wording, test-only coverage, or mechanical synchronization with no product behavior.
```

- [ ] **Step 3: Update the task structure heading and fields**

In the `## Task Structure` fenced template, change:

```markdown
### Task N: [Component Name]
```

to:

```markdown
### T-001 / Task 1: [Component Name]
```

Within the same template, after the `**Traceability:**` block, keep the existing `Source AC`, `Design anchors`, and `Test cases` lines and add:

```markdown
- Task anchor: `T-001`

**Review focus:**
- Verify `T-001` implements the listed Source AC, Design anchors, and Test cases without extra behavior.
- Check downstream interfaces listed in `Produces` still match later task consumers.
```

For tasks with no review-relevant behavior, the template text should show:

```markdown
**Review focus:** not_applicable - docs-only or mechanical synchronization task with no product behavior.
```

Do not remove `**Support lenses:**`.

- [ ] **Step 4: Update Remember and Self-Review**

In `## Remember`, add:

```markdown
- Preserve task anchor coverage for every `T-*` generated by this plan.
```

In `## Self-Review`, add a checklist item after anchor coverage:

```markdown
6. **Task anchor coverage:** Does every implementation task have a unique plan-local `T-*`, a compatible `Task N` label, exact `AC-*`/`D-*`/`TC-*` traceability, and a `Review focus` field? If this is a multi-plan package, are cross-plan references qualified with the child plan slug or path?
```

Renumber the following self-review items so the list remains sequential.

- [ ] **Step 5: Run targeted governance tests**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: FAIL until downstream skills and `task-brief` are updated. The new plan-to-exec assertions for `0.3.8`, `T-*`, `Review focus`, plan-local uniqueness, and multi-plan cross-reference wording should pass.

- [ ] **Step 6: Commit plan-to-exec contract update**

Run:

```bash
git add skills/plan-to-exec/SKILL.md
git commit -m "docs: add plan task anchor contract"
```

Expected: commit succeeds.

### Task 3: Thread T-* Through Exec, Subagent-Exec, And Review Contracts

**Task anchor:** T-003

**Files:**
- Modify: `skills/exec/SKILL.md`
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `skills/subagent-exec/implementer-prompt.md`
- Modify: `skills/subagent-exec/task-reviewer-prompt.md`
- Modify: `skills/review/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: future plans with `### T-001 / Task 1: ...` headings and `Task anchor: T-001`.
- Produces: downstream skill contracts and prompt guidance that preserve `T-*` in execution, handoff, reporting, and review.

**Traceability:**
- Source AC: AC-003, AC-007
- Design anchors: D-005, D-007
- Test cases: TC-003, TC-007

**Review focus:**
- Verify downstream skills preserve `T-*` without making `final-review` a hard AC/D/T matrix gate.
- Verify prompt changes ask subagents to report `task_anchor` but do not alter report file naming or progress storage semantics beyond markdown text.

**Support lenses:** architecture-designer

- [ ] **Step 1: Bump downstream skill metadata versions**

In `skills/exec/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.3"
```

to:

```yaml
metadata:
  version: "0.3.4"
```

In `skills/subagent-exec/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.6"
```

to:

```yaml
metadata:
  version: "0.3.7"
```

In `skills/review/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.5"
```

to:

```yaml
metadata:
  version: "0.3.6"
```

- [ ] **Step 2: Update `exec` progress and review guidance**

In `skills/exec/SKILL.md`, under `### Step 2: Execute Tasks`, add this paragraph after `For each task:`:

```markdown
If the plan task heading contains a `T-*` task anchor such as `T-001 / Task 1`, preserve that anchor in `update_plan`, checkpoint rows, blocked escalation, and review requests. Historical plans without `T-*` continue to use `Task N`.
```

In the checkpoint format table, change the sample rows from:

```markdown
| 1 | completed | abc1234 | |
| 2 | completed | def5678 | review requested after this task |
| 3 | in_progress | - | blocked: missing API key config |
| 4 | pending | - | |
| 5 | pending | - | |
```

to:

```markdown
| T-001 / Task 1 | completed | abc1234 | |
| T-002 / Task 2 | completed | def5678 | review requested after this task |
| T-003 / Task 3 | in_progress | - | blocked: missing API key config |
| T-004 / Task 4 | pending | - | |
| T-005 / Task 5 | pending | - | |
```

In `### Checkpoint Review Questions`, add:

```markdown
For plans with `T-*`, include the relevant task anchor in the review request so findings can reference it directly.
```

- [ ] **Step 3: Update `subagent-exec` skill contract**

In `skills/subagent-exec/SKILL.md`, under `## Pre-Flight Plan Review`, add a bullet:

```markdown
- duplicate `T-*` task anchors within the same plan, or missing `T-*` anchors in new-style task headings
```

In `## File Handoffs`, add:

```markdown
- Task anchor: when the task brief contains `T-*`, pass the exact anchor such as `T-001 / Task 1` to the implementer and reviewer. Keep report file names such as `task-N-report.md` for compatibility; the report content must preserve `task_anchor`.
```

In `## Durable Progress`, change:

```text
Task N: complete (commits <base7>..<head7>, review clean, brief <path>, report <path>, review <path>)
```

to:

```text
T-001 / Task 1: complete (commits <base7>..<head7>, review clean, brief <path>, report <path>, review <path>)
```

Add this sentence after the code block:

```markdown
For historical plans without `T-*`, `Task N: complete ...` remains valid.
```

In `## Anchor Context Contract`, add:

```text
- task anchor such as T-001 when present
```

Update the required YAML block from:

```yaml
anchor_coverage:
  REQ-001: implemented
implemented_anchor_ids:
  - REQ-001
tests_for_anchor_ids:
  - REQ-001
extra_behavior: none
missing_context: none
```

to:

```yaml
task_anchor: T-001
anchor_coverage:
  REQ-001: implemented
implemented_anchor_ids:
  - REQ-001
tests_for_anchor_ids:
  - REQ-001
extra_behavior: none
missing_context: none
```

- [ ] **Step 4: Update subagent prompt templates**

In `skills/subagent-exec/implementer-prompt.md`, update the template description from:

```text
description: "Implement Task N: [task name]"
prompt: |
  You are implementing Task N: [task name]
```

to:

```text
description: "Implement T-001 / Task 1: [task name]"
prompt: |
  You are implementing T-001 / Task 1: [task name]
```

In the report YAML block, add `task_anchor: T-001` before `anchor_coverage`.

In `skills/subagent-exec/task-reviewer-prompt.md`, update the template description from:

```text
description: "Review Task N (spec + quality)"
```

to:

```text
description: "Review T-001 / Task 1 (spec + quality)"
```

In the Anchor Context section, mention `task_anchor`, and in `## Anchor traceability`, require verifying `task_anchor` in addition to existing anchor fields:

```markdown
Verify `task_anchor`, `anchor_coverage`, `implemented_anchor_ids`, `tests_for_anchor_ids`, `extra_behavior`, and `missing_context` against actual diff and test evidence.
```

- [ ] **Step 5: Update standalone review skill**

In `skills/review/SKILL.md`, after the paragraph beginning `When the formal plan or spec contains`, add:

```markdown
When the formal plan contains `T-*` task anchors, Stage 1 spec compliance must preserve those anchors in findings or coverage notes. Use `T-*` to identify which task introduced a missing requirement, extra behavior, changed interface, or downstream mismatch. Historical plans without `T-*` continue to use `Task N` or the task description.
```

In the inline `Spec Compliance Check` list, add:

```text
8. If `T-*` task anchors exist, findings or coverage notes reference the relevant `T-*`
```

- [ ] **Step 6: Run targeted governance tests**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: FAIL only if `task-brief` still cannot parse `### T-001 / Task 1: ...`, or if a downstream assertion from Task 1 is still missing. Version and contract-text assertions for `exec`, `subagent-exec`, prompts, and `review` should pass.

- [ ] **Step 7: Commit downstream contract update**

Run:

```bash
git add skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/subagent-exec/implementer-prompt.md skills/subagent-exec/task-reviewer-prompt.md skills/review/SKILL.md
git commit -m "docs: preserve task anchors downstream"
```

Expected: commit succeeds.

### Task 4: Make Task-Brief Compatible With T-* Headings

**Task anchor:** T-004

**Files:**
- Modify: `skills/subagent-exec/scripts/task-brief`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: existing `task-brief PLAN_FILE TASK_NUMBER [OUTFILE]` invocation.
- Produces: task brief extraction that supports old `### Task N: ...` and new `### T-001 / Task N: ...` headings.

**Traceability:**
- Source AC: AC-002, AC-003, AC-007
- Design anchors: D-002, D-005, D-006, D-007
- Test cases: TC-002, TC-003, TC-007

**Review focus:**
- Verify the script keeps numeric `TASK_NUMBER` input and output path behavior unchanged.
- Verify old and new headings both work.
- Verify the script does not become an artifact validator or parse unrelated plan schema.

**Support lenses:** architecture-designer

- [ ] **Step 1: Update heading regexes**

In `skills/subagent-exec/scripts/task-brief`, replace:

```awk
    task_header_2 = "^## Task " n "(:| |$)"
    task_header_3 = "^### Task " n "(:| |$)"
    next_task_2 = "^## Task [0-9]+(:| |$)"
    next_task_3 = "^### Task [0-9]+(:| |$)"
```

with:

```awk
    task_prefix = "(T-[0-9][0-9][0-9][[:space:]]*/[[:space:]]*)?"
    task_header_2 = "^## " task_prefix "Task " n "(:| |$)"
    task_header_3 = "^### " task_prefix "Task " n "(:| |$)"
    next_task_2 = "^## " task_prefix "Task [0-9]+(:| |$)"
    next_task_3 = "^### " task_prefix "Task [0-9]+(:| |$)"
```

This preserves old headings because `task_prefix` is optional.

- [ ] **Step 2: Run the targeted governance test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: PASS if all Task 1 through Task 4 changes are complete.

- [ ] **Step 3: Commit task-brief compatibility**

Run:

```bash
git add skills/subagent-exec/scripts/task-brief test/skill-governance.test.mjs
git commit -m "fix: support task anchor headings in briefs"
```

Expected: commit succeeds.

### Task 5: Harden Governance Scope And Version Assertions

**Task anchor:** T-005

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: final expected contracts from Tasks 2 through 4.
- Produces: governance checks that prevent losing `T-*` rules or expanding scope later.

**Traceability:**
- Source AC: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
- Design anchors: D-001, D-002, D-003, D-004, D-005, D-006, D-007
- Test cases: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007

**Review focus:**
- Verify the test suite catches both missing positive contracts and forbidden scope expansion.
- Verify final-review full matrix remains explicitly out of this slice.

**Support lenses:** architecture-designer

- [ ] **Step 1: Strengthen negative assertions in the new governance test**

In the test added in Task 1, add these assertions after the existing final-review negative assertion:

```js
    assert.doesNotMatch(planSkill, /final-review.*hard gate|hard gate.*final-review/i);
    assert.doesNotMatch(execSkill, /final-review.*AC -> D -> T -> verification.*hard/i);
    assert.doesNotMatch(subagentExecSkill, /final-review.*AC -> D -> T -> verification.*hard/i);
    assert.doesNotMatch(reviewSkill, /final-review.*AC -> D -> T -> verification.*hard/i);
    assert.doesNotMatch(planSkill, /migrate historical plans|required historical plan migration/i);
    assert.match(planSkill, /Do not migrate historical `### Task N: \.\.\.` plans|Do not migrate historical/i);
```

- [ ] **Step 2: Add exact helper compatibility assertions**

In the helper-script test, after the new plan brief assertions, add:

```js
    assert.doesNotMatch(brief, /Self-Review/);
    assert.doesNotMatch(brief, /Execution Handoff/);
```

The final brief already checks this behavior; this extends it to the new heading format.

- [ ] **Step 3: Run targeted governance test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: PASS with all tests passing. The output should include `governs plan task anchors across planning execution and review` as passing.

- [ ] **Step 4: Run verifier**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected:

```text
ok: verified 26 loopx bundled skills
```

- [ ] **Step 5: Commit governance hardening**

Run:

```bash
git add test/skill-governance.test.mjs
git commit -m "test: harden plan task anchor governance"
```

Expected: commit succeeds. If Task 4 already committed all test changes and no diff remains, record this step as "no-op; assertions already committed" in the task report instead of creating an empty commit.

### Task 6: Final Verification And Scope Audit

**Task anchor:** T-006

**Files:**
- Test-only verification task; no source edits expected.

**Interfaces:**
- Consumes: completed commits from Tasks 1 through 5.
- Produces: final verification evidence for review/final-review.

**Traceability:**
- Source AC: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
- Design anchors: D-001, D-002, D-003, D-004, D-005, D-006, D-007
- Test cases: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007

**Review focus:**
- Verify the final diff is limited to allowed files.
- Verify no runtime/CLI/artifact-validator/final-review hard-gate scope entered the implementation.
- Verify package skill surface remains valid.

**Support lenses:** architecture-designer

- [ ] **Step 1: Run targeted governance test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: PASS. Output includes `pass` for all tests.

- [ ] **Step 2: Run bundled skill verifier**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected:

```text
ok: verified 26 loopx bundled skills
```

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS. The current baseline is 55 tests across 5 suites; if the count increases because this plan adds tests, all tests must pass and the changed count must be explained in the task report.

- [ ] **Step 4: Run negative scope assertions**

Run:

```bash
! rg "runtime state machine|new CLI command|artifact validator" skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/review/SKILL.md test/skill-governance.test.mjs
! rg "final-review.*hard gate|hard gate.*final-review|full AC -> D -> T -> verification.*hard" skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/review/SKILL.md test/skill-governance.test.mjs
! rg "required historical plan migration|migrate historical plans" skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/review/SKILL.md test/skill-governance.test.mjs
```

Expected: all commands exit 0 because `rg` finds no forbidden text.

- [ ] **Step 5: Run allowed-file audit from finish baseline**

Run:

```bash
BASE=$(node -e 'const fs=require("fs"); const p=".loopx/finish/baselines/plan-to-exec-task-anchors.json"; console.log(JSON.parse(fs.readFileSync(p,"utf8")).head)')
git diff --name-only "$BASE"..HEAD | rg -v "^(skills/plan-to-exec/SKILL\\.md|skills/exec/SKILL\\.md|skills/subagent-exec/SKILL\\.md|skills/subagent-exec/implementer-prompt\\.md|skills/subagent-exec/task-reviewer-prompt\\.md|skills/subagent-exec/scripts/task-brief|skills/review/SKILL\\.md|test/skill-governance\\.test\\.mjs)$" && exit 1 || true
```

Expected: no output and exit 0. If output appears, stop and verify whether the extra file is unrelated work that should not be part of this feature.

- [ ] **Step 6: Commit verification report only if required by the execution workflow**

No source commit is expected for this task. If using `subagent-exec`, write the task report under `.loopx/subagent-exec/` as scratch state and do not commit it.

## Self-Review

- Spec coverage: Tasks 1 through 6 cover AC-001 through AC-007 and D-001 through D-007.
- Placeholder scan: this plan intentionally uses `T-*`, `D-*`, `AC-*`, and `TC-*` as anchor patterns from the source. Bracketed literals such as `[Component Name]` appear only inside exact skill-template text that the implementation must preserve. The task instructions do not use TBD, TODO, "fill in details", or deferred implementation placeholders.
- Type consistency: no runtime types or APIs are introduced.
- Design drift: no runtime state, CLI command, artifact validator, historical migration, or final-review hard matrix is planned.
- Anchor coverage: every D anchor maps to at least one task and one verification path.
- Surface-change coverage: Surface Inventory, Caller Proof, Negative Assertions, and allowed-file audit are included.
- Support lens coverage: architecture-designer is recorded in the header and each task.
- Subagent handoff readiness: each task lists files, interfaces, traceability, review focus, and exact commands.
- Test-case coverage: TC-001 through TC-007 map to governance tests, helper-script compatibility tests, and final negative assertions.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-30-plan-to-exec-task-anchors.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
