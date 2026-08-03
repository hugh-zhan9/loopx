# Current Contract Only Skill Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** Current clarified brief from 2026-07-01 conversation.

**Goal:** Simplify the `exec`, `subagent-exec`, and `finish` skill surfaces around the current multi-plan contract only, while deleting unpublished legacy compatibility logic and keeping all current workflow gates intact.

**Architecture:** Keep current runtime behavior for schema v2 multi-plan packages, execution ranges, canonical final-review reports, and tracked-dirty finish blocking. Remove schema v1 and `plan_final_review` compatibility paths because there are no external users. Split long skill instructions into fast-path `SKILL.md` files plus local `references/*.md` files that are copied with each bundled skill.

**Tech Stack:** Node.js ESM, Markdown skill files, Node built-in `node:test`, `node:assert/strict`.

**Support lenses:** lancet

## Global Constraints

- Current contract only. No legacy compatibility.
- Do not preserve multi-plan schema v1 normalization.
- Do not preserve `plan_final_review` or legacy child review artifact migration.
- Do not preserve legacy child review report path guidance.
- Keep current schema v2 multi-plan readiness:
  - `schema_version: 2`
  - each child `status: "complete"`
  - each child `plan_review.status: "passed"`
  - each child non-empty `plan_review.reviewed_at`
  - each child non-empty `plan_review.summary`
  - each child `ready_for_spec_review: true`
  - child rows must not record `start_commit`, `current_head`, or `end_commit`
  - `spec_final_review.ready_for_finish: "Yes"`
- Keep `execution-start` and `finish-start` as separate required startup commands for execution skills.
- Keep tracked staged/unstaged files blocking `finish-record --status done`; untracked files remain non-blocking and reported.
- Keep canonical final-review report behavior: single-plan and spec-level final-review write `.loopx/final-review/<design-date>-<design-slug>.md`; child plan-level final-review updates multi-plan state only.
- Do not change public CLI command semantics, package install surface, or resolver routing except where current skill text and tests must stop mentioning legacy behavior.
- Use `apply_patch` for source edits.
- Run `node scripts/verify-skills.mjs`, `npm test`, and `git diff --check` before claiming completion.

## Source Requirement Anchors

- `AC-001`: WHEN a multi-plan state file has `schema_version` other than `2`, THEN finish must reject it instead of normalizing or migrating it.
- `AC-002`: WHEN a child plan row lacks current `plan_review.status`, `plan_review.reviewed_at`, or `plan_review.summary`, THEN finish must reject completion with a specific multi-plan gate issue.
- `AC-003`: WHEN current schema v2 multi-plan state is complete and spec-level final-review is ready, THEN finish completion remains allowed.
- `AC-004`: WHEN executing with `exec` or `subagent-exec`, THEN main skill files present a short fast path, scope classifier, required gates, and reference routing instead of long schema/history/manual sections.
- `AC-005`: WHEN skill details are still required for execution, THEN local `references/*.md` files preserve current contract details without legacy compatibility sections.
- `AC-006`: WHEN governance tests inspect skill contracts, THEN they assert current contract coverage across main files plus referenced files and no longer assert legacy compatibility.
- `AC-007`: WHEN runtime or docs are searched for removed compatibility terms in current product surfaces, THEN no retained current caller exists for schema v1 normalization, `plan_final_review`, or legacy child review path migration.
- `AC-008`: WHEN verification is run, THEN `verify-skills`, full tests, and diff whitespace checks pass.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: same-context `plan-reviewer` rubric applied to this plan against the clarified source anchors above.
- Recheck evidence: none
- Residual risk: no independent subagent reviewed source-to-plan coverage; mitigate by preserving explicit AC-to-task traceability and running full governance tests.

### Same-Context Plan Review Result

| Source anchor | Plan coverage | Status | Notes |
|---|---|---|---|
| `AC-001` | `T-001` tests and runtime edits | covered | Replaces legacy pass test with rejection test. |
| `AC-002` | `T-001` keeps existing v2 gate tests | covered | Existing missing timestamp/status tests remain. |
| `AC-003` | `T-001` preserves current schema v2 pass test | covered | Existing clean spec review test remains. |
| `AC-004` | `T-002`, `T-003`, `T-004` | covered | Each target skill gets fast-path structure. |
| `AC-005` | `T-002`, `T-003`, `T-004` references | covered | References are local to owning skill directories. |
| `AC-006` | `T-005` | covered | Governance tests read main and reference files. |
| `AC-007` | `T-001`, `T-005` caller proof and negative assertions | covered | Historical plans may still mention old behavior. |
| `AC-008` | `T-006` | covered | Verification commands are explicit. |

