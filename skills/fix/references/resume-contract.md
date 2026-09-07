# Fix Admission And Recovery

The issue ledger owns the approved repair scope and its recovery evidence.
Keep that evidence in the ledger and existing report directory; no separate
runtime or scheduler is required.

## Admission

| Metadata status | Entry condition | Action |
|---|---|---|
| `ready_for_fix`, no Resume Record | Full diagnosis/brief or valid short form; clean tracked baseline except target ledgers; declared new files only | Record the baseline and initial checkpoint, then set `in_progress` before edits |
| `in_progress` | A fix Resume Record matches the current checkout and approved scope | Re-read the existing delta, then continue from the failed or next check |
| `ready_for_fix`, existing Resume Record | `issue` has resolved a blocker or approved revised scope; preserved checkpoint matches | Resume existing work rather than starting from a clean baseline |
| `needs_scope_change` | A required path or surface exceeds the approved brief | Return to `issue`; do not execute until it sets `ready_for_fix` |
| `blocked` | A material external or owner decision remains open | Report the blocker; return to `issue` to record its resolution |
| `complete` | Repair already closed | Report the recorded result; a requested fresh verification may run, but do not reapply the repair |
| Other states, or `in_progress` without a fix Resume Record | Diagnosis is incomplete or recovery evidence is absent | Return to `issue` |

A short ledger uses `reproduction`, `root_cause`, `change_scope`, and
`verification_commands`. It need not have the full-form section headings.
Its defaults remain `parallel_safe: false`, regression test required, and no
risk triggers. Append the same Resume Record during execution.

## Resume Record

Before the first product edit, append `## Resume Record` containing:

- Baseline HEAD and checkout path.
- Approved source and test paths, declared new paths, and report paths.
- A saved baseline snapshot of any pre-existing declared new files.
- A complete checkpoint patch or snapshot location under
  `.loopx/issues/reports/<ledger-slug>/`, including tracked/staged changes,
  intentional untracked contents, deletions, and file modes.
- Candidate location and base identity for any isolated worker, whether its
  patch was integrated, and the integrated checkpoint location.
- Last verification command and result, failed check, and next action.

The snapshot must represent actual content, not only filenames, timestamps,
or a worker's success claim. The checkpoint includes the full repair delta
against the baseline HEAD. Ledger and report bookkeeping is identified
separately so saving the record does not recursively invalidate its snapshot.

## Checkpoint And Resume

Save a checkpoint after every edit batch, before verification and integration
handoffs, and before reporting a recoverable failure, blocker, or completion.
For parallel ledgers, record each candidate separately and checkpoint the
combined accepted delta after each serial integration.

On resume, inspect HEAD, staged and unstaged changes, and unignored untracked
contents. Require the original baseline HEAD and exact equality with the
recorded baseline/new-file snapshots plus run-owned checkpoint delta, excluding
only the named ledger/report bookkeeping paths. For multiple ledgers, compare
the combined accepted delta and reject overlapping ownership claims. Re-read
the attributed code and the current Fix Brief before continuing; rerun the
failed check instead of trusting prior results.

If HEAD changed, the checkpoint is missing, or an edit occurred after the last
checkpoint, stop before mutation and report the exact mismatch. Do not infer
ownership from an allowed filename, discard work, or restart the fix over it.
The user may explicitly identify and authorize incorporating those changes;
record that decision and the new baseline/checkpoint before resuming. An
uncheckpointed interruption is not automatically recoverable.

## State Ownership

`issue` alone establishes or restores `ready_for_fix` from diagnosis or a
resolved blocker. Preserve existing recovery evidence when revising scope.
`fix` writes `in_progress`, `needs_scope_change`, `blocked`, or `complete` as
described above. A failing test in a recoverable attempt stays `in_progress`;
`failed` is an execution/check outcome, not a ledger admission status.
For scope expansion, both metadata and Execution Reports use
`needs_scope_change`. Never convert a scope request to `blocked` merely to fit
another section's enum. Git disposition is not a prerequisite for completion.
