---
name: fix
description: "Issue-driven bug fix execution for .loopx/issues ready_for_fix ledgers or recorded in_progress repairs, with verification, proportional review, and quiet completion checking. Not for feature work, vague bug reports, unqualified ledgers, issue intake, tracker automation, commits, pushes, or closing issues."
when_to_use: "fix, bug fix, ready_for_fix, .loopx/issues, issue ledger, issue-driven execution, 修复bug, 工单修复"
metadata:
  version: "0.3.1"
---

# Fix

Use this as the issue-driven execution workflow for ready bug ledgers or a recorded interrupted repair.

## Contract

`fix` accepts `.loopx/issues/*.md` with metadata `status: ready_for_fix` for
a first run, or `status: in_progress` with a complete Resume Record for recovery.
Read [references/resume-contract.md](references/resume-contract.md) before
preflight; it defines admission, change attribution, checkpoints, and statuses.

Do not use `fix` for feature requests, enhancements, vague reports, or bug reports that have not gone through `$issue` diagnosis and fix brief preparation.

Do not invoke a separate `exec` workflow from inside this issue-owned fix context.

Use `git worktree` only when parallel subagents will directly modify code. Serial execution may edit the main worktree. Parallel subagents that do not use isolated worktrees must produce patches or reports only; they must not directly modify the main worktree.

Subagents must not commit, push, or close issues. The controller performs Git
disposition only on an explicit user request under the working agreement.

## Inputs

Accept:

- `$fix .loopx/issues/<ledger>.md`
- `$fix .loopx/issues/<ledger-a>.md .loopx/issues/<ledger-b>.md`

Reject:

- ledgers outside `.loopx/issues/`
- missing ledgers
- ledgers outside the admission states defined by the resume contract
- full ledgers missing Diagnosis Summary or Fix Brief; short ledgers missing their four required sections
- conflicting worktree state:
  - changes that cannot be attributed to an admitted run or the target ledgers
  - unignored untracked files outside declared new files or recorded report paths

Ignored local data is non-blocking. Files excluded by `.gitignore`, `.git/info/exclude`, or global git excludes are treated as local runtime data unless the Fix Brief explicitly brings them into scope.

## Preflight

1. Read every requested ledger.
2. Apply first-run or resume admission from the resume contract; a diagnosis-stage `in_progress` ledger without a Resume Record is not a resumable fix.
3. Confirm every ready ledger has `expected_touched_files`, `parallel_safe`, regression test plan or exception, risk triggers, and verification commands. A `form: short` ledger satisfies this with its four sections; its documented defaults (`parallel_safe: false`, regression test required, empty risk triggers) are binding without restatement.
4. Inspect `git status --porcelain --untracked-files=all`.
5. On first entry, require a clean tracked baseline except target ledgers. On resume, compare the current full delta with the recorded checkpoint; allowed paths alone do not prove ownership.
6. Record HEAD, tracked/staged changes, unignored untracked files, and checkpoint locations before editing.
7. Stop on unrelated or unattributable changes; never discard them to pass preflight.
8. Do not block on ignored files. If ignored files might affect verification, record them as environment context, not as fix scope.

## Scope Validation

Before changing code, perform scope validation:

- Confirm each `expected_touched_files` entry exists or is a clearly named new test/source file.
- Confirm `expected_touched_files` and expected surfaces do not overlap across ledgers before parallel execution.
- Treat public CLI/API/schema/config/lockfile/generated artifact changes as high risk unless explicitly listed in the Fix Brief.
- If a necessary file is outside the expected scope, stop, write `status: needs_scope_change` under `## Execution Reports`, set ledger metadata `status: needs_scope_change`, and do not silently expand scope. The ledger returns to `issue` for a scope decision.
- If a high-risk trigger appears mid-fix on a `form: short` ledger, or the fix outgrows one file, stop and backfill the full ledger (metadata `status: needs_scope_change` until backfilled and approved through `issue`) before continuing.

## Scheduling

- Default to serial direct execution in the main worktree.
- If all ledgers are `parallel_safe: true`, expected files do not overlap, and no high-risk trigger requires confirmation, independent bug-fix subagents may run in parallel only with isolated `git worktree` checkouts.
- If parallel worktrees are unavailable or unnecessary, parallel subagents may produce patch/report artifacts only; the controller applies patches serially in the main worktree.
- If parallel safety cannot be proven and no high-risk trigger blocks execution, downgrade to serial direct execution.
- Never let multiple subagents directly edit the main worktree at the same time.

