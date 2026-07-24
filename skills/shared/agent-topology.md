# Agent Topology Contract

The top-level controller is the only orchestration owner and agent lifecycle
owner for loopx execution. This remains true for prompt-first requests and
explicit workflow skills.

## Hard Rules

- Every implementer, reviewer, fixer, and final reviewer is a leaf worker.
- Reviewers and final reviewers are read-only. They report findings and never
  modify the candidate under review. A separate fixer owns any accepted change.
- A leaf worker completes its assigned role directly. It must not spawn,
  delegate to, wait for, message, replace, interrupt, or terminate another
  agent.
- The controller may dispatch only work admitted by the owning execution
  contract. Concurrent workers must have independent assignments and remain
  leaves.
- The controller alone owns execution state, Git integration, review-gate
  transitions, and cleanup. Leaf workers never advance shared state.
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

The default shared worker budget is four active leaf workers. Implementers,
reviewers, fixers, and any other dispatched roles all consume the same budget;
an owning execution contract may lower it but must not create a second pool.
Use at most the minimum of ready independent work, observed host capacity, and
the configured budget. Do not create
exploratory helpers, duplicate reviewers, speculative parallel workers, or a
replacement merely because a worker is slow. A new worker is justified only by
admitted ready work or a terminal replacement condition from the hard rules.
When sufficient evidence exists for the required output, record the result and
stop dispatching.

## Dispatch Economy

- When the host supports per-worker model selection, declare a model tier per
  dispatched role: mechanical implementation of a fully specified slice may use
  a low tier, task review a middle tier, and final Spec and Standards review
  the strongest available tier. An undeclared tier is reported as "inherits the
  session model", never left implicit.
- Final-review findings close in one fix wave: a single fixer receives the
  complete accepted finding list. Never dispatch one fixer per finding.
- Workers receive file paths and task contracts, not pasted session history;
  large artifacts travel as files, bound by hash where the owning profile
  requires provenance.
- Reviewer prompts are never primed: no pre-judged severities, no "do not
  flag" or "at most Minor" instructions, no restrictions on what may be
  reported.

## Dispatch Clause

Every worker-visible prompt must say:

> You are a leaf worker. Do not spawn, delegate to, or wait for other agents.
> Complete this assignment directly and report blockers to the controller.