Findings:

- Critical: none
- Important: none
- Minor: same-context plan review is degraded because no independent reviewer tool is available in this planning turn.

---

## Surface Inventory

- Public commands/API/routes/events/config:
  - `loopx execution-start`
  - `loopx finish-start`
  - `loopx finish-audit`
  - `loopx finish-record`
- Exported functions/types/modules:
  - `executionStartStage`
  - `finishAuditStage`
  - `finishRecordStage`
  - `resolveExecutionRangePath`
- Runtime/generated artifacts and templates:
  - `.loopx/execution-ranges/<slug>.json`
  - `.loopx/finish/<slug>/.../finish-state.json`
  - `.loopx/multi-plan/<feature-slug>/state.json`
  - `.loopx/final-review/<design-date>-<design-slug>.md`
- Installer/package/deployment surface:
  - bundled skill directories under `package.json.files`
  - `scripts/verify-skills.mjs`
  - `src/install-discovery.mjs`
- Hooks/background jobs/automation:
  - no hook behavior changes planned
- Current product docs:
  - `skills/exec/SKILL.md`
  - `skills/subagent-exec/SKILL.md`
  - `skills/finish/SKILL.md`
  - new `references/*.md` under those skill directories
- Tests/governance checks:
  - `test/workflow.test.mjs`
  - `test/skill-governance.test.mjs`
- Compatibility/migration paths:
  - remove schema v1 normalization
  - remove `plan_final_review` migration
  - remove legacy child review path allowance

Caller proof commands:

```bash
rg -n "plan_final_review|LEGACY_CHILD_REVIEW_PATH_FIELD|normalizeMultiPlanStateForValidation|__normalized_from_schema_version" src scripts test skills package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
rg -n "schema_version:\\s*1|schema_version: 1|schema_version\\\": 1" src scripts test skills package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
```

Decision rule:

- Retained caller exists in current source/runtime code -> keep it and name the caller in the implementation notes.
- Only historical docs, old plans, or design records reference it -> do not count that as a retained caller.
- No retained caller -> delete compatibility code, current skill guidance, and current governance assertions.

Negative assertions:

```bash
! rg -n "LEGACY_CHILD_REVIEW_PATH_FIELD|normalizeMultiPlanStateForValidation|__normalized_from_schema_version|plan_final_review" src scripts test skills package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
! rg -n "legacy v1|normalizes on read|schema v1|schema_version: 1|schema_version\\\": 1" test skills src scripts package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
npm pack --dry-run --json
```

Strict current product paths for negative assertions:

- `src/`
- `scripts/`
- `test/`
- `skills/`
- `package.json`
- `README.md`
- `README.zh-CN.md`
- `docs/loopx/cli.md`
- `docs/loopx/cli.zh-CN.md`
- `docs/loopx/skills.md`
- `docs/loopx/skills.zh-CN.md`
- `docs/loopx/specs/`

Historical paths allowed to mention removed behavior:

- `docs/loopx/plans/`
- `docs/loopx/design/`
- `docs/articles/`

## File Structure

- Modify `src/finish-runtime.mjs`: remove unpublished legacy normalization and validate schema v2 state directly.
- Modify `test/workflow.test.mjs`: replace the legacy v1 pass test with a schema v1 rejection test and remove helper constants that only supported `plan_final_review`.
- Modify `skills/finish/SKILL.md`: reduce to fast path, gates, completion output, references, and red flags.
- Create `skills/finish/references/final-review-and-finish-gates.md`: current final-review report, multi-plan v2 finish gate, tracked/untracked status, and finish-audit evidence fields.
- Create `skills/finish/references/branch-worktree-and-recording.md`: branch/worktree placement, finish choices, finish-record usage, and failure handling.
- Create `skills/finish/references/memory-and-spec-candidates.md`: current memory/spec candidate handling.
- Modify `skills/exec/SKILL.md`: reduce to same-context execution fast path, input scope classifier, gates, and reference routing.
- Create `skills/exec/references/multi-plan-package-mode.md`: current package/direct-child behavior only.
- Create `skills/exec/references/checkpoints-and-resume.md`: checkpoint review, progress ledger, task evidence, and blocked handling.
- Modify `skills/subagent-exec/SKILL.md`: reduce to orchestrator fast path, input scope classifier, required gates, and reference routing.
- Create `skills/subagent-exec/references/multi-plan-package-mode.md`: current package/direct-child behavior only.
- Create `skills/subagent-exec/references/task-handoff-and-review.md`: brief/report/review package contracts and reviewer self-check.
- Create `skills/subagent-exec/references/model-selection-and-retry.md`: model choice and blocked retry handling.
- Modify `test/skill-governance.test.mjs`: assert current contract text across main and reference files, remove legacy compatibility expectations, and update metadata versions.

