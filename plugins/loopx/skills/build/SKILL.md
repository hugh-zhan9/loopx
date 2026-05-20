---
name: build
description: "Executes an approved loopx plan or review rework contract with evidence, verification, deslop, and regression gates. Not for unclear requirements or independent review."
when_to_use: "build, implement approved plan, execute PRD, --from-review, review rework, implementation fixes, 执行, 实现, 修改"
metadata:
  version: "0.1.4"
argument-hint: "[--no-deslop] <approved PRD path or workflow slug> | --from-review <review artifact path>"
---

# loopx Build

<Purpose>
`build` is loopx's canonical execution lane. It executes an approved plan with Ralph-style rigor while keeping the public loopx stage surface unchanged.

By default, `build` is not a one-shot draft writer. It is a persistence loop with internal parallel lanes, fresh verification, architect gating, deslop, and regression re-verification before `review` can start.
</Purpose>

<Use_When>
- `plan -> build` has already been explicitly approved.
- `review -> build` was requested for implementation fixes and a review artifact is supplied with `--from-review`.
- Canonical plan artifacts already exist and execution should now proceed.
- The task needs execution persistence, verification evidence, and explicit pre-review quality gates.
</Use_When>

<Do_Not_Use_When>
- Requirements or planning are still incomplete.
- The user wants to skip execution and only review or inspect the plan.
- A valid build run is already review-ready and the next action is `review`.
</Do_Not_Use_When>

<Core_Principles>
- Public surface stays `build`; internal strength can still match Ralph-style execution.
- Execution may parallelize internally without exposing a public `team` stage.
- `build` does not replace `review`.
- `execution-record.md` remains the sole canonical execution and verification artifact.
- Feature work and bug fixes should use `tdd`: write a failing test, confirm it fails for the intended reason, then implement the smallest passing change.
- Bug, test-failure, build-failure, and unexpected-behavior work should use `debug` before proposing fixes.
- Completion and review-ready claims should use `verify` before they are stated.
- Go edits should use `go-style` and preserve local repository conventions.
- Go-Kratos work should use `kratos` when Kratos project signals or Kratos-specific tasks are present.
- Fresh evidence is required before review handoff.
- Deslop and regression re-verification are part of the default build path.
- `build` has one owner for persistence. Delegation may run in parallel, but the owner remains accountable for draining delegated work and proving completion before review handoff.
</Core_Principles>

<Preconditions>
For initial execution, `build` starts only when all of the following are true:

- approved `plan -> build` transition exists
- `.loopx/plans/prd-<slug>.md` exists
- `.loopx/plans/test-spec-<slug>.md` exists
- workflow-local planning artifacts required by the execution lane exist

For review-requested implementation fixes, `build` may instead start from:

- `$build --from-review .loopx/workflows/<slug>/review-report.md`
- or `$build --from-review .loopx/workflows/<slug>/review.md`

In that mode, the review artifact is the direct rework contract. The approved PRD, test spec, previous execution record, and workflow-local plan package remain required context, but they are not the primary user-facing argument.
</Preconditions>

<Inputs>
Preferred skill input:

- `.loopx/plans/prd-<slug>.md`

Preferred review rework input:

- `--from-review .loopx/workflows/<slug>/review-report.md`

Compatible skill / CLI input:

- `<slug>`

When invoked with a PRD path, derive `<slug>` from `prd-<slug>.md` and still use the matching workflow-local plan package and test spec.

When invoked with `--from-review`, derive `<slug>` from the workflow directory, treat the review artifact as the implementation-fix contract, and load the matching PRD, test spec, previous `execution-record.md`, and workflow-local plan package as supporting context. This Codex skill invocation consumes the `review -> build` rework intent; users should not need a separate bash `loopx approve ... --from review --to build` step for the normal Codex-facing flow.
</Inputs>

<Execution_Model>
`build` should behave like a Ralph-style execution runtime:

1. Initialize or resume build iteration state.
2. If running from `--from-review`, load the review artifact first and constrain implementation work to the requested implementation fixes unless the review artifact exposes a real plan or clarify blocker.
3. Run internal execution / evidence / verification lanes in parallel.
4. For implementation work, apply `tdd` unless the approved plan explicitly classifies the change as non-behavioral or test-inapplicable.
5. For failures discovered during execution or verification, apply `debug` before attempting fixes.
6. For `.go` edits, apply `go-style`; for Kratos API/service/biz/data work, apply `kratos` before changing framework structure.
7. Aggregate lane results into canonical `execution-record.md`.
8. Run fresh verification and read actual output using `verify` discipline.
9. Run architect verification as a hard pre-review gate.
10. Run deslop on build-owned changes.
11. Re-run regression verification after deslop.
12. Write/update the build delegation ledger and ensure blocking delegated work is drained.
13. Write/update the completion audit mapping approved plan, slices, and review rework inputs to evidence.
14. Stop only when review handoff gates are satisfied or a real blocker remains.

