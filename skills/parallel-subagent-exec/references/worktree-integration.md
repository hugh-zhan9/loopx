# Worktree Integration

Only the controller owns `.worktrees/parallel-subagent-exec/<run-id>/` and
`loopx/parallel/...` refs. Task/retry workers edit their assigned worktree but
do not run controller Git operations.

After clean task review, the controller verifies write scope, creates an
ephemeral commit, snapshots the target integration HEAD/index/status, and
applies the task with `cherry-pick --no-commit` in declared task order. A child
or single plan receives one formal boundary commit only after its required
review passes.

On conflict, capture status, unmerged paths, source stat/diff, and conflict
diff; restore the exact snapshot; create a retry worktree; dispatch the
reconciliation prompt; review it; and retry. Permit a maximum of two
reconciliation attempts. Failure preserves all evidence and owned resources.
