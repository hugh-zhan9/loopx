# Development Readiness Rubric

Use this rubric to decide the next loopx recommendation after analyzing a source requirement.

## Ready For `clarify`

Recommend `clarify` when owner answers are needed before design can start.

Signals:

- Scope, non-goals, actor, or acceptance rules are missing or contradictory.
- Multiple product interpretations are plausible and lead to different designs.
- Permission, ownership, or failure handling is not decidable from the document.
- The source mixes competing goals without priority.

Output:

- List P0 questions first.
- Keep questions concrete and answerable.
- Do not draft a design or implementation plan.

## Ready For `spec`

Recommend `spec` when product intent is mostly clear but design decisions must be fixed before planning.

Signals:

- API, data, state, permission, migration, compatibility, or architecture choices are open.
- Existing systems or contracts are affected.
- Rollout, rollback, or operational behavior needs a design decision.
- The requirement is clear enough to compare options but not enough to write tasks.

Output:

- State the design decisions that need to be resolved.
- Identify any support lens that should be used later, such as `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, `go-style`, or `kratos`.

## Ready For `plan-to-exec`

Recommend `plan-to-exec` only when implementation can be decomposed safely.

Signals:

- Scope and non-goals are explicit.
- Acceptance rules and user-visible completion states are testable.
- Affected files, modules, APIs, schemas, commands, or docs are discoverable.
- Remaining choices are local implementation choices, not product or architecture decisions.
- Known risks can be handled as implementation tasks with verification.

Output:

- Summarize why no owner-level decisions block planning.
- Mention any P2 improvements that should be tracked but not block planning.

## Blocked Pending Owner Decisions

Use this when a P0 issue cannot be answered by local repo evidence and has no safe default.

Examples:

- Who is allowed to perform a destructive action?
- What happens to existing data during migration?
- Which customer-visible behavior wins when two requirements conflict?
- What legal, compliance, or privacy rule governs the data?

Output:

- State the blocking decision.
- Explain what downstream design or implementation would be unsafe without it.
- Ask the smallest set of questions needed to unblock the next step.
