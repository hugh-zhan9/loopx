---
name: using-git-worktrees
description: "Prepare an isolated worktree when requested or needed for implementation (隔离工作区). Reuse existing host isolation and preserve all user changes."
when_to_use: "using-git-worktrees, isolated workspace, git worktree, worktree setup, feature branch isolation, implementation workspace, 隔离工作区"
metadata:
  version: "0.1.7"
---

# Using Git Worktrees

Prepare an isolated workspace when implementation needs isolation or the user
requests it. This support skill can precede `exec` or host-native work; it does
not execute the task or authorize commits. Read-only work needs no new worktree.

## Detect and reuse isolation

Honor session instructions and an existing host-managed workspace first. For a
Git checkout, compare the resolved Git and common directories:

```bash
loopx_git_dir=$(cd "$(git rev-parse --git-dir)" && pwd -P) || exit 1
loopx_git_common=$(cd "$(git rev-parse --git-common-dir)" && pwd -P) || exit 1
if [ "$loopx_git_dir" != "$loopx_git_common" ]; then
  printf 'linked worktree\n'
else
  printf 'main checkout\n'
fi
git branch --show-current
```

Different directories identify a linked worktree, including a linked submodule
worktree. Submodule membership alone does not determine isolation. Reuse an
existing isolated checkout and report detached HEAD accurately; do not create a
branch merely to describe it as ready.

## Create when needed

Use a host-native isolation mechanism when available, following its actual
lifecycle and cleanup contract. Otherwise use Git. Existing authorization carries
forward; routine reversible setup does not require another confirmation.

Choose a location in this order: explicit instructions, existing `.worktrees/`,
existing `worktrees/`, then `.worktrees/` at the repository root. Choose a specific
lowercase task slug for the branch when none was given. Inspect existing branches
and paths; do not force-replace a collision or discard work.

For the following examples, start at the repository root and set `LOCATION` to
the chosen directory and `BRANCH_NAME` to the new branch name. For a project-local
location, verify **that exact directory** is ignored before creation:

```bash
git check-ignore -q -- "$LOCATION/" || {
  printf 'Chosen worktree directory is not ignored: %s\n' "$LOCATION" >&2
  exit 1
}
```

If it is not ignored, add a narrowly scoped local exclude rule in
`git rev-parse --git-path info/exclude` when permitted by repository instructions,
then rerun the check. Use `.gitignore` when shared ignore configuration is part of
the task. No setup step authorizes a commit. External worktree directories do not
need the project-local ignore check.

```bash
loopx_worktree_path="$LOCATION/$BRANCH_NAME"
git worktree add "$loopx_worktree_path" -b "$BRANCH_NAME" || exit 1
cd "$loopx_worktree_path" || exit 1
```

Use ordinary task variables, not shell or Git control variables such as `path`
or `GIT_DIR`. Keep paths quoted so setup also works in zsh and paths with spaces.
If isolation is required but creation is blocked, report the actual blocker;
do not silently switch to editing the protected checkout.

## Setup and baseline

Run the repository-documented setup needed for the target. Inspect
postinstall hooks and effects on user-level state or external services before running setup;
ask only for consequential actions outside existing authorization. Do not infer
and execute generic install commands from a package-file name alone.

Run the required baseline checks before implementation. Investigate failures
within the authorized scope and distinguish pre-existing failures from later
regressions. Ask only when an unresolved scope or behavior decision prevents
progress; a failing baseline alone is not a reason to repeatedly request consent.

Report the actual path, branch or detached state, and baseline result with any
blocked checks. Leave cleanup to the host's contract or the user's Git request;
never remove a worktree containing unaccounted-for changes.
