---
name: build
description: Ralph-style LoopX execution runtime under the public build stage.
argument-hint: "[--no-deslop] <approved workflow slug>"
---

# LoopX Build

<Purpose>
`build` is LoopX's canonical execution lane. It executes an approved plan with Ralph-style rigor while keeping the public LoopX stage surface unchanged.

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
- Fresh evidence is required before review handoff.
- Deslop and regression re-verification are part of the default build path.
</Core_Principles>

<Preconditions>
`build` starts only when all of the following are true:

- approved `plan -> build` transition exists
- `.LoopX/plans/prd-<slug>.md` exists
- `.LoopX/plans/test-spec-<slug>.md` exists
- workflow-local planning artifacts required by the execution lane exist
</Preconditions>

<Execution_Model>
`build` should behave like a Ralph-style execution runtime:

1. Initialize or resume build iteration state.
2. Run internal execution / evidence / verification lanes in parallel.
3. Aggregate lane results into canonical `execution-record.md`.
4. Run fresh verification and read actual output.
5. Run architect verification as a hard pre-review gate.
6. Run deslop on build-owned changes.
7. Re-run regression verification after deslop.
8. Stop only when review handoff gates are satisfied or a real blocker remains.

`build` may persist support artifacts for runtime inspection, but they must not replace `execution-record.md`.
</Execution_Model>

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

<Flags>
- `--no-deslop`: skip the deslop pass and the post-deslop regression loop, while still requiring the latest successful pre-deslop verification evidence
</Flags>

<Must_Not_Decide_Automatically>
- do not self-approve review
- do not mark the workflow complete
- do not replace `execution-record.md` with support artifacts
- do not widen execution into public `team`, `ultrawork`, or `ralph` command surfaces
</Must_Not_Decide_Automatically>