## Task Right-Sizing

This is a single implementation plan because the product change is one coherent contract cleanup. Tasks are sequential because runtime, skill docs, and governance tests must converge on the same current-only contract.

### T-001 / Task 1: Remove Runtime Legacy Multi-Plan Compatibility

**Files:**
- Modify: `src/finish-runtime.mjs`
- Modify: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: `.loopx/multi-plan/<feature-slug>/state.json`
- Produces: `finishRecordStage` validation errors or completed finish state
- Preserves: `finishRecordStage(cwd, auditIdOrPath, { action, status, summary, url, env })`

**Traceability:**
- Source AC: `AC-001`, `AC-002`, `AC-003`, `AC-007`
- Design anchors: `not_applicable` - source is clarified refactor brief, not a design spec
- Test cases: `TC-001` schema v1 rejected, `TC-002` current v2 accepted, `TC-003` missing child review fields rejected
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/workflow.test.mjs`
- `evidence_summary`: workflow tests prove schema v1 is rejected, schema v2 complete state is accepted, and incomplete current child review fields remain blocking
- `remaining_risk`: none

**Review focus:**
- Verify `T-001` removes only unpublished legacy compatibility and does not weaken current schema v2 finish gates.
- Verify errors remain specific enough for agents to repair bad multi-plan state.

**Support lenses:** lancet

- [ ] **Step 1: Prove retained caller surface**

Run:

```bash
rg -n "plan_final_review|LEGACY_CHILD_REVIEW_PATH_FIELD|normalizeMultiPlanStateForValidation|__normalized_from_schema_version" src scripts test skills package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
```

Expected before edit: matches only in `src/finish-runtime.mjs`, `test/workflow.test.mjs`, and current skill/governance text. Historical `docs/loopx/plans/` and `docs/loopx/design/` are intentionally excluded from this strict current-surface proof.

- [ ] **Step 2: Delete legacy constants and normalization**

In `src/finish-runtime.mjs`, remove:

```js
const LEGACY_CHILD_REVIEW_PATH_FIELD = ['plan', 'final', 'review'].join('_');
```

Delete the whole `normalizeMultiPlanStateForValidation` function.

- [ ] **Step 3: Validate current state directly**

In `assertMultiPlanReadyForFinish`, replace:

```js
const issues = validateMultiPlanState(normalizeMultiPlanStateForValidation(multiPlanState), multiPlanPackage);
```

with:

```js
const issues = validateMultiPlanState(multiPlanState, multiPlanPackage);
```

In `validateMultiPlanState`, replace the timestamp condition:

```js
if (planReview && multiPlanState.__normalized_from_schema_version !== 1 && !nonEmptyText(planReview.reviewed_at)) {
```

with:

```js
if (planReview && !nonEmptyText(planReview.reviewed_at)) {
```

- [ ] **Step 4: Replace legacy passing test**

In `test/workflow.test.mjs`, delete the test named:

```js
it('allows finish done when matching multi-plan state is legacy v1 and normalizes on read', async () => {
```

Replace it with:

```js
it('blocks finish done when matching multi-plan state uses legacy schema v1', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-legacy-block-'));
  await initGitRepo(wd);

  const featureSlug = '2026-06-29-feature';
  await finishStartStage(wd, featureSlug, {
    source: `docs/loopx/plans/${featureSlug}/00-overview.md`,
  });
  const audit = await finishAuditStage(wd, featureSlug);
  await markFinishAuditReviewed(audit);

  await writeMultiPlanState(wd, featureSlug, {
    schema_version: 1,
    feature_slug: featureSlug,
    plan_package: `docs/loopx/plans/${featureSlug}`,
    source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
    plans: [
      {
        path: `docs/loopx/plans/${featureSlug}/01-core.md`,
        status: 'complete',
        plan_review: {
          status: 'passed',
          reviewed_at: '2026-06-30T00:00:00.000Z',
          summary: 'No blocking issues',
        },
        ready_for_spec_review: true,
      },
    ],
    spec_final_review: {
      path: `.loopx/final-review/${featureSlug}.md`,
      ready_for_finish: 'Yes',
    },
  });

  await assert.rejects(
    () => finishRecordStage(wd, audit.auditId, {
      action: 'keep',
      status: 'done',
      summary: 'Should be blocked.',
    }),
    /finish_record_multi_plan_incomplete:.*schema_version must be 2/,
  );
});
```

- [ ] **Step 5: Remove test-only legacy helper**

Remove any `legacyChildReviewPathField` constant if it is unused after Step 4.

- [ ] **Step 6: Run focused workflow tests**

Run:

```bash
node --test test/workflow.test.mjs
```

Expected: all tests in `test/workflow.test.mjs` pass.

- [ ] **Step 7: Commit runtime cleanup**

```bash
git add src/finish-runtime.mjs test/workflow.test.mjs
git commit -m "Remove legacy multi-plan compatibility"
```

### T-002 / Task 2: Simplify Finish Skill Around Current Gates

**Files:**
- Modify: `skills/finish/SKILL.md`
- Create: `skills/finish/references/final-review-and-finish-gates.md`
- Create: `skills/finish/references/branch-worktree-and-recording.md`
- Create: `skills/finish/references/memory-and-spec-candidates.md`

**Interfaces:**
- Consumes: current `finish` skill frontmatter and existing finish guidance
- Produces: shorter `skills/finish/SKILL.md` plus local references copied as part of bundled skill directory

**Traceability:**
- Source AC: `AC-004`, `AC-005`, `AC-006`, `AC-007`
- Design anchors: `not_applicable` - source is clarified refactor brief, not a design spec
- Test cases: `TC-004` finish skill main file has fast path and reference routing, `TC-005` references preserve current gates, `TC-006` no legacy terms remain
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node scripts/verify-skills.mjs`, `node --test test/skill-governance.test.mjs`
- `evidence_summary`: governance tests find required finish gates across main and reference files and reject legacy compatibility wording
- `remaining_risk`: none

**Review focus:**
- Verify `finish` remains operational without forcing the agent to read long branch/memory details before the main gate sequence.
- Verify references do not reintroduce schema v1 or legacy child review artifact guidance.

**Support lenses:** lancet

- [ ] **Step 1: Create finish references directory**

Run:

```bash
mkdir -p skills/finish/references
```

Expected: directory exists.

- [ ] **Step 2: Rewrite `skills/finish/SKILL.md` structure**

Keep existing frontmatter but bump:

```yaml
metadata:
  version: "0.3.9"
```

Rewrite the body around these headings:

```markdown
# Finish

## Fast Path
## Preconditions
## Required Gates
## Completion Flow
## Output
## References
## Stop Conditions
```

The `Fast Path` must include, in this order:

1. Confirm implementation and verification are complete.
2. Read canonical final-review report.
3. Check multi-plan finish gate when source is a package path.
4. Run `finish-audit`.
5. Review memory/spec extraction candidates.
6. Present commit/merge/PR/keep/discard choice.
7. Run `finish-record`.
8. Report final evidence.

- [ ] **Step 3: Keep required current gates in the main file**

Ensure the main file still contains these exact tokens or close equivalents:

```text
canonical final-review report
.loopx/final-review/<design-date>-<design-slug>.md
.loopx/execution-ranges/<slug>.json
.loopx/multi-plan/<feature-slug>/state.json
schema_version: 2
plan_review.status
plan_review.reviewed_at
plan_review.summary
spec_final_review.ready_for_finish
tracked changes
Untracked files count as clean
finish-audit
finish-record
```

- [ ] **Step 4: Move detailed gates to `final-review-and-finish-gates.md`**

Create `skills/finish/references/final-review-and-finish-gates.md` with current-only details for:

- canonical final-review report lookup
- single-plan versus spec-level final-review
- child plan-level final-review state only
- multi-plan v2 finish gate
- tracked dirty blocking and untracked reporting
- finish report evidence fields

Do not include `schema_version: 1`, `plan_final_review`, `legacy`, or `normalizes on read`.

- [ ] **Step 5: Move branch/worktree and recording details**

Create `skills/finish/references/branch-worktree-and-recording.md` with current details for:

- normal repo versus worktree choices
- commit/merge/PR/keep/discard selection
- `finish-record` fields
- stale audit head handling
- dirty tracked status handling

- [ ] **Step 6: Move memory/spec candidate details**

Create `skills/finish/references/memory-and-spec-candidates.md` with current details for:

- accepted memory candidates
- rejected candidates with reason
- no-candidate reasons
- spec delta candidates
- no automatic write to repo-tracked specs unless explicitly accepted

- [ ] **Step 7: Run skill verification**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: `ok: verified 27 loopx bundled skills`.

- [ ] **Step 8: Commit finish skill simplification**

```bash
git add skills/finish/SKILL.md skills/finish/references
git commit -m "Simplify finish skill current gates"
```

### T-003 / Task 3: Simplify Exec Skill Around Same-Context Fast Path

**Files:**
- Modify: `skills/exec/SKILL.md`
- Create: `skills/exec/references/multi-plan-package-mode.md`
- Create: `skills/exec/references/checkpoints-and-resume.md`

**Interfaces:**
- Consumes: current `exec` skill frontmatter and current execution contract
- Produces: shorter `skills/exec/SKILL.md` plus current-only references

**Traceability:**
- Source AC: `AC-004`, `AC-005`, `AC-006`, `AC-007`
- Design anchors: `not_applicable` - source is clarified refactor brief, not a design spec
- Test cases: `TC-007` exec main file has fast path and gates, `TC-008` references preserve package/checkpoint details, `TC-009` no legacy compatibility terms remain
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node scripts/verify-skills.mjs`, `node --test test/skill-governance.test.mjs`
- `evidence_summary`: governance tests find `execution-start`, `finish-start`, checkpoint review, `fix-review`, and final-review/finish gates across main plus references
- `remaining_risk`: none

**Review focus:**
- Verify the main `exec` skill can be read quickly by an inline executor while references still contain all current contract details needed for package/direct-child execution.

**Support lenses:** lancet

- [ ] **Step 1: Create exec references directory**

Run:

```bash
mkdir -p skills/exec/references
```

Expected: directory exists.

- [ ] **Step 2: Rewrite `skills/exec/SKILL.md` structure**

Keep existing frontmatter but bump:

```yaml
metadata:
  version: "0.3.9"
```

Rewrite the body around these headings:

```markdown
# Exec

## Fast Path
## Input Scope
## Required Startup
## Task Loop
## Required Review Gates
## Completion By Scope
## References
## Stop Conditions
```

The main file must retain these current-contract tokens:

```text
loopx execution-start <slug> --source <plan-path> [--design <design-path>]
loopx finish-start <slug> --source <plan-path>
docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md
docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md
docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md
plan-level final-review
spec-level final-review
fix-review
checkpoint review
```

- [ ] **Step 3: Move package mode details**

Create `skills/exec/references/multi-plan-package-mode.md` with current-only details for:

- package input detection
- v2 state initialization shape
- direct child plan mode
- sequential package orchestration
- child `plan_review` update
- spec-level final-review before finish

Do not include any legacy schema or migration section.

- [ ] **Step 4: Move checkpoint and resume details**

Create `skills/exec/references/checkpoints-and-resume.md` with current details for:

- task completion evidence fields
- mandatory checkpoint review
- handling Critical/Important review findings with `fix-review`
- progress ledger shape
- blocked handling
- lancet implementation discipline

- [ ] **Step 5: Run skill verification**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: `ok: verified 27 loopx bundled skills`.

- [ ] **Step 6: Commit exec skill simplification**

```bash
git add skills/exec/SKILL.md skills/exec/references
git commit -m "Simplify exec skill fast path"
```

### T-004 / Task 4: Simplify Subagent Exec Skill Around Orchestration Fast Path

**Files:**
- Modify: `skills/subagent-exec/SKILL.md`
- Create: `skills/subagent-exec/references/multi-plan-package-mode.md`
- Create: `skills/subagent-exec/references/task-handoff-and-review.md`
- Create: `skills/subagent-exec/references/model-selection-and-retry.md`

**Interfaces:**
- Consumes: current `subagent-exec` frontmatter, implementer prompt, reviewer prompt, and platform subagent docs
- Produces: shorter `skills/subagent-exec/SKILL.md` plus current-only references

**Traceability:**
- Source AC: `AC-004`, `AC-005`, `AC-006`, `AC-007`
- Design anchors: `not_applicable` - source is clarified refactor brief, not a design spec
- Test cases: `TC-010` subagent-exec main file has orchestrator fast path, `TC-011` references preserve handoff/review/model details, `TC-012` no legacy compatibility terms remain
- Task anchor: `T-004`

**Expected execution evidence:**
- `commands_run`: `node scripts/verify-skills.mjs`, `node --test test/skill-governance.test.mjs`
- `evidence_summary`: governance tests find startup commands, fresh implementer per task, task reviewer gate, package mode, and model selection guidance across main plus references
- `remaining_risk`: none

**Review focus:**
- Verify the main `subagent-exec` skill reads as an orchestrator checklist and does not duplicate prompt/reference detail already stored elsewhere.

**Support lenses:** lancet

- [ ] **Step 1: Create subagent-exec references directory**

Run:

```bash
mkdir -p skills/subagent-exec/references
```

Expected: directory exists.

- [ ] **Step 2: Rewrite `skills/subagent-exec/SKILL.md` structure**

Keep existing frontmatter but bump:

```yaml
metadata:
  version: "0.3.12"
```

Rewrite the body around these headings:

```markdown
# Subagent Exec

## Fast Path
## Subagent Capability
## Input Scope
## Required Startup
## Per-Task Orchestration
## Required Review Gates
## Completion By Scope
## References
## Stop Conditions
```

The main file must retain these current-contract tokens:

```text
fresh implementer subagent per task
task reviewer
scripts/task-brief
scripts/review-package
loopx execution-start <slug> --source <plan-path> [--design <design-path>]
loopx finish-start <slug> --source <plan-path>
plan-level final-review
spec-level final-review
fix-review
model explicitly
```

- [ ] **Step 3: Move package mode details**

Create `skills/subagent-exec/references/multi-plan-package-mode.md` with current-only details for:

- package input detection
- v2 state initialization shape
- direct child plan mode
- sequential child plan execution
- child `plan_review` state update
- spec-level final-review before finish

- [ ] **Step 4: Move task handoff and review details**

Create `skills/subagent-exec/references/task-handoff-and-review.md` with current details for:

- `scripts/task-brief PLAN_FILE N`
- `ANCHOR_CONTEXT`
- implementer report fields
- task reviewer prompt expectations
- review package generation
- task completion ledger
- Critical/Important handling through `fix-review`

- [ ] **Step 5: Move model and retry details**

Create `skills/subagent-exec/references/model-selection-and-retry.md` with current details for:

- cheap/standard/most-capable classification
- uncertainty bias upward
- `DONE`, `NEEDS_CONTEXT`, `BLOCKED` handling
- retry with more context, stronger model, smaller task, or plan defect escalation

- [ ] **Step 6: Run skill verification**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: `ok: verified 27 loopx bundled skills`.

- [ ] **Step 7: Commit subagent-exec skill simplification**

```bash
git add skills/subagent-exec/SKILL.md skills/subagent-exec/references
git commit -m "Simplify subagent exec orchestration"
```

### T-005 / Task 5: Update Governance Tests For Current-Only Split References

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: current skill files and new reference files
- Produces: governance assertions that allow split references and reject legacy compatibility text

**Traceability:**
- Source AC: `AC-006`, `AC-007`
- Design anchors: `not_applicable` - source is clarified refactor brief, not a design spec
- Test cases: `TC-013` governance tests pass, `TC-014` legacy compatibility terms are absent from current product surfaces, `TC-015` key gates remain covered across main plus references
- Task anchor: `T-005`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs`
- `evidence_summary`: governance tests pass and enforce current-only split skill contract
- `remaining_risk`: none

**Review focus:**
- Verify tests do not become weaker by only checking that reference files exist; they must assert required gate text across the composed skill surface.

**Support lenses:** lancet

- [ ] **Step 1: Add composed skill reader helper**

In `test/skill-governance.test.mjs`, add a helper near existing file readers:

```js
async function readSkillSurface(skillName, referenceFiles = []) {
  const parts = [
    await readFile(join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8'),
  ];
  for (const referenceFile of referenceFiles) {
    parts.push(await readFile(join(repoRoot, 'skills', skillName, 'references', referenceFile), 'utf8'));
  }
  return parts.join('\n\n');
}
```

- [ ] **Step 2: Update metadata version assertions**

Update expected versions:

```js
exec: 0.3.9
finish: 0.3.9
subagent-exec: 0.3.12
```

Keep unrelated skill versions unchanged.

- [ ] **Step 3: Update multi-plan package governance assertions**

Where tests currently read only `skills/exec/SKILL.md`, `skills/subagent-exec/SKILL.md`, or `skills/finish/SKILL.md`, use composed surfaces that include the new references.

Assert the composed surface contains:

```text
schema_version
2
plan_review.status
plan_review.reviewed_at
plan_review.summary
ready_for_spec_review
spec_final_review
```

Assert it does not contain:

```text
plan_final_review
schema_version: 1
legacy v1
normalizes on read
```

- [ ] **Step 4: Update review range and finish assertions**

Make current contract assertions search the composed finish surface for:

```text
canonical final-review report
requirement start commit
final `HEAD`
commit list
changed files
tracked status
untracked
Untracked files count as clean
```

- [ ] **Step 5: Keep package surface verification strict**

Do not modify `src/install-discovery.mjs` or `package.json.files` unless tests reveal the new `references/` files are excluded. Bundled skill directories are already packaged recursively.

- [ ] **Step 6: Run focused governance tests**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: all governance tests pass.

- [ ] **Step 7: Run current-surface negative assertions**

Run:

```bash
! rg -n "LEGACY_CHILD_REVIEW_PATH_FIELD|normalizeMultiPlanStateForValidation|__normalized_from_schema_version|plan_final_review" src scripts test skills package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
! rg -n "legacy v1|normalizes on read|schema v1|schema_version: 1|schema_version\\\": 1" test skills src scripts package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
```

Expected: both commands exit successfully because no matches remain in current product surfaces.

- [ ] **Step 8: Commit governance updates**

```bash
git add test/skill-governance.test.mjs
git commit -m "Govern current-only split skills"
```

### T-006 / Task 6: Final Verification And Package Surface Check

**Files:**
- Verify: whole repository

**Interfaces:**
- Consumes: all changed runtime, skill, reference, and test files
- Produces: final verification evidence

**Traceability:**
- Source AC: `AC-008`
- Design anchors: `not_applicable` - source is clarified refactor brief, not a design spec
- Test cases: `TC-016` full verification passes, `TC-017` package dry run still includes bundled skill references
- Task anchor: `T-006`

**Expected execution evidence:**
- `commands_run`: `node scripts/verify-skills.mjs`, `npm test`, `git diff --check`, `npm pack --dry-run --json`
- `evidence_summary`: all verification commands pass and package dry run includes new reference files inside bundled skill directories
- `remaining_risk`: none

**Review focus:**
- Verify all task commits compose cleanly and no current product surface still documents deleted compatibility behavior.

**Support lenses:** lancet

- [ ] **Step 1: Run skill verifier**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected:

```text
ok: verified 27 loopx bundled skills
```

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected:

```text
fail 0
```

- [ ] **Step 3: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 4: Check package dry run**

Run:

```bash
npm pack --dry-run --json
```

Expected: JSON output includes files under:

```text
skills/exec/references/
skills/finish/references/
skills/subagent-exec/references/
```

Expected: JSON output does not include any non-bundled auxiliary skill directories.

- [ ] **Step 5: Run final status**

Run:

```bash
git status --short --branch
```

Expected: branch shows only intentional committed changes, or a clean worktree if every task committed.

- [ ] **Step 6: Commit final verification note only if needed**

If no files changed during verification, do not create an empty commit. If verification required small test/doc fixes, commit them:

```bash
git add <changed-files>
git commit -m "Verify current-only skill simplification"
```

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-07-01-current-contract-only-skill-simplification.md`.

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
