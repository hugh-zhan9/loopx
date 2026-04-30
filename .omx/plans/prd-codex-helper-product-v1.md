# PRD: codex-helper Product V1

## Requirements Summary

`codex-helper` is an independent workflow product for Codex CLI users doing day-to-day feature development. Its V1 workflow is:

`clarify -> plan -> build/team -> review`

The product goal is to outperform simple prompt-only development by reducing requirement drift and unstable implementation through explicit stage gates, structured artifacts, and verification evidence.

This plan is grounded in:

- product clarification spec: `.omx/specs/deep-interview-codex-helper-product.md`
- current CLI surface: `src/cli.mjs`
- current prototype state machine: `src/workflow.mjs`
- current artifact templates: `templates/*.md`
- current prototype documentation: `README.md`

## Current Brownfield Facts

- The current prototype already exposes CLI commands for `clarify`, `plan`, `build`, `team`, `review`, and `status`. It is implemented in `src/cli.mjs`.
- The current state machine writes workflow state under `.codex-helper/workflows/<slug>/` and creates markdown artifacts from `templates/`.
- `build` and `team` currently share the same shallow behavior: both only stamp `build-result.md` and move to `review-pending`.
- `review` currently validates placeholder removal and evidence keywords rather than independently reviewing execution outputs.
- The current prototype has no dedicated stage skills and no real team runtime.
- The current CLI argument parsing does not fully match the documented `status [slug] [--json]` contract when `--json` is passed without a slug.

## Acceptance Criteria

### Product contract

- The product exposes five first-class stage surfaces:
  - `clarify`
  - `plan`
  - `build`
  - `team`
  - `review`
- Each stage has a dedicated skill contract and a deterministic artifact contract.
- The workflow remains an independent product surface with no compatibility aliases to other workflow systems.

### Clarify stage

- `clarify` identifies ambiguity points and blocks promotion while ambiguity remains unresolved.
- `clarify` outputs a structured `spec.md` artifact rather than an informal brief.
- The user can see which ambiguity points remain unresolved.

### Plan stage

- `plan` produces a complete execution package:
  - `plan.md`
  - `architecture.md`
  - `development-plan.md`
  - `test-plan.md`
- The plan package records explicit decision drivers, alternatives, and chosen architecture.

### Build stage

- `build` executes strictly from approved plan artifacts.
- `build` records multiple fine-grained execution and verification checkpoints.
- `build` cannot self-approve stage transitions; it can only recommend next actions.

### Team stage

- `team` is available in V1 and is not deferred.
- `team` provides real parallel multi-agent execution.
- `team` includes leader / worker / verifier separation.
- `team` uses tmux / worktree orchestration.
- `team` records dispatch decisions, worker outputs, verification evidence, and aggregated delivery output.
- Minimum supported topology is `leader + 2 workers + 1 verifier`.

### Review stage

- `review` is independent from `build/team` execution.
- `review` produces a go / no-go verdict plus rollback recommendation.
- If execution is incomplete or unstable, `review` recommends rollback to `plan`.

### Global workflow behavior

- The user always sees the current stage, unmet gate conditions, and recommended next action.
- Entering the next stage, choosing `build` vs `team`, rollback, and post-review handling always require explicit user confirmation.

## RALPLAN-DR Summary

### Principles

1. Keep the workflow product independent and self-describing.
2. Make stage gates explicit, inspectable, and hard to bypass accidentally.
3. Prefer deterministic local artifacts and state over ambient session magic.
4. Treat `team` as a real execution surface, not a label on single-agent behavior.
5. Separate execution from acceptance so `review` remains an actual gate.

### Decision Drivers

1. V1 must materially reduce requirement drift compared with simple prompts.
2. V1 must include both reliability and efficiency paths, so `team` is mandatory.
3. The current prototype already has useful CLI/state/artifact scaffolding that should be upgraded rather than discarded without cause.

### Viable Options

#### Option A: Reuse the current substrate, replace the current prototype contract

Pros:

- Reuses existing CLI, state model, artifact generation, and tests.
- Preserves current brownfield momentum and file layout.
- Minimizes redundant rebuild of already-working prototype scaffolding.

Cons:

- Requires refactoring prototype naming and artifact semantics.
- Current stage machine is too permissive and needs tighter gates.
- Current `team` behavior is mostly placeholder and needs substantial build-out.

