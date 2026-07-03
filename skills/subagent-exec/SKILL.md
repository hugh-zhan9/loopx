---
name: subagent-exec
description: "Executes approved loopx implementation plans with fresh subagents per independent task and combined task review. Not for planning, unclear requirements, or tightly coupled edits."
when_to_use: "approved implementation plan, independent tasks, subagent execution, combined task review, spec and quality verdicts, parallel-capable execution"
metadata:
  version: "0.3.14"
---

# Subagent Exec

Execute an approved plan by running one fresh implementer subagent per task,
then one task reviewer gate per task, then the required final-review scope for
the input path. This skill is the orchestration fast path. Keep the controller
context small and push bulky handoff artifacts into files.

## Fast Path

1. Classify the input path.
2. Confirm subagent capability on the current platform.
3. Run required startup:
   - `loopx execution-start <slug> --source <plan-path> [--design <design-path>]`
   - `loopx finish-start <slug> --source <plan-path>`
4. For each task, generate a brief with `scripts/task-brief`, dispatch a fresh
   implementer subagent, generate a current-worktree review package with
   `scripts/review-package --worktree <task-anchor>`, then dispatch the task
   reviewer.
5. Handle Critical and Important findings with `fix-review`, then re-review.
6. Finish according to scope:
   - single plan: run plan completion, `spec-level final-review`, then `finish`
   - direct child plan: run `plan-level final-review`, update multi-plan state,
     then stop
   - package mode: execute child plans sequentially, run `spec-level final-review`,
     then `finish`

## Subagent Capability

Before falling back to `loopx:exec`, run the current platform's subagent
capability check from [platform-subagents.md](./platform-subagents.md). Codex
may expose subagent tools through deferred tool discovery, so do not treat an
initial visible tool list as final evidence. The platform references contain
the runtime-specific checks.

## Input Scope

Classify the user-provided path exactly:

| Input | Scope | Behavior |
|---|---|---|
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` | single plan | Execute tasks, then `spec-level final-review`, then `finish`. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` | multi-plan package | Run package mode for the whole package. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/` | multi-plan package | Resolve `00-overview.md` and run package mode. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md` | direct child plan mode | Execute only that child plan, run `plan-level final-review`, update multi-plan state, and stop. |

If the path is missing, ambiguous, unreadable, or structurally invalid, stop
and report the concrete defect. Do not guess. Current contract only.

## Required Startup

Before dispatching the first implementer, record both requirement identity and
finish baseline:

```bash
loopx execution-start <slug> --source <plan-path> [--design <design-path>]
loopx finish-start <slug> --source <plan-path>
```

`execution-start` records the requirement start commit and canonical final-review
report identity. `finish-start` preserves the committed audit baseline so
`finish-audit` can inspect `baseline..HEAD` while task work remains uncommitted
until the plan or child-plan boundary.

## Commit Policy

Do not create task-level commits or Git-index checkpoints.

- Single plan: create one implementation commit after all tasks and task-review
  gates pass, before `spec-level final-review`.
- Direct child plan: create one implementation commit after that child plan's
  tasks and plan-level review pass.
- Multi-plan package: create one implementation commit after each child plan
  completes and its plan-level review passes.

Task success is proven by implementer reports, commands run, review packages,
and clean task-review gates, not by commit SHAs.

## Per-Task Orchestration

Keep the task loop strict:

1. Check the progress ledger in `$(scripts/subagent-workspace)/progress.md`.
   Do not re-dispatch a completed task.
2. Generate the task brief with `scripts/task-brief PLAN_FILE N`.
3. Pass the brief path, `ANCHOR_CONTEXT`, `LANCET_CONTEXT` when present,
   `SURFACE_CHANGE_CONTEXT` when present, and a report path to one fresh
   implementer subagent.
4. Model explicitly for every subagent dispatch.
5. The implementer writes the full report file and returns only short status:
   `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.
6. For `DONE` or acceptable `DONE_WITH_CONCERNS`, generate the current worktree
   evidence review package with `scripts/review-package --worktree <task-anchor>`.
7. Dispatch the task reviewer with the brief path, report path, review package
   path, Global Constraints, `ANCHOR_CONTEXT`, and `SURFACE_CHANGE_CONTEXT`.
8. After clean review, append task completion to the progress ledger and move
   to the next task without pausing.

Detailed task handoff, report fields, review package contract, and reviewer
expectations are in
[task-handoff-and-review.md](./references/task-handoff-and-review.md).

## Required Review Gates

Do not mark a task complete unless both gates pass:

- Spec Compliance: `SPEC_COMPLIANT`
- Task quality: `Approved`

If the reviewer returns `NEEDS_CONTEXT`, supply the missing context and re-run
review. If the reviewer finds Critical or Important issues, route them through
`fix-review`, re-run focused verification, rebuild the review package, and
dispatch the task reviewer again. Never skip task review. Never proceed with
unfixed Critical or Important findings.

Model selection, uncertainty handling, retry rules, and `DONE` /
`NEEDS_CONTEXT` / `BLOCKED` handling are in
[model-selection-and-retry.md](./references/model-selection-and-retry.md).

## Completion By Scope

Follow the completion rule for the classified scope:

- single plan:
  create one implementation commit after all task-review gates pass, then run
  `spec-level final-review`; only start `loopx:finish` after the review is clean
  and all Critical/Important feedback has been handled and rechecked.
- direct child plan mode:
  execute only that child plan; do not execute sibling child plans; do not
  proceed to package-level spec review or `finish` after the child plan
  completes; run `plan-level final-review`, create one implementation commit,
  update `.loopx/multi-plan/<feature-slug>/state.json`, and stop.
- multi-plan package:
  execute child plans strictly sequentially through the same per-task flow,
  run plan-level review for each child plan, create one implementation commit
  per completed child plan, update each child row's `plan_review.status`,
  `plan_review.reviewed_at`, `plan_review.summary`, and
  `ready_for_spec_review: true`, then run one `spec-level final-review` before
  `finish`.

For current package mode, schema v2 initialization and validation, direct child
plan state updates, and spec-level completion rules, use
[multi-plan-package-mode.md](./references/multi-plan-package-mode.md).

## References

- [platform-subagents.md](./platform-subagents.md)
- [codex-subagents.md](./codex-subagents.md)
- [claude-subagents.md](./claude-subagents.md)
- [cursor-subagents.md](./cursor-subagents.md)
- [implementer-prompt.md](./implementer-prompt.md)
- [task-reviewer-prompt.md](./task-reviewer-prompt.md)
- [multi-plan-package-mode.md](./references/multi-plan-package-mode.md)
- [task-handoff-and-review.md](./references/task-handoff-and-review.md)
- [model-selection-and-retry.md](./references/model-selection-and-retry.md)

## STOP Conditions

Stop and report the defect when any of the following is true:

- subagents are unavailable on the current platform and `loopx:exec` is the
  required fallback
- the plan path or package structure is invalid
- the multi-plan state file is invalid, stale, duplicated, or mismatched with
  the overview
- required startup commands were not run
- the plan is ambiguous enough that task review cannot be applied coherently
- the task reviewer or final-review returns unresolved Critical or Important
  findings
- the implementer remains `BLOCKED` after context or model adjustments

Use `loopx:exec` only when subagent support is unavailable or the work cannot
be delegated safely.

## Red Flags

- Do not dispatch overlapping write scopes to parallel subagents.
- Do not mark a task complete without both execution evidence and task review.
- Do not redispatch completed tasks during resume.
- Do not use task-level commits or Git-index checkpoints as proof of task state.
