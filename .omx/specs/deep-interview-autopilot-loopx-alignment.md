# Deep Interview Spec: autopilot-loopx-alignment

## Metadata

- Profile: standard
- Rounds: 6
- Final ambiguity: 0.08
- Threshold: 0.20
- Context type: brownfield
- Context snapshot: `.omx/context/autopilot-loopx-alignment-20260430T101034Z.md`
- Transcript: `.omx/interviews/autopilot-loopx-alignment-20260430T102514Z.md`

## Clarity Breakdown

| Dimension | Score | Notes |
|---|---:|---|
| Intent | 0.95 | Strengthen LoopX autopilot using the richer parent autopilot design. |
| Outcome | 0.95 | Upgrade both skill contract and runtime orchestration. |
| Scope | 0.90 | Internal phases may deepen, external LoopX stages remain stable. |
| Constraints | 0.92 | Preserve LoopX artifact contract and automatic internal approvals. |
| Success | 0.90 | Autopilot becomes richer without escaping LoopX's public stage model. |
| Context | 0.95 | Current thin skill and bounded runtime are grounded in repo code. |

## Intent

Upgrade LoopX `autopilot` from a thin bounded composition surface into a stronger autonomous orchestration model by borrowing the parent `oh-my-codex` autopilot's phase structure and reviewer ideas, but keeping LoopX's stage surface and artifact contract authoritative.

## Desired Outcome

LoopX `autopilot` should:

- upgrade both the skill and runtime
- own a richer internal phase model inspired by the parent autopilot
- still present LoopX's external `clarify / plan / build / review` stage model
- continue to consume stage approvals internally and record them as control events
- remain LoopX-native rather than a literal port of the parent implementation

## In Scope

- upgrade `skills/autopilot/SKILL.md` to a richer contract
- upgrade `src/workflow.mjs` `autopilotStage()` runtime orchestration
- introduce finer-grained internal autopilot phases where helpful
- preserve `.LoopX/autopilot/<slug>/run.json` or evolve it within the LoopX artifact model
- import multi-phase orchestration, QA/validation concepts, and reviewer-role ideas from the parent autopilot where compatible with LoopX

## Out of Scope / Non-goals

- do not introduce a new external public stage family beyond `clarify / plan / build / review`
- do not bypass LoopX canonical artifacts or stage truths
- do not literally copy the parent autopilot where it conflicts with LoopX runtime contracts
- do not widen this change into unrelated stage redesigns unless explicitly required by the autopilot contract

## Decision Boundaries

- both skill and runtime are in scope
- internal richer phases are allowed
- external user-facing stages remain `clarify / plan / build / review`
- internal stage approvals may continue to be auto-consumed and recorded as control events
- parent autopilot concepts may be adapted, but LoopX remains the source of truth

## Constraints

- current LoopX runtime already has real `plan` and `build` strengthening work underway / landed
- public LoopX artifact and stage contracts must remain coherent
- autopilot should integrate with strengthened stage runtimes rather than re-implementing contradictory truths
- automatic internal control events must remain inspectable

## Testable Acceptance Criteria

- `skills/autopilot/SKILL.md` reflects the richer internal phase model
- `autopilotStage()` runtime no longer behaves as only a thin direct wrapper
- external users still see the same LoopX stage model
- autopilot still records internal control events
- autopilot remains grounded in LoopX canonical artifacts and does not fork a conflicting workflow truth
- tests prove richer internal orchestration while preserving LoopX stage semantics

## Assumptions Exposed + Resolutions

- Assumption: only the skill text needs changing
  - Resolution: rejected; runtime must also change
- Assumption: richer internal phases would force a public stage expansion
  - Resolution: rejected; they remain internal
- Assumption: stage approvals must remain manual even inside autopilot
  - Resolution: rejected; internal automatic approvals remain allowed
- Assumption: the parent autopilot should be copied literally
  - Resolution: rejected; only compatible concepts should transfer

## Pressure-pass Findings

- Earlier answer revisited: "reference the parent autopilot"
- What changed: the requirement was tightened from vague reference reuse into "import internal phase/reviewer ideas only when they still collapse back into LoopX's external stage and artifact contract"
- Resulting rule: LoopX-native orchestration remains authoritative

## Brownfield Evidence vs Inference

### Evidence

- current LoopX autopilot skill is thin
- current LoopX autopilot runtime is bounded composition
- parent autopilot skill is much richer and multi-phase

### Inference

- runtime will likely need a new internal phase/state model and stronger test coverage to absorb the richer orchestration safely

## Technical Context Findings

- LoopX autopilot currently underuses the richer stage runtimes now available locally
- the strongest design risk is split truth between internal phases and external LoopX stages
- keeping control events and canonical artifacts coherent is the central guardrail

## Recommended Handoff

Use `plan --direct .omx/specs/deep-interview-autopilot-loopx-alignment.md` as the planning source of truth for the next stage. The resulting plan should define the internal autopilot phase model, control-event semantics, artifact contract, and regression coverage.
