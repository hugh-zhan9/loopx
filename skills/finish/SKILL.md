---
name: finish
description: "Finishes completed loopx development work after tests pass by presenting merge, PR, keep, or discard options. Not for unfinished work or failing verification."
when_to_use: "implementation complete, tests pass, finish branch, create pull request, merge locally, keep branch, discard work"
metadata:
  version: "0.2.4"
---

# Finish

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → extract memory/spec learnings → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finish skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Detect Environment

**Determine workspace state before presenting options:**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

This determines which menu to show and how cleanup works:

| State | Menu | Cleanup |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo) | Standard 4 options | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Standard 4 options | Provenance-based (see Step 6) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | Reduced 3 options (no merge) | No cleanup (externally managed) |

### Step 3: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 4: Audit-First Learning Extraction

Run `finish-audit` before presenting merge, PR, keep, or discard options.

`loopx:exec` and `loopx:subagent-exec` should have run `finish-start` before implementation. `finish-audit` uses that baseline to preserve committed `baseline..HEAD` evidence after the working tree is clean. It may also generate `audit.extraction_candidates` as draft memory/spec review prompts. These drafts are not automatically written to memory or specs.

Allowed inputs:
- `finish-state.json` `audit.change_window`, especially `baseline..HEAD` commits and changed files
- `finish-state.json` `audit.extraction_candidates`
- current uncommitted git diff and `git status --short`
- executed verification output
- plan, spec, and review artifacts used in this task
- explicit user decisions in the current conversation
- existing `.loopx/memory/MEMORY.md` and `.loopx/memory/index.jsonl`
- existing `docs/loopx/memory/*.md`
- existing `docs/loopx/specs/*.md`

An empty git diff does not mean there is no learning candidate. When `audit.change_window.commit_count > 0`, inspect the committed range before deciding memory/spec candidates. "Already committed" is not a rejection reason; reject only when the committed change window contains no durable behavior, contract, invariant, pitfall, or user decision worth preserving.

Read the audit state from `.loopx/finish/<audit-id>/finish-state.json` before deciding what to record.
After learning extraction, update `finish-state.json` before any `done` record:
- set `status` to `"audited"`
- for every `audit.extraction_candidates[]` item, add either a matching `accepted_candidates` with evidence or a matching `rejected_candidates[]` item with `rejection_reason`
- when no extraction candidates exist and no candidate is accepted, replace `no_candidates_reason` with a specific reason

`finish-record --status done` will reject an audit while generated extraction candidates remain unreviewed.

Learning extraction priority:
1. Durable behavior, contracts, or constraints proven by the implementation
2. State, file, CLI, API, install, migration, compatibility, or test invariants
3. Explicit user decisions that constrain future work
4. Review findings or fixes that reveal a reusable pitfall, pattern, or boundary
5. Documentation changes when they define, correct, or preserve one of the above

Do not infer durable rules from agent intuition alone. Do not promote unverified implementation details.

When the audit has no candidates, record `none` with the scanned inputs and a reason in `no_candidates_reason`.
Keep rejected candidates explicit when draft candidates are not accepted.
Accepted candidates require evidence from the audit state. Rejected candidates require reasons.
choice recording must persist the user's completion choice through `finish-record` before presenting the final completion outcome.

#### Memory

Memory has two scopes:

- local memory: agent-queryable project context for one machine; not repo-tracked
- shared memory: lightweight project knowledge that should follow a user across machines; repo-tracked

Use local memory for machine-local facts, short-lived handoffs, and context that is useful only to the current agent environment:

```text
.loopx/memory/MEMORY.md
.loopx/memory/index.jsonl
.loopx/memory/entries/
.loopx/memory/archive/
```

`MEMORY.md` is the bounded curated summary an agent should read first. Keep it dense and useful.

`index.jsonl` is a curated active index, not an append-only history. It should point only to active memory cards worth querying.

Use shared memory for concise, evidence-backed notes that are useful across machines but not stable enough for specs:

```text
docs/loopx/memory/
```

Use memory only for facts that will help a future agent avoid rework, avoid mistakes, or preserve a decision. Do not record process negatives such as "no spec promotion". Do not store secrets, raw conversation logs, or machine-local paths in shared memory.

One finish run may write 0-3 active memory cards. If more learnings appear, consolidate, promote to spec, archive stale cards, or skip low-signal items.

Memory entry index rows should use this shape:

