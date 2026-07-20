---
name: fix
description: "Issue-driven bug fix execution for .loopx/issues ledgers with status ready_for_fix, verification, review, and quiet completion checking. Not for feature work, vague bug reports, non-ready ledgers, issue intake, tracker automation, commits, pushes, or closing issues."
when_to_use: "fix, bug fix, ready_for_fix, .loopx/issues, issue ledger, issue-driven execution, 修复bug, 工单修复"
metadata:
  version: "0.1.3"
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

Use `git worktree` only when parallel subagents will directly modify code. Serial execution may edit the main worktree. Parallel subagents that do not use isolated worktrees must produce patches or reports only; they must not directly modify the main worktree.

Controllers and subagents must not commit, must not push, and must not close
issues. Use `finish` afterward only when the user explicitly requests Git
disposition.

## Inputs

Accept:

- `$fix .loopx/issues/<ledger>.md`
- `$fix .loopx/issues/<ledger-a>.md .loopx/issues/<ledger-b>.md`

Reject:

- ledgers outside `.loopx/issues/`
- missing ledgers
- ledgers whose `status` is not `ready_for_fix`
- ledgers missing Diagnosis Summary or Fix Brief
- conflicting worktree state:
  - tracked changes outside the target `.loopx/issues/` ledgers
  - unignored untracked files unless explicitly listed as expected new files

Ignored local data is non-blocking. Files excluded by `.gitignore`, `.git/info/exclude`, or global git excludes are treated as local runtime data unless the Fix Brief explicitly brings them into scope.

## Preflight

1. Read every requested ledger.
2. Confirm each ledger contains `status: ready_for_fix`.
3. Confirm every ready ledger has `expected_touched_files`, `parallel_safe`, regression test plan or exception, risk triggers, and verification commands.
4. Inspect `git status --porcelain --untracked-files=all`.
5. Require a clean tracked baseline except changes to the target `.loopx/issues/` ledgers.
6. Record baseline with `git diff --name-only` and `git ls-files --others --exclude-standard`.
7. Stop if unrelated tracked changes or unignored untracked files exist.
8. Do not block on ignored files. If ignored files might affect verification, record them as environment context, not as fix scope.

## Scope Validation

Before changing code, perform scope validation:

- Confirm each `expected_touched_files` entry exists or is a clearly named new test/source file.
- Confirm `expected_touched_files` and expected surfaces do not overlap across ledgers before parallel execution.
- Treat public CLI/API/schema/config/lockfile/generated artifact changes as high risk unless explicitly listed in the Fix Brief.
- If a necessary file is outside the expected scope, stop, write `status: needs_scope_change` under `## Execution Reports`, set ledger metadata status to `blocked`, and do not silently expand scope.

## Scheduling

- Default to serial direct execution in the main worktree.
- If all ledgers are `parallel_safe: true`, expected files do not overlap, and no high-risk trigger requires confirmation, independent bug-fix subagents may run in parallel only with isolated `git worktree` checkouts.
- If parallel worktrees are unavailable or unnecessary, parallel subagents may produce patch/report artifacts only; the controller applies patches serially in the main worktree.
- If parallel safety cannot be proven and no high-risk trigger blocks execution, downgrade to serial direct execution.
- Never let multiple subagents directly edit the main worktree at the same time.

Each subagent receives only:

> You are a leaf worker. Do not spawn, delegate to, or wait for other agents.
> Complete this assignment directly and report blockers to the controller.

The top-level controller is the only orchestration owner. It creates exactly
one active worker per ledger stage and never replaces a worker that is still
running.

- its ledger
- allowed files and surfaces
- forbidden scope
- verification commands
- report path under `.loopx/issues/reports/`
- worktree path when using isolated parallel direct execution

Subagents must stop with `needs_scope_change` if the fix requires files outside the allowed set.

## Worktree Isolation

Use isolated worktrees only for parallel direct code edits:

```bash
git worktree add --detach .loopx/worktrees/fix-<ledger-slug> HEAD
```

Each worktree belongs to one ledger. The subagent edits only that worktree and writes its report under `.loopx/issues/reports/`.

After the subagent finishes:

