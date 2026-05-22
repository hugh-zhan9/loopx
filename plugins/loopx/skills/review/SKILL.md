---
name: review
description: "Reviews a loopx build execution record for acceptance, code risks, evidence quality, and architecture smells. Not for doing implementation work or replanning."
when_to_use: "review, code review, acceptance, go no-go, execution-record, architecture smell, build complete, 审查, 验收"
metadata:
  version: "0.1.10"
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

When present, use `.loopx/config.json` as supporting context for project-native verification commands, existing AI rule files, and existing spec sources. Do not treat those external or pre-existing sources as replacements for the loopx execution record and review artifact.

## Expected Outputs

- a review artifact tied to the run being evaluated
- verdict and rationale
- code review findings for the implementation diff, including file / line references when issues are found
- architecture-smell findings from the internal review lane, focused on module depth, test seams, domain vocabulary, duplicated rules, and plan architecture alignment
- rollback/fix guidance when execution is incomplete, unstable, or needs another iteration
- an explicit `Next:` block with the exact next skill command when more work remains

## User Notification Language

The final user-facing review result must be written in Chinese.

Use stable machine values only where they are commands, file paths, JSON/state fields, or exact verdict identifiers. The human-readable summary, rationale, findings, residual risks, rollback guidance, and next-step instruction must be Chinese.

## Decision Boundary

- Use this only after build has produced execution and verification evidence for a specific run.
- Stop here if review evidence is incomplete. `review` remains an independent gate and does not auto-complete the workflow.
- Review must include code review of the build-owned implementation diff. Do not limit review to artifact/schema checks.
- Review should compare verification evidence against project-native commands recorded in `.loopx/config.json` when available, while still accepting stronger task-specific verification from the approved plan.
- Review must include the architecture-smell lane as part of review evidence. This is not a new workflow stage and must not create extra user steps.
- Review must compare the execution scope against the approved workflow scope. If `execution-record.md` declares non-empty `remaining_scope`, `completion_claim` other than `full`, or a mismatch between `planned_scope` and `implemented_scope`, review must return no-go and route to build or plan. A partial slice may be accepted as useful work, but it must not be approved as full workflow completion.
- Review must compare implementation evidence against the original source requirements and `.loopx/workflows/<slug>/requirement-traceability.md`, not only against the generated plan. If the traceability matrix is missing, partial, or contradicted by code/tests, route to `review -> plan` or `review -> clarify` depending on whether the plan or requirements are wrong.
- Code review findings should focus on real bugs, regressions, missing tests, broken contracts, security/data-integrity risks, and user-visible behavior gaps.
- If code review finds blocking high or medium severity issues, return a no-go verdict and rollback guidance instead of approving completion.
- If architecture-smell findings are only advisory, record them as warnings without blocking. Block only when module seams, testability, domain boundaries, duplicated rules, or plan architecture assumptions are materially wrong.
- Route request-changes by problem type:
  - implementation bugs, missing tests, small contract fixes: `review -> build`
  - wrong plan, wrong architecture, unresolved execution inputs: `review -> plan`
  - unclear product requirements or decision boundaries: `review -> clarify`
- Do not route implementation-only fixes back to plan unless the plan itself is wrong.

## Next Step Format

Every no-go review result must end with a concrete next command block.

For implementation fixes:

Default implementation-fix handoff:

```text
Next:
$build --from-review .loopx/workflows/<slug>/review-report.md
```

The review artifact is the direct rework contract for implementation fixes. `$build --from-review ...` must load the review findings first, while still using the approved PRD, test spec, previous `execution-record.md`, and workflow-local plan package as supporting context. Do not make the normal Codex-facing handoff require a separate bash `loopx approve ... --from review --to build` step.

For CLI/runtime debugging only, the equivalent state transition is:

```bash
loopx build --from-review .loopx/workflows/<slug>/review-report.md
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
$archive <slug>
```

`$archive` consumes the pending `review -> done` completion transition before syncing specs. Do not ask the user to run a separate `loopx approve <slug> --from review --to done` command in the normal Codex-facing flow.

For CLI/runtime debugging only, the equivalent explicit sequence is:

```bash
loopx approve <slug> --from review --to done
loopx archive <slug>
```

This syncs the approved `.loopx/changes/active/<change-id>/spec-delta.md` into long-lived `.loopx/specs/` files and moves the change folder under `.loopx/changes/archive/<change-id>/`.

## Support Skill Review Lenses

Use loopx support skills as review lenses, not as implementation instructions:

- `verify`: Evidence lens. Reject completion, passing, or review-ready claims that lack fresh command output and exit status.
- `scope`: Completion lens. Reject full-completion claims when the execution record still declares remaining workflow scope or only a partial slice was implemented.
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
