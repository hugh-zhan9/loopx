# Final Review And Finish Gates

## Canonical Final-Review Lookup

Read the canonical final-review report before presenting any finish choice.

- First look at `.loopx/execution-ranges/<slug>.json` for the shared review identity.
- Resolve the canonical final-review report as `.loopx/final-review/<design-date>-<design-slug>.md`.
- Capture the report path, `Ready for finish?`, and blocking issues from the report.

`finish` does not create this report. If the report is missing, tell the user to run `final-review` first unless they explicitly say final review was handled elsewhere.

## Single-Plan vs Spec-Level Final Review

- Single-plan work reads the canonical final-review report and uses it as a hard gate for finish.
- Spec-level final-review for a multi-plan package writes the single canonical report for the package.
- Child plan-level final-review does not write a final-review report artifact. It updates package state only.

Do not introduce extra child review report paths.

## Multi-Plan V2 Finish Gate

When the source is a package path, read `.loopx/multi-plan/<feature-slug>/state.json` and require all of the following:

- `schema_version: 2`
- package `plans[]` is non-empty
- every child `status: "complete"`
- every child `plan_review.status: "passed"`
- every child non-empty `plan_review.reviewed_at`
- every child non-empty `plan_review.summary`
- every child `ready_for_spec_review: true`
- `spec_final_review.path` is present
- `spec_final_review.ready_for_finish: "Yes"`

Child rows must not depend on `start_commit`, `current_head`, or `end_commit`.

## Tracked Dirty Blocking And Untracked Reporting

- Tracked staged or unstaged files block `finish-record --status done` until the intended work is committed into final `HEAD`.
- Record and report tracked dirty state in the finish evidence.
- Untracked files count as clean. They do not block finish, but they still belong in the untracked summary.

## Finish Report Evidence Fields

The finish completion summary must include:

- final-review report path
- ready-for-finish value
- blocking issues
- requirement start commit
- final `HEAD`
- commit list
- changed files
- tracked status summary
- untracked summary

Keep the report human-readable and aligned with the final git state that `finish-record` accepted.
