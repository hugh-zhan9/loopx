# Branch, Worktree, And Git Disposition

## Inspect Repository Shape

Collect current evidence without mutating the repository:

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
git rev-parse --show-toplevel
git branch --show-current
git rev-parse --short HEAD
git status --short
```

- Equal resolved Git and common directories indicate a normal repository.
- Different directories with a branch indicate a named worktree.
- Different directories without a branch indicate a detached worktree.

Match the user's language. If no action was named, present only the choices
valid for the detected shape:

- normal repository: commit on the current branch, or create a new branch and
  commit there;
- named worktree: merge locally, push and create a pull request, keep as-is,
  clean up an already integrated owned worktree, or discard;
- detached worktree: create a branch and pull request, keep as-is, clean up an
  already integrated owned worktree, or discard.

## Operation Rules

- Stage and commit only paths belonging to the accepted change. Do not make an
  empty commit when the intended commit already exists.
- Before a local merge, discover the destination branch and check that its
  worktree is clean. Never assume `main`.
- Before a pull request, confirm the source branch, remote, base branch, and
  authentication. Return the created URL.
- `keep` performs no cleanup or deletion.
- `cleanup` is valid only for an already integrated worktree owned by this
  workflow. Remove it from the main repository, not from inside that worktree.
- `discard` requires explicit typed confirmation of the exact branch/worktree
  target and a final check for uncommitted or unpushed work.
- Untracked files are never auto-added or deleted. Report them unless the user
  explicitly included an exact path in cleanup or discard.

## Partial Failure Reconciliation

Treat completion as `prepare -> perform -> record -> reconcile`; within the
perform step, use `inspect -> perform -> verify -> optional cleanup`.
If the Git or remote action succeeded but reporting or cleanup failed, inspect
the resulting branch, HEAD, worktrees, and remote state before retrying. Do not
repeat a commit, merge, push, pull-request creation, deletion, or discard based
only on missing local bookkeeping.
