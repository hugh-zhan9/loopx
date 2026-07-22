---
name: exec
description: "Canonical execution entry for a clear request or persistent plan. Selects inline, delegated-serial, or parallel-strict execution from plan structure and current runtime evidence, with mandatory independent review for delegated profiles. Not for unresolved decisions, planning-only requests, standalone code review, or Git disposition."
when_to_use: "explicit exec invocation, run implementation plan, implement clear multi-outcome request, select execution profile, governed delegated execution"
metadata:
  version: "0.5.0"
argument-hint: "<clear request or plan path>"
---

# loopx Exec

`exec` is the canonical execution entry. The caller supplies a clear request or
plan, not an executor choice. `exec` selects one structural profile and owns the
controller lifecycle through completion.

## Input Resolution

- A clear, bounded, low-risk request with one coherent outcome may use
  `inline-owned-v1` in the current context.
- A current plan supplies exactly one authoritative
  `loopx.execution-graph.v1` block and `selected_profile`.
- A legacy lean plan without that graph is conservatively compiled as
  `delegated-serial-v1`; it is never admitted to parallel execution.
- A clear multi-outcome prompt may use a temporary graph, but every dependency,
  write scope, relevant path, exclusive resource, interface, verification
  boundary, and review obligation needed for dispatch must be established first.

Stop before mutation when a material product, API, data, permission, migration,
compatibility, security, destructive, or cross-module architecture decision is
unresolved. Route that decision to `clarify` or `spec`.

## Structural Profile Selection

Read [references/execution-selection.md](./references/execution-selection.md).

- `inline-owned-v1`: only prompt-first small work selected before execution.
- `delegated-serial-v1`: the default for planned work, legacy plans, a ready
  frontier of one, coupling, write/resource conflicts, or uncertain independence.
- `parallel-strict-v1`: only when the graph proves a ready frontier of at least
  two independent slices and strict isolated mutation is available.

For a current plan, validate the graph and selected structural profile before
dispatch. Reject duplicate or missing ids, unknown dependencies, cycles,
graph-task/slice mismatches, and unproved parallel safety. Do not ask the user to
choose a profile during ordinary execution.

`subagent-exec` and `parallel-subagent-exec` are explicit profile entry points
that forward into this same controller contract. They do not own separate
schedulers, state, Git integration, or review policy.

## Runtime Admission

Runtime evidence may keep or safely narrow the selected structural profile; it
must never silently broaden it or convert planned work to inline execution.

- A parallel graph with lost isolation, write overlap, relevant-path overlap,
  or another invalidated independence claim narrows to delegated serial and
  records the reason.
- Temporary worker capacity below two applies backpressure or effective
  concurrency one; it does not authorize inline execution.
- Missing implementer or independent-review capability blocks a planned
  delegated run. Report the missing capability instead of silently executing it
  in the controller context.
- A delegated run must bind complete source and authoritative plan provenance
  in `reviewContext` before mutation. Acceptance and scope summaries may be
  derived from the graph, but missing source or plan context blocks execution;
  resume requires the same proof.
- User-owned changes remain untouched. Never stash, commit, unstage, overwrite,
  or include them in an execution result.

## Profile Execution

### Inline Owned

The controller inspects, implements, and freshly verifies one coherent prompt
outcome. Inline work has no mandatory per-task review ceremony unless an
independent-review signal from the shared review contract applies.

### Delegated Serial

Follow [../subagent-exec/SKILL.md](../subagent-exec/SKILL.md). Dispatch one fresh
implementer at a time. Every implementation or fix candidate must pass fresh
verification and an independent read-only task review before the next dependent
slice proceeds.

### Parallel Strict

Follow [references/concurrent-execution.md](./references/concurrent-execution.md)
and [../parallel-subagent-exec/SKILL.md](../parallel-subagent-exec/SKILL.md).
Schedule only the current ready frontier within one shared worker budget.
Dependencies unlock only after their predecessors are verified, independently
reviewed, and integrated.

Every dispatched worker is a leaf under
[../shared/agent-topology.md](../shared/agent-topology.md). The controller alone
owns state, dispatch, Git, integration, retries, and cleanup.

The implementation seam is [scripts/adaptive-exec.mjs](./scripts/adaptive-exec.mjs).
It owns profile selection, graph scheduling, reviewed task dispatch, manifest
state, Git isolation, protected integration, resume, and cleanup. Profile skills
reuse this implementation instead of duplicating it.

## Review And Completion Gates

Read [references/review-selection.md](./references/review-selection.md). For
delegated serial and parallel strict:

1. The implementer produces a candidate and fresh verification evidence.
2. A separate read-only reviewer checks task spec compliance and task quality.
3. Critical or Important findings go to a separate fixer, followed by fresh
   verification and independent re-review.
4. Only a clean candidate may integrate.
5. After all slices integrate, dispatch independent final Spec and Standards
   reviewers. Keep their findings side by side; either axis may block completion.

Before any completion claim, run the controller integration check from the
review-selection contract and the quiet check from
[../shared/completion-check.md](../shared/completion-check.md).
Report the selected and effective profile, selection or narrowing evidence,
changed paths, verification, task-review and final-review results, blockers, and
residual risk.

## STOP Conditions

Stop when the input or graph is invalid, a material decision is unresolved,
safe ownership cannot be proved, required implementation or reviewer capability
is unavailable, verification cannot run, a Critical or Important finding lacks
clean re-review, or satisfying acceptance would expand approved scope.
