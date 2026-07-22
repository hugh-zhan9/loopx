# Parallel Strict Execution

Use this path only after a validated graph proves a ready frontier of at least
two independent slices and the host proves isolated mutation.

## Ready Frontier

A slice is ready only when every dependency is verified, independently
reviewed, and integrated. Recompute the frontier after each integration. A
diamond graph runs its independent branches together, then waits at the fan-in
barrier before starting the consumer.

Within the shared worker budget, prefer fixer and re-review work, then task
review, then new implementation. Do not starve review by filling every slot with
new implementers.

## Isolated Slice Lifecycle

1. Inspect Git topology, user-owned changes, baseline identity, write scope, and relevant-path snapshots.
2. Persist owner-only run state under `.loopx/exec/<run-id>/` with the graph, selected profile, effective limit, task states, worktree identities, review state, and resume instruction.
3. Create a fresh owned worktree from the latest reviewed integration boundary for each admitted ready slice.
4. Dispatch a leaf implementer with only its slice contract, context, write scope, verification obligation, and report destination.
5. Require fresh verification and reject actual changes outside the declared write scope.
6. Freeze the candidate and dispatch a separate read-only leaf reviewer for task spec compliance and task quality.
7. Route Critical or Important findings to a separate fixer; then verify and independently re-review the new candidate.
8. Integrate only a clean reviewed candidate in deterministic graph order and run relevant combined verification.

Persist every worker reservation before dispatch. A normal result or explicit
terminal failure clears the reservation. An ambiguous exception retains an
`uncertain` active-worker record, including adapter-provided native identity
when available; resume may reset, replace, or clean its worktree only after the
host proves that worker terminal.

Final reviewers are read-only and the controller compares the integration tree
before and after both reviews. Any reviewer mutation is rejected and reset.
Final-fix ownership remains active through identity checks, verification, and
commit; every terminal noncommitted exit resets to the persisted integration
HEAD, while an ambiguous exit remains `uncertain` until terminal proof.
Resume reconciles a persisted `committing` reservation before strict HEAD
validation. A task commit rolls forward only when its single parent and exact
reviewed-diff hash match the reservation. Integration commits roll back to the
last persisted boundary and rebuild from reviewed task commits.
9. Unlock dependents only after the integration boundary is persisted.
10. After the complete graph integrates, run independent final Spec and Standards reviews before applying the verified result and completing.

The controller alone owns dispatch, state, Git operations, integration,
retries, and cleanup. Workers never edit central state, integrate candidates, or
spawn other workers.

## Safety Gates

- A result without fresh verification is not reviewable or integrable.
- A reviewer must be independent, read-only, and bound to the exact candidate.
- A task cannot integrate before clean review or re-review.
- An actual changed path outside declared scope blocks integration.
- A changed relevant baseline invalidates the dispatch evidence.
- After the verified patch is applied, persist a post-apply fingerprint for
  the complete target surface: every declared write scope, actual changed path,
  and relevant path, including overlapping directories. Resume rechecks that
  fingerprint before accepting interrupted applied verification.
- If the target patch is already present while application state is still
  `pending`, resume recognizes the exact applied boundary, records the
  complete post-apply target snapshot, and continues verification without
  applying the patch twice.
- Integration or application verification failure blocks completion.
- A changed invoking baseline or target surface blocks automatic application.
- Unrelated user changes are never stashed, committed, unstaged, overwritten,
  or included.
- Blocked or interrupted runs retain exact identities and resume only after
  validating graph, repository, candidate, review, and integration state.

Successful application removes owned worktrees, branches, and transient run
state. Never clean a resource whose persisted identity no longer matches.
