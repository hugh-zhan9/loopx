# Deep Interview Spec: plan-runtime-ralplan-alignment

## Metadata

- Profile: standard
- Rounds: 6
- Final ambiguity: 0.07
- Threshold: 0.20
- Context type: brownfield
- Context snapshot: `.omx/context/plan-skill-ralplan-alignment-20260430T081032Z.md`
- Transcript: `.omx/interviews/plan-runtime-ralplan-alignment-20260430T083816Z.md`

## Clarity Breakdown

| Dimension | Score | Notes |
|---|---:|---|
| Intent | 0.95 | Align runtime behavior with the already-updated `plan` contract. |
| Outcome | 0.95 | Real Planner / Architect / Critic runtime for `plan`, with approved-plan stop. |
| Scope | 0.92 | Planning-only orchestration; execution orchestration excluded. |
| Constraints | 0.90 | Preserve `.LoopX/plans/prd-<slug>.md` as canonical approved plan. |
| Success | 0.90 | Completion blocked until canonical plan plus required docs outputs exist. |
| Context | 0.95 | Existing runtime gap and current skill/runtime mismatch are grounded in repo code. |

## Intent

Bring `plan` runtime in line with the already-updated consensus-first planning contract so the product no longer says `Planner -> Architect -> Critic` in skills while executing a lightweight artifact-only planner in code.

## Desired Outcome

`loopx plan` should run a real planning orchestration with Planner, Architect, and Critic, stopping after an approved plan package is produced. The runtime should not launch execution lanes as part of this change.

## In Scope

- implement real Planner / Architect / Critic orchestration as the default `plan` runtime behavior
- add plan runtime state fields and status reporting for consensus planning
- keep approved plan canonical under `.LoopX/plans/prd-<slug>.md`
- require the following blocking planning artifacts:
  - `.LoopX/plans/prd-<slug>.md`
  - `.LoopX/plans/test-spec-<slug>.md`
  - `docs/<slug>/架构文档.md`
  - `docs/<slug>/设计文档.md`
  - `docs/<slug>/测试计划.md`
- keep the loop planning-only and stop after approved plan output

## Out of Scope / Non-goals

- do not launch `build`, `autopilot`, `ralph`, or `team` as part of `plan`
- do not expand this change into a generic execution orchestrator
- do not move the canonical approved plan out of `.LoopX/plans/prd-<slug>.md`
- do not make the Chinese docs optional or post-hoc derived artifacts

## Decision Boundaries

- `plan` may orchestrate Planner / Architect / Critic internally
- `plan` must stop after approved planning artifacts are complete
- execution transitions still require explicit downstream approval and separate runtime handling
- required docs path contract is `docs/<slug>/`
- required docs filenames are fixed:
  - `架构文档.md`
  - `设计文档.md`
  - `测试计划.md`

## Constraints

- the existing skill contract in `skills/plan/SKILL.md` is already consensus-first and runtime must catch up to it
- Chinese docs are required completion artifacts
- runtime status must become machine-checkable for planning progression
- preserve current clarify gating and overall LoopX stage sequencing

## Testable Acceptance Criteria

- `plan` runtime creates and tracks a real Planner / Architect / Critic planning loop
- `plan` completion is blocked until Critic approves
- `plan` completion is blocked until all required Chinese docs exist under `docs/<slug>/`
- canonical approved plan remains at `.LoopX/plans/prd-<slug>.md`
- canonical test spec remains at `.LoopX/plans/test-spec-<slug>.md`
- `loopx status` exposes plan runtime progression beyond `plan_package_status=complete`
- tests prove the mismatch is closed: skill contract and runtime behavior align

## Assumptions Exposed + Resolutions

- Assumption: only local plan state/gates might be enough
  - Resolution: rejected; runtime must implement real Planner / Architect / Critic orchestration
- Assumption: docs under `docs/` might be secondary outputs
  - Resolution: rejected; they are blocking artifacts for plan completion
- Assumption: approved plan might move to `docs/`
  - Resolution: rejected; canonical approved plan stays under `.LoopX/plans/`

## Pressure-pass Findings

- Earlier answer revisited: docs requirement
- What changed: docs were tightened from “extra outputs” into “blocking completion artifacts”
- Resulting rule: `.LoopX/plans/prd-<slug>.md` alone is insufficient for completed `plan`

## Brownfield Evidence vs Inference

### Evidence

- `skills/plan/SKILL.md` says default `plan` is consensus-first with Planner / Architect / Critic
- `src/workflow.mjs` `planStage()` currently writes plan artifacts and marks plan package complete without consensus orchestration
- `src/cli.mjs` does not currently expose plan consensus state

### Inference

- runtime changes will need new state fields, status formatting, and tests to make plan progression auditable

## Technical Context Findings

- runtime and skill contract are currently out of sync
- tests presently only cover the lightweight plan path
- this change should land as a planning-runtime feature, not as part of execution runtime expansion

## Recommended Handoff

Use `plan --direct .omx/specs/deep-interview-plan-runtime-ralplan-alignment.md` as the planning source of truth for the next stage. The resulting implementation plan should include runtime state schema, orchestration sequencing, docs artifact contract, CLI/status changes, and regression coverage.
