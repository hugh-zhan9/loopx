# Agent Topology Contract

The controller is the only orchestration owner for loopx workflow execution.

## Hard Rules

- Every implementer, reviewer, fixer, and final reviewer is a leaf worker.
- A leaf worker completes its assigned role directly. It must not spawn,
  delegate to, wait for, message, replace, interrupt, or terminate another
  agent.
- The controller creates exactly one active worker for a task stage unless an
  owning workflow contract explicitly permits bounded parallel read-only work.
- A replacement requires explicit completion, failure, interruption,
  `BLOCKED`, or `NEEDS_CONTEXT`. Never replace a worker that is still running.

## Runtime Capabilities

Required capabilities are create worker and await or observe worker result.

Optional capabilities are inspect worker state, message worker, interrupt
worker, and release or close worker. A runtime remains usable when an optional
capability is absent or automatic.

An empty wait window is not a failure. Keep the same running worker and avoid
an unbounded `wait -> message -> wait` polling loop.

## Agent Budget And Stop Rule

The approved plan defines the agent budget: one implementer and one combined
task reviewer for each task that actually reaches those stages. Do not create
exploratory helpers, duplicate reviewers, speculative parallel workers, or a
replacement merely because a worker is slow. A new worker is justified only by
the next planned stage or a terminal replacement condition from the hard rules.
When the current stage has sufficient evidence for its required output, record
the result and stop dispatching.

## Dispatch Clause

Every worker-visible prompt must say:

> You are a leaf worker. Do not spawn, delegate to, or wait for other agents.
> Complete this assignment directly and report blockers to the controller.
