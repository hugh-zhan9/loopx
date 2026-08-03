# Mode Profiles, Streaming Scheduler, And Independent Graduation Lanes Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for the independently reviewed streaming and evaluation lanes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md` (sections 4.4, 4.12, 4.13, 4.16, 8.1-8.2)

**Canonical contract:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

**Goal:** Add explicit inline/delegated-serial/parallel-strict/parallel-relaxed profiles, deterministic bounded scheduling, wait-any and future optimization rungs that remain independently versioned and disabled until their P0/P1 graduation evidence passes.

**Architecture:** `scheduler-lib.mjs` is a pure ready/reservation decision owner; state/runtime persist reservations and effects. Profile policy computes effective capacity from configured, local, observed provider, and ready-stage limits, with role priority and stable tie-breakers. `integration-lib.mjs` contains the separate commutativity/early-integration gate. `eval-lib.mjs` records paired baseline/candidate evidence and rejects any candidate with a P0 regression before comparing latency/tokens.

**Tech Stack:** Node.js ESM, deterministic JSON policy files, existing simulation/adapter fixtures, `node:test`, local eval artifacts only.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

**Execution strategy recommendation:** `subagent-exec`

**Selection rationale:** The baseline scheduler is the shared prerequisite. After it is reviewed, streaming integration and graduation evaluation have disjoint write scopes and can run independently before their combined verification gate.

```loopx-parallel-plan
{"schema":"loopx.parallel-plan.v1","max_parallel":2}
```

## Global Constraints

- Effective leaf limit is `min(configured_limit, local_runtime_limit, observed_provider_limit, ready_leaf_stages)`; controller/lease/state/Git actions do not consume leaf slots. Capacity shortage is bounded backpressure, never a new attempt or unbounded polling loop.
- Baseline ordering remains reconciliation/fix > review > implementation, then stable topological level, plan path, and task anchor. All leaf roles count toward the cap.
- `wait-any` may trigger scope-check/review on completion but keeps integration barrier/order/test cadence. Early integration, critical-path ranking, test layering, automatic P=2/P=4, and review-turn reduction are separate policy versions and disabled by default.
- Early integration requires fresh approved exact deltas, non-overlapping actual paths/exclusive resources, no semantic dependency, and commutativity proof; package child boundary order and review ownership remain unchanged.
- Graduation uses wide-DAG, long-tail, diamond, and package fan-in workloads with at least 20 balanced paired samples per workload; every replicate must pass all P0 gates before P1 metrics are considered.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md` — all three Important findings closed
- Residual risk: live provider capacity and native agent timing remain adapter-specific; deterministic simulations prove policy boundaries, not universal throughput.

---

### T-001 / Task 1: Implement profile schemas and deterministic baseline scheduler

**Files:**
- Modify: `skills/shared/execution/policy-lib.mjs`
- Modify: `skills/shared/execution/scheduler-lib.mjs`
- Create: `skills/shared/execution/policies/profiles-v1.json`
- Create: `test/execution-scheduler.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-001","depends_on":[],"write_scope":["skills/shared/execution/policy-lib.mjs","skills/shared/execution/scheduler-lib.mjs","skills/shared/execution/policies/profiles-v1.json","test/execution-scheduler.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: manifest task DAG/write/resource boundaries, state task/reservation statuses, capability profile, configured limit, local/provider capacity observations.
- Produces: `MODE_PROFILES`, `effectiveLeafLimit`, `computeReadyStages`, `selectNextStages`, `selectionTokenPayload`, and baseline scheduler policy hash.

