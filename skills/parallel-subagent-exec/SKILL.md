---
name: parallel-subagent-exec
description: "Executes strict loopx plans across Codex, Claude Code, Cursor App, and Cursor Agent CLI with bounded parallel leaf workers, isolated worktrees, deterministic integration, and controller-owned review. Not for legacy plans or direct child execution."
when_to_use: "manual cross-runtime execution of a strict parallel single plan or complete package with explicit machine-readable DAG metadata"
metadata:
  version: "0.3.3"
---

# Parallel Subagent Exec

Manually execute a strict plan DAG with isolated task and child worktrees. The
controller alone owns lifecycle, state, Git, retries, review gates, integration,
resume, and cleanup. Invoke only as:

```text
$parallel-subagent-exec <plan-or-package> [--max-parallel N]
```

This is an experimental, explicit executor. Do not auto-route to it.

## Input Gate

Accept only a strict single-plan file or a package `00-overview.md` validated by
`scripts/parallel-exec.mjs manifest inspect`. The metadata must use
`loopx.parallel-plan.v1`, `loopx.parallel-task.v1`, and for packages
`loopx.parallel-package.v1`.

For missing, legacy, or invalid parallel metadata, or a direct numbered child
plan, stop and print this same-path handoff exactly:

```text
$subagent-exec <same-input-path>
```

Do not execute the input and do not silently degrade inside this skill.

## Capability Gate

Read [platform-subagents.md](./platform-subagents.md), select the Codex, Claude
Code, Cursor App, Cursor Agent CLI, or Codex Agent CLI adapter, then verify
create with an explicit model, a controlled worktree binding, and
observe-or-wait before state initialization. A native API may bind the worktree
through an explicit cwd; Cursor App may instead use its verified workspace
probe. In Codex, inspect the bundled Codex Agent CLI adapter before declaring
capability unavailable when native `spawn_agent` lacks model or cwd. Missing
capability exits `5`, records zero task dispatch, names the missing capability,
and does not invoke or recommend another executor.

The configured worker budget defaults to `4`; `--max-parallel N` overrides it.
The effective budget is the lower of configured and observed runtime capacity.
Capacity zero is backpressure, not task failure.

## Startup

1. Validate the normalized manifest and Git topology before dispatch.
2. Create the controller-owned root integration worktree.
3. Resolve source and design to canonical absolute paths.
4. From the root integration worktree run `loopx execution-start`, then
   `loopx finish-start`, before the first reservation.
5. Persist the requirement-start commit, finish baseline, artifact paths,
   canonical final-review report, root HEAD, index tree, branch, and worktree.

Any startup failure leaves zero reservations and zero dispatches.

## Controller Loop

Use [references/scheduler-and-state.md](./references/scheduler-and-state.md).

1. Strictly resume or initialize owner-only state under
   `.loopx/parallel-subagent-exec/<run-id>/`.
2. Compute ready stages from the normalized DAG and reserve them atomically.
3. Dispatch within one global budget using the platform adapter.
4. Persist the native worker identity, observed model, cwd, report path, and
   running status before treating the reservation as dispatched. For Codex
   Agent CLI, also persist the role, capability path/hash, expected
   executable/version, skill/config fingerprints, prompt hash, protected
   worktrees, and immutable operation identity.
5. Every dispatch includes exactly:
   `You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`
6. Before task-review dispatch, validate the final rendered prompt with
   `review prompt-verify`; do not create the worker operation until the exact
   `loopx.review-result.v1` finding schema passes preflight.
7. Require task review before integration. A valid Critical or Important
   finding transitions that task to `needs_fix`; reserve a fixer and fresh
   re-review within the same global budget. The finding itself is not a global
   STOP condition, and independent ready work remains schedulable.
8. Treat a malformed machine-readable review result as reviewer
   infrastructure failure, not a verdict. Retain the failed artifact and
   dispatch at most one fresh replacement reviewer against the byte-identical
   candidate and review package. Block only when that replacement is also
   invalid or cannot be safely resumed.
9. The controller alone creates ephemeral commits, snapshots integration state,
   applies task commits with `cherry-pick --no-commit`, and creates boundaries.
10. On conflict, restore the exact snapshot and allow at most two reconciliation attempts.
    A third attempt is forbidden; mark the affected branch blocked.

