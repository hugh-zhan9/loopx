---
name: exec
description: "Executes one ready plan2exec plan through host-native leaf subagents. The controller only schedules, reviews, integrates, resolves conflicts, and verifies; independent slices may run in parallel. Not for planning, blocked plans, prompt-first work, issue ledgers owned by fix, or Git disposition."
when_to_use: "$exec, execute a ready plan2exec plan, delegated plan execution, parallel plan slices, 执行 plan2exec 计划"
metadata:
  version: "1.0.0"
argument-hint: "<plan path> [model=<id>] [reasoning_effort=<level>] [max_workers=<n>]"
---

# Exec

Execute exactly one ready `plan2exec` document. Implementation belongs to leaf
subagents. The top-level agent is the controller and does not author feature code
or tests.

## Admission

- Require one plan path with `status: ready`, a non-empty acyclic slice graph,
  explicit `depends`, `writes`, acceptance, and `verify` entries, and matching
  frontmatter/body slice IDs.
- Read the plan source, current user constraints, repository instructions, relevant
  specs and code, and the tracked/untracked baseline before dispatch.
- Preserve existing user changes. Treat overlap with planned `writes` as run-owned
  only when the plan's slice status and Resume note identify the exact changed paths
  from a prior `exec` run; otherwise stop before mutation and report the paths.
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
allowed and forbidden paths, acceptance, and verification. Include:

> You are a leaf worker. Do not spawn or wait for other agents. Implement only this
> slice, modify only its declared writes, and do not edit the plan or perform Git
> disposition. Preserve baseline and other workers' changes. Report changed paths,
> verification evidence, blockers, and residual risks.

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
2. checks acceptance, source behavior, and protected behavior;
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

## Finish Or Block

Keep a recoverable worker, verification, or review failure `in_progress`, keep the
plan `ready`, and do not unlock dependents. In the Resume note record the failed
slice, its run-owned changed paths, whether its candidate was integrated, the failed
check, and the next leaf-worker action. On resume, re-read that exact delta and
redispatch the slice; if current changes exceed the note or declared `writes`, stop
as unattributable. Use
`blocked` only for a material decision, scope/dependency change, invalid independence
claim, or unattributable workspace contamination.

After every slice is `done`, run `Integration And Final Verification` and any
required whole-diff review. Claim completion only from fresh passing evidence. The
run delta must stay within declared slice `writes`, apart from controller-owned plan
state edits, and pre-existing unrelated user changes must remain intact.

Report the effective subagent profile, changed paths, verification evidence, review
outcome, blockers, and residual risks. Do not commit, push, merge, discard work, or
add an unrequested fallback.
