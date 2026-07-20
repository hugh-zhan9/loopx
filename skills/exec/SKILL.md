---
name: exec
description: "Executes an explicitly invoked clear request, a persistent lean plan, or a clear multi-outcome request that needs adaptive execution, keeping strongly coupled work serial and requiring fresh verification. Not for ordinary clear single-outcome work that stays prompt-first, unresolved decisions, planning-only requests, code review, or Git disposition."
when_to_use: "explicit exec invocation, run lean plan, implement clear multi-outcome request, adaptive execution after prompt-first decomposition, strongly coupled planned work"
metadata:
  version: "0.4.4"
argument-hint: "<clear request or plan path>"
---

# loopx Exec

Use one execution intent for a clear request or a persistent plan. Derive the
current execution graph from the input and repository; do not ask the user to
choose a serial, subagent, or parallel executor.

## Input Resolution

- Ordinary clear single-outcome work stays prompt-first unless the user
  explicitly invokes `exec`.
- If the argument resolves to a readable plan, load its Outcomes, Boundaries,
  Likely Modules, Known Dependencies, Acceptance, and Verification.
- Otherwise treat the argument and current user request as the execution input.
- Do not require or create a persistent plan for clear prompt input.
- Treat likely modules and known dependencies as orientation. Current code and
  observed behavior remain authoritative.

Stop before mutation when the input leaves a material product, API, data,
permission, migration, compatibility, security, destructive, or cross-module
architecture decision unresolved. Route the concrete decision to `clarify` or
`spec`; do not hide it inside execution.

## Temporary Execution Graph

Inspect the relevant code, specs, tests, and user-owned changes. Derive a
temporary execution graph containing semantic outcomes, known dependencies,
likely writes, and verification boundaries. Keep it in the current context for
ordinary work; do not write a workflow artifact merely to represent it.

Read [references/execution-selection.md](./references/execution-selection.md)
before dispatching any worker. Explain each concurrency decision with a
concrete dependency or capability reason.

Strongly coupled work remains serial in the current context. This includes work
that shares intermediate reasoning or state, changes the same file, defines and
consumes the same new interface, updates one generated output, or continues an
active debugging investigation. Uncertain independence also selects serial
execution.

## Serial Execution

For serial work, keep inspection, implementation, and verification in this
context:

1. Confirm the accepted outcome and protected boundaries.
2. Inspect the current implementation and relevant tests.
3. Make the smallest coherent change, using a failing test first where useful.
4. Run focused checks as the change develops.
5. Run fresh task-relevant verification before any completion claim.
6. Report the result, changed paths, verification evidence, and concrete
   blockers or residual risks.

Do not create a run manifest, checkpoint, review report, finish audit, or other
workflow artifact for an ordinary successful serial run. A source plan remains
the only persistent planning artifact when one was provided.

## Concurrent Admission Boundary

Concurrency is admissible only when every independence condition in
`execution-selection.md` is satisfied and the host provides the required
isolation. Missing or uncertain capability narrows execution to serial work in
this same intent; it does not fail the request or recommend another executor.

For admitted concurrent mutation, read
[references/concurrent-execution.md](./references/concurrent-execution.md) and
use the exec-owned runtime in `scripts/adaptive-exec.mjs`. Workers verify their
outcome in isolated task worktrees. The controller validates actual changed
paths, integrates in a protected workspace, verifies the combination, applies
one complete result to the unchanged invoking workspace, verifies again, and
removes all successful run state.

Unrelated tracked, staged, unstaged, and untracked user changes may remain in
the invoking workspace. A user change that overlaps an outcome's
`write_scope` or `relevant_paths` selects current-context serial execution.
Never stash, commit, unstage, or overwrite pre-existing user work. If the
baseline identity or a target snapshot changes after dispatch, retain the
verified integration result and follow the manifest's exact `$exec --resume`
instruction only after the user-owned target is safe again.

The top-level controller owns lifecycle and the shared worker budget. Every
dispatched worker is a leaf. Concurrent mutation must use the exec-owned Git
isolation boundary; do not let workers write the invoking workspace.

## Integration Check And Review Selection

Read [references/review-selection.md](./references/review-selection.md) before
claiming completion. Every dispatched worker must provide fresh verification.
The controller then performs an integration check that validates accepted
scope, worker evidence, actual changed paths, and combined behavior.

Independent review is additional and proportional. Dispatch it only for an
explicit review request or concrete security, destructive, public
compatibility, cross-task interaction, or reconciled-conflict evidence.
Multi-agent execution alone is not a review trigger. Low-risk disjoint results
with passing combined verification do not receive one reviewer per task or a
generic final-review ceremony.

When independent review returns Critical or Important findings, keep ownership
in this active execution context. Check each finding against the accepted
intent and current code, make the focused fix or evidence-backed pushback, run
fresh focused and combined verification, and obtain independent re-review
before closing it. Do not route findings through a mandatory fix workflow.

## Completion Contract

Before every completion claim, apply the direct, serial, and concurrent
completion check in [../shared/completion-check.md](../shared/completion-check.md).
It confirms fresh verification, synchronizes an applicable spec changed by the
implementation, and preserves only qualifying reusable knowledge. A quiet
`none` outcome creates no artifact or reminder.

Then summarize:

- accepted outcome;
- changed paths;
- verification commands and results;
- integration-check evidence and any independent-review trigger or result;
- whether execution stayed serial and the concrete reason;
- any unresolved blocker or residual risk.

## STOP Conditions

Stop and report the concrete blocker when the input is unreadable or
contradictory, a material decision remains unresolved, user-owned changes make
the safe write boundary uncertain, required verification cannot run, or the
implementation cannot satisfy acceptance without expanding scope.
