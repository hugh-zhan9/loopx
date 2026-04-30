# PRD: Autopilot LoopX Alignment

## Requirements Summary

This change upgrades LoopX `autopilot` by referencing the richer autonomous orchestration ideas from `/Users/zhangyukun/project/oh-my-codex/skills/autopilot/SKILL.md`, while keeping LoopX's stage model and artifact contract authoritative.

The target behavior is:

- upgrade both `skills/autopilot/SKILL.md` and `autopilotStage()` runtime
- preserve the external user-facing LoopX stage model:
  - `clarify`
  - `plan`
  - `build`
  - `review`
- allow richer internal autopilot phases such as:
  - expansion
  - planning
  - execution
  - QA
  - validation
- keep internal automatic stage approvals and record them as control events
- remain LoopX-native rather than a literal port of the parent autopilot

This plan is grounded in:

- clarified requirements: `.omx/specs/deep-interview-autopilot-loopx-alignment.md`
- context snapshot: `.omx/context/autopilot-loopx-alignment-20260430T101034Z.md`
- current LoopX autopilot skill/runtime: `skills/autopilot/SKILL.md`, `src/workflow.mjs`
- parent reference autopilot: `/Users/zhangyukun/project/oh-my-codex/skills/autopilot/SKILL.md`
- current LoopX stage runtimes: `clarify`, `plan`, `build`, `review`

## Current Brownfield Facts

- current LoopX `autopilot` skill is a thin bounded composition description
- current `autopilotStage()` does a direct happy-path composition:
  - internally approve `clarify -> plan`
  - run `plan`
  - internally approve `plan -> build`
  - run `build`
  - overwrite or finalize `execution-record.md`
  - internally approve `build -> review`
  - run `review`
  - internally approve `review -> done`
- current `autopilot` writes `.LoopX/autopilot/<slug>/run.json`
- current `autopilot` does not model richer internal phases like expansion, QA, or validation explicitly
- LoopX `plan` and `build` runtimes are already being strengthened and should become reusable internal phase building blocks rather than bypass targets

## Acceptance Criteria

### Skill and runtime scope

- `skills/autopilot/SKILL.md` reflects the richer internal phase model
- `plugins/loopx/skills/autopilot/SKILL.md` mirrors the canonical skill
- `autopilotStage()` implements more than a thin direct wrapper

### External stage stability

- external user-facing stage semantics remain:
  - `clarify`
  - `plan`
  - `build`
  - `review`
- richer internal phases remain autopilot internals and do not create a new public stage family

### Internal autopilot model

- autopilot may introduce internal phases such as:
  - expansion
  - planning
  - execution
  - QA
  - validation
- internal phases map back onto LoopX stage truth rather than forking it
- autopilot may consume stage approvals automatically and must record them as control events
- internal phase state must be explicit and separate from external stage state so the two do not drift

### Artifact and control-plane contract

- LoopX canonical artifacts remain authoritative:
  - clarify spec artifacts
  - plan artifacts
  - build canonical `execution-record.md`
  - review canonical `review-report.md`
- autopilot continues to write `.LoopX/autopilot/<slug>/run.json`
- autopilot may add richer orchestration metadata, but must not replace stage artifacts with a conflicting parallel truth
- `run.json` should carry internal phase progression, blockers, and control events without becoming the primary truth for stage readiness

### Runtime behavior

- expansion-like intake may reuse existing deep-interview spec when present instead of blindly re-expanding
- planning phase should use the strengthened LoopX `plan` runtime rather than a separate incompatible planner
- execution/QA should integrate with the strengthened LoopX `build` runtime
- validation should complement, not replace, LoopX `review`
- one autopilot invocation still authorizes one bounded autopilot run

## Non-goals

- do not introduce a new external public stage family
- do not bypass LoopX canonical stage artifacts
- do not literally copy the parent autopilot where it conflicts with LoopX runtime contracts
- do not widen this effort into unrelated redesign of clarify/plan/build/review beyond what autopilot integration requires

## Decision Boundaries

- both autopilot skill and runtime are in scope
- internal richer phases are allowed
- public LoopX stage surface remains unchanged
- internal automatic approvals remain allowed and must be recorded
- parent autopilot concepts are reference input, not the final source of truth

## Constraints

- LoopX stage runtimes are the canonical substrate
- `autopilot` must remain inspectable through control events and runtime artifacts
- richer internal behavior must not create a second contradictory workflow truth
- tests must remain deterministic without needing live external orchestration dependencies

## RALPLAN-DR Summary

### Principles

1. Keep LoopX stage truth authoritative.
2. Let `autopilot` deepen internally without expanding the public stage surface.
3. Prefer composition over duplicate orchestration logic where LoopX stage runtimes are already strong enough.
4. Record internal autopilot control decisions explicitly.
5. Do not let richer internal phases fragment canonical artifacts.
6. Keep the implementation testable through explicit runtime adapters or phase modeling seams.
7. Separate internal phase state from public stage state explicitly.

