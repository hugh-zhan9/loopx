# Test Spec: codex-helper Product V1

## Purpose

Validate that `codex-helper` V1 behaves as an independent workflow product rather than a loose prototype, with hard stage gates, structured artifacts, evidence-backed execution, and a real team path.

## Scope

- stage-skill contract validation
- artifact contract validation
- gate enforcement
- team runtime minimum contract
- review independence
- CLI correctness

## Unit Test Categories

### 1. Stage gate rules

- `clarify` refuses promotion while ambiguity items remain unresolved.
- `plan` requires approved `clarify` output.
- `build` requires approved plan package and cannot skip plan approval.
- `team` requires approved plan package and cannot skip plan approval.
- `review` cannot start unless execution artifacts exist from `build` or `team`.

### 1a. Normative transition table enforcement

| From | To | Expected result |
| --- | --- | --- |
| `clarify -> plan` | allowed only with zero unresolved ambiguity and user approval |
| `plan -> build` | allowed only with full plan package and user decision |
| `plan -> team` | allowed only with full plan package and user decision |
| `build -> review` | allowed only with complete `execution-record.md`, including embedded verification evidence |
| `team -> review` | allowed only with aggregate package and verifier output |
| `review -> done` | allowed only with approve verdict and user confirmation |
| forbidden jumps | always blocked |

### 2. State transitions

- every stage writes current stage, unmet gates, and recommended next action
- transition intent is separate from user confirmation
- rollback targets are explicit and bounded
- `last_confirmed_transition` changes only when the engine actually consumes an approved transition
- rollback requests expose both `rollback_target` and non-empty `rollback_rationale`

### 2a. Approval control-plane checks

- approval state is stored independently from stage execution state
- a stage command cannot silently imply approval
- pending decisions are surfaced in status output
- last confirmed transition is recorded
- `approve` records permission without directly mutating `current_stage`
- `approve` does not directly mutate `last_confirmed_transition`
- next-stage execution requires a matching approved transition

### 3. Artifact contract validation

- `clarify` emits `spec.md`
- `plan` emits:
  - `plan.md`
  - `architecture.md`
  - `development-plan.md`
  - `test-plan.md`
- `build` emits `execution-record.md` as the sole canonical execution + verification artifact
- `team` emits `execution-record.md` plus verifier-owned team artifacts
- `review` emits a review report with verdict and rollback recommendation

### 3a. Normative artifact manifest checks

- every canonical artifact includes owner-stage metadata
- every canonical artifact includes required sections
- every machine-checkable field is present and parseable
- prototype-only artifact semantics are not treated as canonical V1 truth
- `build` does not emit a second build-verification artifact outside `execution-record.md`
- `team-aggregate.json` exists for `team` runs
- `team-verification.md` exists for `team` runs
- `review-report.md` includes `reviewed_run_id`
- markdown artifact metadata is parsed only from YAML frontmatter
- json artifact metadata is parsed only from canonical JSON top-level keys

### 4. CLI contract validation

- `status --json` works with and without slug
- every command rejects invalid argument combinations with deterministic errors
- CLI help matches actual supported arguments
- approval commands reject invalid `from -> to` combinations
- terminal approvals (`review -> plan`, `review -> done`) record approval before stage mutation
- status surfaces `pending_user_decision`, `requested_transition`, and `last_confirmed_transition` with canonical transition-enum values

## Integration Test Categories

### 1. Product happy paths

- `clarify -> plan -> build -> review`
- `clarify -> plan -> team -> review`

Both paths must show:

- visible current stage
- visible missing prerequisites
- execution evidence
- review-ready package output

### 2. Team minimum topology

- leader can launch at least two workers plus one verifier
- workers receive bounded assignments
- verifier receives aggregated execution package
- final output includes code result, execution record, verification result, and review input material
- tmux/worktree operations can be simulated by deterministic test doubles
- backend request / assignment / result contracts are validated as stable shapes
- verifier count is fixed to exactly one in V1 and validated by launcher tests

### 3. Rollback behavior

- failed `build` can only recommend rollback; user confirmation is still required
- failed `team` returns a rollback recommendation to `plan`
- failed `review` includes bounded rollback target and rationale

### 4. Brownfield regression protection

- current deterministic local-state behavior remains intact after productization
- artifact directories stay predictable and inspectable
- stage-gate tightening does not break valid happy-path runs

### 5. Prototype-to-V1 cutover protection

- workflow directories expose `schema_version`
- status can distinguish prototype vs V1 workflow directories
- V1 execution commands reject prototype-contract directories unless explicitly migrated
- prototype tests are only removed after equivalent V1 contract tests exist
- legacy detection follows explicit precedence: state version -> V1 artifact presence -> prototype fallback heuristics

## Review Validation

- review must not self-approve from the same execution actor without independent evidence handling
- review must not pass based only on placeholder removal or keyword matching
- review verdicts must incorporate execution artifacts and verification artifacts
- review must record reviewer provenance and rollback rationale
- review rejects missing provenance/evidence schema fields
- review rejects missing `reviewed_run_id`
- review rejects rollback recommendations that omit non-empty `rollback_rationale`

## Manual Smoke Checks

1. Start a new workflow and confirm the user can see the exact stage and gate status.
2. Attempt an invalid stage jump and confirm it is blocked.
3. Run a valid `build` path and inspect evidence capture.
4. Run a valid `team` path and inspect dispatch, aggregation, and verifier output.
5. Trigger review failure and confirm rollback recommendation is present.
6. Trigger `status --json` with and without slug and confirm both return valid JSON.
7. Trigger approval commands and confirm pending decisions, requested transitions, and confirmed transitions appear in status.
8. Run multiple build/team attempts and confirm review targets the intended `reviewed_run_id`.

## Exit Criteria

- all hard gate tests pass
- all artifact contract tests pass
- CLI contract matches docs
- team minimum topology is proven
- review independence is proven

## Suggested Verification Commands

```bash
node --test test/*.test.mjs
node src/cli.mjs --help
node src/cli.mjs status --json
```
