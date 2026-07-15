# Task Pipeline

For each reserved task, create an owned task worktree from the persisted child
or root base. Generate a brief with the existing `subagent-exec` script, then
dispatch an implementer with its controlled worktree and report path.

For Cursor App, pass the canonical assigned worktree, allowed write scope,
operation nonce, and brief directly to native Task. The worker uses absolute
paths for every file operation and returns its report in the terminal Task
result; the controller alone retains that result at the report path. Dispatch
independent reservations as one active batch of background Task calls, persist
each returned agent id immediately, and observe those exact Task results. Do
not let workers read or write the central run-state directory. Wait for every
batch member before review or integration, then validate each assigned
worktree's declared write scope. Active batch worktrees are excluded from
per-worker sibling immutability checks; inactive worktrees, the invoking
checkout, and controller artifacts must remain unchanged. Record this adapter
as `relaxed-worktree` because Cursor App does not enforce per-Task cwd.

For the optional Cursor Agent CLI adapter, copy briefs, review packages, and conflict evidence into
the adapter's worker-local inbox. Point the prompt at adapter placeholders and
write reports/results only to its worker-local outbox; the controller-owned
supervisor validates and retains them after terminal completion. Never grant a
worker write access to the central run-state directory.

The controller verifies the report and focused commands, builds a review
package from the task worktree, and dispatches a fresh task reviewer. Review
must return both spec compliance and quality approval before integration.
Critical or Important findings reserve a fixer, then require a fresh package
and reviewer. Reviewers and fixers consume the same global budget.

Every handoff contains:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

The controller alone advances task state and creates the scope-checked
ephemeral task commit. A worker never commits or edits another worktree.
