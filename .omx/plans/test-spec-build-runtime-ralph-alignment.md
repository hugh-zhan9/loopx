# Test Spec: Build Runtime Ralph Alignment

## Purpose

Validate that `loopx build` behaves like a Ralph-style execution runtime while preserving independent `review` and keeping `execution-record.md` as the sole canonical execution artifact.

## Scope

- build runtime state schema
- internal parallel lane orchestration
- fresh verification
- architect verification gate
- deslop and post-deslop regression loop
- execution-record canonical artifact rules
- review-stage separation
- CLI/status visibility

## Unit Test Categories

### 1. Build state initialization

- entering `build` initializes:
  - `build_current_iteration=1`
  - `build_run_id`
  - `build_max_iterations`
  - `build_parallel_mode=true`
  - `build_verification_status=pending`
  - `build_architect_verification_status=not-started`
  - `build_deslop_status=pending`
  - `build_regression_status=pending`
- support artifact paths are tracked in state
- approved planning input paths are tracked in state

### 2. Internal lane orchestration

- build refuses to start if approved planning inputs are missing
- build can run multiple execution / evidence / verification lanes
- lane outcomes are recorded distinctly
- lane aggregation updates canonical `execution-record.md`
- failure in one lane blocks build completion

### 3. Verification and architect gate

- build reads actual verification results rather than assuming success
- architect verification runs after verification evidence exists
- architect rejection blocks `build -> review`
- architect approval alone is insufficient if verification or regression remains red

### 4. Deslop and regression

- deslop runs by default after architect approval
- post-deslop regression must pass before build can enter review
- `--no-deslop` explicitly skips the deslop/regression-deslop stage while preserving earlier verification evidence
- deslop/regression failures keep build incomplete

### 5. Canonical artifact preservation

- `execution-record.md` remains the sole canonical execution artifact
- support artifacts do not become review gate replacements
- `execution_record_status=complete` still means canonical execution and verification evidence are complete
- canonical frontmatter fields remain present after multi-lane aggregation

### 6. Review-stage separation

- build does not self-approve review
- build does not collapse review responsibilities
- build only reaches review-ready state; review still performs provenance/evidence/completion/code-review checks

## Integration Test Categories

### 1. Happy-path Ralph-style build

- plan approved
- build enters iteration loop
- internal lanes complete
- verification passes
- architect approves
- deslop passes
- post-deslop regression passes
- execution-record becomes complete
- build becomes review-ready, not workflow-complete
- build iteration cap defaults to 10 unless explicitly overridden by runtime configuration

### 2. Architect rejection path

- verification passes
- architect rejects
- build remains incomplete
- review cannot start

### 3. Regression failure after deslop

- architect approves
- deslop runs
- regression fails
- build remains incomplete until fixed and rerun

### 4. Explicit no-deslop path

- build invoked with explicit no-deslop semantics
- deslop step is skipped
- prior successful verification evidence remains the gating basis
- review readiness still depends on architect approval and canonical execution-record completeness

### 5. Internal multi-lane aggregation path

- execution/evidence/verification lanes all produce outputs
- aggregation rolls them into one complete `execution-record.md`
- canonical evidence remains centralized

### 6. Review separation path

- build reaches review-ready state
- review remains a separate stage
- build does not mark workflow complete

## Manual Smoke Checks

1. Start from a workflow with approved `plan -> build`.
2. Run `loopx build <slug>`.
3. Confirm build enters a multi-step execution loop rather than only drafting `execution-record.md`.
4. Confirm status shows build iteration, architect gate, deslop, regression, and blockers.
5. Confirm `execution-record.md` is the single canonical execution artifact.
6. Confirm review does not start until build gates are satisfied.
7. Confirm workflow is not marked complete after build alone.

## Exit Criteria

- build runtime unit tests pass
- happy-path integration test passes
- architect rejection path passes
- deslop regression failure path passes
- no-deslop path passes
- multi-lane aggregation path passes
- review separation path passes

## Suggested Verification Commands

```bash
node --test test/workflow.test.mjs
node src/cli.mjs status <slug>
```
