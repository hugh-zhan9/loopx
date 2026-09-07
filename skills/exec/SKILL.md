---
name: exec
description: "Executes one ready plan2exec plan through host-native leaf subagents while rechecking architecture conformance. The controller schedules, reviews, integrates, resolves conflicts, and verifies; independent slices may run in parallel. Not for planning, blocked plans, prompt-first work, issue ledgers owned by fix, or Git disposition."
when_to_use: "$exec, execute a ready plan2exec plan, delegated plan execution, parallel plan slices, 执行 plan2exec 计划"
metadata:
  version: "1.0.3"
argument-hint: "<plan path> [model=<id>] [reasoning_effort=<level>] [max_workers=<n>]"
---

# Exec

Execute exactly one ready `plan2exec` document. Implementation belongs to leaf
subagents. The top-level agent is the controller and does not author feature code
or tests.

## Admission

- Require one plan path with `schema: loopx-plan/v1`, `status: ready`, a non-empty
  acyclic slice graph, explicit `depends`, `writes`, `architecture`, acceptance,
  and `verify` entries, and matching frontmatter/body slice IDs. Reject unknown
  schemas. Treat an unversioned plan as legacy and return it to `plan2exec` for
  an explicit in-place schema and architecture-evidence upgrade before dispatch.
- Read the plan source and linked authoritative `概要设计.md` decisions, current user constraints, repository instructions, relevant
  specs and code, and the tracked/untracked baseline before dispatch.
- Read [the architecture conformance contract](../shared/architecture-conformance.md)
  and recheck the plan's reuse, ownership, dependency, isolation, and maintenance
  evidence against the current tree. Missing current-schema evidence is invalid,
  not a legacy compatibility signal, and never authorizes a new architecture
  decision.
- Preserve existing user changes. Treat overlap with planned `writes` as run-owned
  only when the slice status and Resume note match the prior run's baseline and
  complete content checkpoint; otherwise stop before mutation and report the paths.
- Require host-native leaf subagents. Never inline implementation when delegation is
  unavailable.
- Accept optional `model`, `reasoning_effort`, and positive `max_workers`. Pass
  explicit model and effort values through the host API to every worker and reviewer;
  if unsupported, stop instead of substituting them. Count all active subagents
  against `max_workers`.
- Leave ready `.loopx/issues` ledgers to `$fix`. Plain work without a plan remains
  prompt-first.

## Controller And Workers

Only the controller may update plan state, compute the ready frontier, dispatch
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

A pending slice is runnable only when all dependencies are `done`. Mark it
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
slice against that state. Continue when it resolves the conflict within existing
`writes` and decisions. If resolution needs new paths, dependencies, or write scope,
mark the slice and plan `blocked` and return to `plan2exec`. Route a new product,
compatibility, data, security, or architecture decision to `clarify` or `spec`.
An unexplained parallel capability, boundary bypass, widened blast radius, or
new source of truth is architecture drift, not a local cleanup.

## Finish Or Block

Keep recoverable failures `in_progress` and the plan `ready`; do not unlock
dependents. Before dispatch and after each integration or controller-owned edit,
save a content checkpoint and identify it in the Resume note: baseline HEAD and
checkout, baseline user delta, complete tracked/staged/untracked run delta (including
new files, deletions, and modes), candidate identity/integration state, failed check,
and next action. Store artifacts at a named host-local location; exclude only named
plan/checkpoint bookkeeping from its own snapshot. No new execution runtime is needed.

On resume, require the same baseline HEAD and exact content equality with baseline
plus accepted run delta. Paths alone never establish ownership. A missing checkpoint,
changed HEAD, or uncheckpointed edit stops mutation; preserve the changes and obtain
explicit attribution before recording a replacement baseline and redispatching.
Use `blocked` for a material decision, scope/dependency change, invalid independence
claim, or unattributable contamination; record the exact blocker and recovery point.

After every slice is `done`, run `Integration And Final Verification` and any
required whole-diff review. Claim completion only from fresh passing evidence. The
run delta must stay within declared slice `writes`, apart from controller-owned plan
state edits, and pre-existing unrelated user changes must remain intact.

Report the effective subagent profile, changed paths, architecture-conformance and
verification evidence, review outcome, blockers, and residual risks. Do not commit,
push, merge, discard work, or add an unrequested fallback.