#### Option B: Rebuild around stage skills first, then add CLI/state later

Pros:

- Prioritizes the user-facing workflow surface immediately.
- Encourages stage semantics to be defined before CLI details.

Cons:

- Duplicates logic already present in the prototype.
- Risks splitting skill behavior from deterministic local state behavior.
- Makes testing and artifact enforcement harder during V1.

#### Option C: Build `team` runtime first, then retrofit the rest of the workflow

Pros:

- Tackles the hardest V1 requirement early.
- Forces runtime constraints to become concrete.

Cons:

- Leaves `clarify`, `plan`, and `review` underspecified for too long.
- High risk of overbuilding runtime before stage contract clarity is in place.
- Weak fit for the user's stated goal of reducing drift first.

### Option Decision

Choose **Option A**, with a stricter statement of what is actually being reused:

- reuse the substrate:
  - workspace layout
  - slug normalization
  - local state persistence
  - CLI entrypoint shell
- replace the contract:
  - stage schema
  - artifact schema
  - review semantics
  - team runtime contract
  - gate enforcement rules

Rejected alternatives:

- Option B invalidated because it would duplicate the current deterministic engine and delay state/gate correctness.
- Option C invalidated because it optimizes for runtime mechanics before the workflow contract is stable.

## ADR

### Decision

Use the current prototype only as the implementation substrate, then replace its embedded workflow contract with a stricter product contract: five dedicated stage surfaces, canonical product artifacts, hard stage gates, structured review evidence, and a real team runtime.

### Drivers

- Existing code already provides a useful deterministic foundation.
- The product must remain independent and explicit.
- `team` is a required V1 efficiency lane, not optional polish.

### Alternatives considered

- Skill-first rebuild from scratch
- Team-runtime-first implementation

### Why chosen

The chosen path preserves working brownfield scaffolding while avoiding semantic drag from the prototype contract. Reuse is constrained to neutral substrate concerns; product semantics are rebuilt on top of it.

### Consequences

- Some current files and artifact names will need breaking changes.
- Existing prototype workflow directories may become non-canonical under the V1 contract.
- Team runtime work remains the highest-cost V1 area.
- Tests must shift from prototype-only checks to product-contract checks.

### Follow-ups

- Define exact stage-skill contracts.
- Define final artifact schema and filenames.
- Define team runtime topology and evidence model.
- Define migration behavior for pre-V1 workflow directories.

## Retained Substrate vs Replaced Contract

### Retained substrate

- `.codex-helper/workflows/<slug>/` workspace layout
- slug normalization and path resolution
- local JSON state persistence
- top-level CLI command shell and workspace bootstrap

### Replaced contract

- `brief.md`-centric clarify semantics
- `detailed-design.md` as a required planning-stage artifact
- shallow shared `build-result.md` behavior for both `build` and `team`
- heuristic review approval based on placeholders and keywords
- permissive stage advancement behavior

## Migration Decision

V1 will treat the old prototype artifact contract as breaking and non-canonical.

Decision:

- do not preserve semantic compatibility with old workflow directories
- existing prototype workflow directories may remain on disk for reference only
- V1 commands operate on the new canonical artifact contract
- if migration tooling is later needed, it should be an explicit utility rather than hidden in stage commands

## Normative State Machine Specification

### Stage enum

- `clarify`
- `plan`
- `build`
- `team`
- `review`
- `done`

### Approval state enum

- `not-requested`
- `requested`
- `approved`
- `rejected`

### Transition enum

- `none`
- `clarify->plan`
- `plan->build`
- `plan->team`
- `build->review`
- `team->review`
- `review->plan`
- `review->done`

### Workflow state fields

- `current_stage`
- `stage_status`
- `ambiguity_items`
- `unresolved_ambiguity_count`
- `plan_package_status`
- `execution_mode_selection`
- `review_status`
- `recommended_next_action`
- `rollback_target`
- `rollback_rationale`
- `pending_user_decision`
- `requested_transition`
- `last_confirmed_transition`
- `approval.plan`
- `approval.execution`
- `approval.review`
- `approval.rollback`
- `approval.complete`
- `execution_record_status`
- `aggregation_status`
- `team_verifier_status`
- `review_verdict`
- `completion_confirmed`

