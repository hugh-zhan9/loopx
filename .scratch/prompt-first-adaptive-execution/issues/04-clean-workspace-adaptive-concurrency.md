# 04 — Run adaptive concurrency in a clean workspace

**What to build:** Let the adaptive executor identify independent outcomes, dispatch bounded leaf workers into isolated task worktrees, integrate their results in a protected workspace, verify the combination, and apply one complete result back to an unchanged clean workspace.

**Blocked by:** 01 — Establish the exec-owned Git isolation seam; 03 — Deliver lean plans and one serial exec entry.

**Status:** ready-for-agent

- [ ] Concurrency is admitted only when dependencies, write surfaces, decisions, verification, baseline inputs, and integration outcomes are independent.
- [ ] Same-file changes, producer-consumer API work, shared generated outputs, and continuous debugging remain serial with a concrete reason.
- [ ] The top-level executor owns all agent lifecycle, workers remain leaves, and the shared default worker budget is four.
- [ ] Concurrent writers operate only in owned task worktrees and never write the invoking workspace directly.
- [ ] Actual changed paths are checked before integration, and the combined result receives relevant verification before and after application.
- [ ] Successful execution removes all owned worktrees and temporary run state while leaving only the intended uncommitted product change.
