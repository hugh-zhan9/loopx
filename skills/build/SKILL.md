---
name: build
description: Ralph-style loopx execution runtime under the public build stage.
argument-hint: "[--no-deslop] <approved PRD path or workflow slug>"
---

# loopx Build

<Purpose>
`build` is loopx's canonical execution lane. It executes an approved plan with Ralph-style rigor while keeping the public loopx stage surface unchanged.

By default, `build` is not a one-shot draft writer. It is a persistence loop with internal parallel lanes, fresh verification, architect gating, deslop, and regression re-verification before `review` can start.
</Purpose>

<Use_When>
- `plan -> build` has already been explicitly approved.
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
</Core_Principles>

<Preconditions>
`build` starts only when all of the following are true:

- approved `plan -> build` transition exists
- `.loopx/plans/prd-<slug>.md` exists
- `.loopx/plans/test-spec-<slug>.md` exists
- workflow-local planning artifacts required by the execution lane exist
</Preconditions>

<Inputs>
Preferred skill input:

- `.loopx/plans/prd-<slug>.md`

Compatible skill / CLI input:

- `<slug>`

When invoked with a PRD path, derive `<slug>` from `prd-<slug>.md` and still use the matching workflow-local plan package and test spec.
</Inputs>

<Execution_Model>
`build` should behave like a Ralph-style execution runtime:

1. Initialize or resume build iteration state.
2. Run internal execution / evidence / verification lanes in parallel.
3. For implementation work, apply `tdd` unless the approved plan explicitly classifies the change as non-behavioral or test-inapplicable.
4. For failures discovered during execution or verification, apply `debug` before attempting fixes.
5. For `.go` edits, apply `go-style`; for Kratos API/service/biz/data work, apply `kratos` before changing framework structure.
6. Aggregate lane results into canonical `execution-record.md`.
7. Run fresh verification and read actual output using `verify` discipline.
8. Run architect verification as a hard pre-review gate.
9. Run deslop on build-owned changes.
10. Re-run regression verification after deslop.
11. Stop only when review handoff gates are satisfied or a real blocker remains.

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
- `execution_record_status`

`build -> review` is blocked until:

- all internal lanes are complete
- fresh verification passes
- architect verification is approved
- deslop is complete, unless explicitly skipped
- post-deslop regression passes
- `execution-record.md` is complete
</Runtime_State_Machine>

<Artifact_Contract>
Canonical artifact:

- `execution-record.md`

Support artifacts may exist for:

- iteration progress
- lane evidence summaries
- architect gate summaries
- deslop summaries
- regression summaries

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
