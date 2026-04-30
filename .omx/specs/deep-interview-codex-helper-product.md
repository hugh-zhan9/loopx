# Deep Interview Spec: codex-helper product

## Metadata

- Profile: `standard`
- Context type: `brownfield`
- Readiness: `plan-ready`

## Intent

Build `codex-helper` as an independent workflow product for Codex CLI users doing day-to-day feature development.

The product must reduce requirement drift and unstable implementation by enforcing a stronger staged workflow than simple prompt-only use.

## Desired Outcome

Provide a workflow product whose default user journey is:

`clarify -> plan -> build/team -> review`

where each stage has its own dedicated skill, produces structured artifacts, and is governed by explicit stage gates.

## In Scope

- A dedicated stage surface for each of:
  - `clarify`
  - `plan`
  - `build`
  - `team`
  - `review`
- Structured per-stage artifacts
- Local state management that always exposes current stage and missing requirements
- Stage-gating rules that block invalid progression
- Review rollback routing
- Execution evidence capture for `build` and `team`
- A mandatory V1 `team` path with actual multi-agent parallelism

## Out of Scope / Non-goals

- Compatibility layers or alias mapping to other workflow products
- Deep IDE / GitHub / CI integration
- Enterprise auth, approvals, or governance systems
- Project-management features such as boards, planning, or reporting
- A generic standalone code-review platform
- Full autonomous repair of all implementation failures

## Workflow Contract

### `clarify`

- Finds ambiguity points in the user requirement
- Resolves those ambiguity points with the user
- Must not pass to `plan` while ambiguity remains unresolved
- Outputs a structured spec

### `plan`

- Converts the approved spec into an execution package
- Must output at least:
  - execution plan
  - technical architecture / design
  - development plan
  - test plan

### `build`

- Executes using the plan artifacts as the source of truth
- Must leave multiple fine-grained verification records

### `team`

- Executes using the same plan artifacts as the source of truth
- Must include:
  - real parallel multi-agent execution
  - leader / worker structure
  - tmux / worktree runtime
  - task dispatch and aggregation
  - independent verification
- Minimum topology:
  - `leader + 2 workers + 1 verifier`
- Worker scaling:
  - may increase with task decomposition
  - preferred maximum is `5` workers

### `review`

- Performs independent whole-code review
- Must not collapse into a duplicate of `build/team`
- Must prepare a clear go / no-go result and a rollback suggestion when needed

## Decision Boundaries

The product may recommend, but must not automatically decide:

- whether to enter the next stage
- whether to choose `build` or `team`
- whether to roll back to a previous stage
- how to proceed after `review` fails

## Testable Acceptance Criteria

- `clarify` blocks transition to `plan` when unresolved ambiguity exists
- `clarify` outputs a structured spec artifact
- `plan` outputs a complete planning document package
- `build/team` reference plan artifacts rather than improvising
- `build/team` leave multiple fine-grained verification records
- `review` is independent from `build/team`
- The user can always tell the current stage and missing prerequisites
- The workflow is visibly more stable than simple prompt-only use

## Required Delivery Outputs

### For `build`

- code result
- execution record
- verification result
- review input material

### For `team`

- code result
- build/team execution record
- verification result
- review input material
- rollback recommendation to `plan` when execution fails

## Assumptions Exposed

- `team` might be deferrable to V1.1
  - rejected: `team` is required in V1 because efficiency improvement is a necessary product scenario

## Planning Handoff

The next stage should define:

- the exact stage-skill contract for each of the five skills
- the exact artifact schema and file layout
- the state-machine rules and transition gates
- the minimum runtime contract for `team`
- the verification contract for `build/team/review`
