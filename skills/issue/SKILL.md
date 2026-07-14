---
name: issue
description: "Issue-driven bug-class workflow intake: triage a bug report, run debug-discipline diagnosis, create a .loopx/issues ledger, and produce a fix brief. Not for feature requests, enhancements, implementation plans, lasting code changes, issue tracker automation, or closing issues."
when_to_use: "issue, bug report, regression issue, failing test issue, build failure issue, unexpected behavior, issue-driven, bug-class issue, 问题工单, bug修复流程"
metadata:
  version: "0.3.7"
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
clarify -> spec? -> plan-to-exec -> exec/subagent-exec -> review/final-review -> fix-review? -> finish
```

## Contract

`issue` creates or updates a local ledger:

```text
.loopx/issues/issue-<slug>-YYYY-MM-DD.md
```

`issue` does not perform lasting product code changes. It may read code, run commands, and inspect git history. Temporary diagnostic edits are allowed only on a clean worktree by default. If the worktree is dirty, do not create temporary diagnostic edits unless the user explicitly allows them; when allowed, record a baseline diff first, then roll back the diagnostic diff or record it as a diagnostic patch for `fix`.

Do not use issue tracker automation. If the source is an external issue, the user must provide the issue text, a local file, or pasted output.

## STOP Conditions

Stop before marking an issue `ready_for_fix` when reproduction, root cause, expected behavior, affected files, forbidden scope, or verification commands are missing. A vague report must remain in diagnosis, not become a fix brief.

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

## Triage Decision Matrix

Classify before diagnosis. Use the first row that fits the evidence; do not force a feature request through `issue` just because it is phrased as a bug.

Ask these questions:

- Was this behavior ever working, or is there a failing existing test/build check? If yes, treat it as bug-class.
- Was this behavior documented, specified, or accepted as part of the product contract? If yes, treat divergence as bug-class.
- Is the report only "not what I expected" with no contract, history, or failing check? Treat it as `feature_request`.
- Is this a new use case on top of existing capability? Treat it as enhancement and route to `$clarify`.

| Signal | Existing contract or once worked | No contract/history, expectation only | Explicit new behavior or new use case |
|---|---|---|---|
| Reproducible failure, failing test, build failure, or regression evidence | `issue_driven` bug-class | `needs_info` until contract/history is identified | `feature_request` unless existing contract is found |
| Documentation, spec, accepted behavior, or comparable working path contradicts actual behavior | `issue_driven` bug-class | `needs_info` for contract evidence | `feature_request` if the contract must change |
| No failure evidence; request says "should", "I want", or asks for different behavior | `needs_info` or `already_fixed` after checking current code | `feature_request` -> `$clarify` | `feature_request` -> `$clarify` |

## Preflight

1. Inspect `git status --porcelain`.
2. Record whether the worktree is clean or dirty.
3. If dirty, record the dirty file list in the ledger.
4. If dirty, diagnostic edits are prohibited unless the user explicitly allows them.
5. If dirty diagnostic edits are allowed, record the baseline diff before editing and keep any diagnostic diff separately identifiable.
6. Never revert pre-existing user changes.

## Ledger Template

Write this structure:

```markdown
# Issue Ledger: <title-or-slug>

metadata:
  phase: intake | triage | diagnosis | fix_brief | closeout
  status: pending | in_progress | ready_for_fix | needs_info | not_a_bug | duplicate | already_fixed | feature_request | blocked
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
- routing_decision: issue_driven | feature_driven | fix_review | exec | blocked
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

## Process

1. Read the input or existing ledger.
2. Create a new ledger unless the user supplied one to continue.
3. Classify the report before diagnosis.
4. Follow debug discipline: reproduce or collect equivalent evidence, inspect recent changes, compare with working patterns, form hypotheses, and reject or confirm them with minimal tests.
5. Update the Diagnosis Summary.
6. Write a Fix Brief only when the issue is bug-class and the next step is controlled repair.
7. Write a Response Draft and Handoff section.

## Diagnosis Minimum Standard

