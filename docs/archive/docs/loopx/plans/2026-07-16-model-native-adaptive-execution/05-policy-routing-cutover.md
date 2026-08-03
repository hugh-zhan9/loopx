# Risk Policy, Capability Provenance, Generation Routing, And Alias Cutover Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for the independent policy and routing foundations. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md` (sections 4.4, 4.8, 4.14, 4.16, 8.1-8.4)

**Canonical contract:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

**Goal:** Pin mode/capability/model policy per run, keep the changed-surface High guard authoritative while the classifier remains shadow-only, and route fresh/current/unknown invocations without in-place migration or public-surface drift.

**Architecture:** `policy-lib.mjs` evaluates approved surfaces and actual delta paths, enforces monotonic risk and hard High blocking, and records observed/recommended/enforced gates. `router-lib.mjs` detects exact persisted generation/path/schema and returns `unified:<profile>`, `legacy:<engine-version>`, or structured rejection. Existing aliases become thin callers of `runtime.mjs`; cutover is phase-pinned and rollback only changes fresh selection.

**Tech Stack:** Node.js ESM, content-addressed policy JSON, existing skill Markdown aliases, `node:test`, compatibility snapshots.

**Support lenses:** `architecture-designer`, `cli-developer`, `ddia:failure-review`

**Execution strategy recommendation:** `subagent-exec`

**Selection rationale:** Policy classification and exact generation routing have disjoint owners and test surfaces, so they can be implemented and reviewed independently. Alias cutover waits for both accepted foundations and owns the combined compatibility matrix.

```loopx-parallel-plan
{"schema":"loopx.parallel-plan.v1","max_parallel":2}
```

## Global Constraints

- Hard High-risk guard is always enabled and blocks unapproved public API/CLI/schema, permission/security, migration/backfill, destructive deletion/data loss, installer ownership, compatibility removal, and unsafe secret handling surfaces.
- Shadow classifier uses only evidenced requirement/repo/diff signals and cannot change actual executor, tree, baseline, or quality gates. Observed risk and recommended gates only increase.
- Mode/profile, workspace/Git strategy, adapter capability requirement, quality policy, compiler/prompt/model-policy versions, and effective limits are pinned in the manifest; runs never switch generation/profile silently.
- Current-contract state is recognized by exact path/schema/source identity and enters the matching frozen legacy engine. Ambiguous repo-global state, unknown/pre-v2 state, orphan artifacts, and missing engine fail closed.
- Existing aliases, flags, human/JSON/non-TTY output, exit codes, install surface, and public CLI remain unchanged. Rollback stops fresh unified selection; it never converts an active unified run to legacy or treats `concurrency=1` as engine rollback.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md` — all three Important findings closed
- Residual risk: only adapters with passing negative write-root probes can be routed to unified writer profiles.

---

### T-001 / Task 1: Implement hard risk guard, shadow classifier, and monotonic policy

**Files:**
- Create: `skills/shared/execution/policy-lib.mjs`
- Create: `skills/shared/execution/policies/hard-guard-v1.json`
- Create: `skills/shared/execution/policies/classifier-shadow-v1.json`
- Create: `test/execution-policy.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-001","depends_on":[],"write_scope":["skills/shared/execution/policy-lib.mjs","skills/shared/execution/policies/hard-guard-v1.json","skills/shared/execution/policies/classifier-shadow-v1.json","test/execution-policy.test.mjs"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: approved source surfaces, exact delta actual path set, manifest profile/policy version, and previous state risk observation.
- Produces: `evaluateHardGuard`, `classifyShadowRisk`, `mergeMonotonicRisk`, `createSuccessorLink`, policy hashes, stable signal/reason codes, and `decision_required`/`superseded` transition payloads.

