---
name: finish
description: "Handles an explicitly requested Git disposition for completed work: commit or branch placement, merge, pull request, keep, cleanup, or discard. Not for ordinary completion, verification, review, or knowledge capture."
when_to_use: "user explicitly requests Git disposition, commit current work, create branch, merge locally, create pull request, keep branch, cleanup worktree, discard work"
metadata:
  version: "0.4.0"
---

# Finish

Use `finish` only when the user explicitly requests Git disposition after the
implementation and its fresh verification are complete. Do not infer this
intent from a completion claim, passing tests, or the end of an execution.

Announce at start: "I'm using the finish skill for the requested Git disposition."

## Preconditions

- Confirm the requested work is implemented and has fresh verification.
- Inspect the current branch, HEAD, worktree shape, and tracked/untracked status.
- Preserve unrelated user changes. Do not stash, stage, commit, move, or delete
  them.
- Do not require a review report, extraction candidate, audit artifact, or other
  workflow state. Finish performs Git disposition only.

## Flow

1. Read [references/branch-worktree-and-recording.md](references/branch-worktree-and-recording.md).
2. Detect whether this is a normal repository, named worktree, or detached
   worktree.
3. If the user already named a valid action, confirm only details that affect
   safety or destination and perform that action. Otherwise present only the
   valid choices for the current repository shape.
4. Re-read Git state after the operation. Do not repeat an externally visible
   action when only later cleanup or reporting failed.
5. Report the chosen action, resulting branch and HEAD, remote or pull-request
   URL when applicable, remaining tracked/untracked status, and any incomplete
   cleanup.

## Valid Dispositions

- normal repository: commit on the current branch, or create a branch and
  commit there;
- named worktree: merge locally, push and create a pull request, keep as-is,
  clean up an already integrated owned worktree, or discard;
- detached worktree: create a branch and pull request, keep as-is, clean up an
  already integrated owned worktree, or discard.

Never invent a review, verification, or knowledge-extraction precondition for
one of these choices.

## STOP Conditions

- Stop when fresh verification is missing or failing.
- Stop when unrelated user changes overlap the requested Git operation.
- Stop before destructive discard, branch deletion, force push, or worktree
  removal without explicit confirmation of the exact target.
- Stop when the requested destination branch or remote is ambiguous and cannot
  be discovered safely.
