---
name: fix
description: "Issue-driven bug fix execution for .loopx/issues ledgers with status ready_for_fix, verification, local review, whole diff review, and finish handoff. Not for feature work, vague bug reports, non-ready ledgers, issue intake, tracker automation, commits, pushes, or closing issues."
when_to_use: "fix, bug fix, ready_for_fix, .loopx/issues, issue ledger, issue-driven execution, 修复bug, 工单修复"
metadata:
  version: "0.1.0"
---

# Fix

Use this as the issue-driven execution workflow for one or more ready bug ledgers.

## Contract

`fix` only accepts `.loopx/issues/*.md` ledgers whose metadata contains:

```yaml
status: ready_for_fix
```

Do not use `fix` for feature requests, enhancements, vague reports, or bug reports that have not gone through `$issue` diagnosis and fix brief preparation.

Do not invoke `subagent-exec` or `loopx:exec` as the execution engine for this workflow.

Do not use `git worktree`.

Controllers and subagents must not commit, must not push, and must not close issues. `finish` remains the final completion step.

## Inputs

Accept:

- `$fix .loopx/issues/<ledger>.md`
- `$fix .loopx/issues/<ledger-a>.md .loopx/issues/<ledger-b>.md`

Reject:

- ledgers outside `.loopx/issues/`
- missing ledgers
- ledgers whose `status` is not `ready_for_fix`
- ledgers missing Diagnosis Summary or Fix Brief
- dirty worktrees except target ledger changes under `.loopx/issues/`

## Preflight

1. Read every requested ledger.
2. Confirm each ledger contains `status: ready_for_fix`.
3. Confirm every ready ledger has `expected_touched_files`, `parallel_safe`, regression test plan or exception, risk triggers, and verification commands.
4. Inspect `git status --porcelain`.
5. Require a clean worktree except changes to the target `.loopx/issues/` ledgers.
6. Record baseline with `git diff --name-only` and untracked files.
7. Stop if unrelated dirty files exist.

## Scope Validation

Before changing code, perform scope validation:

- Confirm each `expected_touched_files` entry exists or is a clearly named new test/source file.
- Confirm `expected_touched_files` and expected surfaces do not overlap across ledgers before parallel execution.
- Treat public CLI/API/schema/config/lockfile/generated artifact changes as high risk unless explicitly listed in the Fix Brief.
- If a necessary file is outside the expected scope, stop and update the ledger with `needs_scope_change`; do not silently expand scope.

## Scheduling

- If all ledgers are `parallel_safe: true`, expected files do not overlap, and no high-risk trigger requires confirmation, independent bug-fix subagents may run in parallel.
- If parallel safety cannot be proven and no high-risk trigger blocks execution, downgrade to serial execution.
- If high-risk triggers exist, ask for confirmation before execution.

Each subagent receives only:

- its ledger
- allowed files and surfaces
- forbidden scope
- verification commands
- report path under `.loopx/issues/reports/`

Subagents must stop with `needs_scope_change` if the fix requires files outside the allowed set.

## Execution

For each ready ledger:

1. Reproduce or run the failing check when possible.
2. Add or update the regression test unless the ledger records a valid exception.
3. Implement the smallest root-cause fix that satisfies the Fix Brief.
4. Run ledger verification commands.
5. Write an execution report with:

```yaml
ledger: .loopx/issues/<ledger>.md
status: fixed | failed | blocked | needs_scope_change
actual_changed_files:
  - <path>
verification:
  - command: <command>
    result: pass | fail
notes: <summary>
```

## Actual Changed Files Check

After execution, compute `actual_changed_files` from the baseline diff and untracked files.

Stop before closeout when:

- any actual changed file is outside all allowed `expected_touched_files`, paired tests, target ledgers, or report paths
- actual changed files overlap between supposedly parallel fixes
- a subagent reports `needs_scope_change`

## Review

Every code modification through `fix` requires:

- local review per bug against that ledger's Diagnosis Summary, Fix Brief, and actual diff
- whole diff review after all individual fixes are complete

Use existing review standards. Critical and Important findings must be handled with `fix-review` discipline: verify the finding, implement a focused change or give evidence-based pushback, then re-run relevant verification and re-review.

Minor findings may be fixed or recorded, but must not expand scope.

## Verification And Finish Handoff

After local review, whole diff review, and any `fix-review` pass:

1. Run final verification commands from every ledger.
2. Update each ledger with execution, review, fix-review decisions, verification evidence, and closeout notes.
3. Set status to `complete`, `failed`, or `blocked`.
4. Only when all ledgers are complete, hand off to `finish`.

Do not call the work complete until verification and review evidence is recorded.