### Persisted state normalization

The following fields are persisted state and must use only the exact values below:

- `current_stage`
  - value set: stage enum
- `stage_status`
  - value set: `idle`, `ready`, `blocked`, `awaiting-approval`, `in-progress`, `completed`, `failed`
- `ambiguity_items[]`
  - required entry fields: `id`, `question`, `status`, `resolution`
  - `status` value set: `open`, `resolved`
- `unresolved_ambiguity_count`
  - integer `>= 0`
  - must equal the count of `ambiguity_items[]` whose `status=open`
- `plan_package_status`
  - value set: `missing`, `partial`, `complete`
- `execution_mode_selection`
  - value set: `unset`, `build`, `team`
- `review_status`
  - value set: `not-started`, `pending-input`, `ready-for-review`, `in-review`, `approved`, `changes-requested`
- `rollback_target`
  - value set: `none`, `plan`, `build`, `team`
- `rollback_rationale`
  - value set: `null` or non-empty string
- `pending_user_decision`
  - value set: transition enum
- `requested_transition`
  - value set: transition enum
- `last_confirmed_transition`
  - value set: transition enum
  - records the most recent transition actually consumed by the engine
  - approval commands must not mutate this field directly
- `approval.plan`
- `approval.execution`
- `approval.review`
- `approval.rollback`
- `approval.complete`
  - value set: approval state enum
- `execution_record_status`
  - value set: `missing`, `partial`, `complete`
  - for `build`, `complete` means `execution-record.md` contains both execution evidence and verification evidence
- `aggregation_status`
  - value set: `not-applicable`, `missing`, `partial`, `complete`
- `team_verifier_status`
  - value set: `not-applicable`, `missing`, `pass`, `fail`
- `review_verdict`
  - value set: `none`, `approve`, `request-changes`
- `completion_confirmed`
  - value set: `true`, `false`

### Derived-only status fields

These fields may be rendered in status output, but they are not independent workflow truth:

- `recommended_next_action`
  - derived from blockers, approval state, and artifact/status completeness
  - implementations may cache it, but readers must treat the persisted structural fields as authoritative if the text is stale

### Canonical pending-decision semantics

- `approve` records permission and the requested transition.
- `approve` does **not** directly mutate `current_stage`.
- `approve` does **not** directly mutate `last_confirmed_transition`.
- Stage commands consume a matching approved transition and then mutate `current_stage`.
- “ready but waiting for approval” is represented canonically as:
  - `pending_user_decision=<target transition>`
  - `requested_transition=<target transition>`
  - relevant approval state=`requested`
- “approved but not yet executed” is represented canonically as:
  - `pending_user_decision=none`
  - `requested_transition=<target transition>`
  - relevant approval state=`approved`
- When a transition is consumed successfully:
  - `last_confirmed_transition=<target transition>`
  - `pending_user_decision=none`
- No intermediate hidden stage like prototype `review-pending` is used in V1.
- When `review` recommends rollback:
  - `rollback_target` must be populated before approval is requested
  - `rollback_rationale` must be non-empty before `approval.rollback` can move to `requested` or `approved`
- Terminal transitions follow the same rule:
  - `review -> plan` consumes `approval.rollback=approved`
  - `review -> done` consumes `approval.complete=approved`

### Execution mode selection

- `unset`
- `build`
- `team`

### Allowed transitions and blockers

| From | To | Allowed when | Blockers |
| --- | --- | --- | --- |
| `clarify` | `plan` | ambiguity count is `0` and user approves transition | unresolved ambiguity, missing `spec.md`, missing user approval |
| `plan` | `build` | plan package complete and user selects `build` | missing plan artifacts, missing user approval |
| `plan` | `team` | plan package complete and user selects `team` | missing plan artifacts, missing user approval |
| `build` | `review` | execution record is complete, embedded build verification evidence is complete, and user approves entering review | missing execution evidence, missing embedded build verification evidence, missing user approval |
| `team` | `review` | aggregate execution package and verifier output are complete and user approves entering review | missing worker outputs, missing verifier output, missing user approval |
| `review` | `done` | review approves and user confirms completion | failed review, missing user approval |
| `review` | `plan` | review recommends rollback to `plan` and user confirms rollback | missing rationale, missing user approval |

