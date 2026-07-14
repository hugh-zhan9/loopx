# Package Mode

Validate `00-overview.md` into the child DAG. Children become runnable only
after dependency children integrate, subject to `can_run_in_parallel` and the
global worker budget. Each child owns task/retry worktrees plus one child
integration worktree.

Before plan-level review, copy the root worktree's exact
`.loopx/multi-plan/<slug>/state.json` into the child at the same path and save
`reviews/<child-id>/multi-plan-state.before.json`. Require schema v2. The child
reviewer may change only the matching row, may not write the canonical package
final-review report, and receives the leaf-worker clause.

The controller canonicalizes and compares every sibling row byte-for-byte,
validates the matching-row transition and clean verdict, then merges only that
row into root state with a serial CAS update. Reject sibling mutation, report
ownership mismatch, or blocking review before boundary commit.

Each child creates one formal commit. Apply completed child commits to the root
integration worktree in overview order, even when execution completed out of
order. Create no package commit. Run exactly one root-owned spec-level final
review and call `finish` only when clean.
