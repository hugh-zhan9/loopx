# Concurrent Execution

Use this path only after `execution-selection.md` admits independent mutating
outcomes and the host proves task-worktree binding.

## Isolated Mutation Lifecycle

1. Inspect the invoking Git topology, user-owned changes, baseline commit, and
   target-path content snapshots. Overlapping write or relevant-read paths
   select serial execution before creating owned state.
2. Create one owner-only run manifest under `.loopx/exec/<run-id>/` with the
   invoking identity, exact worktree descriptors, semantic task contracts,
   task and verification state, integration state, and
   `$exec --resume <run-id>` instruction.
3. Create one owned task worktree per outcome and one protected integration
   workspace from the same baseline.
4. Dispatch at most the admitted worker limit. Every prompt must state:
   `You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`
5. Require fresh worker verification, then compare actual changed paths with
   the declared write scope before creating the ephemeral task commit.
6. Apply verified task commits to the integration workspace in dependency and
   stable input order. Run relevant combined verification there.
7. Recheck the invoking identity and target snapshots. Apply the one verified
   integration patch to the working tree without moving the branch or changing
   the user's index, then run the same relevant verification again.
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
- A blocked or interrupted run keeps the single manifest and exact owned
  worker results. Resume validates repository, baseline, target, branch, path,
  and commit identities before applying or cleaning anything. It retries only
  unfinished tasks from the current execution graph, rebuilds interrupted
  integration from verified task commits, and recognizes an already-applied
  result before rerunning verification and cleanup.
- Identity or baseline mismatch never deletes retained worker results.
- Unrelated tracked or untracked user changes are never stashed, committed,
  unstaged, overwritten, or included in the integration result.

Successful application and verification remove the manifest, owned worktrees,
and owned branches. Nothing cleans an owned result whose persisted identity no
longer matches the actual resource.