### Explicitly forbidden transitions

- `clarify -> build`
- `clarify -> team`
- `clarify -> review`
- `plan -> review`
- `build -> done`
- `team -> done`
- any automatic rollback without user confirmation

## Normative Artifact Manifest

| Artifact | Owner stage | Required | Required sections / fields | Machine-checkable fields |
| --- | --- | --- | --- | --- |
| `spec.md` | `clarify` | yes | ambiguity list, clarified answers, in-scope, non-goals, decision boundaries, success criteria | unresolved ambiguity count, stage owner, approval status |
| `plan.md` | `plan` | yes | requirements summary, deliverables, implementation steps, risks, verification | source spec path, stage owner |
| `architecture.md` | `plan` | yes | architecture intent, boundaries, options, chosen design | decision id, chosen option |
| `development-plan.md` | `plan` | yes | execution breakdown, staffing guidance, sequencing | execution mode readiness, stage owner |
| `test-plan.md` | `plan` | yes | unit, integration, end-to-end, observability checks | verification checklist status |
| `execution-record.md` | `build` / `team` | yes | changes, checkpoint log, execution evidence, verification evidence, limitations | execution mode, checkpoint count, evidence manifest, run id |
| `team-dispatch.json` | `team` | yes for `team` | assignments, worker ids, task boundaries | schema version, workflow id, run id, worker count, assignment ids |
| `team-aggregate.json` | `team leader` | yes for `team` | aggregated worker results, review input refs, aggregate status | schema version, workflow id, run id, assignment count |
| `team-verification.md` | `team verifier` | yes for `team` | aggregation summary, verifier checks, defects, pass/fail | verifier id, verdict |
| `review-report.md` | `review` | yes | verdict, evidence reviewed, findings, rollback recommendation, rationale | reviewer id, verdict, rollback target, reviewed run id |

### Canonical build verification rule

V1 uses exactly one canonical verification shape for `build`:

- `build` does **not** emit a separate build-verification artifact
- `execution-record.md` is the single canonical build execution + verification artifact
- build verification evidence must be embedded inside `execution-record.md` frontmatter/body metadata and evidence manifest
- `execution_record_status=complete` is the only build-review gate status for execution evidence completeness

`team` keeps a separate verifier-owned artifact because independence is part of the contract:

- `team-verification.md` remains mandatory for `team`
- `team_verifier_status` tracks verifier completeness independently from `execution_record_status`

### Provenance and evidence schema

The following machine-checkable fields are mandatory:

#### `execution-record.md`

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
- `evidence_manifest[]`

#### `team-verification.md`

- `schema_version`
- `workflow_id`
- `run_id`
- `verifier_id`
- `aggregate_package_ref`
- `verdict`
- `finding_count`
- `evidence_manifest[]`

#### `team-dispatch.json`

- `schema_version`
- `workflow_id`
- `run_id`
- `leader_id`
- `worker_count`
- `verifier_count`
- `assignment_manifest[]`

#### `team-aggregate.json`

- `schema_version`
- `workflow_id`
- `run_id`
- `leader_id`
- `assignment_count`
- `worker_result_manifest[]`
- `review_input_paths[]`

#### `review-report.md`

- `schema_version`
- `workflow_id`
- `review_id`
- `reviewer_id`
- `reviewed_run_id`
- `input_manifest[]`
- `verdict`
- `rollback_target`
- `rollback_rationale`
- `evidence_manifest[]`

## Team Runtime Minimum Architecture

### Runtime boundary

The deterministic workflow engine must not directly encode tmux or worktree operations. It should call a `team execution backend` boundary.

### Minimum architecture

- `leader`
  - reads approved plan artifacts
  - decomposes work
  - issues worker assignments
  - aggregates outputs
- `worker`
  - executes bounded assigned slices
  - writes structured output packages
- `verifier`
  - reviews aggregate execution package
  - emits verifier verdict and defects

### Required runtime contracts

- launcher boundary
  - accepts workflow id, execution package, requested worker count
- assignment format
  - assignment id, owner, task scope, allowed write scope, verification expectation
- worker output format
  - changed paths, execution notes, local verification evidence, unresolved issues
- verifier input package
  - aggregated worker outputs, execution record, plan references
