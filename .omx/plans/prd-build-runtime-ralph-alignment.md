# PRD: Build Runtime Ralph Alignment

## Requirements Summary

This change aligns the public `loopx build` stage with the Ralph-style execution discipline documented in `skills/ralph/SKILL.md`, while keeping the public LoopX stage surface unchanged.

The target behavior is:

- `loopx build` becomes a true Ralph-style execution runtime
- the public stage name remains `build`
- `build` may internally parallelize execution / evidence / verification lanes
- `build` performs fresh verification, architect verification, deslop, and regression re-verification
- `build` still hands off to an independent `review` stage
- `execution-record.md` remains the sole canonical execution and verification artifact

This plan is grounded in:

- clarified requirements: `.omx/specs/deep-interview-build-runtime-ralph-alignment.md`
- context snapshot: `.omx/context/build-runtime-ralph-alignment-20260430T092953Z.md`
- current skill contract: `skills/build/SKILL.md`
- current runtime behavior: `src/workflow.mjs`
- current execution artifact template: `templates/execution-record.md`
- current tests: `test/workflow.test.mjs`
- Ralph reference contract: `skills/ralph/SKILL.md`

## Current Brownfield Facts

- `skills/build/SKILL.md` is currently a minimal execution-stage description and does not describe Ralph-style semantics.
- `src/workflow.mjs` `buildStage()` currently:
  - requires approved `plan -> build`
  - writes a draft `execution-record.md`
  - sets `execution_record_status=partial`
  - stops without any execution loop, verification, architect gate, or re-verification cycle
- `reviewStage()` already treats `execution-record.md` as the canonical evidence gate for `build -> review`.
- There is no public `team` execution lane in the current LoopX release surface.
- `skills/ralph/SKILL.md` includes:
  - persistence loop
  - internal parallel delegation
  - fresh verification
  - architect verification
  - deslop
  - regression re-verification
  - clean completion lifecycle

## Acceptance Criteria

### Runtime behavior

- `build` starts only from approved planning inputs:
  - approved `plan -> build` transition
  - `.LoopX/plans/prd-<slug>.md`
  - `.LoopX/plans/test-spec-<slug>.md`
  - workflow-local plan artifacts required by the execution lane
- `loopx build` runs as a persistence loop until:
  - execution is complete and verified, or
  - a real blocker remains, or
  - the bounded iteration cap is reached with explicit failure semantics
- the default iteration cap aligns with Ralph semantics: `build_max_iterations=10`
- `build` may internally run multiple execution / evidence / verification lanes in parallel
- `build` does not expose new public `team`, `ultrawork`, or `ralph` commands
- `build` does not auto-complete the workflow; it still stops at the `review` handoff boundary

### Verification and gating

- `build` performs fresh verification and reads actual verification output
- `build` performs architect verification as a hard pre-review quality gate
- if architect verification fails, `build` remains incomplete and cannot enter `review`
- `build` performs a deslop pass unless explicitly skipped through an explicit build flag
- `build` performs regression re-verification after deslop and remains incomplete until post-deslop verification passes

### Artifact contract

- `execution-record.md` remains the sole canonical execution + verification artifact
- canonical review gating continues to depend on `execution_record_status=complete`
- any extra runtime-support artifacts for progress, lane evidence, or architect verification must not replace `execution-record.md`
- auxiliary artifacts may exist under the workflow root for runtime inspection and status reporting
- `execution-record.md` must continue to carry the canonical machine-checkable fields:
  - `schema_version`
  - `workflow_id`
  - `run_id`
  - `stage`
  - `actor_id`
  - `actor_role`
  - `plan_digest`
  - `started_at`
  - `completed_at`
  - `checkpoint_count`
  - `evidence_manifest`

### Review-stage separation

- `review` remains independent from `build`
- `build` architect verification is limited to execution-quality gating
- `review` continues to own:
  - provenance checks
  - evidence completeness checks
  - completion vs rollback decisions
  - code-review

### CLI and state visibility

- `loopx status <slug>` exposes build iteration, lane progress, architect gate status, deslop status, regression status, and blockers
- build runtime state is machine-checkable and durable across retries

## Non-goals

- do not introduce new public `team`, `ultrawork`, or `ralph` surfaces
- do not collapse or remove the independent `review` stage
- do not split `execution-record.md` into multiple canonical execution artifacts
- do not widen this work into `autopilot` or `plan` runtime redesign

## Decision Boundaries

- internal parallelism is allowed inside `build`
- the external public stage remains one `build` surface
- architect verification inside `build` is a pre-review execution-quality gate only
- review remains the final independent gate and explicitly includes code-review
- canonical execution artifact remains `execution-record.md`

## Constraints

- the current shallow `buildStage()` must be replaced, not only wrapped with documentation
- review independence must remain intact
- execution evidence must stay machine-checkable
- support artifacts may assist runtime/status, but must not become new canonical evidence sources
- the design must remain testable without requiring live Codex-native subagents during test runs

## RALPLAN-DR Summary

### Principles

1. Runtime behavior must match the public stage contract.
2. `build` may become internally stronger without changing the public LoopX stage surface.
3. Execution quality gates must be explicit and machine-checkable.
4. Review independence must be preserved.
5. Canonical evidence stays concentrated in `execution-record.md`.
6. Production orchestration and deterministic tests must share one stage machine through an adapter boundary.

### Decision Drivers

