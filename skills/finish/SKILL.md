---
name: finish
description: "Handles Git disposition only when the user explicitly invokes `$finish` or requests disposition for work completed by the active loopx `exec` or `fix` run. Not for standalone Git requests such as creating, switching, renaming, listing, committing, merging, pushing, opening a pull request, or managing worktrees outside that active loopx context."
when_to_use: "explicit $finish invocation, active loopx exec or fix completion requests Git disposition"
metadata:
  version: "0.4.1"
---

# Finish

Use `finish` only when the user explicitly invokes `$finish`, or when the active
loopx `exec` or `fix` run has completed implementation and fresh verification
and the user requests disposition of that run's Git result.

A standalone Git request must not trigger `finish`. Handle branch creation or
switching, commits, merges, pushes, pull requests, and worktree operations as
ordinary Git work when they are outside an active loopx completion context. Do
not infer loopx ownership from a `.loopx` directory, historical workflow state,
the current branch name, worktree shape, changed files, or Git vocabulary.

Announce at start: "I'm using the finish skill for the requested Git disposition."

## Preconditions

- Establish one valid trigger: explicit `$finish`, or Git disposition for the
  completed active loopx `exec` or `fix` run.
- Confirm the requested work is implemented and has fresh verification.
- Inspect the current branch, HEAD, worktree shape, and tracked/untracked status.
- Preserve unrelated user changes. Do not stash, stage, commit, move, or delete
  them.
- Do not require a review report, extraction candidate, audit artifact, or
  additional persisted state after the active loopx context is established.
  Finish performs Git disposition only.

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

- Exit this skill and handle the request as ordinary Git work when neither
  valid trigger is present.
- Stop when fresh verification is missing or failing.
- Stop when unrelated user changes overlap the requested Git operation.
- Stop before destructive discard, branch deletion, force push, or worktree
  removal without explicit confirmation of the exact target.
- Stop when the requested destination branch or remote is ambiguous and cannot
  be discovered safely.
