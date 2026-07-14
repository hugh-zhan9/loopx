# Scheduler And State

Persist owner-only state using `loopx.parallel-exec-state.v1` and CAS revision
updates. Initialize only after manifest, Git, capability, and root startup
checks pass. Reserve a stage and its worker record in one transition before
dispatch. A failed dispatch releases or blocks that exact reservation.

Ready order is deterministic: reconciliation/fix, review, implementation;
then DAG level, plan path, task anchor, and role. Dependencies require
integrated predecessors. `parallel_safe: false` is plan-exclusive;
`can_run_in_parallel: false` is package-exclusive. The global budget includes
all implementer, reviewer, fixer, reconciliation, plan-review, and final-review
workers. Capacity zero transitions eligible work to `capacity_wait`.

Resume compares all persisted input, repo, startup, worker, and worktree
identities. Mismatch exits `3`; it never repairs identity by guessing.