- aggregation artifact
  - single review-ready package for `review`
- failure semantics
  - on execution failure, emit rollback recommendation to `plan`

### Implementable backend interface

The planning baseline for the team backend is:

```ts
type TeamLaunchRequest = {
  workflowId: string;
  planPaths: string[];
  requestedWorkerCount: number;
  maxWorkerCount: number;
  verifierCount: 1;
  executionMode: 'team';
  artifactRoot: string;
};

type TeamAssignment = {
  assignmentId: string;
  workerId: string;
  role: 'worker' | 'verifier';
  scope: string;
  allowedWritePaths: string[];
  requiredChecks: string[];
};

type EvidenceItem = {
  id: string;
  kind: 'command' | 'test' | 'diff' | 'artifact';
  summary: string;
  ref: string;
};

type WorkerResult = {
  assignmentId: string;
  workerId: string;
  changedPaths: string[];
  executionNotes: string[];
  evidence: EvidenceItem[];
  unresolvedIssues: string[];
};

type TeamAggregatePackage = {
  runId: string;
  workflowId: string;
  leaderId: string;
  assignments: TeamAssignment[];
  workerResults: WorkerResult[];
  reviewInputPaths: string[];
};

type VerifierResult = {
  runId: string;
  verifierId: string;
  verdict: 'pass' | 'fail';
  findings: string[];
  evidence: EvidenceItem[];
  rollbackRecommendation?: 'plan';
};
```

The implementation may use JS modules rather than TypeScript, but the request/assignment/result shapes above are the required contract.

Verifier provisioning is explicit and fixed in V1:

- exactly one verifier per `team` run
- reflected in `TeamLaunchRequest.verifierCount`
- launcher must reject `0` or `>1` verifiers in V1

### Test strategy

- use test doubles for tmux and worktree provisioning
- keep runtime contract tests separate from pure state-machine tests
- prove minimum topology launch and aggregation with deterministic fixtures

## Review Independence Contract

Review is independent only if all of the following are true:

- reviewer provenance is distinct from build/team execution provenance
- review consumes a structured evidence manifest, not only free-form text
- review can fail based on missing or weak evidence even if placeholder text is gone
- review outputs a verdict plus rollback recommendation with rationale

### Required review inputs

- approved `spec.md`
- approved planning package
- execution record
- for `build`, verification evidence embedded in `execution-record.md`
- for `team`, worker aggregation package plus verifier output

### Independence mechanism

Review independence is enforced by:

- distinct `reviewer_id` vs execution `actor_id` / `leader_id`
- mandatory input manifest tying review to concrete execution artifacts
- verdict logic operating on structured evidence manifests
- explicit rejection when provenance fields are missing or self-referential

### Disallowed review behavior

- approval on placeholder removal alone
- approval on `PASS` keyword presence alone
- self-certification by the same execution actor without independent evidence processing

## CLI Contract Correction Note

The documented `status [slug] [--json]` contract must be normalized so that:

- `status --json` returns workspace JSON
- `status <slug> --json` returns workflow JSON
- `status <slug>` returns human-readable workflow status

## Command-Level User Confirmation Contract

Critical workflow decisions must be explicitly confirmed through a separate approval control surface rather than being fused into stage execution commands.

### Approval control surface

- CLI carrier: `codex-helper approve <slug> --from <stage> --to <stage>`
- Optional execution selection: `codex-helper approve <slug> --from plan --to build|team`
- Skills remain the user-facing workflow stages, but approval is recorded by the control-plane command so the system can distinguish:
  - stage work
  - pending human decision
  - confirmed promotion