**Traceability:**
- Source AC: `AC-006`, `AC-007`, `AC-008`, `AC-023`, `AC-026`
- Design anchors: `D-008`, `D-012`, `D-016`
- Test cases: `TC-004`, `TC-005`, `TC-017`, `TC-019`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-policy.test.mjs`
- `evidence_summary`: Low→Standard adds reasons/gates; shadow non-High output is deterministic and baseline-parity; unapproved High immediately blocks new dispatch/integration/finish and preserves work; successor link carries predecessor/source/delta identity; candidate with one P0 regression cannot graduate.
- `remaining_risk`: policy signals are local evidence only; material owner decisions remain outside classifier.

**Review focus:**
- Verify hard guard and shadow classifier have separate versions/owners and shadow cannot alter actual gates.
- Verify risk is monotonic and no reclassification decreases required gates.
- Verify successor run is a new identity and old review/evidence is never silently reused.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED policy fixtures.** Cover Low/Standard signals, unapproved High API/permission/migration/delete/installer/secret paths, approved High surfaces, shadow parity, monotonic merge, successor link, and candidate-faster-with-P0-regression.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-policy.test.mjs`; expect missing module/data failures.
- [ ] **Step 3: Add versioned policy data.** Encode exact hard signal categories and shadow reason schema; keep automatic routing/enforcement disabled in policy metadata.
- [ ] **Step 4: Implement evaluators.** Return structured `{risk, signals, evidence, recommended_gates, enforced_gates, policy_hash}`; hard High returns `decision_required`, and successor creation returns new manifest source hash/predecessor link rather than mutating the old run.
- [ ] **Step 5: Run focused tests to GREEN.** Run `node --test test/execution-policy.test.mjs`; expect PASS.
- [ ] **Step 6: Record task evidence.** Record deterministic reason JSON, hard-block state, successor relation, and failed graduation fixture.

### T-002 / Task 2: Implement exact generation detection and legacy routing

**Files:**
- Create: `skills/shared/execution/router-lib.mjs`
- Create: `test/execution-router.test.mjs`
- Modify: `skills/exec/SKILL.md`
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `skills/parallel-subagent-exec/SKILL.md`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-002","depends_on":[],"write_scope":["skills/shared/execution/router-lib.mjs","test/execution-router.test.mjs","skills/exec/SKILL.md","skills/subagent-exec/SKILL.md","skills/parallel-subagent-exec/SKILL.md"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: alias name, source path/hash, route policy version, `.loopx/exec/<slug>`, `.loopx/subagent-exec/progress.md`, parallel v1 state, and unified `.loopx/runs/<run-id>` descriptors.
- Produces: `detectGeneration`, `routeInvocation`, `legacyStateDisposition`, and structured outputs `unified:<profile>`, `legacy:<engine-version>`, `legacy_state_ambiguous`, `unknown_generation`, `legacy_engine_missing`.

**Traceability:**
- Source AC: `AC-004`, `AC-020`, `AC-021`, `AC-026`
- Design anchors: `D-001`, `D-004`, `D-014`
- Test cases: `TC-003`, `TC-015`, `TC-018`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-router.test.mjs test/skill-governance.test.mjs`
- `evidence_summary`: empty/fresh, qualified current state, mixed/ambiguous progress, orphan artifacts, unknown/pre-v2 state, missing engine, rollback, and active-unified cases each follow the exact routing matrix without state mutation or implicit fallback.
- `remaining_risk`: pre-v2 remains unsupported by design; legacy deletion date is deferred to a separate spec.

**Review focus:**
- Verify detection uses source/run identity and schema, not directory existence; repo-global `subagent-exec` ambiguity is preserved and actionable.
- Verify recognized current state never bootstraps into unified or rewrites its ledger; active unified never switches generation.
- Verify alias prose says facade authorization/route behavior without inventing public flags or adaptive in-place semantics.

**Support lenses:** `cli-developer`, `ddia:failure-review`

- [ ] **Step 1: Write RED routing fixtures.** Add empty/fresh, exact current `exec`, qualified current `subagent-exec`, exact parallel v1, mixed source, orphan artifact, unknown schema, pre-v2, missing engine, active unified, and rollback-route fixtures.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-router.test.mjs`; expect missing router exports.
- [ ] **Step 3: Implement detection and route matrix.** Read only recognized schema/path/source identities; return structured route/rejection; preserve current files for user/doctor cleanup and never normalize unknown data.
- [ ] **Step 4: Update alias contracts.** State that fresh phase routes call `runtime.mjs`, current state resumes through frozen legacy engine, and no fallback occurs after unified prepare starts. Keep public invocation examples and worker leaf rules.
- [ ] **Step 5: Run focused tests to GREEN.** Run `node --test test/execution-router.test.mjs test/skill-governance.test.mjs`; expect PASS.
- [ ] **Step 6: Record task evidence.** Record all route dispositions, no-mutation assertions, and alias/public-surface negative checks.

### T-003 / Task 3: Add phase-pinned alias integration and capability/model provenance

