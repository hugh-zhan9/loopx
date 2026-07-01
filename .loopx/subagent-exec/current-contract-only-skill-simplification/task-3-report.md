# T-003 / Task 3 Report

## Summary

Rewrote `skills/exec/SKILL.md` into a short same-context fast path and split
the detailed package/checkpoint guidance into two local reference docs under
`skills/exec/references/`. The exec skill now centers on the current-only
contract, required startup, task loop, checkpoint review gates, completion by
scope, and stop conditions.

```yaml
task_anchor: T-003
source_ac:
  - AC-004
  - AC-005
  - AC-006
  - AC-007
design_anchors: not_applicable
test_cases:
  - TC-007
  - TC-008
  - TC-009
commands_run:
  - command: node scripts/verify-skills.mjs
    result: pass, verified 27 loopx bundled skills
  - command: rg -n "plan_final_review|LEGACY_CHILD_REVIEW_PATH_FIELD|normalizeMultiPlanStateForValidation|__normalized_from_schema_version" src scripts test skills package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
    result: no matches
  - command: rg -n "legacy v1|normalizes on read|schema v1|schema_version: 1|schema_version\\\": 1" test skills src scripts package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
    result: no matches
  - command: git diff --check
    result: pass
evidence_summary: >
  Exec now presents a concise same-context fast path with the required current
  contract surface: input classification for single plan, package overview,
  package directory, and direct child plan inputs; required startup commands;
  task-loop evidence fields; checkpoint review gates; completion by scope; and
  reference routing for package mode and checkpoints/resume. The strict current
  product surface no longer mentions the removed compatibility terms.
remaining_risk: >
  Focused governance assertions in `test/skill-governance.test.mjs` still
  expect the pre-bump exec metadata version, so that test update is deferred to
  T-005.
```

## Surface Change

```yaml
surface_change:
  removed_or_changed:
    - `skills/exec/SKILL.md` was rewritten from the long overview/task-history body into the requested fast-path structure with `Fast Path`, `Input Scope`, `Required Startup`, `Task Loop`, `Required Review Gates`, `Completion By Scope`, `References`, and `Stop Conditions`
    - `metadata.version` for the bundled `exec` skill was bumped to `0.3.9`
    - detailed package orchestration and checkpoint/resume guidance moved into `skills/exec/references/*.md`
  retained_with_caller_proof:
    - item: `loopx execution-start <slug> --source <plan-path> [--design <design-path>]`
      caller: `skills/exec/SKILL.md` -> `Required Startup`
    - item: `loopx finish-start <slug> --source <plan-path>`
      caller: `skills/exec/SKILL.md` -> `Required Startup`
    - item: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` / `00-overview.md` / `NN-<plan-slug>.md`
      caller: `skills/exec/SKILL.md` -> `Input Scope`
    - item: `plan-level final-review` and `spec-level final-review`
      caller: `skills/exec/references/multi-plan-package-mode.md`
    - item: `fix-review` and `checkpoint review`
      caller: `skills/exec/SKILL.md` -> `Task Loop` and `Required Review Gates`
  negative_assertions:
    - command: rg -n "plan_final_review|LEGACY_CHILD_REVIEW_PATH_FIELD|normalizeMultiPlanStateForValidation|__normalized_from_schema_version" src scripts test skills package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
      result: no matches
    - command: rg -n "legacy v1|normalizes on read|schema v1|schema_version: 1|schema_version\\\": 1" test skills src scripts package.json README.md docs/loopx/cli.md docs/loopx/skills.md docs/loopx/specs
      result: no matches
  package_or_governance_checks:
    - command: node scripts/verify-skills.mjs
      result: pass
    - command: git diff --check
      result: pass
```