`build` may persist support artifacts for runtime inspection, but they must not replace `execution-record.md`.
</Execution_Model>

<Continuation_Discipline>
`build` is a persistence loop, not a "one phase per invocation" runner.

If approved plan work remains, continue executing within the same `$build` invocation until either review handoff gates are satisfied or a real blocker prevents further progress.

The following are **not** real blockers by themselves:

- a planned phase is unfinished
- a runtime adapter is not fully migrated yet
- store-layer branches still need to be moved to the new service/client path
- more files remain in the approved implementation scope
- verification has not been rerun after the latest edits

Those are remaining execution work. Keep working them down.

A real blocker must identify why execution cannot safely continue now, such as:

- missing human product/architecture decision that is not specified by the approved plan
- unavailable credential, service, fixture, dependency, or environment that cannot be mocked or bypassed responsibly
- verification failure caused by a pre-existing repository condition that blocks evaluating this change and cannot be isolated
- repeated implementation failure after the build iteration budget is exhausted
- a conflict between the approved plan and current repository facts that requires re-planning

Do not end a build response with "continue in the next build" for unfinished approved work. If work remains and no real blocker exists, keep executing. If a real blocker exists, name the concrete blocker and record it in `execution-record.md`.
</Continuation_Discipline>

<Runtime_State_Machine>
`build` should track at minimum:

- `build_run_id`
- `build_current_iteration`
- `build_max_iterations` (default `10`)
- `build_parallel_mode`
- `build_lane_statuses`
- `build_verification_status`
- `build_architect_verification_status`
- `build_deslop_status`
- `build_regression_status`
- `build_blockers`
- `build_progress_artifact_paths`
- `build_support_evidence_paths`
- `build_owner_id`
- `build_owner_session_id`
- `build_owner_status`
- `build_delegation_status`
- `build_delegation_ledger_path`
- `build_active_delegation_count`
- `build_completion_audit_status`
- `build_completion_audit_path`
- `execution_record_status`

`build -> review` is blocked until:

- all internal lanes are complete
- fresh verification passes
- architect verification is approved
- deslop is complete, unless explicitly skipped
- post-deslop regression passes
- blocking delegated build work is drained
- completion audit passes
- `execution-record.md` is complete
</Runtime_State_Machine>

<Artifact_Contract>
Canonical artifact:

- `execution-record.md`

`execution-record.md` must make the completion scope explicit when a plan is larger than the current implementation slice:

- `planned_scope`: the approved PRD/workflow scope being measured.
- `implemented_scope`: the scope actually completed in this build run.
- `remaining_scope`: empty only when the approved workflow scope is fully implemented.
- `completion_claim`: use `full` only when the whole approved workflow is complete; use `slice` or another non-full value for partial implementation.

If `remaining_scope` is non-empty or `completion_claim` is not `full`, build may still hand off for slice review, but review/archive must not treat that as full workflow completion.

Support artifacts may exist for:

- iteration progress
- lane evidence summaries
- architect gate summaries
- deslop summaries
- regression summaries
- `build-support/delegation-ledger.json`
- `build-support/completion-audit.json`

These support artifacts are runtime aids only. They must not become new canonical review inputs.
</Artifact_Contract>

<Review_Boundary>
- build-internal architect verification is an execution-quality gate
- review remains the final independent stage
- review continues to own provenance checks, evidence completeness checks, completion/rollback decisions, and code-review
</Review_Boundary>

<Final_Response_Contract>
When `build` reaches review handoff readiness, the final response must include an explicit next skill command using the execution record path:

```text
Next:
$review .loopx/workflows/<slug>/execution-record.md
```

If the user needs the CLI/runtime-debug form, use:

```bash
loopx review <slug>
```

Do not end with prose-only guidance such as "next step should enter review" when the workflow is ready for review. Do not emit `$review <slug>` as the primary skill handoff when the execution record path is known. If review handoff is blocked, state the blocker instead of emitting a `$review` command.
</Final_Response_Contract>

<Flags>
- `--no-deslop`: skip the deslop pass and the post-deslop regression loop, while still requiring the latest successful pre-deslop verification evidence
</Flags>

<Must_Not_Decide_Automatically>
- do not self-approve review
- do not mark the workflow complete
- do not replace `execution-record.md` with support artifacts
- do not widen execution into public `team`, `ultrawork`, or `ralph` command surfaces
</Must_Not_Decide_Automatically>
