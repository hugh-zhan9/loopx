---
name: review
description: Repo-local acceptance surface for loopx.
---

# loopx Review

## Purpose

Repo-local acceptance surface for loopx. Use it to evaluate the execution package from `build` and return an explicit go / no-go result.

## Expected Outputs

- a review artifact tied to the run being evaluated
- verdict and rationale
- rollback guidance when execution is incomplete or unstable

## Decision Boundary

- Use this only after build has produced execution and verification evidence for a specific run.
- Stop here if review evidence is incomplete. `review` remains an independent gate and does not auto-complete the workflow.

## Must Not Decide Automatically

- final completion without an explicit approval step
- re-running build work inside the review surface

## Notes

- Review consumes structured outputs from the active loopx run. It should reject thin or placeholder-only evidence.
