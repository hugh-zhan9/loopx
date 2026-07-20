# 05 — Preserve dirty workspaces and resume safely

**What to build:** Extend adaptive concurrency so unrelated user changes survive untouched, stale target paths block automatic application, interruptions retain only the state needed for safe recovery, and hosts without reliable write isolation continue serially.

**Blocked by:** 04 — Run adaptive concurrency in a clean workspace.

**Status:** ready-for-agent

- [ ] Unrelated tracked and untracked user changes remain byte-for-byte intact through concurrent execution.
- [ ] Overlapping or semantically relevant user changes select current-context serial execution instead of worktree concurrency.
- [ ] A target path changed after the execution baseline prevents automatic application and preserves the verified integration result.
- [ ] loopx never stashes, formally commits, or overwrites pre-existing user work.
- [ ] Interrupted concurrent writes retain one compact run manifest with ownership, task status, verification, integration state, and an exact resume instruction.
- [ ] Successful recovery cleans owned state; identity or baseline mismatch stops automatic integration without deleting worker results.
- [ ] Missing host capacity or reliable worktree binding safely narrows execution to read-only concurrency or serial work.
