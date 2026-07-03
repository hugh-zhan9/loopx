---
name: exec
description: "Executes a written loopx implementation plan sequentially with spec verification, mandatory checkpoint reviews, and checkpoint-based resume. Not for unclear plans, missing requirements, or subagent-first execution."
when_to_use: "written implementation plan, inline execution, sequential plan execution, mandatory checkpoint review, no subagent lane"
metadata:
  version: "0.3.11"
---

# Exec

Use `exec` for the same-context fast path. Load one plan, execute tasks inline,
apply checkpoint reviews where required, and finish according to input scope.
`exec` does not use subagents.

## Fast Path

Use this skill when the plan is clear enough to execute in the current context
without delegation.

- Read the plan once, confirm the scope, then work task by task.
- Keep task evidence, checkpoint review notes, and resume state current.
- Preserve the current contract only. Do not add legacy compatibility behavior.

## Input Scope

Classify the user-provided path before execution:

| Input | Scope | Behavior |
|---|---|---|
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` | single plan | Execute inline, then run `loopx:final-review` and `loopx:finish` when clean. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` | multi-plan package | Run package mode for the whole package. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/` | multi-plan package | Resolve `00-overview.md` and run package mode. |
| `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md` | direct child plan mode | Execute only that child plan, run plan-level `loopx:final-review`, update `.loopx/multi-plan/<feature-slug>/state.json`, and stop. |

If the input is missing, ambiguous, unreadable, a package directory without
`00-overview.md`, or an overview without the required package fields, stop and
report the concrete path defect.

## Required Startup

Before implementation starts, record both requirement identity and finish audit
baseline:

```bash
loopx execution-start <slug> --source <plan-path> [--design <design-path>]
loopx finish-start <slug> --source <plan-path>
```

`execution-start` records the requirement start commit and canonical final-review
report identity. `finish-start` preserves the committed audit baseline so
`finish-audit` can inspect `baseline..HEAD`.

## Commit Policy

Do not create task-level commits or Git-index checkpoints.

- Single plan: create one implementation commit after all tasks and checkpoint
  obligations are clean, before `loopx:final-review`.
- Multi-plan package: create one implementation commit after each child plan
  completes and its plan-level review is clean.
- Direct child plan: create one implementation commit after that child plan
  completes and its plan-level review is clean.

Task completion is proven by evidence fields and review results, not by commit
SHAs.

## Task Loop

For each task:

1. Mark the task `in_progress`.
2. Follow the plan step exactly.
3. Run the specified verification.
4. Perform a lightweight spec compliance check.
5. Record task completion evidence before marking the task complete.
6. Request `checkpoint review` when a mandatory checkpoint applies.
7. Fix Critical or Important findings with `fix-review`, re-run focused
   verification, and re-run checkpoint review.
8. Update the checkpoint after the task is complete.

Task completion evidence fields are:

```yaml
task_anchor: <T-* or Task N>
source_ac: <AC-* ids or not_applicable>
design_anchors: <D-* ids or not_applicable>
test_cases: <TC-* ids, manual checks, or deferred-with-rationale>
commands_run: <commands and outcomes>
evidence_summary: <short proof summary tied to expected execution evidence>
remaining_risk: <none or concrete residual risk>
```

## Required Review Gates

Use checkpoint reviews, not mandatory review after every task. Request
`loopx:review` when any checkpoint condition applies.

- The task changes a public interface, exported type, or shared utility
- The task removes, replaces, narrows, migrates, or changes compatibility for
  existing behavior
- The task deletes modules, generated artifacts, templates, hooks, package
  entries, migrations, or installer/governance rules
- The task rewrites or deletes tests for existing behavior
- The task changes current public docs that describe product behavior
- The task touches 5+ files
- The task involves security-sensitive code
- You have completed 3 consecutive tasks without a review
- The plan explicitly marks a task as a review checkpoint
- You are about to leave Step 2 because all tasks are implemented

Before announcing all tasks complete or starting `loopx:final-review`, inspect
both unstaged and staged changes with `git diff` and `git diff --cached`, then
run a final checkpoint `loopx:review` unless the latest clean checkpoint review
already covers every change since the previous review.

`loopx:review` is the implementation-stage checkpoint gate. It does not replace
`loopx:final-review`.

## Completion By Scope

- Single plan: after all tasks are complete and checkpoint obligations are
  clean, create one implementation commit, run `loopx:final-review`, then
  `loopx:finish`.
- Multi-plan package: execute child plans strictly sequentially, create one
  implementation commit after each child plan's plan-level review is clean,
  update child `plan_review`, then run one spec-level `loopx:final-review`
  before `loopx:finish`.
- Direct child plan: after all tasks are complete and the plan-level review is
  clean, create one implementation commit, update the matching child row in
  `.loopx/multi-plan/<feature-slug>/state.json`, and stop.

## References

- [Multi-Plan Package Mode](references/multi-plan-package-mode.md)
- [Checkpoints and Resume](references/checkpoints-and-resume.md)

## STOP Conditions

Stop and report the concrete blocker if the plan is ambiguous, the required
input path is missing, a checkpoint review returns Critical or Important issues
that cannot be fixed immediately, verification fails repeatedly, or execution is
blocked by a dependency or environment issue.

## Red Flags

- Do not execute an unreadable, ambiguous, or anchor-broken plan.
- Do not skip checkpoint review because local tests passed.
- Do not create task-level commits or use the Git index as task state.
- Do not start `final-review` until diffs and checkpoint obligations are clean.
