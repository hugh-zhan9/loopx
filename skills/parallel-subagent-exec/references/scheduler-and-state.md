# Scheduler And State

Persist owner-only state using `loopx.parallel-exec-state.v1` and CAS revision
updates. Initialize only after manifest, Git, capability, and root startup
checks pass. Reserve a stage and its worker record in one transition before
dispatch. A failed dispatch releases or blocks that exact reservation.
After creation, persist the runtime agent/session id, requested and observed
model evidence, controlled worktree, report path, start time, and running
status with `set_worker_runtime` before treating the reservation as active.
Cursor App uses `runtime: cursor-app`, the Task agent id, and an immutable native
operation path/digest; it does not invent process, supervisor, token, or
heartbeat fields. Cursor Agent CLI uses `runtime: cursor` and additionally
requires process/supervisor ids, supervisor token, and heartbeat path. Attach
once; a repeat must be byte-for-byte the same identity.

For Cursor App, persist `runtime_adapter`, `isolation_mode`, capability artifact
path/SHA-256, skill source SHA-256, and canonical workspace root in run config.
Resume compares every field. Native parallel reservations form an active batch;
none may advance to review or integration until every peer is terminal and the
batch scope checks pass.

Ready order is deterministic: reconciliation/fix, review, implementation;
then DAG level, plan path, task anchor, and role. Dependencies require
integrated predecessors. `parallel_safe: false` is plan-exclusive;
`can_run_in_parallel: false` is package-exclusive. The global budget includes
all implementer, reviewer, fixer, reconciliation, plan-review, and final-review
workers. Capacity zero transitions eligible work to `capacity_wait`.

Resume compares all persisted input, repo, startup, adapter, worker, and
worktree identities. Cursor App resumes through the same Task agent id and
native result evidence; CLI resumes through the same durable operation and
supervisor evidence. Mismatch exits `3`; it never repairs identity by guessing.