| Decision point | CLI entry | Required state fields | Blockers | Success state change |
| --- | --- | --- | --- | --- |
| enter `plan` | `codex-helper approve <slug> --from clarify --to plan` | `pending_user_decision`, `unresolved_ambiguity_count`, `requested_transition` | ambiguity count > 0, missing `spec.md` | `approval.plan=requested->approved`, `requested_transition=plan` |
| choose `build` | `codex-helper approve <slug> --from plan --to build` | `pending_user_decision`, `plan_package_status`, `execution_mode_selection` | incomplete plan package | `execution_mode_selection=build`, `approval.execution=approved` |
| choose `team` | `codex-helper approve <slug> --from plan --to team` | `pending_user_decision`, `plan_package_status`, `execution_mode_selection` | incomplete plan package | `execution_mode_selection=team`, `approval.execution=approved` |
| enter `review` from `build` | `codex-helper approve <slug> --from build --to review` | `pending_user_decision`, `execution_record_status` | missing execution evidence or embedded build verification evidence | `approval.review=requested->approved` |
| enter `review` from `team` | `codex-helper approve <slug> --from team --to review` | `pending_user_decision`, `aggregation_status`, `team_verifier_status` | missing aggregation package or verifier output | `approval.review=requested->approved` |
| rollback to `plan` | `codex-helper approve <slug> --from review --to plan` | `pending_user_decision`, `rollback_target`, `rollback_rationale` | missing rollback rationale | `approval.rollback=requested->approved`, `requested_transition=plan` |
| complete workflow | `codex-helper approve <slug> --from review --to done` | `pending_user_decision`, `review_verdict` | review not approved | `approval.complete=requested->approved`, `requested_transition=done` |

### Status contract for approvals

`status` must expose:

- current stage
- pending decision, if any
- blockers for that decision
- last confirmed transition
- recommended next action

### Approval sequencing contract

The execution flow for a gated transition is:

1. stage command finishes work and records `pending_user_decision`
2. user runs `approve`
3. `approve` records `requested_transition` and relevant `approval.*=approved`
4. next stage command validates:
   - matching approved transition exists
   - blockers are still clear
   - artifacts still satisfy gate
5. only then does the engine mutate `current_stage`
6. when the engine consumes the transition, it writes `last_confirmed_transition=<consumed transition>`

For terminal transitions, the same sequencing applies:

- `review` stage logic consumes `approval.rollback` before mutating to `plan`
- `review` stage logic consumes `approval.complete` before mutating to `done`

## Dedicated Stage Skill Registry

The product must ship stage skills from a repo-local skill surface so the workflow contract is explicit and versioned with the codebase.

### Canonical skill paths

- `skills/clarify/SKILL.md`
- `skills/plan/SKILL.md`
- `skills/build/SKILL.md`
- `skills/team/SKILL.md`
- `skills/review/SKILL.md`

### Skill-to-engine contract

| Skill | Primary engine action | Primary artifact | Must not decide automatically |
| --- | --- | --- | --- |
| `clarify` | create/update clarify state and ambiguity register | `spec.md` | promotion to `plan` |
| `plan` | create/update plan package | `plan.md`, `architecture.md`, `development-plan.md`, `test-plan.md` | `build` vs `team` choice |
| `build` | execute single-owner backend against approved plan | `execution-record.md` | promotion to `review` |
| `team` | execute multi-agent backend against approved plan | `execution-record.md`, `team-dispatch.json`, `team-aggregate.json`, `team-verification.md` | promotion to `review`, rollback |
| `review` | evaluate structured execution package | `review-report.md` | completion or rollback |

The stage skills should remain thin orchestration/documentation surfaces around the deterministic engine rather than embedding separate workflow logic.

## Canonical Artifact Metadata Encoding

All machine-checkable metadata must use one canonical encoding per artifact class.

### Markdown artifacts

These artifacts:

- `spec.md`
- `plan.md`
- `architecture.md`
- `development-plan.md`
- `test-plan.md`
- `execution-record.md`
- `team-verification.md`
- `review-report.md`

must begin with YAML frontmatter. The frontmatter is the machine-checkable metadata surface; the markdown body is human-readable narrative.

Required rule:

- parsers and tests read metadata only from YAML frontmatter
- required metadata keys must not be duplicated in ad hoc inline formats

### JSON artifacts

These artifacts:

- `team-dispatch.json`
- `team-aggregate.json`

must use canonical JSON object encoding with stable top-level keys.

Required rule:

- parsers and tests treat these files as authoritative structured artifacts
- no markdown wrapper or mixed-format encoding is allowed

## Deliverables

1. Final V1 workflow contract and artifact schema
2. Dedicated stage skills for `clarify`, `plan`, `build`, `team`, and `review`
3. Refactored deterministic engine with strict gate enforcement
4. Real `team` runtime with leader / workers / verifier
5. Product-grade tests for stage gating, artifacts, evidence, rollback, and team flow
6. Approval control-plane and status contract
7. Repo-local dedicated stage skill registry

