# T-003 Report

## Scope

- Task anchor: `T-003 / Task 3`
- Owned files: `src/finish-runtime.mjs`, `test/workflow.test.mjs`
- Goal: add requirement-start evidence to finish audit/report, preserve baseline fallback, capture final HEAD in finish evidence, and separate tracked vs untracked status so untracked-only files do not block finish done.

## Changes Made

1. In `src/finish-runtime.mjs`:
   - Added `readExecutionRangeForSlug(cwd, slug)` to load `.loopx/execution-ranges/<slug>.json` with `ENOENT` fallback and invalid-state erroring.
   - Added `splitStatusShort(lines)` to partition `git status --short` lines into `tracked` vs `untracked`.
   - Extended `resolveChangeWindow(...)` to populate:
     - `requirement_start_commit`
     - `requirement_start_commit_short`
     - `requirement_start_source`
     - `final_head`
     - `tracked_status`
     - `untracked_status`
   - Kept legacy baseline fallback when execution range state is absent.
   - Added `refreshChangeWindowStatus(...)` so `finish-record` refreshes current `final_head` and status buckets before rendering/reporting.
   - Updated `buildFinishReport(...)` to render:
     - `requirement_start_commit`
     - `requirement_start_source`
     - `final_HEAD`
     - `### Tracked Status`
     - `### Untracked Status`
   - Updated `isFinishAuditReadyForDone(...)` so tracked dirty state blocks `finish-record --status done`, while untracked-only state does not.

2. In `test/workflow.test.mjs`:
   - Added coverage for execution-range-backed requirement start commit in finish report/state.
   - Added coverage for baseline fallback when execution range state is absent.
   - Added coverage that untracked-only files do not block finish done and render in `Untracked Status`.
   - Added coverage that tracked dirty files still block finish done.

## Verification

- Ran:
  - `node --test test/workflow.test.mjs --test-name-pattern "finish report includes requirement start|untracked"`
- Result:
  - Pass, 26 tests passed, 0 failed.

## Self Review

- Scope stayed inside the two owned files.
- Existing `uncommitted_status` output was preserved for compatibility; tracked/untracked sections were added alongside it.
- `finish-record` now refreshes only live HEAD/status evidence instead of recomputing the whole change window, which keeps prior baseline/range semantics stable while making done-gating auditable.

## Remaining Risk

- None identified for this task scope.

```yaml
task_anchor: T-003
source_ac:
  - AC-4
  - AC-7
  - AC-8
  - AC-8a
design_anchors:
  - D-008
  - D-010
test_cases:
  - TC-4
  - TC-8
  - TC-9
  - TC-9b
commands_run:
  - node --test test/workflow.test.mjs --test-name-pattern "finish report includes requirement start|untracked": pass, 26 tests passed and 0 failed
evidence_summary: finish state and report include execution-range requirement start evidence and final HEAD; baseline fallback remains covered; untracked-only status is separated from tracked status and does not block done
remaining_risk: none
anchor_coverage:
  AC-4: implemented
  AC-7: implemented
  AC-8: implemented
  AC-8a: tested
implemented_anchor_ids:
  - AC-4
  - AC-7
  - AC-8
  - D-008
  - D-010
tests_for_anchor_ids:
  - TC-4
  - TC-8
  - TC-9
  - TC-9b
extra_behavior: none
missing_context: none
surface_change:
  removed_or_changed:
    - finish audit state/report now include requirement start evidence, final HEAD, tracked_status, and untracked_status while preserving legacy uncommitted_status
  retained_with_caller_proof:
    - item: finish baseline fallback when no execution range exists
      caller: test/workflow.test.mjs baseline fallback coverage
  negative_assertions:
    - command: node --test test/workflow.test.mjs --test-name-pattern "finish report includes requirement start|untracked"
      result: confirmed untracked-only files do not block done and tracked status remains separate
  package_or_governance_checks:
    - command: not_applicable
      result: no package/governance check required for this runtime-only task
```

## Review Fix Notes

- Fixed `finishRecordStage(...)` to refresh git evidence and change-window status from the audited worktree recorded in `state.audit.worktree`, not the caller's invocation directory.
- Kept multi-plan readiness checks aligned to the same audited worktree so audit-path invocations behave consistently outside the repo being audited.
- Added a regression test that calls `finishRecordStage(...)` by absolute audit path from a different repo, verifies persisted `tracked_status`/`final_head` come from the audited repo on a `pending` record, and verifies `done` is still blocked by tracked dirtiness in the audited repo.

## Additional Verification

- Exact brief command run:
  - `node --test test/workflow.test.mjs --test-name-pattern "finish report includes requirement start|untracked files do not block finish"`
  - Result: pass, Node executed the full `test/workflow.test.mjs` suite under this runner; relevant matched coverage includes:
    - `finish report includes requirement start commit from execution range`
    - `finish report includes requirement start fallback to finish baseline when execution range missing`
    - `untracked files do not block finish done`
- Extra targeted command run for the review finding:
  - `node --test test/workflow.test.mjs --test-name-pattern "finish record by audit path refreshes status from the audited repo, not caller cwd"`
  - Result: pass
