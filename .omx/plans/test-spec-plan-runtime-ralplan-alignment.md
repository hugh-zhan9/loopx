# Test Spec: Plan Runtime Ralplan Alignment

## Purpose

Validate that `loopx plan` runtime actually behaves like the published consensus-first planning contract, and does not complete until the approved plan plus required Chinese docs outputs exist.

## Scope

- plan runtime state schema
- planner/architect/critic sequencing
- bounded re-review loop
- approved-plan artifact generation
- docs blocking contract under `docs/<slug>/`
- CLI status visibility
- non-execution stop behavior

## Unit Test Categories

### 1. Plan state initialization

- entering `plan` initializes:
  - `plan_current_iteration=1`
  - `plan_max_iterations=5`
  - `plan_consensus_mode=true`
- `plan_architect_review_status=not-started`
- `plan_critic_verdict=none`
- plan docs artifact paths are tracked in state
- planner / architect / critic review artifact paths are tracked in state

### 2. Planner artifact generation

- planner draft writes or refreshes:
  - `.LoopX/workflows/<slug>/plan.md`
  - `.LoopX/workflows/<slug>/architecture.md`
  - `.LoopX/workflows/<slug>/development-plan.md`
  - `.LoopX/workflows/<slug>/test-plan.md`
  - `.LoopX/plans/prd-<slug>.md`
  - `.LoopX/plans/test-spec-<slug>.md`
  - `docs/<slug>/架构文档.md`
  - `docs/<slug>/设计文档.md`
  - `docs/<slug>/测试计划.md`
- the three docs outputs contain Chinese content, not only Chinese filenames

### 3. Architect/Critic sequencing

- Critic cannot run before Architect review completes
- Architect and Critic outcomes are recorded distinctly
- review evidence artifacts exist for planner / architect / critic steps
- plan completion is blocked while:
  - architect review is incomplete
  - critic verdict is not `approve`

### 4. Re-review loop

- Critic `iterate` returns the workflow to another planner revision cycle
- Critic `reject` also blocks completion and remains inside plan
- iteration count increments on each closed loop
- plan fails or reports explicit residual risk when max iterations are exhausted
- deterministic test fixtures can drive review outcomes without live agent availability

### 5. Docs completion blocking

- even with approved `.LoopX/plans/prd-<slug>.md`, missing any of:
  - `docs/<slug>/架构文档.md`
  - `docs/<slug>/设计文档.md`
  - `docs/<slug>/测试计划.md`
  keeps plan incomplete
- filenames and directory are exact, not fuzzy
- docs containing English-only placeholders fail the docs-completion gate

### 6. Non-execution behavior

- `plan` does not automatically invoke `build`
- `plan` does not automatically invoke `autopilot`
- no execution transition is recorded when plan completes

### 7. CLI planning flags

- `loopx plan --direct <spec-path>` works
- `loopx plan --interactive ...` is parsed and reflected in runtime state
- `loopx plan --deliberate ...` is parsed and reflected in runtime state

## Integration Test Categories

### 1. Happy-path consensus plan

- clarify approved
- plan enters planner draft
- architect review completes
- critic approves
- canonical plan/test-spec artifacts exist
- Chinese docs exist under `docs/<slug>/`
- Chinese docs contain Chinese headings/body text
- state marks plan complete and still remains in planning scope only

### 2. Critic iterate path

- critic returns `iterate`
- planner revision runs again
- architect re-review runs
- critic later approves
- final state shows iteration count > 1
- review evidence artifacts show both iterations

### 3. Docs-blocked path

- critic approves
- delete or omit one required docs file
- plan remains incomplete with a docs-specific blocker

### 3a. Docs-language-blocked path

- critic approves
- replace one required docs file with English-only placeholder content
- plan remains incomplete with a docs-language-specific blocker

### 4. CLI status visibility

- `loopx status <slug>` shows:
  - current plan iteration
  - architect review status
  - critic verdict
  - missing docs outputs if any
- status remains useful without opening artifacts manually

## Manual Smoke Checks

1. Start from an approved clarify workflow.
2. Run `loopx plan <slug>`.
3. Confirm runtime records planner, architect, and critic progression rather than jumping directly to `plan_package_status=complete`.
4. Confirm `.LoopX/plans/prd-<slug>.md` and `.LoopX/plans/test-spec-<slug>.md` are written.
5. Confirm `docs/<slug>/架构文档.md`, `设计文档.md`, and `测试计划.md` are written in Chinese.
6. Confirm review evidence artifacts exist for planner, architect, and critic.
7. Confirm `loopx status <slug>` exposes plan-stage review status.
8. Confirm no execution stage starts automatically.

## Exit Criteria

- all plan runtime unit tests pass
- consensus-path integration test passes
- iterate-path integration test passes
- docs-blocking tests pass
- docs-language-blocking tests pass
- CLI/status assertions pass
- no unintended execution handoff occurs

## Suggested Verification Commands

```bash
node --test test/workflow.test.mjs
node src/cli.mjs status <slug>
```
