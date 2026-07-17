# Worktree Integration

Only the controller owns `.worktrees/parallel-subagent-exec/<run-id>/` and
`loopx/parallel/...` refs. Task/retry workers edit their assigned worktree but
do not run controller Git operations.

The Cursor App adapter requires the canonical primary repository to be the
current Cursor workspace and every owned worktree to be a non-symlink
descendant of that workspace. It records the invoking checkout plus every
owned worktree's symbolic branch, HEAD, index, and status before dispatch. A
worker may change only its assigned worktree and declared write scope. In
Cursor App `relaxed-worktree` mode, validate concurrently reserved worktrees as
one active batch: defer integration until all peers are terminal, exclude
active batch worktrees from sibling immutability checks, and scope-check each
worktree before any batch member integrates. Any change to the invoking
checkout, controller artifacts, or inactive worktrees blocks the complete
batch even when Cursor reports success.

All adapters record the assigned symbolic branch, HEAD, and index before a
writer starts and require that terminal identity to remain unchanged. Codex
read-only roles additionally snapshot complete tracked and untracked worktree
content and require byte-identical completion. Codex operations also snapshot
the invoking checkout and every declared sibling worktree; any mutation blocks
the operation. CLI worker-local exchanges must be ignored. Any observed stage,
commit, checkout, assigned-branch change, or protected-worktree mutation blocks
integration. Controller ownership of unrelated shared refs remains a scheduler
invariant; do not infer worker ownership from a repository-wide ref snapshot.

After clean task review, the controller verifies write scope, creates an
ephemeral commit, snapshots the target integration HEAD/index/status, and
applies the task with `cherry-pick --no-commit` in declared task order. A child
or single plan receives one formal boundary commit only after its required
review passes.

On conflict, capture status, unmerged paths, source stat/diff, and conflict
diff; restore the exact snapshot; create a retry worktree; dispatch the
reconciliation prompt; review it; and retry. Permit a maximum of two
reconciliation attempts. Failure preserves all evidence and owned resources.
