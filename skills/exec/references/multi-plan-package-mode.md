# Multi-Plan Package Mode

Use package mode only when the input is:

- `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md`
- `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`

## Current-Only Package Detection

Read `00-overview.md` and extract:

- source spec path
- package slug
- local state path
- ordered child plan list

If the overview is missing required package fields, stop and report the defect.
Do not infer package state from historical plans or design notes.

## Schema V2 State Initialization

If `.loopx/multi-plan/<feature-slug>/state.json` is missing, initialize schema
v2 state from the overview and child plan list.

```json
{
  "schema_version": 2,
  "feature_slug": "2026-07-01-feature",
  "plan_package": "docs/loopx/plans/2026-07-01-feature",
  "source_spec": "docs/loopx/design/2026-07-01-feature/需求设计文档.md",
  "status": "in_progress",
  "plans": [
    {
      "path": "docs/loopx/plans/2026-07-01-feature/01-core.md",
      "status": "pending",
      "plan_review": null,
      "ready_for_spec_review": false
    }
  ],
  "spec_final_review": null
}
```

Child plan rows in current schema v2 must not record `start_commit`,
`current_head`, or `end_commit`.

## Direct Child Plan Mode

When the input is a numbered child plan, execute only that child plan.

- Do not execute sibling child plans.
- Do not proceed to package-level spec review or `finish`.
- Use the matching child row in `.loopx/multi-plan/<feature-slug>/state.json`
  for status updates.

## Sequential Package Orchestration

Execute child plans strictly sequentially.

1. Load the next pending child plan.
2. Run the same-context task loop for that child.
3. Do not start the next child until the current child is complete and reviewed.
4. Skip child plans that are already complete with a passed plan review and
   `ready_for_spec_review: true`.

## Child Plan Review Update

After each child plan is complete, run plan-level `loopx:final-review` and update
the matching state row:

```json
{
  "status": "complete",
  "plan_review": {
    "status": "passed",
    "reviewed_at": "2026-07-01T00:00:00.000Z",
    "summary": "No blocking issues"
  },
  "ready_for_spec_review": true
}
```

Plan-level final-review must not write a `.loopx/final-review/*.md` report.

## Spec-Level Final-Review Before Finish

After every child plan is ready, run one spec-level `loopx:final-review` for the
source spec, `00-overview.md`, all child plans, and current repository state.
Only start `loopx:finish` when that review is clean and all Critical or Important
feedback has been handled and rechecked.