Implementers, reviewers, fixers, reconciliation workers, plan reviewers, and
final reviewers never update controller state, create commits, cherry-pick,
remove worktrees, or own refs.

## Task And Review Pipeline

Follow [references/task-pipeline.md](./references/task-pipeline.md) and
[references/worktree-integration.md](./references/worktree-integration.md).
Consume these existing `subagent-exec` assets read-only:

- `../subagent-exec/implementer-prompt.md`
- `../subagent-exec/task-reviewer-prompt.md`
- `../subagent-exec/scripts/task-brief.mjs`
- `../subagent-exec/scripts/review-package.mjs`
- `../subagent-exec/scripts/review-result.mjs`

Do not modify files under `skills/subagent-exec/`.

For Cursor, follow [cursor-subagents.md](./cursor-subagents.md). Prefer an
already installed and authenticated Cursor Agent CLI for strict isolation. It
uses `cursor inspect`, `cursor artifact-id`, `cursor start`, `cursor wait`, and
`cursor interrupt`, double-binds `--workspace` and process cwd, and retains only
verified worker-local outputs. Without an authenticated CLI, use native Cursor
App Task with explicit `relaxed-worktree` isolation after its real-worktree
probe succeeds; do not require Cursor Agent CLI installation.

For Codex, follow [codex-subagents.md](./codex-subagents.md). Use strict native
creation when the API exposes model and cwd. Otherwise use the bundled Codex
Agent CLI adapter after `codex inspect` verifies binary identity,
authentication, explicit model/cwd, workspace sandboxing, JSONL lifecycle, and
terminal report support. Require the controlled automation flag that ignores
user/project execpolicy rules while retaining the fingerprinted Codex config
needed for authentication and custom model providers. It uses `codex
artifact-id`, `codex run`, `codex wait`, and `codex interrupt`; never use the
sandbox-bypass flag.

## Completion By Scope

Single plan: integrate tasks in declared order, create one formal plan commit,
run one spec-level final review, then run `finish` only when clean.

Package: follow [references/package-mode.md](./references/package-mode.md).
Run child plans by the overview DAG and `can_run_in_parallel`, with task
worktrees plus one integration worktree per child. Each clean child receives
one formal commit after plan-level review. Apply child commits to the root in
overview order, retaining exactly one formal commit per child and no package
commit. The package root owns one spec-level final review and `finish`.

Before child review, copy the exact multi-plan schema v2 state into the child
and save a controller-owned before snapshot. The reviewer may change only its
matching row. Sibling rows must remain byte-identical, and the child must not
write the canonical package report. Merge the accepted row serially with CAS.

## Resume And Cleanup

Resume only when source hash, manifest hash, baseline, control root, state
schema, startup artifacts, worker supervisor/session identities, worktree
paths, HEADs, index trees, owned refs, capability and operation bindings, and
retained report hashes/sizes match. A repeated complete invocation returns
`completion.json`.

On success, remove owned task, retry, and child worktrees plus temporary and
ephemeral refs. Retain reports, reviews, conflict evidence, compact `state.json`,
`completion.json`, and the root integration worktree for `finish`.

Blocked and interrupted runs preserve all state, evidence, worktrees, and refs,
then print the exact resume command. Never call `finish` after a blocking task,
plan-level, or spec-level review.

## References

- [platform-subagents.md](./platform-subagents.md)
- [codex-subagents.md](./codex-subagents.md)
- [claude-subagents.md](./claude-subagents.md)
- [cursor-subagents.md](./cursor-subagents.md)
- [reconciliation-prompt.md](./reconciliation-prompt.md)
- [references/task-pipeline.md](./references/task-pipeline.md)
- [references/scheduler-and-state.md](./references/scheduler-and-state.md)
- [references/worktree-integration.md](./references/worktree-integration.md)
- [references/package-mode.md](./references/package-mode.md)

## STOP Conditions

Stop on unsupported input, missing runtime capability, identity mismatch,
unowned or dirty integration state, an invalid review artifact after its one
allowed byte-identical replacement, two failed reconciliation attempts,
sibling-row mutation, canonical report ownership violation, or a Critical or
Important finding that remains unresolved because its fixer/re-review path has
blocked. A first valid Critical or Important finding enters `needs_fix`; it
does not stop independent work or bypass the fixer.
