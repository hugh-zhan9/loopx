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

For the Codex and Cursor Agent CLI adapters, copy briefs, review packages, and
conflict evidence into the adapter's worker-local inbox. Point the prompt at
adapter placeholders and write reports/results only to its worker-local
outbox; the controller-owned supervisor validates and retains them after
terminal completion. Codex operations identify the exact role: writer roles
use `workspace-write`, while task, plan, and final reviewers use `read-only`.
Never grant a worker write access to the central run-state directory.

The controller verifies the report and focused commands, builds a review
package from the task worktree, and renders a fresh task-review prompt. Before
creating the reviewer operation or dispatching the worker, run:

```text
node <skill-dir>/scripts/parallel-exec.mjs review prompt-verify \
  --input <rendered-review-prompt>
```

Preflight must verify the exact leaf clause and one complete
`loopx.review-result.v1` example. The example must show the exact finding
fields `id`, `severity`, `anchor_ids`, and `summary`; an empty `findings`
example is insufficient because it does not teach the worker the accepted
finding contract. Correct or regenerate a failed controller-owned prompt
before dispatch. Never dispatch a worker with a known-invalid prompt.

Review must return both spec compliance and quality approval before
integration. A review transport/runtime failure does not stand in for a
reviewer verdict. A terminal-success report whose machine-readable block does
not parse is also infrastructure failure, not a semantic verdict. Once the
original operation is terminal and its completion/report evidence is retained,
dispatch at most one fresh replacement reviewer against the byte-identical
task candidate, review package, and rendered contract. If the replacement also
fails transport or produces an invalid artifact, block. Never reconstruct or
rewrite a verdict from Markdown, partial JSONL, an empty report, or fields that
the parser rejected.

A valid Critical or Important finding transitions only that task to
`needs_fix`. Reserve a fixer, rebuild the review package from the fixed
candidate, and dispatch a fresh reviewer. Do not globally stop merely because
a valid actionable finding exists; independent ready work and sibling fixers
remain eligible under the same global budget. Integration remains forbidden
until the task receives a clean re-review.

Every handoff contains:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

The controller alone advances task state and creates the scope-checked
ephemeral task commit. A worker never commits or edits another worktree.
