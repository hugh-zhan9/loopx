# PRD: Plan Runtime Ralplan Alignment

## Requirements Summary

This change aligns the `loopx plan` runtime with the already-updated consensus-first planning contract documented in `skills/plan/SKILL.md`.

The target behavior is:

- `loopx plan` runs a real internal `Planner -> Architect -> Critic` planning loop
- the loop is planning-only and stops after approved planning artifacts are complete
- the canonical approved plan remains `.LoopX/plans/prd-<slug>.md`
- the canonical test spec remains `.LoopX/plans/test-spec-<slug>.md`
- completion is blocked until the following Chinese docs also exist:
  - `docs/<slug>/架构文档.md`
  - `docs/<slug>/设计文档.md`
  - `docs/<slug>/测试计划.md`

This plan is grounded in:

- clarified requirements: `.omx/specs/deep-interview-plan-runtime-ralplan-alignment.md`
- context snapshot: `.omx/context/plan-skill-ralplan-alignment-20260430T081032Z.md`
- current planning skill contract: `skills/plan/SKILL.md`
- current runtime implementation gap: `src/workflow.mjs`, `src/cli.mjs`
- current tests: `test/workflow.test.mjs`

## Current Brownfield Facts

- `skills/plan/SKILL.md` already declares `plan` as consensus-first with `Planner -> Architect -> Critic`.
- `skills/ralplan/SKILL.md` has already been reduced to a compatibility alias.
- `src/workflow.mjs` `planStage()` currently only:
  - copies `spec.md`
  - writes four plan artifacts under `.LoopX/workflows/<slug>/`
  - writes `.LoopX/plans/prd-<slug>.md` and `.LoopX/plans/test-spec-<slug>.md`
  - marks `plan_package_status=complete`
- the current runtime does not track:
  - plan iteration count
  - architect review status
  - critic verdict
  - blocking docs output under `docs/<slug>/`
- `src/cli.mjs status` currently exposes clarify-specific fields, but not plan consensus progression.
- tests currently validate only the lightweight plan happy path.

## Acceptance Criteria

### Runtime behavior

- `loopx plan` executes a real internal `Planner -> Architect -> Critic` sequence.
- Architect and Critic run sequentially, never in parallel.
- any non-approve Critic verdict re-enters a bounded re-review loop, up to 5 iterations.
- the runtime stays within planning and does not launch `build`, `autopilot`, `ralph`, or `team`.
- CLI accepts planning-source/runtime flags required by the contract:
  - `loopx plan <slug>`
  - `loopx plan --direct <spec-path>`
  - `loopx plan --interactive <slug|spec>`
  - `loopx plan --deliberate <slug|spec>`

### Artifact contract

- the canonical approved plan is `.LoopX/plans/prd-<slug>.md`
- the canonical test spec is `.LoopX/plans/test-spec-<slug>.md`
- the runtime also writes these blocking Chinese docs:
  - `docs/<slug>/架构文档.md`
  - `docs/<slug>/设计文档.md`
  - `docs/<slug>/测试计划.md`
- `plan` is not complete until all five outputs exist and Critic has approved.
- the three `docs/<slug>/` outputs are written in Chinese, not only named in Chinese.
- review-cycle evidence is persisted under the workflow so plan progression is inspectable.

### State machine

- plan runtime state is machine-checkable and includes:
  - `plan_current_iteration`
  - `plan_max_iterations`
  - `plan_consensus_mode`
  - `plan_deliberate_mode`
  - `plan_principles_resolved`
  - `plan_options_reviewed`
  - `plan_architect_review_status`
  - `plan_critic_verdict`
  - `plan_acceptance_criteria_testable`
  - `plan_verification_steps_resolved`
  - docs artifact paths and docs completion status
  - planner / architect / critic artifact paths
- `src/cli.mjs status` shows plan-stage progress rather than only generic artifact absence.

### Verification

- unit and integration tests prove the runtime no longer completes `plan` without consensus review and required docs
- tests prove Critic rejection keeps the workflow in plan rather than unblocking build
- tests prove docs path/filename contract exactly matches `docs/<slug>/架构文档.md`, `设计文档.md`, `测试计划.md`
- tests prove the docs outputs contain Chinese content rather than placeholder English-only copies
- tests prove runtime can be exercised deterministically without requiring live subagent calls in test runs

## Non-goals

- do not add execution orchestration to `plan`
- do not widen scope into `build`, `review`, or `autopilot` runtime redesign
- do not move approved plan artifacts out of `.LoopX/plans/`
- do not make docs optional or best-effort
- do not reintroduce a public `team` planning surface into LoopX

## Decision Boundaries

- runtime may internally orchestrate planner/architect/critic agents
- runtime must stop after approved planning artifacts are complete
- execution transitions remain a separate explicit step after planning
- the docs contract is fixed to `docs/<slug>/`
- the three Chinese doc filenames are fixed and testable

## RALPLAN-DR Summary

### Principles

