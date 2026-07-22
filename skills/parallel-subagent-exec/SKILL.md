---
name: parallel-subagent-exec
description: "Explicit parallel-strict execution profile for exec. Schedules proved-independent ready slices in isolated worktrees with bounded leaf workers, mandatory task review, deterministic integration, and final Spec plus Standards review. Not for unvalidated or legacy graphs, unresolved requirements, or shared mutable work."
when_to_use: "explicit parallel-subagent-exec invocation, force parallel-strict admission, valid execution graph, bounded isolated subagents"
disable-model-invocation: true
metadata:
  version: "0.5.0"
argument-hint: "<plan path with loopx.execution-graph.v1>"
---

# parallel-subagent-exec Profile

This is the explicit `parallel-strict-v1` profile entry point. Forward the same
input to the canonical `exec` controller with parallel admission requested.
This skill does not own a separate scheduler, state store, Git pipeline, or
review policy.

## Admission

Require a valid authoritative `loopx.execution-graph.v1` and a current ready
frontier of at least two. Every concurrently admitted pair must prove:

- no dependency path in either direction;
- disjoint write scopes and exclusive resources;
- no producer-consumer interface or shared mutable state;
- independent decisions and verification outcomes;
- reliable isolated worktree binding and protected integration.

A legacy plan, width-one frontier, conflict, or uncertain independence narrows
to `delegated-serial-v1` with the concrete reason. Temporary capacity one may
retain the structural profile with effective concurrency one. Neither case may
silently become inline execution. Missing implementer or reviewer capability
blocks the run.

## Scheduling And Slice Gate

- Schedule only ready slices whose dependencies are reviewed and integrated.
- Use one shared worker budget for implementers, reviewers, fixers, and final
  reviewers; prefer fix and review work before new implementation.
- Give each implementer a fresh isolated worktree from the latest reviewed
  integration boundary.
- Require fresh verification and reject writes outside declared scope.
- Dispatch a separate read-only leaf reviewer for every candidate.
- Send Critical or Important findings to a separate fixer, then freshly verify
  and independently re-review.
- Integrate only a clean candidate in deterministic graph order; persist the new
  integration boundary before unlocking dependents.

The controller alone owns lifecycle, state, Git, integration, resume, and
cleanup. All dispatched roles are leaves and may not delegate.

## Final Gate

After complete graph integration and combined verification, dispatch independent
read-only Spec and Standards final reviewers, concurrently when capacity allows.
Keep both verdicts side by side; either axis may block completion.

## STOP Conditions

Stop on an invalid graph, lost isolation, stale baseline, unsafe user-change
overlap, unavailable required worker or reviewer capability, failed verification,
or a blocking finding without clean re-review.
