# Branch Worktree And Recording

## Detect Repo Shape

Collect:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
CURRENT_BRANCH=$(git branch --show-current)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
git status --short
```

Interpretation:

- `GIT_DIR == GIT_COMMON` means a normal repo. Present the 2 commit-placement options only.
- `GIT_DIR != GIT_COMMON` with a branch means a named worktree. Present merge, PR, keep, or discard.
- `GIT_DIR != GIT_COMMON` with detached HEAD means no local merge option. Present PR, keep, or discard.

## Commit Merge PR Keep Discard Choice

Use the current repo shape to present the exact finish choice:

- normal repo: commit on current branch, or create a new branch and commit there
- named worktree: merge locally, push and create a Pull Request, keep as-is, or discard
- detached HEAD: push as new branch and create a Pull Request, keep as-is, or discard

Require explicit typed confirmation before discard.

## `finish-record` Fields

`finish-record` must preserve:

- audit id or path
- chosen action
- final status
- summary

The completion summary must also preserve the audit evidence window:

- requirement start commit
- final `HEAD`
- commit list
- changed files
- tracked status summary
- untracked summary

## Stale Audit Head Handling

`finish-audit` provides the evidence window and audit state. Read the latest finish audit state before calling `finish-record`.

If the recorded audit head is stale relative to current `HEAD`, refresh the audit state first. Do not record done against an out-of-date audit window.

## Dirty Tracked Status Handling

- If tracked files are still staged or unstaged, commit the intended tracked work before `finish-record --status done`.
- If the working tree is clean and the completion commit already exists, do not create an empty commit.
- Untracked files remain non-blocking and should be reported, not auto-added.

## Cleanup Rules

- Normal repo choices never remove a worktree.
- Preserve named worktrees for PR and keep choices.
- Only remove a worktree after a successful local merge or an explicit discard confirmation, and only when the worktree is owned by the workflow.
- Run removal from the main repo root, not from inside the worktree being removed.
