# Concurrent Execution

Use this path only after `execution-selection.md` admits independent mutating
outcomes and the host proves task-worktree binding.

## Clean Workspace Lifecycle

1. Inspect the invoking Git topology and record its clean baseline commit.
2. Create one temporary run manifest under `.loopx/exec/<run-id>/`.
3. Create one owned task worktree per outcome and one protected integration
   workspace from the same baseline.
4. Dispatch at most the admitted worker limit. Every prompt must state:
   `You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`
5. Require fresh worker verification, then compare actual changed paths with
   the declared write scope before creating the ephemeral task commit.
6. Apply verified task commits to the integration workspace in dependency and
   stable input order. Run relevant combined verification there.
7. Apply the one verified integration result to the unchanged invoking
   workspace without moving its branch or creating a formal commit. Unstage the
   result and run the same relevant verification again.
8. Remove every owned worktree, branch, and run-manifest directory. The only
   remaining repository change is the intended unstaged product diff.

The top-level `exec` controller owns this lifecycle and calls the primitives in
`scripts/adaptive-exec.mjs`. Workers receive only their outcome, owned
workspace, write scope, and verification obligation.

## Safety Gates

- A worker result without passing verification is not integrable.
- An actual changed path outside declared scope blocks integration.
- An integration verification failure blocks application.
- An application verification failure cannot be reported as success.
- A changed invoking baseline or target surface blocks automatic application.

Dirty-workspace preservation and interruption recovery extend this lifecycle
only when their dedicated contract is active; do not improvise stash, commit,
or overwrite behavior.
