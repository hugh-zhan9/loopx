---
name: exec
description: "Execute one ready `loopx-plan/v1` plan through isolated leaf subagents, with controller-owned integration and verification (执行计划)."
disable-model-invocation: true
metadata:
  version: "1.3.0"
  when_to_use: "$exec, execute a ready plan2exec plan, delegated plan execution, parallel plan slices, 执行计划"
argument-hint: "<plan path> [model=<id>] [reasoning_effort=<level>] [max_workers=<n>]"
---

# Exec

Execute one ready `loopx-plan/v1` plan through **leaf subagents**. The
controller owns plan state, frontier scheduling, diff review, sequential
integration, conflict reconciliation, and final verification; the controller
does not author feature code or tests.

## Admission

1. Validate the plan structure first (run `../plan2exec/scripts/validate-plan.mjs <plan-path>`
   relative to the installed skills root when available, or verify manually).
   Require `schema: loopx-plan/v1` and overall `status: ready` (reject unknown
   schemas, dependency cycles, or undeclared parallel `writes` overlaps before
   dispatch). If work is already complete, verify code and fresh evidence
   against the original source instead of redispatching.
2. Read the plan's original source (including linked `概要设计.md` `D-*`
   decisions), relevant specs, and current git status/baseline. Preserve
   unrelated user changes; treat overlap with planned `writes` as run-owned
   only when the slice status and Resume note match a recorded checkpoint
   ([recovery.md](references/recovery.md)).
3. Require host-native leaf subagents (never inline implementation). Pass
   explicit `model` and `reasoning_effort` values when supplied; count all
   active subagents against `max_workers`.

## Frontier dispatch (sparse context pointers)

Work the **frontier**: pending slices whose `depends` are all `done` and whose
pre-slice review gates (if any) have passed. Never dispatch `blocked` or `done`
slices. Mark each dispatched slice `in_progress` immediately before dispatch.

Keep worker prompts concise by passing **context pointers** (paths to the
source requirement, design doc, plan slice, and integrated upstream files)
rather than duplicating full documents, plus the exact slice acceptance,
`writes`, `architecture`, and `verify` contract. Always include:

> You are a leaf worker. Do not spawn or wait for other agents. Implement only
> this slice, modify only its declared `writes`, and do not edit the plan or
> perform Git disposition. Preserve baseline and other workers' changes. Return
> your base identity, isolated-workspace locator/ref or unapplied patch,
> changed paths, and fresh verification output.

Run frontier slices in parallel ONLY when their `depends` are independent,
`writes` are disjoint, they share no mutable generated/config/migration
resource, workers run in isolated workspaces (or return unapplied patches), and
active agents stay within `max_workers`. Otherwise run serially. Never let
concurrent workers edit the controller workspace directly.

## Review, integrate, and finish

Integrate completed candidates **one at a time**:

1. Verify the candidate's exact diff against its declared base and slice
   `writes`, checking source behavior, reuse/boundaries, and absence of
   architecture drift.
2. Integrate onto the latest accepted state and rerun the slice `verify`
   command in the integrated workspace.
3. On merge conflict, stop integrating remaining candidates and dispatch one
   serial leaf worker to reconcile against the latest state.
4. Return confirmed implementation defects to a leaf worker (controller never
   patches feature code). Apply [review-coverage.md](references/review-coverage.md)
   for shared review points and dispatch `code-review` (two-axis Standards vs
   Spec) whenever a risk review point or final high-risk integration is reached.
5. Mark the slice `done` only after scope, integration, verification, and any
   due review pass; then recompute the frontier.

After every slice is `done`, re-read the original source requirements, run
`Integration And Final Verification` plus `node skills/code-review/scripts/check-guardrails.mjs`,
and set overall `status: complete` only from fresh passing evidence.

Report effective subagent profile, changed paths, verification and review
evidence, blockers, and residual risks. Perform Git disposition only on
explicit user request.