1. Capture a patch from the isolated worktree, including intentional untracked files.
2. Apply patches serially in the main worktree.
3. Run the ledger verification commands after each patch.
4. Remove the isolated worktree after the patch is applied or rejected.

Do not commit, push, or close issues from the isolated worktree.

## High-Risk Triggers

Evaluate `risk_triggers` from the Diagnosis Summary and Fix Brief before execution:

- `scope_unclear`: block execution and return to `$issue` or the user to narrow expected files/surfaces.
- `public_surface`: ask for confirmation unless the Fix Brief explicitly lists the public CLI/API/schema/config change and verification command.
- `no_repro`: ask for confirmation before a defensive fix; if confirmation is not given, mark the ledger `blocked`.
- `defensive_fix`: ask for confirmation and require a verification command that proves the defensive behavior.
- lockfile, generated artifact, migration, package metadata, global config, or shared fixture changes: ask for confirmation unless explicitly listed in the Fix Brief.

## Execution

For each ready ledger:

1. Reproduce or run the failing check when possible.
2. Add or update the regression test unless the ledger records a valid exception.
3. Implement the smallest root-cause fix that satisfies the Fix Brief.
4. Run ledger verification commands.
5. Write an execution report with:

Use `lancet` discipline while fixing: check whether the fix can be deletion,
repo reuse, stdlib, native platform, or an already-installed dependency before
adding code. Keep the smallest root-cause fix and do not add speculative
abstractions, new dependencies, or broader cleanup outside the ledger scope.

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

After execution, compute `actual_changed_files` from the baseline tracked diff and the delta of unignored untracked files:

```bash
git diff --name-only
git ls-files --others --exclude-standard
```

Ignored files are excluded from `actual_changed_files` unless the Fix Brief explicitly made them part of the fix scope.

Stop before closeout when:

- any actual changed file is outside all allowed `expected_touched_files`, paired tests, target ledgers, or report paths
- actual changed files overlap between supposedly parallel fixes
- a subagent reports `needs_scope_change`

When `needs_scope_change` occurs, do not invent a new metadata status. Write `status: needs_scope_change` in `## Execution Reports`, set ledger metadata `status: blocked`, and hand back to `$issue` or the user to revise the Fix Brief.

## Ledger Append Sections

`issue` creates the intake, diagnosis, Fix Brief, Response Draft, Handoff, and Evidence Log sections. It should not pre-fill execution, review, verification, or closeout content.

When executing a ready ledger, append or update these sections:

```markdown
## Execution Reports

- status: fixed | failed | blocked | needs_scope_change
- actual_changed_files:
  - <path>
- verification:
  - command: <command>
    result: pass | fail
- notes: <execution summary>

## Reviews

- local_review:
  - status: clean | findings_addressed | blocked
  - findings:
    - <finding or none>
- whole_diff_review:
  - status: clean | findings_addressed | blocked
  - findings:
    - <finding or none>
- fix_review_decisions:
  - <Critical/Important finding handled, pushed back with evidence, or none>

## Verification

- final_commands:
  - command: <command>
    result: pass | fail | not_run
- regression_test_result: <summary>
- evidence: <fresh verification evidence>

## Closeout

- status: complete | failed | blocked
- response_draft: <final user/reporter response>
- git_disposition: requested | not_requested | blocked
```

## Review

Every code modification through `fix` requires:

- local review per bug against that ledger's Diagnosis Summary, Fix Brief, and actual diff
- whole diff review after all individual fixes are complete

Use existing review standards. Critical and Important findings must be handled with `fix-review` discipline: verify the finding, implement a focused change or give evidence-based pushback, then re-run relevant verification and re-review.

Minor findings may be fixed or recorded, but must not expand scope.

## Verification And Completion

After local review, whole diff review, and any `fix-review` pass:

1. Run final verification commands from every ledger.
2. Append or update `## Execution Reports`, `## Reviews`, `## Verification`, and `## Closeout`.
3. Set status to `complete`, `failed`, or `blocked`.
4. For both serial and concurrent fixes, apply the quiet completion check in
   [../shared/completion-check.md](../shared/completion-check.md) before any
   completion claim.
5. Record whether Git disposition was explicitly requested. Invoke `finish`
   only for that explicit Git disposition; otherwise close out without it.

Do not call the work complete until verification and review evidence is recorded.
