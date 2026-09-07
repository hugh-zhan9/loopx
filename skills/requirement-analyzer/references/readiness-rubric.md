# Development Readiness Rubric

Use this rubric to decide the next loopx recommendation after analyzing a source requirement.

## Ready For `clarify`

Recommend `clarify` when requirement analysis has done the available evidence work and owner answers are still needed before design can start.

Signals:

- Scope, non-goals, actor, or acceptance rules are missing or contradictory.
- Multiple product interpretations are plausible and lead to different designs.
- Permission, ownership, or failure handling is not decidable from the document.
- The source mixes competing goals without priority.
- Behavioral model reveals non-deterministic transitions or undefined failure paths that require business decisions.
- Cross-document contradictions exist that only the owner can resolve.

Do this first:

- Cross-check referenced documents, examples, and nearby repo implementation when available.
- Separate questions already resolved by evidence from questions that still require owner decisions.
- For each remaining question, list two or three plausible interpretations and the downstream design consequence.
- Avoid using `clarify` as a broad handoff for unexplored ambiguity.
- Complete behavioral model extraction before routing — don't route to clarify with "what are the states?" when the document provides enough to extract them.
- Route gaps in business semantics to `clarify`: state meaning, customer-visible behavior, ownership, allowed operation, rollback policy, failure outcome, or source-of-truth conflicts.

Output:

- List only the remaining unresolved P0 questions first.
- Keep questions concrete and answerable.
- Include behavioral model gaps as structured questions (e.g., "State X has no defined failure path — should it retry, escalate, or fail permanently?").
- Do not draft a design or implementation plan.

## Ready For `spec`

Recommend `spec` when product intent is mostly clear but design decisions must be fixed before planning.

Signals:

- API, data, state, permission, migration, compatibility, or architecture choices are open.
- Existing systems or contracts are affected.
- Rollout, rollback, or operational behavior needs a design decision.
- The requirement is clear enough to compare options but not enough to write tasks.
- Behavioral model is mostly complete but implementation approach (saga vs state machine, sync vs async, etc.) needs design.
- Remaining behavioral coverage or traceability gaps concern technical design, with product semantics already clear.
- The implementation approach is open, but product/business semantics are already decidable from the requirement and evidence.

Output:

- State the design decisions that need to be resolved.
- Identify any support lens that should be used later, such as `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, `go-style`, or `kratos`.
- Include the behavioral model as input context for the spec (states, transitions, operations, mutations are defined — implementation approach is not).
- Route implementation approach gaps to `spec`: persistence shape, state-machine mechanism, sync vs async execution, API contract shape, migration strategy, observability, or rollback implementation.

## Ready For `plan2exec`

Recommend `plan2exec` when the source is ready and a persistent plan serves the
request, approval boundary, recovery, or coordination need. Clear local work can
proceed through the host without creating a plan.

Signals:

- Scope and non-goals are explicit.
- Acceptance rules and user-visible completion states are testable.
- Affected files, modules, APIs, schemas, commands, or docs are discoverable.
- Remaining choices are local implementation choices, not product or architecture decisions.
- Known risks can be handled as implementation tasks with verification.
- Behavioral model is complete: all states, transitions, operations, and mutations are defined with no P0 gaps.
- Relevant requirements have goal and acceptance evidence, with any coverage limits disclosed.
- No owner-level or durable design decision remains unresolved.

Output:

- Summarize why no owner-level decisions block planning.
- Mention any P2 improvements that should be tracked but not block planning.
- Include the complete behavioral model as context for plan decomposition.

## Blocked Pending Owner Decisions

Use this when a P0 issue cannot be answered by local repo evidence and has no safe default.

Examples:

- Who is allowed to perform a destructive action?
- What happens to existing data during migration?
- Which customer-visible behavior wins when two requirements conflict?
- What legal, compliance, or privacy rule governs the data?
- A state transition has two contradictory definitions across documents and the source of truth is unclear.
- The behavioral model reveals a dead-end state with no recovery path, and the business decision on recovery is not documented.

Output:

- State the blocking decision.
- Explain what downstream design or implementation would be unsafe without it.
- Ask the smallest set of questions needed to unblock the next step.
- If behavioral model analysis identified the blocker, include the specific state/transition/operation that is blocked.

## Optional Scores and Readiness

A numerical score is not required for any recommendation. If included, it
summarizes the assessed scope; it does not supply permission or resolve gaps.
Any unresolved P0 prevents a ready-for-implementation recommendation. Route
missing business semantics to `clarify`, durable technical choices to `spec`,
and wording-only defects to document improvement, regardless of score.