**Traceability:**
- Source AC: `AC-003`, `AC-004`, `AC-005`, `AC-011`, `AC-017`, `AC-021`, `AC-025`, `AC-026`
- Design anchors: `D-004`, `D-012`, `D-016`
- Test cases: `TC-003`, `TC-008`, `TC-013`, `TC-014`, `TC-015`, `TC-017`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-scheduler.test.mjs`
- `evidence_summary`: all four profile records pin workspace/Git/quality/adapter requirements; baseline queue selects only ready tasks with explicit dependencies; effective cap/backpressure and priority/tie-break fixtures match the contract and never increment attempts when capacity is zero.
- `remaining_risk`: no automatic profile selection is enabled; routing remains phase-pinned from child `05`.

**Review focus:**
- Verify profile records distinguish inline leaf count `0`, delegated serial `1`, strict parallel `2..configured`, and relaxed adapter-proven roots.
- Verify capacity/backpressure cannot consume a slot or mutate task attempt; all leaf roles count, controller actions do not.
- Verify stable baseline ranking remains unchanged until an explicit rung is enabled.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED scheduler/profile tests.** Cover each profile, unavailable capability, configured/local/provider/ready caps, zero capacity, no-ready idle, reconciliation/fix/review priority, semantic dependency, exclusive resource, and stable tie-break.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-scheduler.test.mjs`; expect missing scheduler/profile exports.
- [ ] **Step 3: Add profile policy data.** Encode exact `inline-owned-v1`, `delegated-serial-v1`, `parallel-strict-v1`, and `parallel-relaxed-v1` requirements, quality profile, and concurrency semantics; mark automatic routing false.
- [ ] **Step 4: Implement pure baseline scheduler.** Compute ready stages from explicit DAG/state only; calculate effective limit; select by stage priority then topological/path/anchor; emit token payload without writing state.
- [ ] **Step 5: Run focused tests to GREEN.** Run `node --test test/execution-scheduler.test.mjs`; expect PASS.
- [ ] **Step 6: Record task evidence.** Record profile JSON, cap calculations, idle/backpressure result, and selection-token payload.

### T-002 / Task 2: Add wait-any and separately gated early-integration decisions

**Files:**
- Create: `skills/shared/execution/integration-lib.mjs`
- Modify: `skills/shared/execution/scheduler-lib.mjs`
- Modify: `skills/shared/execution/runtime.mjs`
- Create: `test/execution-streaming-integration.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-002","depends_on":["T-001"],"write_scope":["skills/shared/execution/integration-lib.mjs","skills/shared/execution/scheduler-lib.mjs","skills/shared/execution/runtime.mjs","test/execution-streaming-integration.test.mjs"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: accepted task results/reviews/deltas, baseline scheduler token, profile capability, integration barrier state, and package child boundary order.
- Produces: `waitAnyDecision`, `commutativityProof`, `earlyIntegrationDecision`, `integrationBarrierState`, and explicit policy/rung reason codes.

**Traceability:**
- Source AC: `AC-017`, `AC-018`, `AC-023`, `AC-025`
- Design anchors: `D-006`, `D-012`, `D-013`
- Test cases: `TC-013`, `TC-019`, `TC-020`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-streaming-integration.test.mjs`
- `evidence_summary`: strict adapter wait-any enters scope/review immediately but preserves integration barrier/order/tests; relaxed adapter returns unavailable; early integration remains disabled unless policy version is explicitly supplied and only commutative reviewed tasks unlock dependents; overlap/dependency fixtures remain barriers.
- `remaining_risk`: production early integration is deferred to a separate graduation decision; this task only makes the proof and rollback boundary executable.