1. Runtime behavior must match the published planning contract.
2. Planning stays planning-only; execution remains a separate control plane.
3. Completion must be machine-checkable rather than inferred from a single `plan_package_status`.
4. Human-facing docs are part of the planning contract, not post-processing.
5. Keep the diff scoped to `plan` runtime, status reporting, and tests.
6. Orchestration must be adapter-driven so production runtime and tests can share one stage machine without flaky live-agent dependencies.

### Decision Drivers

1. The current skill/runtime mismatch is a product-contract bug.
2. The user explicitly requires approved plan plus Chinese docs as blocking outputs.
3. Existing clarify/build/review behavior should remain stable while plan runtime is upgraded.
4. The implementation must be testable without real Codex-native subagent availability.

### Viable Options

#### Option A: Embed real Planner / Architect / Critic orchestration directly into `planStage()`

Pros:

- closes the skill/runtime mismatch in the smallest runtime surface
- keeps state and artifact ownership inside the existing workflow engine
- allows exact gating against plan artifacts and docs outputs
- supports one canonical state machine with swappable execution adapters

Cons:

- requires adding orchestration result handling to a runtime that is currently deterministic and single-path
- requires new test seams for agent outcomes

#### Option B: Keep `planStage()` lightweight and add a wrapper command that simulates consensus around it

Pros:

- lower change risk inside the existing workflow engine
- easier to add around the current implementation quickly

Cons:

- preserves the core mismatch because runtime truth still lives in the lightweight path
- increases drift between wrapper behavior and canonical stage behavior
- makes status/debugging harder because plan truth is split across layers

### Option Decision

Choose **Option A**.

Why:

- the bug is specifically that canonical `plan` runtime does not match the contract
- a wrapper would preserve duplicate truths
- the required plan-state fields and docs gating naturally belong in the stage runtime itself

## ADR

### Decision

Implement `loopx plan` as a real planning orchestration stage inside the existing workflow runtime, with explicit planner/architect/critic state, bounded re-review, and blocking Chinese docs outputs under `docs/<slug>/`.

### Drivers

- published `plan` contract is already consensus-first
- approved plan plus Chinese docs are required outputs
- build/autopilot execution must remain out of scope for this change

### Alternatives considered

- wrapper-style consensus around the current lightweight `planStage()`
- leaving runtime lightweight and treating the skill text as aspirational

### Why chosen

This is the smallest change that makes runtime truth match the contract the product already exposes.

### Consequences

- `planStage()` will gain orchestration sequencing and additional state fields
- status output will become richer for plan-stage introspection
- tests will need seams for consensus outcomes and docs blocking
- docs generation becomes part of plan completion semantics
- runtime will need an explicit orchestration adapter boundary to separate production agent calls from deterministic tests

### Follow-ups

- after runtime alignment lands, reevaluate whether `plan` needs explicit interactive approval surfaces in CLI
- later execution-mode planning may consume the richer plan artifacts, but that is out of scope here

## Implementation Plan

1. Extend plan runtime state and artifact schema in `src/workflow.mjs`.
   - add plan-specific state fields
   - add docs artifact path tracking
   - add review artifact path tracking
   - add completion blockers for Critic approval and Chinese docs existence

2. Introduce a planning orchestration adapter.
   - define a runtime-facing adapter contract for planner / architect / critic execution
   - production adapter: real agent-backed planning orchestration
   - test adapter: deterministic fixture-based outcomes for unit/integration tests
   - fail clearly when production runtime lacks the capabilities required for real agent orchestration

3. Add plan orchestration sequencing to the runtime.
   - planner draft step
   - architect review step
   - critic gate step
   - bounded iterate/reject loop
   - persist review evidence for each step
   - stop at approved plan outputs

4. Add artifact writers for the required docs outputs.
   - write `docs/<slug>/架构文档.md`
   - write `docs/<slug>/设计文档.md`
   - write `docs/<slug>/测试计划.md`
   - ensure docs are generated in Chinese from the same approved planning source, not as unrelated post-hoc files
   - keep `.LoopX/plans/prd-<slug>.md` and `.LoopX/plans/test-spec-<slug>.md` canonical

5. Upgrade CLI/status visibility.
   - expose plan iteration and review state
   - expose direct/deliberate/interactive planning inputs
   - expose missing docs blockers distinctly from generic missing artifacts

6. Expand regression coverage.
   - happy-path consensus approval
   - architect/critic non-approve loop
   - docs-blocked completion
   - Chinese docs content checks
   - adapter-driven deterministic review outcomes
   - exact docs path/filename checks
   - no execution launch from plan

## Touchpoints

- `src/workflow.mjs`
- `src/cli.mjs`
- `src/plan-runtime.mjs` or an equivalent new orchestration adapter module
- `test/workflow.test.mjs`
- `templates/plan.md`
- `templates/architecture.md`
- `templates/development-plan.md`
- `templates/test-plan.md`
- optional new templates for Chinese docs under `docs/<slug>/`

## Risks

- if orchestration results are not modeled explicitly, tests may become flaky or over-mocked
- if docs generation is coupled too tightly to approval sequencing, retries may overwrite useful draft output unexpectedly
- if status reporting is partial, plan debugging will remain opaque even after the runtime change
- if production runtime lacks a stable agent-execution adapter, real plan orchestration may work in docs but fail in normal CLI use