**Files:**
- Modify: `skills/shared/execution/capability-lib.mjs`
- Create: `test/execution-capability.test.mjs`
- Create: `skills/exec/scripts/execution-entry.mjs`
- Create: `skills/subagent-exec/scripts/execution-entry.mjs`
- Modify: `skills/shared/execution/runtime.mjs`
- Modify: `skills/parallel-subagent-exec/scripts/parallel-exec.mjs`
- Modify: `skills/RESOLVER.md`
- Modify: `skills/exec/SKILL.md`
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `skills/parallel-subagent-exec/SKILL.md`
- Modify: `skills/review/SKILL.md`
- Modify: `skills/final-review/SKILL.md`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-003","depends_on":["T-001","T-002"],"write_scope":["skills/shared/execution/capability-lib.mjs","test/execution-capability.test.mjs","skills/exec/scripts/execution-entry.mjs","skills/subagent-exec/scripts/execution-entry.mjs","skills/shared/execution/runtime.mjs","skills/parallel-subagent-exec/scripts/parallel-exec.mjs","skills/RESOLVER.md","skills/exec/SKILL.md","skills/subagent-exec/SKILL.md","skills/parallel-subagent-exec/SKILL.md","skills/review/SKILL.md","skills/final-review/SKILL.md"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: adapter probe results, requested/observed model identity, phase route table, internal facade responses, and existing review/final-review skill handoffs.
- Produces: `probeCapability`, `validateCapabilityForProfile`, `recordModelObservation`, thin alias entry scripts that invoke the shared router/facade without calculating state, a compatibility wrapper in `parallel-exec.mjs`, route-specific alias handoff text, and stable capability artifact `loopx.adapter-capability.v1`.

**Traceability:**
- Source AC: `AC-003`, `AC-004`, `AC-005`, `AC-011`, `AC-014`, `AC-019`, `AC-021`, `AC-025`, `AC-026`
- Design anchors: `D-004`, `D-005`, `D-007`, `D-009`, `D-012`, `D-014`, `D-016`
- Test cases: `TC-003`, `TC-005`, `TC-008`, `TC-009`, `TC-013`, `TC-014`, `TC-015`, `TC-020`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-capability.test.mjs test/skill-governance.test.mjs`; `node scripts/verify-skills.mjs`
- `evidence_summary`: capability artifact binds adapter/runtime/model/auth/workspace identity and negative-probe evidence; unverified substitute blocks High/final-review; resolver/aliases preserve current default route and complete final-review responsibility.
- `remaining_risk`: native adapter live stress is deferred; capability-unavailable profiles remain explicit `unavailable`, never prompt-only.

**Review focus:**
- Verify requested and observed model are both persisted and substitute is not mislabeled as requested success.
- Verify profile capability requirements include enforced writable root and source Git read-only, not just cwd/worktree claims.
- Verify `review`/`final-review` text preserves task review, Critical/Important closure, and six-stage final-review.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Write RED capability/model tests.** Cover identity mismatch, expired cache, strict/relaxed/inline requirements, negative probe failure, provider substitute below policy, and capability reuse only with identical identity/hash/TTL.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-capability.test.mjs`; expect missing capability helper.
- [ ] **Step 3: Implement capability artifacts.** Record platform/adapter/runtime/hash, auth/workspace identity, requested/observed model, create/wait/inspect/cancel/capture support, write-root/source-Git enforcement, negative probes, and expiry.
- [ ] **Step 4: Implement policy checks and alias entry adapters.** Require capability proof before unified profile selection; record observed model before accepting reservation/review. Add thin `execution-entry.mjs` scripts for `exec` and `subagent-exec` that pass owner-only requests to the shared router/facade and return its structured result; make `parallel-exec.mjs` delegate fresh unified operations while retaining the frozen v1 path for recognized current state. None of these adapters calculates DAG/state or changes public invocation.
- [ ] **Step 5: Run focused verification to GREEN.** Run `node --test test/execution-capability.test.mjs test/skill-governance.test.mjs` and `node scripts/verify-skills.mjs`; expect PASS.
- [ ] **Step 6: Record task evidence.** Record capability hash, substitute block, route matrix, and negative public-surface assertions.

## Plan Verification

```bash
node --test test/execution-policy.test.mjs test/execution-router.test.mjs test/execution-capability.test.mjs
node --test test/skill-governance.test.mjs
node scripts/verify-skills.mjs
git diff --check
```

Expected: all pass; no public CLI/flag is added; current-state route and public skill aliases remain compatible; no active generation is rewritten.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/05-policy-routing-cutover.md
```