## Implementation Plan

1. **Freeze the product contract and file schema**
   - Replace prototype-facing artifact semantics (`brief.md`, `detailed-design.md`, `build-result.md`) with canonical product artifacts.
   - Define one canonical artifact contract for each stage and write it under `.omx/plans/` and repo docs.
   - Touchpoints: `README.md`, `templates/`, `src/workflow.mjs`.

2. **Refactor the workflow state machine into hard gates**
   - Add explicit unresolved-ambiguity tracking for `clarify`.
   - Prevent direct entry into `review` or `build/team` without prior approved stages.
   - Represent recommended next actions separately from user-confirmed stage transitions.
   - Touchpoints: `src/workflow.mjs`, `src/cli.mjs`, `test/workflow.test.mjs`.

3. **Introduce dedicated stage skills as first-class product surfaces**
   - Add `clarify`, `plan`, `build`, `team`, and `review` skill definitions under:
     - `skills/clarify/SKILL.md`
     - `skills/plan/SKILL.md`
     - `skills/build/SKILL.md`
     - `skills/team/SKILL.md`
     - `skills/review/SKILL.md`
   - Define each skill's input, output artifact, decision boundary, and failure behavior.
   - Keep skills aligned with the deterministic engine rather than duplicating logic in free-form prompt text.
   - Touchpoints: new `skills/` surface for this project, `README.md`, `.omx/plans/`.

4. **Rebuild artifact generation around the V1 product contract**
   - Convert templates to product artifacts:
     - `spec.md`
     - `plan.md`
     - `architecture.md`
     - `development-plan.md`
     - `test-plan.md`
     - `execution-record.md`
     - `team-dispatch.json`
     - `team-verification.md`
     - `review-report.md`
   - Require build/team evidence sections that can be mechanically checked.
   - Touchpoints: `templates/`, `src/workflow.mjs`, tests.

5. **Implement a real `team` runtime minimum**
   - Support leader orchestration, at least two workers, and one verifier.
   - Define worktree allocation, tmux session naming, dispatch contracts, aggregation format, and verifier responsibilities.
   - Capture final required outputs: code result, execution record, verification result, review input package, rollback recommendation on failure.
   - Touchpoints: likely new runtime modules plus `src/cli.mjs`, `src/workflow.mjs`, repo docs.

6. **Introduce approval control-plane separation**
   - Add a dedicated approval command path so human approval is stored independently from stage execution.
   - Ensure status surfaces pending decisions and blockers.
   - Touchpoints: `src/cli.mjs`, `src/workflow.mjs`, tests, docs.

7. **Strengthen `review` into an independent acceptance gate**
   - Make `review` consume execution records and verification artifacts rather than keyword heuristics alone.
   - Require provenance and evidence manifests in all review inputs.
   - Require rollback recommendation classification.
   - Keep review independent from the build/team actor that produced the execution package.
   - Touchpoints: `src/workflow.mjs`, templates, tests.

8. **Expand product-grade verification**
   - Add tests for hard stage-order enforcement, unresolved ambiguity blocking, artifact completeness, user-confirmed transitions, team topology minimums, rollback routing, and CLI correctness.
   - Fix CLI contract gaps such as `status --json` without slug.
   - Touchpoints: `test/workflow.test.mjs` and new tests as required.

## Risks and Mitigations

### Risk 1: V1 scope expands too much around team runtime

- Risk: `team` can swallow the entire V1 and block delivery.
- Mitigation: define a strict minimum topology and artifact contract before broader runtime features.

### Risk 2: Stage skills diverge from deterministic engine behavior

- Risk: prompts say one thing while local state machine enforces another.
- Mitigation: treat the engine contract as the source of truth and keep skill docs thin and artifact-bound.

### Risk 2a: Approval semantics leak back into stage commands

- Risk: convenience flags re-fuse human confirmation and stage execution, weakening the product contract.
- Mitigation: keep approval on a separate control-plane path and test that separation explicitly.

### Risk 3: Prototype artifact names hide product behavior mismatch

- Risk: reusing `brief.md` or `build-result.md` may preserve prototype semantics that conflict with the product contract.
- Mitigation: explicitly rename or remap artifacts where product semantics changed.

