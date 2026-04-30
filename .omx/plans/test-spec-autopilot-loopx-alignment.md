# Test Spec: Autopilot LoopX Alignment

## Purpose

Validate that LoopX `autopilot` evolves from a thin bounded composition into a richer internal phase orchestrator while preserving LoopX's external stage model and canonical artifacts.

## Scope

- autopilot skill contract
- autopilot runtime phase model
- clarified-spec reuse
- LoopX stage-runtime reuse
- control-event integrity
- bounded autonomous completion

## Unit Test Categories

### 1. Skill/runtime contract alignment

- `skills/autopilot/SKILL.md` describes richer internal phases
- plugin mirror matches the canonical autopilot skill
- runtime behavior no longer reflects only a thin direct wrapper

### 2. Internal phase progression

- autopilot tracks internal phases such as:
  - expansion
  - planning
  - execution
  - qa
  - validation
- internal phase state is inspectable
- public stage semantics remain unchanged
- internal phase state is stored explicitly rather than inferred only from stage transitions

### 3. Clarified-spec reuse

- if a suitable deep-interview spec exists, autopilot can reuse it instead of re-expanding blindly
- clarified-spec reuse still records the correct stage/control semantics

### 4. Stage-runtime reuse

- planning phase uses LoopX `plan`
- execution/qa uses LoopX `build`
- validation complements LoopX `review` rather than replacing it

### 5. Control-event integrity

- stage-level control events remain recorded for:
  - `clarify -> plan`
  - `plan -> build`
  - `build -> review`
  - `review -> done`
- richer internal checkpoints do not erase or obscure stage-level control events

### 6. Canonical artifact preservation

- canonical stage artifacts remain authoritative
- `run.json` remains an orchestration ledger, not a replacement source of truth
- `run.json` contains internal phase progression and blockers without becoming the sole stage-readiness truth

### 7. Deterministic phase modeling

- tests can drive internal phase outcomes without requiring live autonomous subagents
- internal phase adapter/state seam is explicit enough for deterministic regression coverage

## Integration Test Categories

### 1. Richer happy-path autopilot

- autopilot runs with richer internal phase progression
- canonical LoopX artifacts are produced through stage runtimes
- control events are recorded
- workflow completes cleanly

### 2. Clarified-spec reuse path

- pre-existing clarified spec is reused
- autopilot skips redundant ambiguity expansion
- stage/control semantics remain correct

### 3. Plan/build integration path

- autopilot works with strengthened `plan` and `build` runtimes rather than bypassing them
- richer phase metadata still collapses back into LoopX stage truth

### 4. Validation failure path

- richer internal validation fails before final review completion
- autopilot stops with inspectable failure/blocker state rather than pretending success
- failure state shows both the internal phase blocker and the still-authoritative external stage context

## Manual Smoke Checks

1. Start with a bounded LoopX task.
2. Run `loopx autopilot <slug>`.
3. Confirm internal phase progression is richer than the previous thin wrapper.
4. Confirm public stage semantics still read as `clarify / plan / build / review`.
5. Confirm `.LoopX/autopilot/<slug>/run.json` contains stage-level control events plus richer internal phase metadata.
6. Confirm canonical stage artifacts remain the source of truth.

## Exit Criteria

- autopilot skill/runtime alignment tests pass
- rich happy-path integration passes
- clarified-spec reuse path passes
- plan/build integration path passes
- validation failure path passes
- control-event integrity checks pass

## Suggested Verification Commands

```bash
node --test test/workflow.test.mjs
node src/cli.mjs autopilot <slug>
```
