---
name: using-git-worktrees
description: "Sets up or verifies an isolated workspace for implementation work using native worktree support first and git worktree fallback only when needed. Not for ordinary read-only tasks, existing isolated worktrees, issue-ledger fix parallel worktrees, finish branch placement, or committing workflow changes."
when_to_use: "using-git-worktrees, isolated workspace, git worktree, worktree setup, feature branch isolation, implementation workspace, 隔离工作区"
metadata:
  version: "0.1.0"
---

# Using Git Worktrees

Use this support skill before implementation work when the current checkout should be protected from edits, or when the user explicitly asks for an isolated workspace. This skill prepares the workspace only; it does not clarify requirements, write specs, plan implementation, execute code changes, review work, or finish branches.

## loopx Boundary

`using-git-worktrees` is a support lens, not a workflow state. Use it before `exec` or manual implementation when isolation is needed. Do not use it to replace `plan-to-exec`, `subagent-exec`, `exec`, `fix`, or `finish`.

Do not use this skill for:

- read-only investigation, docs review, or code review
- a workspace that is already an externally managed isolated worktree
- `fix` parallel subagent worktrees; `fix` owns those per-ledger temporary worktrees
- choosing where completed work should be committed; `finish` owns branch placement
- creating commits for `.gitignore` or setup changes unless the user explicitly asked for that repository change

## Core Rule

Detect existing isolation first. Then use native tools. Then fall back to git. Never fight the harness.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Step 0: Detect Existing Isolation

Before creating anything, check if you are already in an isolated workspace.

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**Submodule guard:** `GIT_DIR != GIT_COMMON` is also true inside git submodules. Before concluding "already in a worktree," verify you are not in a submodule:

```bash
# If this returns a path, you're in a submodule, not a worktree — treat as normal repo
git rev-parse --show-superproject-working-tree 2>/dev/null
```

If `GIT_DIR != GIT_COMMON` and the repo is not a submodule, you are already in a linked worktree. Skip to Step 2. Do not create another worktree.

Report with branch state:

- On a branch: "Already in isolated workspace at `<path>` on branch `<name>`."
- Detached HEAD: "Already in isolated workspace at `<path>` (detached HEAD, externally managed). Branch creation needed at finish time."

If `GIT_DIR == GIT_COMMON` or the repo is a submodule, you are in a normal repo checkout.

If the user has already instructed you to use or avoid worktrees, honor that instruction. Otherwise ask for consent before creating a worktree:

> "Would you like me to set up an isolated worktree? It protects your current branch from changes."

If the user declines, work in place and skip to Step 2.

## Step 1: Create Isolated Workspace

Try mechanisms in this order.

### 1a. Native Worktree Tools (preferred)

If the environment provides a native isolation mechanism, use it and skip to Step 2. Examples include a tool named like `EnterWorktree`, `WorktreeCreate`, a `/worktree` command, or a first-party `--worktree` flag.

Native tools handle directory placement, branch creation, and cleanup automatically. Using `git worktree add` when you have a native tool creates phantom state your harness can't see or manage.

Only proceed to Step 1b if you have no native worktree tool available.

### 1b. Git Worktree Fallback

**Only use this if Step 1a does not apply** — you have no native worktree tool available. Create a worktree manually using git.

#### Directory Selection

Follow this priority order. Explicit user preference always wins.

1. Check user or repo instructions for a declared worktree directory preference.
2. Check for an existing project-local worktree directory:

   ```bash
   ls -d .worktrees 2>/dev/null     # Preferred (hidden)
   ls -d worktrees 2>/dev/null      # Alternative
   ```

   If both exist, `.worktrees` wins.

3. If there is no other guidance, default to `.worktrees/` at the project root.

#### Safety Verification (project-local directories only)

Verify the project-local worktree directory is ignored before creating a worktree:

```bash
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

If the chosen directory is not ignored, stop and ask whether to add it to `.gitignore`. Do not commit the `.gitignore` change inside this skill unless the user explicitly asks you to commit.

This check prevents accidentally committing nested worktree contents to the repository.

#### Create the Worktree

```bash
# Determine path based on chosen location
path="$LOCATION/$BRANCH_NAME"

git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

Choose `BRANCH_NAME` from the task slug when no branch name was provided. Keep it lowercase, hyphenated, and specific.

If `git worktree add` fails with a permission error or environment denial, tell the user the environment blocked worktree creation and ask whether to continue in the current directory.

## Step 2: Project Setup

Run the minimum project setup needed for the target repository. Prefer commands documented by the repo over generic defaults.

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

Do not install dependencies when the repository already has documented no-install or frozen-dependency instructions.

## Step 3: Verify Clean Baseline

Run the project's baseline verification before implementation:

```bash
npm test / cargo test / pytest / go test ./...
```

If tests fail, report failures and ask whether to proceed or investigate. Do not present the workspace as clean.

If tests pass, report ready.

## Report Contract

```text
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| Already in linked worktree | Skip creation (Step 0) |
| In a submodule | Treat as normal repo (Step 0 guard) |
| Native worktree tool available | Use it (Step 1a) |
| No native tool | Git worktree fallback (Step 1b) |
| `.worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| Both exist | Use `.worktrees/` |
| Neither exists | Check instruction file, then default `.worktrees/` |
| Directory not ignored | Ask before editing `.gitignore` |
| Permission error on create | Ask whether to continue in place |
| Tests fail during baseline | Report failures + ask |
| No package.json/Cargo.toml | Skip dependency install |

## Common Mistakes

### Fighting the harness

- **Problem:** Using `git worktree add` when the platform already provides isolation
- **Fix:** Step 0 detects existing isolation. Step 1a defers to native tools.

### Skipping detection

- **Problem:** Creating a nested worktree inside an existing one
- **Fix:** Always run Step 0 before creating anything

### Skipping ignore verification

- **Problem:** Worktree contents get tracked, pollute git status
- **Fix:** Always use `git check-ignore` before creating a project-local worktree

### Assuming directory location

- **Problem:** Creates inconsistency, violates project conventions
- **Fix:** Follow priority: explicit instructions > existing project-local directory > default

### Proceeding with failing tests

- **Problem:** Can't distinguish new bugs from pre-existing issues
- **Fix:** Report failures, get explicit permission to proceed

## Red Flags

**Never:**
- Create a worktree when Step 0 detects existing isolation
- Use `git worktree add` when you have a native worktree tool (e.g., `EnterWorktree`). This is the #1 mistake — if you have it, use it.
- Skip Step 1a by jumping straight to Step 1b's git commands
- Create worktree without verifying it's ignored (project-local)
- Commit `.gitignore`, branch setup, or workspace scaffolding unless the user explicitly asks
- Skip baseline test verification
- Proceed with failing tests without asking

**Always:**
- Run Step 0 detection first
- Prefer native tools over git fallback
- Follow directory priority: explicit instructions > existing project-local directory > default
- Verify directory is ignored for project-local
- Auto-detect and run project setup
- Verify clean test baseline
