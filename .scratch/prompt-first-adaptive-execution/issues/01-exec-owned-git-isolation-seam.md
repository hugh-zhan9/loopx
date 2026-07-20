# 01 — Establish the exec-owned Git isolation seam

**What to build:** Add an exec-owned boundary around the proven worktree creation, integration, rollback, and cleanup behavior while keeping the existing execution experience unchanged. This is the expand step that makes later adaptive concurrency changes small enough to implement and verify safely.

**Blocked by:** None — can start immediately.

**Status:** complete

- [x] Existing parallel execution behavior and Git safety tests remain green while callers can use the new exec-owned boundary.
- [x] The boundary owns task worktrees, integration snapshots, conflict restoration, and cleanup without taking ownership of user changes.
- [x] No routing, planning, review, finish, or user-facing execution behavior changes in this ticket.
- [x] The old implementation remains available until the later contract ticket removes it.