```json
{"id":"2026-06-02-example","type":"decision","domain":"workflow","tags":["finish"],"summary":"finish writes local memory and repo-tracked spec candidates","path":"entries/2026-06-02-example.md","created_at":"2026-06-02T00:00:00Z"}
```

Allowed memory `type` values:
- `decision`
- `constraint`
- `pattern`
- `pitfall`
- `handoff`

Finish may automatically update `.loopx/memory/MEMORY.md`, `.loopx/memory/index.jsonl`, and active memory cards. The final response must list the memory changes.

When accepting an `audit.extraction_candidates[]` item with `kind: "memory"` and `scope: "shared"`, write the accepted note under `docs/loopx/memory/` so it is visible in the git diff. Promote shared memory to `docs/loopx/specs/` when it becomes a durable rule that planning or review should depend on.

#### Spec Candidates

Spec extraction is conditional. Run the audit every time, but write spec candidates only when the task produced stable, shared, reusable project rules.

Write repo-tracked candidates directly to:

```text
docs/loopx/specs/<domain>.md
```

If the domain is unclear, use:

```text
docs/loopx/specs/inbox.md
```

Recommended domains:
- `workflow`
- `skills`
- `installation`
- `memory`
- `testing`
- `inbox`

Spec candidates must be visible in the repo diff and reported in the final response. Do not silently change team specs.

### Step 5: Present Options

**Normal repo and named-branch worktree — present exactly these 4 options:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Detached HEAD — present exactly these 3 options:**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)
3. Discard this work

Which option?
```

**Don't add explanation** - keep options concise.

### Step 6: Execute Choice

#### Option 1: Merge Locally

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>

# Only after merge succeeds: cleanup worktree (Step 7), then delete branch
```

Then: Cleanup worktree (Step 7), then delete branch:

```bash
git branch -d <feature-branch>
```

#### Option 2: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

**Do NOT clean up worktree** — user needs it alive to iterate on PR feedback.

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:
```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

Then: Cleanup worktree (Step 7), then force-delete branch:
```bash
git branch -D <feature-branch>
```

### Step 7: Cleanup Workspace

**Only runs for Options 1 and 4.** Options 2 and 3 always preserve the worktree.

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**If `GIT_DIR == GIT_COMMON`:** Normal repo, no worktree to clean up. Done.

**If worktree path is under `.worktrees/`, `worktrees/`, or `~/.config/loopx/worktrees/`:** loopx created this worktree — we own cleanup.

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**Otherwise:** The host environment (harness) owns this workspace. Do NOT remove it. If your platform provides a workspace-exit tool, use it. Otherwise, leave the workspace in place.

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | yes | - | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| 4. Discard | - | - | - | yes (force) |

## Final Response Contract

Every finish response must include the verification result, chosen completion action, memory changes, and Spec candidates.

Use this shape:

```text
Memory:
- updated: .loopx/memory/MEMORY.md
- shared: docs/loopx/memory/<file>.md
- entries: <N> added, <N> archived
- summary:
  - <high-signal memory change>

Spec candidates:
- docs/loopx/specs/<domain>.md: <candidate change>
```

If there are no memory changes or spec candidates, report `none`. Do not write `none` into memory.

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" is ambiguous
- **Fix:** Present exactly 4 structured options (or 3 for detached HEAD)

**Cleaning up worktree for Option 2**
- **Problem:** Remove worktree user needs for PR iteration
- **Fix:** Only cleanup for Options 1 and 4

**Deleting branch before removing worktree**
- **Problem:** `git branch -d` fails because worktree still references the branch
- **Fix:** Merge first, remove worktree, then delete branch

**Running git worktree remove from inside the worktree**
- **Problem:** Command fails silently when CWD is inside the worktree being removed
- **Fix:** Always `cd` to main repo root before `git worktree remove`

**Cleaning up harness-owned worktrees**
- **Problem:** Removing a worktree the harness created causes phantom state
- **Fix:** Only clean up worktrees under `.worktrees/`, `worktrees/`, or `~/.config/loopx/worktrees/`

**No confirmation for discard**
- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request
- Remove a worktree before confirming merge success
- Clean up worktrees you didn't create (provenance check)
- Run `git worktree remove` from inside the worktree

**Always:**
- Verify tests before offering options
- Detect environment before presenting menu
- Present exactly 4 options (or 3 for detached HEAD)
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only
- `cd` to main repo root before worktree removal
- Run `git worktree prune` after removal
