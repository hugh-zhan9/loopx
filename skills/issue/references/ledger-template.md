# Full Issue Ledger Template

Use for a full ledger. Field and readiness rules remain in `../SKILL.md`;
keep execution-owned sections for `fix` to add.

```markdown
# Issue Ledger: <title-or-slug>

metadata:
  phase: intake | triage | diagnosis | fix_brief | closeout
  status: pending | in_progress | ready_for_fix | needs_info | not_a_bug | duplicate | already_fixed | feature_request | blocked | needs_scope_change | complete
  form: full | short
  source: pasted | local_file | failing_test | build_failure | reproduction_notes | existing_ledger
  created_at: YYYY-MM-DD
  updated_at: YYYY-MM-DD

## Source

<original report, file path, failing output, or reproduction notes>

## Worktree Baseline

- clean: true | false
- dirty_files:
  - <path>

## Triage

- classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info | feature_request
- routing_decision: issue_driven | prompt_first | review | exec | blocked
- decision_question_results:
  - previously_worked: yes | no | unknown
  - documented_or_accepted_contract: yes | no | unknown
  - failing_existing_check: yes | no | unknown
  - new_or_changed_behavior: yes | no | unknown
- reason: <why>

## Diagnosis Summary

diagnosis:
  classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info
  reproduction_status: reproduced | intermittent | not_reproduced | not_attempted
  evidence:
    - type: command | log | steps | code | user_report
      value: <summary>
  root_cause_status: confirmed | likely | unknown
  root_cause: <specific cause and mechanism, or unknown>
  hypotheses_rejected:
    - <hypothesis and evidence>
  fix_mode: root_cause_fix | defensive_fix | blocked | no_fix_needed
  regression_test_required: true | false
  regression_test_exception_reason: <required when false>
  risk_triggers:
    - no_repro
    - defensive_fix
    - public_surface
    - scope_unclear

## Fix Brief

- strategy: <root-cause fix or defensive fix>
- expected_touched_files:
  - <path>
- expected_touched_surfaces:
  - <surface>
- parallel_safe: false by default; true only when expected files/surfaces are narrow, non-overlapping, and avoid public CLI/API/schema/config, lockfile, and generated artifacts
- parallel_safety_reason: <why this is safe, or why it defaults to false>
- regression_test_plan: <test to add or update>
- verification_commands:
  - <command>
- forbidden_scope:
  - public CLI/API/schema/config changes unless explicitly listed
  - lockfile changes unless explicitly listed
  - generated artifact changes unless explicitly listed
- diagnostic_patches:
  - <none or patch path/summary>

## Response Draft

<short response for the reporter or user>

## Handoff

- if status is `ready_for_fix`: `$fix .loopx/issues/<this-ledger>.md`
- if status is `needs_info`: ask for the missing reproduction, log, environment, or version data
- if status is `not_a_bug`: explain the observed behavior and evidence
- if status is `duplicate`: link or describe the existing issue/source
- if status is `already_fixed`: explain the evidence that current behavior is already fixed
- if status is `feature_request`: route to `$clarify`
- if status is `blocked`: explain the blocker and the next decision needed

## Evidence Log

- YYYY-MM-DD <command/file/observation> -> <result>
```