Each subagent prompt carries the leaf clause:

> You are a leaf worker. Do not spawn, delegate to, or wait for other agents.
> Complete this assignment directly and report blockers to the controller.

Each subagent receives only:

- its ledger
- allowed files and surfaces
- forbidden scope
- verification commands
- report path under `.loopx/issues/reports/`
- worktree path when using isolated parallel direct execution

The top-level controller is the only orchestration owner. It creates exactly
one active worker per ledger stage and never replaces a worker that is still
running.

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
3. Save the integrated checkpoint and run the ledger verification commands after each patch.
4. Preserve the worker delta and recovery evidence. Remove only an accounted-for,
   clean temporary worktree under the host cleanup contract; a rejected or dirty
   candidate is not authorization to discard its changes.

Do not commit, push, or close issues from the isolated worktree.

## High-Risk Triggers

Evaluate `risk_triggers` from the Diagnosis Summary and Fix Brief before execution.
Honor existing explicit approval covering the same risk and scope; ask only for
remaining required authorization. Do not treat a pending answer as refusal or approval:

- `scope_unclear`: block execution and return to `$issue` or the user to narrow expected files/surfaces.
- `public_surface`: ask for confirmation unless the Fix Brief explicitly lists the public CLI/API/schema/config change and verification command.
- `no_repro`: ask for confirmation before a defensive fix; if declined or unavailable, keep the unresolved authorization visible and mark the ledger `blocked`.
- `defensive_fix`: ask for confirmation and require a verification command that proves the defensive behavior.
- lockfile, generated artifact, migration, package metadata, global config, or shared fixture changes: ask for confirmation unless explicitly listed in the Fix Brief.

## Execution

For each admitted ledger:

1. Initialize or verify the Resume Record, set metadata `status: in_progress`, and reproduce or run the failing check when possible.
2. Add or update the regression test unless the ledger records a valid exception.
3. Implement the smallest root-cause fix that satisfies the Fix Brief.
4. Save a complete checkpoint after each edit batch and before verification, then run ledger verification commands. On failure, retain `in_progress` for a recoverable repair and record the failed check and next action.
5. Write an execution report using the fields below.

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
git diff HEAD --name-only
git ls-files --others --exclude-standard
```

Ignored files are excluded from `actual_changed_files` unless the Fix Brief explicitly made them part of the fix scope.

Stop before closeout when:

- any actual changed file is outside declared `expected_touched_files`, target ledgers, or report paths
- actual changed files overlap between supposedly parallel fixes
- a subagent reports `needs_scope_change`

When scope must change, set both metadata and Execution Reports to `needs_scope_change`, save the current checkpoint, and return to `issue`. Preserve the Resume Record when the brief is revised; scope approval does not authorize unrelated edits.

## Ledger Append Sections

Use [report-contract.md](references/report-contract.md) for execution-owned
`## Execution Reports`, `## Reviews`, `## Verification`, and `## Closeout`.
Keep the intake and diagnosis evidence; do not overwrite them with run results.

## Review

Every code modification through `fix` receives a controller-owned scope and
integration check against the ledger's Diagnosis Summary, Fix Brief, actual
diff, and verification evidence. Follow the installed working agreement's review clause: dispatch an
independent reviewer only for an explicit review request, security-sensitive
or destructive behavior, public compatibility changes, cross-task interaction,
or a reconciled conflict. A routine low-risk fix does
not require a local reviewer and whole-diff reviewer ceremony.

When an independent review is triggered, Critical and Important findings must be
verified, addressed with a focused change or evidence-based pushback, freshly
reverified, and independently re-reviewed.

Minor findings may be fixed or recorded, but must not expand scope.

## Verification And Completion

After the controller integration check and any triggered blocking-finding
closure:

1. Run final verification commands from every ledger.
2. Append or update `## Execution Reports`, `## Reviews`, `## Verification`, and `## Closeout`.
3. Set metadata `status: complete` only after all checks pass; use `in_progress` for recoverable execution failures, `needs_scope_change` for scope changes, and `blocked` for unresolved external or owner decisions. Record the check outcome separately in Execution Reports and Closeout, and save the final checkpoint.
4. For both serial and concurrent fixes, apply the quiet completion check in
   [../shared/completion-check.md](../shared/completion-check.md) before any
   completion claim.
5. Record whether Git disposition was explicitly requested. Perform authorized
   Git work directly through the host under the working agreement; do not
   require another skill for closeout.

Do not call the work complete until verification, the controller integration
check, and any triggered independent-review evidence are recorded.