### Risk 4: Review remains superficial

- Risk: the product claims independent acceptance but still only checks text patterns.
- Mitigation: introduce structured execution evidence requirements and reviewer-owned verdict logic.

### Risk 5: Cutover from prototype contract is ambiguous

- Risk: mixed old/new workflow directories produce undefined status and verification behavior.
- Mitigation: define explicit cutover rules, schema versioning, and test replacement strategy before implementation starts.

## Cutover Rule from Prototype Contract to V1 Contract

### Schema versioning

- prototype contract is treated as `schema_version=1`
- V1 product contract moves to `schema_version=2`

### Status behavior during cutover

- `status` must report the schema version of a workflow directory
- V1 status output must clearly mark prototype directories as `legacy/prototype contract`
- V1 execution commands must refuse to continue a prototype-contract workflow without explicit migration

### Legacy detection rule

A workflow directory is treated as `legacy/prototype contract` when any of the following hold:

- `state.json` has no workflow-level `schema_version`
- `state.json.schema_version == 1`
- canonical V1 `spec.md` is absent while prototype `brief.md` is present
- prototype-only required artifacts such as `detailed-design.md` / `build-result.md` exist without their V1 replacements

Detection precedence:

1. explicit workflow `schema_version`
2. canonical V1 artifact presence
3. prototype artifact fallback heuristics

### Test replacement strategy

- existing prototype tests remain temporarily as brownfield regression checks until V1 replacements exist
- each prototype-semantic test must be replaced by a V1 contract test before the prototype test is deleted
- no execution work is complete while only prototype tests are green

## Verification Steps

1. Contract tests prove that invalid stage transitions are blocked.
2. Artifact tests prove each stage emits the required structured files.
3. CLI tests prove each public command matches documented argument behavior.
4. Approval tests prove human confirmation is recorded separately from stage execution.
5. Integration tests prove `team` launches the minimum topology and aggregates outputs correctly.
6. Review tests prove review decisions depend on execution artifacts, provenance, and rollback logic, not only placeholders or keywords.
7. Manual smoke run proves the user can always tell current stage, unmet gates, pending decisions, and recommended next action.

## Available-Agent-Types Roster

- `planner`
- `architect`
- `critic`
- `executor`
- `verifier`
- `test-engineer`
- `debugger`
- `writer`
- `code-reviewer`
- `security-reviewer`
- `build-fixer`

## Follow-up Staffing Guidance

### Recommended `ralph` lane

- `executor` — `high`
  - Own workflow-engine refactors and artifact contract implementation
- `test-engineer` — `medium`
  - Own regression and integration test expansion
- `verifier` — `high`
  - Own acceptance evidence and plan conformance checks

### Recommended `team` lane

- `leader` orchestrates from the approved plan
- `worker-1` / `executor` — `high`
  - Stage engine and CLI gate enforcement
- `worker-2` / `executor` — `high`
  - Artifact template and skill surface implementation
- `worker-3` / `executor` — `medium`
  - Team runtime / tmux / worktree slice when scope justifies a third worker
- `verifier` — `high`
  - Independent verification and review-input package validation
- `test-engineer` — `medium`
  - Shared or sidecar lane when test volume becomes large enough

## Launch Hints

### Ralph-style execution hint

Use the approved PRD plus test spec as the execution brief:

```text
$ralph .omx/plans/prd-codex-helper-product-v1.md
```

### Team-style execution hint

Use the approved PRD plus test spec as the team execution brief:

```text
$team .omx/plans/prd-codex-helper-product-v1.md
omx team 4:executor ".omx/plans/prd-codex-helper-product-v1.md"
```

## Team Verification Path

Before `team` can shut down, it must prove:

1. Worker outputs are aggregated into a single execution package.
2. Verification evidence covers each changed slice.
3. Review input materials are complete.
4. Any failure path includes a rollback recommendation to `plan`.

After team handoff, a final verifier / review lane should still confirm:

1. stage-gate conformance
2. artifact completeness
3. CLI contract correctness
4. review independence

## Changelog

- Initial planner draft created from deep-interview output and current brownfield implementation.
- Revised after architect and critic review to add command-level approval contract, repo-local skill registry, implementable team backend interface, provenance/evidence schema, and explicit prototype-to-V1 cutover rules.
