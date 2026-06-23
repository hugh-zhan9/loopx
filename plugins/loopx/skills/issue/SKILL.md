---
name: issue
description: "Issue-driven bug-class workflow intake: triage a bug report, run debug-discipline diagnosis, create a .loopx/issues ledger, and produce a fix brief. Not for feature requests, enhancements, implementation plans, lasting code changes, issue tracker automation, or closing issues."
when_to_use: "issue, bug report, regression issue, failing test issue, build failure issue, unexpected behavior, issue-driven, bug-class issue, 问题工单, bug修复流程"
metadata:
  version: "0.1.0"
---

# Issue

Use this as the issue-driven workflow entry for bug-class issues only.

Issue-driven handles:

- bug
- regression
- failing test
- build failure
- unexpected behavior

Issue-driven does not handle feature requests or enhancements. Route those to the feature-driven workflow:

```text
clarify -> spec? -> plan-to-exec -> exec/subagent-exec -> review/final-review -> finish
```

## Contract

`issue` creates or updates a local ledger:

```text
.loopx/issues/issue-<slug>-<timestamp>.md
```

`issue` does not perform lasting product code changes. It may read code, run commands, inspect git history, and create temporary diagnostic edits. Temporary diagnostic edits must be rolled back before handoff or recorded as a diagnostic patch for `fix`.

Do not use issue tracker automation. If the source is an external issue, the user must provide the issue text, a local file, or pasted output.

## Inputs

Accept:

- pasted bug report
- local Markdown/text file
- failing test output
- build failure output
- user-written reproduction notes
- an existing `.loopx/issues/*.md` ledger to continue diagnosis

Reject or route:

- feature request -> `feature_request`, suggest `$clarify`
- enhancement -> `feature_request`, suggest `$clarify`
- pure review feedback -> suggest `$fix-review`
- approved implementation plan -> suggest `$exec` or `$subagent-exec`

## Preflight

1. Inspect `git status --porcelain`.
2. Record whether the worktree is clean or dirty.
3. If dirty, record the dirty file list in the ledger.
4. Never revert pre-existing user changes.

## Ledger Template

Write this structure:

```markdown
# Issue Ledger: <title-or-slug>

metadata:
  phase: intake | triage | diagnosis | fix_brief | execution | local_review | whole_review | verification | closeout
  status: pending | in_progress | ready_for_fix | needs_info | not_a_bug | duplicate | already_fixed | feature_request | fixed | reviewed | complete | failed | blocked
  source: pasted | local_file | failing_test | build_failure | reproduction_notes | existing_ledger
  created_at: <timestamp>
  updated_at: <timestamp>

## Source

<original report, file path, failing output, or reproduction notes>

## Worktree Baseline

- clean: true | false
- dirty_files:
  - <path>

## Triage

- classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info | feature_request
- routing_decision: issue_driven | feature_driven | fix_review | exec | blocked
- reason: <why>

## Diagnosis Summary

diagnosis:
  classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info
  reproduction_status: reproduced | intermittent | not_reproduced | not_attempted
  evidence:
    - type: command | log | steps | code | user_report
      value: <summary>
  root_cause_status: confirmed | likely | unknown
  root_cause: <summary>
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
- parallel_safe: true | false
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
- if status is `feature_request`: route to `$clarify`
- if status is `blocked`: explain the blocker and the next decision needed

## Execution Reports

- status: pending | fixed | failed | blocked | needs_scope_change
- actual_changed_files:
  - <path>
- verification:
  - command: <command>
    result: pass | fail
- notes: <execution summary>

## Reviews

- local_review:
  - status: pending | clean | findings_addressed | blocked
  - findings:
    - <finding or none>
- whole_diff_review:
  - status: pending | clean | findings_addressed | blocked
  - findings:
    - <finding or none>
- fix_review_decisions:
  - <Critical/Important finding handled, pushed back with evidence, or none>

## Verification

- final_commands:
  - command: <command>
    result: pass | fail | not_run
- regression_test_result: <summary>
- evidence: <fresh verification evidence>

## Closeout

- status: complete | failed | blocked
- response_draft: <final user/reporter response>
- finish_handoff: `$finish` when complete, or blocker summary when failed/blocked

## Evidence Log

- <timestamp> <command/file/observation> -> <result>
```

## Process

1. Read the input or existing ledger.
2. Create a new ledger unless the user supplied one to continue.
3. Classify the report before diagnosis.
4. Follow debug discipline: reproduce or collect equivalent evidence, inspect recent changes, compare with working patterns, form hypotheses, and reject or confirm them with minimal tests.
5. Update the Diagnosis Summary.
6. Write a Fix Brief only when the issue is bug-class and the next step is controlled repair.
7. Write a Response Draft and Handoff section.

## Status Rules

- Use `ready_for_fix` only when the diagnosis and fix brief are specific enough for `$fix .loopx/issues/<ledger>.md`.
- Use `needs_info` when reproduction steps, logs, environment, or expected behavior are missing.
- Use `not_a_bug` when evidence shows the behavior is intentional or outside the product contract.
- Use `feature_request` for enhancements and route to `$clarify`.
- Use `blocked` when diagnosis cannot continue without a user or external decision.

## Temporary Diagnostic Edits

Temporary diagnostic edits are allowed only to gather evidence. Before handoff, either revert them or record the patch and reason in `diagnostic_patches`. Do not leave unrecorded diagnostic changes in the worktree.
