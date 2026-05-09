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
- rollback/fix guidance when execution is incomplete, unstable, or needs another iteration
- an explicit `Next:` block with the exact next skill command when more work remains

## User Notification Language

The final user-facing review result must be written in Chinese.

Use stable machine values only where they are commands, file paths, JSON/state fields, or exact verdict identifiers. The human-readable summary, rationale, findings, residual risks, rollback guidance, and next-step instruction must be Chinese.

## Decision Boundary

- Use this only after build has produced execution and verification evidence for a specific run.
- Stop here if review evidence is incomplete. `review` remains an independent gate and does not auto-complete the workflow.
- Review must include code review of the build-owned implementation diff. Do not limit review to artifact/schema checks.
- Code review findings should focus on real bugs, regressions, missing tests, broken contracts, security/data-integrity risks, and user-visible behavior gaps.
- If code review finds blocking high or medium severity issues, return a no-go verdict and rollback guidance instead of approving completion.
- Route request-changes by problem type:
  - implementation bugs, missing tests, small contract fixes: `review -> build`
  - wrong plan, wrong architecture, unresolved execution inputs: `review -> plan`
  - unclear product requirements or decision boundaries: `review -> clarify`
- Do not route implementation-only fixes back to plan unless the plan itself is wrong.

## Next Step Format

Every no-go review result must end with a concrete next command block.

For implementation fixes:

```text
Next:
loopx approve <slug> --from review --to build
$build .loopx/plans/prd-<slug>.md
```

For plan fixes:

```text
Next:
loopx approve <slug> --from review --to plan
$plan <slug>
```

For clarify fixes:

```text
Next:
loopx approve <slug> --from review --to clarify
$clarify <slug>
```

For approval:

```text
Next:
loopx approve <slug> --from review --to done
```

## Support Skill Review Lenses

Use loopx support skills as review lenses, not as implementation instructions:

- `verify`: Evidence lens. Reject completion, passing, or review-ready claims that lack fresh command output and exit status.
- `tdd`: Behavior-change lens. Feature work and bug fixes should include failing-test or regression-test evidence unless the execution record explicitly explains why tests are not applicable.
- `debug`: Failure-analysis lens. Fixes for bugs, test failures, build failures, and unexpected behavior should document root cause, not only symptoms or attempted patches.
- `go-style`: Go diff lens. For `.go` changes, review happy-path structure, error handling, context usage, interface boundaries, naming, table tests, and `gofmt`/Go verification evidence.
- `kratos`: Kratos diff lens. For Kratos/proto/service/biz/data/middleware/auth/config changes, review layer boundaries, generated-code flow, proto/package contracts, middleware/auth ordering, config compatibility, and project-native verification.

These lenses can produce review findings when the execution package violates them. Do not run new build work from `review`; request rollback or changes instead.

## Must Not Decide Automatically

- final completion without an explicit approval step
- re-running build work inside the review surface
- editing code or rerunning build from inside review

## Notes

- Review consumes structured outputs from the active loopx run. It should reject thin or placeholder-only evidence.
