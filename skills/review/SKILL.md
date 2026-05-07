---
name: review
description: Repo-local acceptance surface for loopx.
argument-hint: "<execution-record path or workflow slug>"
---

# loopx Review

## Purpose

Repo-local acceptance surface for loopx. Use it to evaluate the execution package from `build` and return an explicit go / no-go result.

## Inputs

Preferred skill input:

- `.loopx/workflows/<slug>/execution-record.md`

Compatible skill / CLI input:

- `<slug>`

When invoked with an execution record path, derive `<slug>` from the workflow directory and evaluate the matching active run.

## Expected Outputs

- a review artifact tied to the run being evaluated
- verdict and rationale
- code review findings for the implementation diff, including file / line references when issues are found
- rollback guidance when execution is incomplete or unstable

## User Notification Language

The final user-facing review result must be written in Chinese.

Use stable machine values only where they are commands, file paths, JSON/state fields, or exact verdict identifiers. The human-readable summary, rationale, findings, residual risks, rollback guidance, and next-step instruction must be Chinese.

## Decision Boundary

- Use this only after build has produced execution and verification evidence for a specific run.
- Stop here if review evidence is incomplete. `review` remains an independent gate and does not auto-complete the workflow.
- Review must include code review of the build-owned implementation diff. Do not limit review to artifact/schema checks.
- Code review findings should focus on real bugs, regressions, missing tests, broken contracts, security/data-integrity risks, and user-visible behavior gaps.
- If code review finds blocking high or medium severity issues, return a no-go verdict and rollback guidance instead of approving completion.

## Must Not Decide Automatically

- final completion without an explicit approval step
- re-running build work inside the review surface
- editing code or rerunning build from inside review

## Notes

- Review consumes structured outputs from the active loopx run. It should reject thin or placeholder-only evidence.