### Decision Drivers

1. The current LoopX autopilot is too thin compared with the intended autonomous behavior.
2. The user explicitly wants both skill and runtime upgraded.
3. External LoopX stage semantics must remain stable.
4. Internal automatic stage approvals remain acceptable when recorded as control events.
5. Parent autopilot concepts should be adapted, not copied blindly.
6. Internal phase richness must stay inspectable and non-contradictory.

### Viable Options

#### Option A: Strengthen LoopX autopilot as a richer internal phase orchestrator over existing LoopX stages

Pros:

- preserves one authoritative stage/runtime truth
- reuses strengthened LoopX `plan` and `build` runtimes
- allows richer autonomous behavior without expanding public stage complexity

Cons:

- requires a new internal phase/state model
- requires careful coordination between phase metadata and stage artifacts

#### Option B: Port the parent autopilot model almost literally and loosely map it back to LoopX artifacts

Pros:

- faster conceptual reuse from the parent implementation
- richer autonomy model arrives quickly on paper

Cons:

- high risk of split truth between parent-style phases and LoopX stage contracts
- likely to bypass or duplicate strengthened local stage runtimes
- harder to keep status, artifacts, and tests coherent

### Option Decision

Choose **Option A**.

Why:

- it preserves LoopX's local authority over stage truth and artifacts
- it still allows substantial internal-phase enrichment
- it minimizes contract drift between autopilot and the strengthened stage runtimes

## ADR

### Decision

Implement LoopX `autopilot` as a richer internal phase orchestrator that reuses LoopX stage runtimes and artifacts, while keeping the public stage model unchanged and recording internal automatic approvals as control events.

### Drivers

- richer autonomy is required
- external LoopX stage simplicity must remain
- canonical stage artifacts must remain the source of truth

### Alternatives considered

- literal parent-autopilot port
- leaving LoopX autopilot as a thin happy-path composition surface

### Why chosen

This is the smallest design that materially strengthens autopilot without forking the product contract.

### Consequences

- `autopilotStage()` will gain explicit internal phase/state handling
- status and `run.json` may become richer
- tests will need stronger coverage for internal phase progression and control-event integrity
- strengthened `plan` and `build` runtimes become foundational dependencies for autopilot
- a dedicated internal phase adapter/state boundary may be needed to keep orchestration deterministic and testable

### Follow-ups

- once runtime alignment lands, update skill/docs and plugin mirrors together
- later decide whether additional reviewer roles should be imported into LoopX review proper, rather than staying autopilot-internal

## Internal Phase Model

Autopilot should model at least:

- `expansion`
- `planning`
- `execution`
- `qa`
- `validation`

Mapping rule:

- internal phases are not public stages
- internal phases must map back onto LoopX stage truth and canonical artifacts

Suggested phase-to-stage alignment:

- `expansion` -> clarify preparation / clarified-spec reuse
- `planning` -> LoopX `plan`
- `execution` + `qa` -> LoopX `build`
- `validation` -> pre-review orchestration evidence plus LoopX `review`

Implementation guardrail:

- internal phase state should be owned in a dedicated autopilot runtime structure or adapter, not inferred indirectly from stage states

## Control Events

Autopilot must continue to record internal control events at minimum for:

- `clarify -> plan`
- `plan -> build`
- `build -> review`
- `review -> done`

If richer internal phases create additional internal checkpoints, they may be recorded in `run.json`, but they must not obscure the stage-level control events.

## Implementation Plan

1. Upgrade skill contracts.
   - rewrite `skills/autopilot/SKILL.md`
   - mirror to `plugins/loopx/skills/autopilot/SKILL.md`

2. Introduce an internal autopilot phase model in runtime.
   - explicit internal phase progression
   - reusable context/spec intake
   - state fields for current phase, phase results, and blockers
   - dedicated phase-state/adaptation seam so tests can drive internal-phase outcomes deterministically

3. Rewire `autopilotStage()` around LoopX-native stage runtimes.
   - reuse `clarify` or an existing deep-interview spec when available
   - reuse strengthened `plan`
   - reuse strengthened `build`
   - keep `review` independent while allowing richer validation preparation before it

4. Expand `run.json` and status/reporting.
   - preserve stage-level control events
   - add internal phase metadata without replacing canonical artifacts

5. Expand regression coverage.
   - richer internal phase happy path
   - clarified-spec reuse path
   - plan/build integration path
   - validation failure path
   - control-event integrity checks

## Touchpoints

- `skills/autopilot/SKILL.md`
- `plugins/loopx/skills/autopilot/SKILL.md`
- `src/workflow.mjs`
- `src/cli.mjs`
- `test/workflow.test.mjs`

## Risks

- if internal phases are not clearly separated from public stages, user-facing semantics will drift
- if autopilot bypasses strengthened `plan` or `build`, stage truth will fork again
- if `run.json` becomes the real source of truth instead of an orchestration ledger, canonical stage artifacts will be undermined