**Review focus:**
- Verify wait-any does not accidentally change integration ordering, task-review count, final-review, or relaxed-adapter behavior.
- Verify commutativity uses actual `--no-renames` path set, exclusive resources, semantic DAG, and original base/candidate hashes—not completion prose.
- Verify child boundary commits retain declared stable order and a blocked sibling cannot contaminate another branch.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED streaming fixtures.** Use long-tail DAG, strict/relaxed capability, reviewed/unreviewed, overlapping/non-overlapping paths, semantic dependency, different completion order, and package child-boundary cases.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-streaming-integration.test.mjs`; expect missing streaming/integration exports.
- [ ] **Step 3: Implement wait-any decision.** Return immediate scope/review action only for strict capability; keep integration barrier and baseline ordering; return `profile_unavailable` for relaxed adapters without strict proof.
- [ ] **Step 4: Implement commutativity proof.** Compare exact actual path sets/resources/dependencies and candidate base hashes; produce an explicit proof artifact and no integration action when any condition is absent.
- [ ] **Step 5: Wire runtime policy gates.** Require separate rung version for early integration; persist reason/rollback target; never change child/spec review ownership.
- [ ] **Step 6: Run focused tests to GREEN.** Run `node --test test/execution-streaming-integration.test.mjs`; expect PASS.
- [ ] **Step 7: Record task evidence.** Record wait-any/early decisions, barrier preservation, proof artifact, and disabled-default assertion.

### T-003 / Task 3: Add model/adapter provenance and one-variable graduation evaluation

**Files:**
- Create: `skills/shared/execution/eval-lib.mjs`
- Create: `skills/shared/execution/policies/graduation-v1.json`
- Create: `test/execution-graduation.test.mjs`
- Modify: `skills/shared/execution/capability-lib.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-003","depends_on":["T-001"],"write_scope":["skills/shared/execution/eval-lib.mjs","skills/shared/execution/policies/graduation-v1.json","test/execution-graduation.test.mjs","skills/shared/execution/capability-lib.mjs"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: baseline/candidate policy hashes, run/task/review provenance, requested/observed model/capability artifacts, paired workload metrics, P0 gate results.
- Produces: `recordPairedSample`, `evaluateGraduation`, `rollbackPolicyVariable`, and local eval report with queue/worktree/review/retry/integration overhead, p50/p95, token totals, and P0/P1 verdicts.

**Traceability:**
- Source AC: `AC-019`, `AC-023`, `AC-024`, `AC-026`
- Design anchors: `D-008`, `D-012`, `D-016`
- Test cases: `TC-014`, `TC-017`, `TC-018`, `TC-019`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-graduation.test.mjs`
- `evidence_summary`: candidate with any P0 regression is `not_graduated` even if faster; one-variable rollback restores baseline; report distinguishes requested/observed model and records at least the four required workload classes/paired-sample counts; no production automatic route is enabled by evaluation.
- `remaining_risk`: real provider/live-agent samples remain maintainer-run and local; no telemetry upload is introduced.

**Review focus:**
- Verify one variable changes per experiment and active runs remain pinned to their original generation/policy.
- Verify P1 thresholds are versioned candidate gates, not permanent SLA claims, and P0 absolute gates run first.
- Verify model substitution below minimum capability blocks or escalates High/final-review rather than being relabeled.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED graduation tests.** Cover P0 pass/fail, faster-but-regressed candidate, paired sample count, p50/p95 threshold, provider degradation/backpressure, one-variable rollback, observed-model mismatch, and missing supersession disposition.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-graduation.test.mjs`; expect missing eval/policy exports.
- [ ] **Step 3: Add graduation policy data.** Encode independent rungs baseline/4a/4b/4c/4d/5a/5b/6, activation gates, rollback target, and disabled-by-default state; include P1 values from the contract without treating them as SLA.
- [ ] **Step 4: Implement paired evaluation.** Persist sample identity/policy/model/capability hashes and metrics; fail immediately on any P0 safety/quality/provenance/compatibility regression, otherwise compare P1 metrics and emit a structured report.
- [ ] **Step 5: Implement rollback.** Roll back only the candidate variable/route, preserve hard guard/lease/write safety, and reject active-generation mutation.
- [ ] **Step 6: Run focused tests to GREEN.** Run `node --test test/execution-graduation.test.mjs`; expect PASS.
- [ ] **Step 7: Record task evidence.** Record candidate failure, rollback result, model provenance, and deferred production-route assertion.

## Plan Verification

```bash
node --test test/execution-scheduler.test.mjs test/execution-streaming-integration.test.mjs test/execution-graduation.test.mjs
node scripts/verify-skills.mjs
git diff --check
```

Expected: all pass; default routes and quality responsibilities are unchanged; wait-any/early/graduation features are explicit policy-controlled lanes, not automatic behavior.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/06-scheduler-graduation.md
```
