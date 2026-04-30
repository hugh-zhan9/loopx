# Deep Interview Spec: build-runtime-ralph-alignment

## Metadata

- Profile: standard
- Rounds: 6
- Final ambiguity: 0.08
- Threshold: 0.20
- Context type: brownfield
- Context snapshot: `.omx/context/build-runtime-ralph-alignment-20260430T092953Z.md`
- Transcript: `.omx/interviews/build-runtime-ralph-alignment-20260430T093919Z.md`

## Clarity Breakdown

| Dimension | Score | Notes |
|---|---:|---|
| Intent | 0.95 | Align `build` runtime with Ralph-style execution rigor. |
| Outcome | 0.95 | True Ralph-style execution runtime under the public `build` name. |
| Scope | 0.90 | Internal parallel lanes allowed, but external surface remains one `build` stage. |
| Constraints | 0.92 | Preserve independent review and canonical `execution-record.md`. |
| Success | 0.90 | Build must gate on verification, architect sign-off, and still hand off to review. |
| Context | 0.95 | Existing `buildStage()` gap is grounded in repo code. |

## Intent

Bring `build` runtime up to the execution rigor already embodied by `skills/ralph/SKILL.md`, so the public `build` stage becomes the real execution lane instead of a shallow execution-record draft writer.

## Desired Outcome

`loopx build` should behave like a Ralph-style execution runtime:

- persistence loop
- internal parallel delegation across execution / evidence / verification lanes
- fresh verification
- architect verification
- deslop
- regression re-verification

It should still remain the public `build` stage and must still hand off to an independent `review` stage after passing internal build gates.

## In Scope

- implement full Ralph-style execution semantics inside `build`
- allow internal parallel execution / evidence / verification lanes
- add build runtime state for iteration, verification, architect gate, deslop, regression status, and blockers
- keep `execution-record.md` as the sole canonical execution/verification artifact
- allow additional runtime-support artifacts for progress or review evidence
- require build-internal architect verification before `build -> review`
- keep `review` as an independent final stage with provenance/evidence/completion/rollback/code-review responsibilities

## Out of Scope / Non-goals

- do not introduce new public `team`, `ultrawork`, or `ralph` command surfaces
- do not remove or collapse the independent `review` stage
- do not split `execution-record.md` into multiple new canonical execution artifacts
- do not widen this change into `autopilot` or `plan` runtime refactors

## Decision Boundaries

- `build` may internally orchestrate multiple lanes in parallel
- `build` must remain one public stage externally
- architect verification inside `build` is a pre-review execution-quality gate
- `review` remains the final independent gate and explicitly includes code-review
- canonical execution artifact remains `execution-record.md`

## Constraints

- current `buildStage()` is too shallow and must be replaced rather than lightly patched
- review independence must remain intact
- execution evidence must stay machine-checkable
- any extra build artifacts are support artifacts, not replacements for `execution-record.md`

## Testable Acceptance Criteria

- `build` runtime loops until execution work is complete or a real blocker remains
- `build` supports internal parallel execution/evidence/verification lanes
- `build` performs fresh verification and reads actual results
- `build` performs architect verification before entering `review`
- `build` performs deslop and post-deslop regression re-verification
- `build` cannot enter `review` if architect verification fails
- `execution-record.md` remains the sole canonical execution/verification artifact
- `review` remains separate and is not collapsed into `build`

## Assumptions Exposed + Resolutions

- Assumption: only part of Ralph behavior might be needed
  - Resolution: rejected; build should become a true Ralph-style execution runtime
- Assumption: stronger build might eliminate the need for independent review
  - Resolution: rejected; review still remains mandatory and independent
- Assumption: internal parallelism would require a public team surface
  - Resolution: rejected; parallelism may remain internal to the single public build stage
- Assumption: canonical execution artifacts may need to split
  - Resolution: rejected; `execution-record.md` remains canonical

## Pressure-pass Findings

- Earlier answer revisited: review-stage independence
- What changed: the difference between build-internal architect verification and final review was made explicit
- Resulting rule: architect verification is a pre-review quality gate, while review keeps provenance/evidence/completion/code-review responsibilities

## Brownfield Evidence vs Inference

### Evidence

- `skills/build/SKILL.md` is currently minimal
- `src/workflow.mjs` `buildStage()` only drafts `execution-record.md`
- `skills/ralph/SKILL.md` already describes the target execution discipline

### Inference

- `build` runtime will need new state fields, iteration tracking, lane modeling, and verification gates to match the desired behavior

## Technical Context Findings

- current runtime and desired build behavior are far apart
- the public stage surface can remain stable while the internal runtime becomes much stronger
- execution-state observability will matter more once build becomes multi-lane and iterative

## Recommended Handoff

Use `plan --direct .omx/specs/deep-interview-build-runtime-ralph-alignment.md` as the planning source of truth for the next stage. The resulting plan should define the build state machine, lane model, architect-gate semantics, deslop/regression loop, and regression coverage.
