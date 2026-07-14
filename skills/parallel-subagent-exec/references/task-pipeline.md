# Task Pipeline

For each reserved task, create an owned task worktree from the persisted child
or root base. Generate a brief with the existing `subagent-exec` script, then
dispatch an implementer with its exact cwd and report path.

The controller verifies the report and focused commands, builds a review
package from the task worktree, and dispatches a fresh task reviewer. Review
must return both spec compliance and quality approval before integration.
Critical or Important findings reserve a fixer, then require a fresh package
and reviewer. Reviewers and fixers consume the same global budget.

Every handoff contains:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

The controller alone advances task state and creates the scope-checked
ephemeral task commit. A worker never commits or edits another worktree.
