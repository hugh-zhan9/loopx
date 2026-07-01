# Multi-Plan Package Mode

Use this reference when the input is:

- `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md`
- `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`
- `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md`

Current contract only. Do not preserve older schema normalization, legacy child
review artifact migration, or legacy child review report path guidance.

## Package Input Detection

Classify the path before execution:

- `00-overview.md`: package mode
- package directory: resolve `00-overview.md`, then package mode
- `NN-<plan-slug>.md`: direct child plan mode

If `00-overview.md` is missing or the overview omits required package fields,
stop and report the path defect.

## Schema V2 State Initialization

Package mode uses `.loopx/multi-plan/<feature-slug>/state.json`.

If the file is missing, initialize schema v2 state from the overview and child
plan list:

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

If the file exists, validate it against the overview. Stop on invalid JSON,
duplicated child plan paths, stale package identity, or schema mismatch.

Required current schema behavior:

- `schema_version: 2`
- each completed child `status: "complete"`
- each completed child `plan_review.status: "passed"`
- each completed child non-empty `plan_review.reviewed_at`
- each completed child non-empty `plan_review.summary`
- each completed child `ready_for_spec_review: true`
- child rows must not record `start_commit`, `current_head`, or `end_commit`
- `spec_final_review.ready_for_finish: "Yes"` before `finish`

## Direct Child Plan Mode

When the input is a numbered child plan, execute only that child plan. Do not
execute sibling plans from direct child plan mode. Do not proceed to package
spec review or `finish`.

After all tasks in the child plan pass task review, run `plan-level final-review`
as a process gate and update only the matching state row:

```json
{
  "path": "docs/loopx/plans/2026-07-01-feature/01-core.md",
  "status": "complete",
  "plan_review": {
    "status": "passed",
    "reviewed_at": "2026-07-01T00:00:00.000Z",
    "summary": "No blocking issues"
  },
  "ready_for_spec_review": true
}
```

Child `plan-level final-review` updates multi-plan state only. It must not
write `.loopx/final-review/<design-date>-<design-slug>.md`.

## Sequential Child Plan Execution

Package mode executes child plans strictly sequentially, even if the overview
says some plans can run in parallel. For each pending child plan:

1. run the normal per-task subagent flow
2. run `plan-level final-review`
3. update that child row's `plan_review` block and
   `ready_for_spec_review: true`

Skip child plans already marked complete with passed `plan_review` and
`ready_for_spec_review: true`.

## Spec-Level Final-Review Before Finish

After every child plan is ready, run one `spec-level final-review` for:

- the source spec
- `00-overview.md`
- all child plans
- current repository state

Only start `loopx:finish` when:

- all child plans are complete and ready
- `spec_final_review.ready_for_finish: "Yes"`
- all Critical and Important final-review feedback has been handled and
  rechecked