The `issue` workflow consumes the `debug` Diagnosis Summary Contract. Before writing a Fix Brief or using `ready_for_fix`, the ledger diagnosis must contain:

- `classification` and `reproduction_status`
- at least one evidence item from command, log, steps, code, or user report
- `root_cause_status` of `confirmed` or `likely`
- a specific `root_cause` explaining cause and mechanism, not only the symptom
- at least one `hypotheses_rejected` entry with evidence
- `fix_mode`
- `regression_test_required`, plus `regression_test_exception_reason` when false
- `risk_triggers`, even when the list is empty

If these fields cannot be filled from available evidence, do not write a ready Fix Brief. Use `needs_info`, `blocked`, `not_a_bug`, `already_fixed`, or `feature_request` as the evidence requires.

## Status Rules

- Use `ready_for_fix` only when the diagnosis and fix brief are specific enough for `$fix .loopx/issues/<ledger>.md`.
- Use `needs_info` when reproduction steps, logs, environment, or expected behavior are missing.
- Use `not_a_bug` when evidence shows the behavior is intentional or outside the product contract.
- Use `duplicate` when another issue, report, or local ledger already covers the same root problem.
- Use `already_fixed` when current code or tests show the reported behavior no longer reproduces.
- Use `feature_request` for enhancements and route to `$clarify`.
- Use `blocked` when diagnosis cannot continue without a user or external decision.
- Do not use execution statuses such as fixed, reviewed, complete, or failed in `issue`; those belong to `fix` ledger append sections.

## Ready For Fix Gate

Use `ready_for_fix` only when all conditions are true:

- Triage classification is `bug`, `regression`, `failing_test`, `build_failure`, or `unexpected_behavior`.
- `routing_decision` is `issue_driven`.
- Diagnosis satisfies the minimum standard above.
- `reproduction_status` is `reproduced` or `intermittent`, or equivalent code/log evidence is recorded with `no_repro` in `risk_triggers`.
- `fix_mode` is `root_cause_fix`, or `defensive_fix` with an explicit risk trigger and confirmation requirement.
- Fix Brief includes `strategy`, `expected_touched_files`, `expected_touched_surfaces`, `parallel_safe`, `parallel_safety_reason`, `regression_test_plan` or a valid exception, `verification_commands`, `forbidden_scope`, and `diagnostic_patches`.
- Expected files and surfaces are narrow enough for `fix` scope validation.
- Public CLI/API/schema/config, lockfile, generated artifact, migration, package metadata, and shared fixture changes are either absent or explicitly listed as high-risk scope.
- No unresolved product behavior, scope, reproduction, or external dependency decision remains.

Do not set `ready_for_fix` when root cause is unknown, reproduction was not attempted, evidence is only a vague user expectation, expected files are placeholders, verification commands are missing, or the report is actually a feature request.

User confirmation is not required for a narrow root-cause fix with reproduced or strongly evidenced behavior. User confirmation is required before handoff when the Fix Brief relies on `no_repro`, `defensive_fix`, public surface changes, generated artifacts, lockfiles, migrations, package metadata, or other high-risk scope.

## Temporary Diagnostic Edits

Temporary diagnostic edits are allowed only to gather evidence and only on a clean worktree by default.

When the worktree is dirty:

- Do not make diagnostic edits unless the user explicitly allows them.
- If allowed, record the baseline diff before editing.
- Keep diagnostic changes isolated from pre-existing user changes.
- Before handoff, either revert the diagnostic diff or record the patch and reason in `diagnostic_patches`.

Do not leave unrecorded diagnostic changes in the worktree.

## Parallel Safety

Set `parallel_safe: false` by default. Use `true` only when:

- `expected_touched_files` and `expected_touched_surfaces` are specific and narrow
- the likely fix does not touch public CLI/API/schema/config, lockfiles, generated artifacts, migrations, or shared test fixtures
- the expected files/surfaces do not overlap with other known ready ledgers

`fix` must still perform final scope validation before parallel scheduling.
