# Checkpoints and Resume

## Task Completion Evidence

Record evidence before marking a task complete.

```yaml
task_anchor: <T-* or Task N>
source_ac: <AC-* ids or not_applicable>
design_anchors: <D-* ids or not_applicable>
test_cases: <TC-* ids, manual checks, or deferred-with-rationale>
commands_run: <commands and outcomes>
evidence_summary: <short proof summary tied to expected execution evidence>
remaining_risk: <none or concrete residual risk>
```

## Mandatory Checkpoint Review

Use `loopx:review` whenever a checkpoint condition applies, especially for
public-surface changes, compatibility changes, deleted tests, or the final
checkpoint before `loopx:final-review`.

If `loopx:review` returns Critical or Important findings:

1. Use `loopx:fix-review` to address them.
2. Re-run focused verification.
3. Re-run `loopx:review` for the task or changed range.

## Progress Ledger

Keep a checkpoint file next to the plan:

`docs/loopx/plans/<slug>-checkpoint.md`

```markdown
# Execution Checkpoint

- Plan: docs/loopx/plans/<slug>.md
- Baseline SHA: <finish-start SHA>
- Current status: <git status --short summary or clean>
- Last updated: YYYY-MM-DD

## Progress

| Task | Status | Evidence | Notes |
|------|--------|--------|-------|
| T-001 / Task 1 | completed | task evidence recorded | review clean |
| T-002 / Task 2 | in_progress | - | |
| T-003 / Task 3 | pending | - | |

## Context for Resume

- Last completed task produced: [key outputs, new files, changed interfaces]
- Last completed task evidence: [task_anchor, source_ac, design_anchors, test_cases, commands_run, evidence_summary, remaining_risk]
- Next task depends on: [any context from prior tasks]
- Open issues: [any unresolved review feedback or known concerns]
```

Update the checkpoint after every task completion, after review fixes, and when a
task becomes blocked.

## Blocked Handling

Treat the task as blocked only when the same blocker recurs and execution cannot
make meaningful progress without user input or an external state change.

- Context gap: search the repo and docs, then ask a specific question if needed.
- Plan defect: stop and report the contradiction or impossibility.
- Dependency missing: report the missing prerequisite and the affected tasks.
- Test failure: diagnose before guessing.
- Environment issue: report the exact failure and do not retry blindly.

Use a concise blocker report:

```markdown
## Blocked: [task anchor or task number and name]

**Blocker type:** [context gap / plan defect / dependency / test failure / environment]
**What happened:** [specific error or confusion]
**What I tried:** [what you investigated before asking]
**What I need:** [specific question or decision]
**Impact:** [what downstream tasks are affected]
```

## Lancet Discipline

Before editing, check deletion, repo reuse, stdlib, native platform, and already
installed dependencies. Keep the smallest correct diff that still satisfies the
task, validation, and regression coverage.