1. The current `build` runtime is too shallow relative to the desired execution contract.
2. The user explicitly wants a true Ralph-style runtime, not a partial subset.
3. Internal parallelism is allowed, but public stage expansion is not.
4. The final review stage must remain independent and include code-review.
5. Build must still execute strictly from approved planning artifacts rather than rediscovering scope at execution time.

### Viable Options

#### Option A: Embed Ralph-style execution semantics directly into `buildStage()`

Pros:

- closes the skill/runtime mismatch at the canonical stage boundary
- keeps one source of truth for build-state progression and review gating
- allows exact control over what is canonical versus support evidence

Cons:

- requires substantial new runtime state and adapter seams
- requires careful failure semantics for iteration, deslop, and architect rejection

#### Option B: Keep `buildStage()` lightweight and wrap it with an external Ralph-like runner

Pros:

- smaller immediate change inside the workflow engine
- faster to prototype outside the current runtime

Cons:

- preserves split truth between public `build` stage and actual execution behavior
- makes status/debugging harder because execution truth is distributed
- risks the same drift problem that existed for `plan`

### Option Decision

Choose **Option A**.

Why:

- the product bug is specifically that canonical `build` runtime does not match the intended stage behavior
- an external wrapper would preserve duplicate truths
- the required architect/deslop/regression gates belong to the stage runtime itself

## ADR

### Decision

Implement Ralph-style execution semantics directly inside LoopX `build` runtime, with internal parallel lanes, explicit verification and architect gating, optional deslop skipping only through an explicit build flag, and post-deslop regression re-verification. Keep `execution-record.md` as the sole canonical execution artifact and keep `review` independent.

### Drivers

- public `build` stage must become the real execution lane
- internal parallelism is allowed
- review remains independent and code-review-capable
- canonical execution evidence must not fragment

### Alternatives considered

- external Ralph-like wrapper around the current lightweight `buildStage()`
- partial adoption of only verification gates without persistence/parallelism

### Why chosen

This is the smallest design that actually makes `build` behave like the intended stage rather than leaving the public runtime shallow and shifting complexity elsewhere.

### Consequences

- `buildStage()` will grow into a real execution loop
- runtime will need new build-specific state fields
- status output will become richer for build-stage introspection
- tests will need deterministic orchestration fixtures
- auxiliary runtime artifacts will exist, but canonical evidence will stay centralized

### Follow-ups

- after runtime alignment, update `skills/build/SKILL.md` and its plugin mirror to match the implemented behavior
- later, decide whether a dedicated CLI flag set for build should include `--no-deslop` only or broader Ralph parity

## Runtime State Machine

Build runtime should track at minimum:

- `build_current_iteration`
- `build_max_iterations`
- `build_run_id`
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
- `context_snapshot_path`

Gate rules:

- `build` cannot enter `review` while any lane is incomplete
- `build` cannot enter `review` while fresh verification is failing
- `build` cannot enter `review` while architect verification is not approved
- `build` cannot enter `review` while deslop is pending, unless explicitly skipped
- `build` cannot enter `review` while post-deslop regression is failing
- `execution-record.md` must be complete before `build -> review`

## Artifact Contract

### Canonical artifact

- `execution-record.md`

Required canonical contents remain:

- changes
- checkpoint log
- execution evidence
- verification evidence
- limitations
- machine-checkable frontmatter including run id, actor id, actor role, evidence manifest, and checkpoint count

### Support artifacts

Support artifacts are allowed for runtime introspection, for example:

- per-iteration progress files
- lane evidence summaries
- architect verification summaries
- deslop summaries
- regression summaries

These must not replace `execution-record.md` as the canonical review input.

## Implementation Plan

1. Extend `build` skill and CLI contract.
   - update `skills/build/SKILL.md`
   - mirror to plugin build skill
   - add build flags needed for Ralph-style runtime, especially explicit `--no-deslop` handling if adopted

2. Introduce a build orchestration adapter.
   - production adapter: real internal lane orchestration
   - test adapter: deterministic execution / architect / regression outcomes
   - keep one stage machine for both

3. Rebuild `buildStage()` around the Ralph-style loop.
   - initialize build iteration state
   - validate approved planning inputs before entering the loop
   - run internal parallel lanes
   - aggregate evidence into `execution-record.md`
   - run fresh verification
   - run architect gate
   - run deslop
   - rerun regression verification
   - stop only when review handoff gates are satisfied

4. Expand status/reporting.
   - expose build iteration, lane progress, architect gate, deslop state, regression state, and blockers
   - keep recommended next action concrete

5. Expand regression coverage.
   - happy path
   - architect rejection path
   - deslop regression failure path
   - no-deslop explicit skip path
   - internal multi-lane aggregation path
   - review-stage separation path

## Touchpoints

- `skills/build/SKILL.md`
- `plugins/loopx/skills/build/SKILL.md`
- `src/workflow.mjs`
- `src/cli.mjs`
- `src/build-runtime.mjs` or equivalent new adapter module
- `templates/execution-record.md`
- `test/workflow.test.mjs`

## Risks

- if lane results are not normalized, parallel execution will produce inconsistent canonical evidence
- if architect verification is modeled too loosely, build may still drift toward shallow completion claims
- if deslop/regression semantics are ambiguous, build completion will become nondeterministic
- if support artifacts begin carrying canonical truth, review gating will fragment again
