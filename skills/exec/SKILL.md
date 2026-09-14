---
name: exec
description: "Execute a ready plan2exec plan through leaf subagents when requested (执行计划). Requires host delegation. Git actions need an explicit request."
when_to_use: "$exec, execute a ready plan2exec plan, delegated plan execution, parallel plan slices, 执行 plan2exec 计划"
metadata:
  version: "1.1.0"
argument-hint: "<plan path> [model=<id>] [reasoning_effort=<level>] [max_workers=<n>]"
---

# Exec

Execute one ready `plan2exec` document through leaf subagents. The controller
does not author feature code or tests.

## Admission

- Check actual progress before admission. For `status: complete` or work already
  implemented, compare code and fresh verification with the original requirements.
  Correct the execution record when authorized; do not dispatch completed slices
  or require a new pre-implementation review. Incomplete or failing results still
  need the concrete repair and verification they are missing.
- Require one active plan with `schema: loopx-plan/v1`, overall `status: ready`, a
  non-empty acyclic slice graph, explicit `depends`, `writes`, `architecture`,
  acceptance, and `verify`, and matching slice IDs. Reject unknown schemas before
  dispatch. Correct clear missing labels or legacy fields in place from settled
  evidence; ask only when their meaning or required decision is unresolved.
- Check required review only for the slice's concrete risks or an explicit review
  request, following [plan review](../plan2exec/references/plan-review.md). Ordinary
  plans need no independent readiness review. Stale review matters only when a
  substantive change affects the reviewed risk; progress and formatting do not.
- Read the plan source and linked authoritative `概要设计.md` decisions, current user constraints, repository instructions, relevant
  specs and code, and the tracked/untracked baseline before dispatch.
- Read [the architecture conformance contract](../shared/architecture-conformance.md)
  and recheck the plan's reuse, ownership, dependency, isolation, and maintenance
  evidence against the current tree. Find missing facts in the repository; do not
  invent evidence or authorize a new architecture decision by filling a field.
- Preserve existing user changes. Treat overlap with planned `writes` as run-owned
  only when the slice status and Resume note match the prior run's baseline and
  complete content checkpoint; otherwise stop before mutation and report the paths.
- Require host-native leaf subagents. Never inline implementation when delegation is
  unavailable.
- Accept optional `model`, `reasoning_effort`, and positive `max_workers`. Pass
  explicit model and effort values through the host API to every worker and reviewer;
  if unsupported, stop instead of substituting them. Count all active subagents
  against `max_workers`.
- Use `debug` for a supplied `.loopx/issues` repair ledger. Plain work without
  a plan remains prompt-first.

## Controller And Workers

Only the controller may update plan state, identify runnable slices, dispatch
workers, review exact diffs, integrate results, resolve conflicts, run verification,
and decide whether execution is complete or blocked.

Each worker receives exactly one slice plus a self-contained prompt containing the
plan goal and boundaries, accepted source behavior, current user constraints,
applicable repository instructions and specs, integrated dependency interfaces,
allowed and forbidden paths, architecture constraints and evidence, acceptance,
and verification. Include:

> You are a leaf worker. Do not spawn or wait for other agents. Implement only this
> slice, modify only its declared writes, and do not edit the plan or perform Git
> disposition. Preserve baseline and other workers' changes. Report changed paths,
> architecture-conformance evidence, verification evidence, blockers, and residual risks.

Require each worker to return its base identity and either an isolated-workspace
locator plus candidate ref, or a complete unapplied patch. It must also report the
exact changed paths, verification evidence, blockers, and residual risks. Reject a
candidate that the controller cannot locate or tie to its declared base.

## Schedule

A pending slice is runnable only when all dependencies are `done` and any required
review for that slice has resolved its blockers. Never dispatch a `blocked` or
`done` slice. Mark it
`in_progress` immediately before dispatch.

Run runnable slices in parallel only when all of these are true:

- neither slice depends on the other;
- normalized `writes` are disjoint;
- they share no generated output, lockfile, migration, global configuration, or
  other mutable resource;
- workers use isolated workspaces or return unapplied, fully inspectable patches;
- the active-subagent count stays within `max_workers` and host capacity.

Otherwise delegate serially. Never let concurrent workers edit the controller
workspace directly. Review and integrate parallel results one at a time.

## Review And Integrate

For each candidate, the controller:

1. resolves the candidate from its base identity and locator, ref, or patch, then
   checks its exact delta and changed paths against that base and slice `writes`;
2. checks acceptance, source behavior, protected behavior, reuse of the owning
   capability, dependency and state boundaries, fault isolation, and maintenance
   surface against the plan and repository evidence;
3. integrates the candidate onto the latest accepted state;
4. reruns the slice `verify` command in the integrated workspace;
5. dispatches an independent read-only leaf reviewer when the plan `review` line or
   repository working agreement requires one;
6. marks the slice `done` only after scope, integration, verification, and required
   review pass, then unlocks dependents.

Return implementation findings to a leaf worker; the controller does not patch them.
Critical or Important findings must be fixed, freshly verified, and re-reviewed.

If a candidate conflicts with the latest integrated state, stop integrating the
remaining candidates and dispatch one serial leaf worker to reconcile the affected
slice against that state. Continue when it resolves the conflict within approved behavior and ownership.
For necessary local paths, check overlaps and extend `writes` before redispatch;
update dependencies and serialize shared writes. These ordinary implementation
choices do not require another approval or a full plan review. Block affected
slices if safe ordering or scope cannot be established; block the whole plan only
when no remaining work can safely proceed. Route a new product,
compatibility, data, security, or architecture decision to `clarify` or `spec`.
An unexplained parallel capability, boundary bypass, widened blast radius, or
new source of truth is architecture drift, not a local cleanup.

## Finish Or Block

For interrupted or recoverable work, follow [recovery](references/recovery.md).
Do not unlock dependents until verification and required review pass.

After every slice is `done`, read the original requirements again, run
`Integration And Final Verification` and any required whole-diff review. Check
expected behavior, not just AC/D/TC presence. Set overall `status: complete` only
from fresh passing evidence. Never use `complete` as a slice status. The
run delta must stay within declared slice `writes`, apart from controller-owned plan
state edits, and pre-existing unrelated user changes must remain intact.

Report the effective subagent profile, changed paths, architecture-conformance and
verification evidence, review outcome, blockers, and residual risks. Do not commit,
push, merge, discard work, or add an unrequested fallback.
