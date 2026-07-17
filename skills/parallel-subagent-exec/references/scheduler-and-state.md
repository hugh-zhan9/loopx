# Scheduler And State

Persist owner-only state using `loopx.parallel-exec-state.v2` and CAS revision
updates. Initialize only after manifest, Git, capability, and root startup
checks pass. Reserve a stage and its worker record in one transition before
dispatch. A failed dispatch releases or blocks that exact reservation.
Do not normalize or silently resume legacy `loopx.parallel-exec-state.v1`;
it lacks completed-worker capability and report bindings. Preserve it and stop
with the state-schema error.
After creation, persist the runtime agent/session id, requested and observed
model evidence, controlled worktree, report path, start time, and running
status with `set_worker_runtime` before treating the reservation as active.
Cursor App uses `runtime: cursor-app`, the Task agent id, and an immutable native
operation path/digest; it does not invent process, supervisor, token, or
heartbeat fields. Codex Agent CLI uses `runtime: codex` and persists role,
immutable operation path/digest, capability path/hash, expected
executable/version, skill/config fingerprints, prompt hash, protected
worktrees, same-batch concurrent worktrees, thread/process identity, and
report/events/completion paths. Cursor
Agent CLI uses `runtime: cursor` and additionally
requires process/supervisor ids, supervisor token, and heartbeat path. Attach
once; a repeat must be byte-for-byte the same identity.

For Cursor App and both CLI adapters, persist `runtime_adapter`,
`isolation_mode`, capability artifact path/SHA-256, skill source SHA-256, and
canonical workspace root in run config. Resume compares every field. Cursor App
native parallel reservations form an active batch; none may advance to review
or integration until every peer is terminal and the batch scope checks pass.

Codex CLI run config additionally persists expected agent path, expected CLI
version, and Codex config fingerprint. Before releasing a terminal Codex CLI
worker, retain its terminal status, completion path, report SHA-256, report byte
size, and end time in `completed_workers` as `report_sha256`, `report_size`, and
the matching lifecycle fields. A report path without matching digest and size
is not completion evidence.

Ready order is deterministic: reconciliation/fix, review, implementation;
then DAG level, plan path, task anchor, and role. Dependencies require
integrated predecessors. `parallel_safe: false` is plan-exclusive;
`can_run_in_parallel: false` is package-exclusive. The global budget includes
all implementer, reviewer, fixer, reconciliation, plan-review, and final-review
workers. Capacity zero transitions eligible work to `capacity_wait`.

A review worker transport/runtime failure is infrastructure failure, not a
semantic review verdict. After the original operation is proven terminal and
released with immutable completion evidence, permit at most one replacement
task or plan reviewer against the same candidate tree and review package.
Return `reviewing -> awaiting_review` or `plan_reviewing -> running`, increment
the matching review-attempt counter, and create a fresh reservation and
operation. A second infrastructure failure blocks the node.

A terminal-success task-review operation with a parser-rejected
machine-readable artifact follows the same bounded replacement policy. Retain
the exact report digest, size, completion path, and parser error; return
`reviewing -> awaiting_review`, increment the task review-attempt counter, and
dispatch one fresh reviewer against byte-identical candidate and package
inputs. Do not reinterpret the Markdown as a verdict. The infrastructure and
invalid-artifact paths share the one-replacement budget for that review
snapshot; a further failure blocks the task.

For a retained older run already marked `blocked`, use only the matching
controller-owned recovery operation:

- `retry_failed_review` requires a matching completed `task_review` worker
  with failed/interrupted terminal evidence and the task error's exact
  completion path.
- `retry_invalid_review` requires a matching completed `task_review` worker
  with terminal-success evidence, the exact retained report/completion paths,
  and `parallel_review_artifact_invalid` as the task error.

Both operations require the run and task to be blocked, no active worker for
the task, and remaining review-attempt budget. They atomically return the task
to `awaiting_review`, the run to `running`, and, in package mode, the owning
blocked child to `running`. They preserve sibling task states such as
`needs_fix`, so the scheduler may reserve the replacement reviewer and an
independent sibling fixer in the same bounded batch. Ordinary
`set_task_status` never unlocks `blocked`.

Resume compares all persisted input, repo, startup, adapter, worker, and
worktree identities. Cursor App resumes through the same Task agent id and
native result evidence; CLI resumes through the same durable operation and
supervisor evidence. Mismatch exits `3`; it never repairs identity by guessing.
