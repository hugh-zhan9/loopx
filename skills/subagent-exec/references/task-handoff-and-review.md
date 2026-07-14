# Task Handoff And Review

Use files for bulky task artifacts so the controller context stays small.

## Task Brief

Generate one brief per task:

```bash
scripts/task-brief PLAN_FILE N
```

Pass the printed brief path to the implementer and the task reviewer. The brief
must preserve:

- `Source AC`
- `Design anchors`
- `Test cases`
- `Task anchor`
- `Review focus`
- `Expected execution evidence`

## ANCHOR_CONTEXT

Provide an `ANCHOR_CONTEXT` block with:

- task anchor such as `T-001 / Task 1`
- relevant anchor ids
- original anchor summary
- source requirement path

If the task has no direct anchor, classify it as exactly one of:

- `infrastructure`
- `test-only`
- `docs-only`
- `refactor-only`

## Implementer Report Fields

The implementer writes the full report file and returns only short status. The
report must preserve:

```yaml
task_anchor: T-001
source_ac:
  - AC-001
design_anchors:
  - D-001
test_cases:
  - TC-001
commands_run:
  - command: npm test
    result: pass
evidence_summary: task proof matched Expected execution evidence
remaining_risk: none
anchor_coverage:
  AC-001: implemented
implemented_anchor_ids:
  - AC-001
tests_for_anchor_ids:
  AC-001:
    - TC-001
extra_behavior: none
missing_context: []
```

Allowed anchor statuses are `implemented`, `tested`, `not_applicable`,
`blocked`, and `needs_context`.

For surface-changing tasks, include a `surface_change` block in the report.

## Review Package

Generate the review package from the current working tree:

```bash
scripts/review-package --worktree T-001
```

The package must include git status, changed files, diff stat, and full diff
context. It must not require a task commit, `HEAD~1`, or Git-index checkpoint.

## Task Reviewer Prompt Expectations

The task reviewer receives:

- brief path
- report path
- review package path
- Global Constraints
- `ANCHOR_CONTEXT`
- `SURFACE_CHANGE_CONTEXT`

The reviewer must apply the expectations from `task-reviewer-prompt.md`,
including:

- `Spec Compliance`
- `Task quality`
- anchor traceability
- surface-change compliance
- read-only review behavior
- `Cannot verify from diff`

Run `scripts/review-result` against native reviewer output as specified in
`review-result-contract.md`. The provenance-bound artifact, not controller prose,
controls the task gate. Record its path in the completion ledger.

Do not pre-judge severities or tell the reviewer what not to flag.

## Task Completion Ledger

At skill start, check the progress ledger:

```bash
workspace=$(scripts/subagent-workspace)
cat "$workspace/progress.md"
```

If the ledger marks a task complete, do not re-dispatch it. After a clean task
review, append:

```text
T-001 / Task 1: complete (review clean, brief <path>, report <path>, review <path>, result <path>)
```

For numeric task headings without `T-*`, preserve `Task N` in the same
evidence-based ledger format.

## Critical And Important Findings

When the task reviewer returns Critical or Important findings:

1. dispatch one fix pass through `fix-review`
2. re-run focused verification for the amended code
3. append the new verification results to the same report file
4. rebuild the review package
5. dispatch the task reviewer again

Do not mark the task complete until both required review gates pass.
