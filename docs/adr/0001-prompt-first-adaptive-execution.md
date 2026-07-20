# Adopt prompt-first adaptive execution

loopx will treat clear work as prompt-first and add clarification, specification, persistent planning, independent review, resumable state, or Git disposition only when a concrete need justifies them. Planned and unplanned work share one adaptive executor: the model identifies semantic dependencies and concurrency opportunities, while loopx enforces worker ownership, worktree isolation, bounded capacity, integration safety, fresh verification, and safe sequential fallback. This replaces the fixed Golden-path and separate sequential, subagent, and parallel execution choices because those contracts duplicate model judgment, produce excessive artifacts, and make stronger models slower without reliably improving outcomes.

## Consequences

- The canonical workflow surface is `clarify`, `spec`, `plan`, `exec`, `review`, and `finish`; older execution and review names remain explicit-only compatibility aliases for one release.
- Persistent plans stay concise and semantic. The executor derives a current execution graph from the request or plan and the present codebase.
- Verification remains universal. Independent review, persistent run state, and knowledge writes are proportional to risk, recovery needs, and evidence.
- Runtime routing comes from installed host guidance and skill frontmatter. `skills/RESOLVER.md` remains a governance index rather than a runtime authority.
- Hosts use safe concurrency only when their observed capabilities support the required isolation; otherwise the same request executes sequentially.
