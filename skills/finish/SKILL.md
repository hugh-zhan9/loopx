---
name: finish
description: "Finishes completed loopx development work after tests pass by choosing normal-repo commit placement or worktree merge/PR/keep/discard handling. Not for unfinished work or failing verification."
when_to_use: "implementation complete, tests pass, finish branch, commit current branch, create new branch, create pull request, merge locally, keep branch, discard work"
metadata:
  version: "0.3.10"
---

# Finish

Guide completion of development work after implementation and verification are already complete.

Announce at start: "I'm using the finish skill to complete this work."

## Fast Path

1. Confirm implementation and verification are complete.
2. Read the canonical final-review report.
3. Check the multi-plan finish gate when the source is a package path.
4. Run `finish-audit`.
5. Review memory and spec extraction candidates.
6. Present the commit, merge, PR, keep, or discard choice that matches the current repo/worktree state.
7. Run `finish-record`.
8. Report final evidence.

## Preconditions

- Finish is only for work that is already implemented and verified.
- Do not start `finish` while tests are failing or required verification is missing.
- Keep `execution-start` and `finish-start` as separate required startup commands for execution skills.
- Read `.loopx/execution-ranges/<slug>.json` and the current finish audit state before making completion decisions.
- Match the user's language for menus and completion summaries.
- Use the current repo state. Do not rewrite prior workflow artifacts to preserve older contracts.

## Required Gates

### Final Review

- Look up the canonical final-review report from `.loopx/execution-ranges/<slug>.json` or the shared design/source identity.
- The canonical final-review report path is `.loopx/final-review/<design-date>-<design-slug>.md`.
- Read the report path, `Ready for finish?`, and blocking issues.
- Preserve accepted and rejected `final-review` gates exactly as reported.
- `finish` must not bypass the review outcome.
- `finish` must not generate the canonical final-review report. Route to `final-review` or `fix-review` when the report is missing or not ready.

### Multi-Plan Finish Gate

When the source is a multi-plan package path, read `.loopx/multi-plan/<feature-slug>/state.json` and require the current schema v2 gate:

- `schema_version: 2`
- non-empty `plans[]`
- every child `status: "complete"`
- every child `plan_review.status: "passed"`
- every child non-empty `plan_review.reviewed_at`
- every child non-empty `plan_review.summary`
- every child `ready_for_spec_review: true`
- `spec_final_review.path` present
- `spec_final_review.ready_for_finish: "Yes"`

Do not require or preserve child `start_commit`, `current_head`, or `end_commit` fields. Child plan-level final-review updates multi-plan state only; the package receives the single canonical report.

### Audit And Cleanliness

- Run `finish-audit` before presenting completion options.
- Review every generated extraction candidate before recording `done`.
- `finish-record` must not mark the run done while generated candidates remain unreviewed.
- `tracked changes` from staged or unstaged files block `finish-record --status done` until they are committed into final `HEAD`.
- Untracked files count as clean and remain reporting-only. `Untracked files count as clean`.

## Completion Flow

1. Verify the implementation and verification evidence are complete enough to finish.
2. Read the canonical final-review report and stop if it is missing, blocked, or explicitly not ready.
3. If the source is a multi-plan package path, enforce the `.loopx/multi-plan/<feature-slug>/state.json` gate before any done outcome.
4. Run `finish-audit`, then read the current finish audit state.
5. Review accepted, rejected, or none outcomes for memory candidates and `Spec Delta Candidates` before any final recording.
6. Detect normal repo versus named worktree versus detached HEAD, then present the matching completion choice. Use the branch/worktree reference for exact menus and cleanup rules.
7. Run `finish-record` with the chosen action and a summary after the tracked work is in final `HEAD` or after confirming the work is already committed.
8. Deliver a completion summary with final-review evidence, final git evidence, memory outcomes, and spec candidate outcomes.

## Output

Completion Summary Contract:

- Final review:
  - report path: `.loopx/final-review/<design-date>-<design-slug>.md` or `none`
  - ready for finish: `Yes`, `No`, or `With fixes`
  - blocking issues: `none` or summary
- Final evidence:
  - requirement start commit
  - final `HEAD`
  - commit list
  - changed files
  - tracked status summary
  - untracked summary
- Memory:
  - accepted, rejected, or none
  - any local/shared paths updated
- Spec Delta Candidates:
  - `ADDED`
  - `MODIFIED`
  - `REMOVED`
  - `RENAMED`
  - accepted, rejected, or deferred disposition with evidence

The completion summary must list the concrete evidence fields above. Do not silently write repo-tracked specs unless the candidate was explicitly accepted.

## References

- Read [references/final-review-and-finish-gates.md](references/final-review-and-finish-gates.md) for canonical final-review lookup, multi-plan finish gates, tracked/untracked cleanliness, and finish evidence fields.
- Read [references/branch-worktree-and-recording.md](references/branch-worktree-and-recording.md) for normal repo versus worktree choices, exact `finish-record` usage, stale audit head handling, and dirty tracked status handling.
- Read [references/memory-and-spec-candidates.md](references/memory-and-spec-candidates.md) for accepted/rejected/no-candidate handling, shared versus local memory, and spec delta candidate disposition.

## STOP Conditions

- Stop when implementation or verification is incomplete.
- Stop when the canonical final-review report is missing, blocked, or not ready for finish.
- Stop when the multi-plan package gate is incomplete.
- Stop when `finish-audit` has unreviewed extraction candidates.
- Stop when tracked changes still need to be committed into final `HEAD`.
- Stop before destructive discard until the user gives the exact confirmation required by the branch/worktree reference.
