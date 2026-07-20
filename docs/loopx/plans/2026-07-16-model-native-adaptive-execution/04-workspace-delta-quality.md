# Owned Workspace, Exact Delta, Evidence V2, And Finish Handoff Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:exec` for tightly coupled work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md` (sections 4.5-4.7, 4.15-4.16)

**Canonical contract:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

**Goal:** Make every unified writer operate in an owned, capability-proven root and make task review consume one immutable base-tree-to-candidate-tree delta with fresh evidence/review provenance and an epoch-bound finish handoff.

**Architecture:** `workspace-lib.mjs` creates/verifies epoch-owned worktrees/refs and enforced write-root capability artifacts. `delta-lib.mjs` captures staged/unstaged/untracked/mode/symlink changes into isolated Git objects before any source object write. `evidence-lib.mjs` and `review-lib.mjs` bind verification/review to the exact delta and observed identity; `finish-runtime.mjs` consumes only a matching handoff and revalidates the invoking checkout before placement.

**Tech Stack:** Node.js ESM, Git CLI with temporary indexes/object alternates, owner-only filesystem, `node:test`, existing review/finish runtime modules.

**Support lenses:** `architecture-designer`, `ddia:failure-review`, `cli-developer`

**Execution strategy recommendation:** `exec`

**Selection rationale:** Filesystem boundary, Git object capture, review hashes, and finish reconciliation form one safety boundary. A change that passes only one layer is unsafe, so tasks require continuous real-Git fault testing.

```loopx-parallel-plan
{"schema":"loopx.parallel-plan.v1","max_parallel":1}
```

## Global Constraints

- Unified resource descriptors bind real common dir, primary/invoking root, run, lease, epoch, kind, qualified ID, branch/ref, HEAD/tree, and creation operation.
- Source common dir, invoking checkout, other worktrees, central state, and unowned refs/objects are read-only/unreachable to workers. `cwd`, standalone Git, prompt paths, and post-diff checks alone are not write isolation.
- Preflight rejects absolute/`..`/symlink/nearest-ancestor escapes, Git metadata aliases, explicit source `--git-dir`, and unavailable enforced write roots before dispatch/worktree mutation.
- Delta identity is `loopx.task-delta.v1`; review unit is immutable `base_tree -> candidate_tree`. Actual path set uses `--no-renames`; ignored/Git metadata/prior task deltas are excluded.
- Evidence/review schemas are `loopx.execution-evidence.v2` and `loopx.review-result.v2`; `Approved + Minor` is valid, any Critical/Important or `cannot_verify` blocks integration, and legacy v1 is read-only.
- Finish before placement is intent-only; actual invoking checkout mutation requires matching authoritative lease/epoch, finish token, expected HEAD/index/worktree snapshot, and before/after capture. Blocked/interrupted evidence is retained and cleanup is exact-owner only.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md` — all three Important findings closed
- Residual risk: capability probes can prove only the adapters exercised; unavailable adapters remain profile-disabled.

---

### T-001 / Task 1: Implement epoch-owned workspace and enforced write-root capability probes

**Files:**
- Create: `skills/shared/execution/workspace-lib.mjs`
- Create: `skills/shared/execution/capability-lib.mjs`
- Create: `skills/shared/execution/adapters/codex-native.mjs`
- Create: `skills/shared/execution/adapters/claude-code.mjs`
- Create: `skills/shared/execution/adapters/cursor-agent.mjs`
- Create: `test/execution-workspace.test.mjs`
- Create: `test/execution-adapter-enforcement.test.mjs`
- Modify: `skills/parallel-subagent-exec/scripts/git-lib.mjs`
- Modify: `test/parallel-exec-git.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-001","depends_on":[],"write_scope":["skills/shared/execution/workspace-lib.mjs","skills/shared/execution/capability-lib.mjs","skills/shared/execution/adapters/codex-native.mjs","skills/shared/execution/adapters/claude-code.mjs","skills/shared/execution/adapters/cursor-agent.mjs","test/execution-workspace.test.mjs","test/execution-adapter-enforcement.test.mjs","skills/parallel-subagent-exec/scripts/git-lib.mjs","test/parallel-exec-git.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: topology from existing `inspectGitTopology`, authoritative lease/fence from child `03`, profile capability requirements, baseline commit/tree.
- Produces: `preflightInvokingCheckout`, `createOwnedRoot`, `createTaskAttempt`, `verifyOwnedResource`, `probeWriteRootCapability`, `snapshotInvokingCheckout`, `cleanupOwnedResource`, the canonical `loopx.adapter-capability.v1` schema/validator, and platform adapter interfaces `prepareEnforcedWorker({ taskRoot, readOnlyRoots, prompt, reservation })`, `inspectWorker`, `cancelWorker`, and `captureWorkerResult`. Each adapter must pass a real write-denial probe before its profile is available; unsupported platform APIs return structured `capability_unavailable` and cannot cut over.

**Traceability:**
- Source AC: `AC-005`, `AC-009`, `AC-010`, `AC-012`, `AC-014`, `AC-022`
- Design anchors: `D-005`, `D-010`, `D-011`, `D-015`
- Test cases: `TC-003`, `TC-006`, `TC-007`, `TC-009`, `TC-016`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-workspace.test.mjs test/execution-adapter-enforcement.test.mjs test/parallel-exec-git.test.mjs`; adapter-specific live negative probe command documented by each adapter and required before route activation.
- `evidence_summary`: dirty invoking checkout snapshots are recorded without mutation; tracked symlink, absolute path, source `--git-dir`, ignored-root failure, root escape, and missing capability reject before worktree/ref creation; at least one target adapter must actually deny outside-root/source-Git writes before phase 2c/2d cutover, otherwise all fresh unified writer routes remain disabled; stale descriptors and cleanup ownership mismatches fail closed.
- `remaining_risk`: real OS sandbox enforcement varies by adapter; probe result disables the profile rather than weakening the boundary.

**Review focus:**
- Verify no worker receives central state/ref/object write access and no broad cleanup glob exists.
- Verify source `git-lib.mjs` primitives are reused or wrapped without changing legacy current-run behavior.
- Verify epoch rotation rebuilds only from a verified persisted tree/checkpoint and quarantines old resources.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED real-Git fixtures.** Build temporary repos with linked worktrees, dirty tracked/untracked invoking checkout, tracked symlink, explicit `--git-dir`, missing ignore rules, root-outside path, stale descriptor, and cleanup identity mismatch.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-workspace.test.mjs test/execution-adapter-enforcement.test.mjs test/parallel-exec-git.test.mjs`; expect missing shared workspace/adapter APIs and new negative assertions.
- [ ] **Step 3: Implement descriptor/preflight helpers.** Normalize realpaths, record HEAD/index/status and placement-sensitive untracked/ignored fingerprints, check `.loopx/runs` and `.worktrees/loopx-execution` with `git check-ignore`, and reject unsafe declared paths before side effects.
- [ ] **Step 4: Implement adapter-enforced writer roots.** Add Codex/Claude/Cursor adapter modules that translate the shared writable/read-only root contract into the platform-native worker creation request. An adapter that cannot install a runtime/tool/OS-enforced root returns `capability_unavailable`; it may not substitute cwd or prompt restrictions. The adapter owns create/inspect/cancel/capture only, never DAG or quality decisions.
- [ ] **Step 5: Implement owned resources and live capability probes.** Create root/attempt worktrees and refs only through controller-facing functions; launch the adapter probe worker and attempt root-outside file, tracked symlink target, invoking checkout, source common dir, and explicit source `--git-dir` writes. Persist capability artifact with identity/hash/expiry only when all writes are denied. If no target adapter passes, record the profile unavailable and prevent later fresh-route cutover.
- [ ] **Step 6: Implement verify/rebuild/cleanup.** Require descriptor common-dir/run/lease/epoch/ref/path identity; quarantine stale epoch resources; cleanup only exact owned descriptors and treat missing exact resources as already cleaned.
- [ ] **Step 7: Run focused tests to GREEN.** Run `node --test test/execution-workspace.test.mjs test/execution-adapter-enforcement.test.mjs test/parallel-exec-git.test.mjs`; expect PASS. A platform live probe may be `blocked` in unsupported environments, but then the corresponding route-activation assertion must remain false.
- [ ] **Step 8: Record task evidence.** Capture preflight snapshot, adapter request, real negative-probe outcomes, descriptor JSON, zero-mutation failure paths, and the explicit route availability result.

### T-002 / Task 2: Capture exact tree/blob task deltas and v2 evidence

**Files:**
- Create: `skills/shared/execution/delta-lib.mjs`
- Create: `skills/shared/execution/evidence-lib.mjs`
- Create: `test/execution-delta.test.mjs`
- Create: `test/execution-evidence.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-002","depends_on":["T-001"],"write_scope":["skills/shared/execution/delta-lib.mjs","skills/shared/execution/evidence-lib.mjs","test/execution-delta.test.mjs","test/execution-evidence.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: task base tree, worker HEAD/index/status, declared writes, workspace capability artifact, report/verification receipts, secret redaction policy.
- Produces: `captureExactTaskDelta`, `writeDeltaArtifacts`, `createEvidenceV2`, and `verifyDeltaEvidenceHashes`; artifacts `delta.json`, `delta.sha256`, `delta.patch`, isolated object descriptor, `evidence.json`, `evidence.sha256`.

**Traceability:**
- Source AC: `AC-003`, `AC-015`, `AC-016`, `AC-018`, `AC-022`, `AC-025`
- Design anchors: `D-006`, `D-007`, `D-011`, `D-016`
- Test cases: `TC-002`, `TC-009`, `TC-011`, `TC-012`, `TC-016`, `TC-019`, `TC-020`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-delta.test.mjs test/execution-evidence.test.mjs`
- `evidence_summary`: staged/unstaged/untracked/create/delete/rename/mode/symlink fixtures produce one complete base/candidate tree delta; prior integrated changes are excluded; out-of-scope/secret content is blocked before object write; evidence contains fresh hashes and redacted receipts.
- `remaining_risk`: large/binary content is validated through Git OID/object descriptors, not text-patch snapshots.

**Review focus:**
- Verify temporary index starts at `base_tree`, worker index and candidate tree are separate, isolated objects do not pollute common objects, and actual paths use `--no-renames`.
- Verify evidence hash graph is acyclic (`contract -> report -> delta -> evidence`) and no artifact embeds its own hash.
- Verify ignored files are fingerprinted for cleanup/verification but never staged or copied as candidate content.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED real-Git delta/evidence tests.** Include staged+unstaged+untracked, create/delete/rename, mode-only, symlink, prior-delta exclusion, path overlap, secret-bearing blob, stale report hash, missing command receipt, and binary object fixtures.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-delta.test.mjs test/execution-evidence.test.mjs`; expect missing module/export failures.
- [ ] **Step 3: Implement pre-object inventory and safety gates.** Inventory path/operation/kind with normalized realpaths; reject out-of-scope, secret, sensitive, and oversize content before creating new object/artifact bytes; quarantine unsafe worktree and record minimum path evidence.
- [ ] **Step 4: Implement temporary-index capture.** Read base tree into controller-owned temporary index, stage approved paths with `git add -A`, write candidate tree into isolated object directory, enumerate full tree diff including mode/type/blob OIDs, and write immutable delta core plus sidecars.
- [ ] **Step 5: Implement v2 evidence.** Bind run/task/reservation/attempt/epoch, manifest/task/delta hashes, command receipts, candidate tree, limitations, and requested/observed implementer identity. Redact declared secret fields before persistence; otherwise mark blocked.
- [ ] **Step 6: Run focused tests to GREEN.** Run `node --test test/execution-delta.test.mjs test/execution-evidence.test.mjs`; expect PASS.
- [ ] **Step 7: Record task evidence.** Record delta IDs/tree hashes, object isolation proof, redacted evidence excerpt, and negative secret/out-of-scope assertions.

### T-003 / Task 3: Add review result v2 and fenced finish handoff

**Files:**
- Create: `skills/shared/execution/review-lib.mjs`
- Create: `test/execution-review.test.mjs`
- Modify: `skills/subagent-exec/scripts/review-result-lib.mjs`
- Modify: `skills/subagent-exec/scripts/review-package`
- Modify: `skills/subagent-exec/scripts/review-artifact-verify`
- Modify: `src/finish-runtime.mjs`
- Modify: `skills/finish/SKILL.md`
- Modify: `test/workflow.test.mjs`
- Modify: `test/skill-governance.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-003","depends_on":["T-002"],"write_scope":["skills/shared/execution/review-lib.mjs","test/execution-review.test.mjs","skills/subagent-exec/scripts/review-result-lib.mjs","skills/subagent-exec/scripts/review-package","skills/subagent-exec/scripts/review-artifact-verify","src/finish-runtime.mjs","skills/finish/SKILL.md","test/workflow.test.mjs","test/skill-governance.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: exact delta/evidence artifacts and current final-review/finish contracts.
- Produces: `validateReviewResultV2`, `parseReviewResultV2`, `acceptTaskReview`, `beginFinishHandoff`, `captureFinishEffect`, and review/finish artifacts bound to run/task/reservation/tree/epoch/model hashes. `loopx.review-result.v2` requires `schema`, run/task/reservation/review-attempt identity, `spec_status`, `task_quality`, `findings`, `cannot_verify`, reviewer provenance, input hashes, and `created_at`; `loopx.execution-completion.v1` binds run/generation/manifest/epoch, source/baseline/final tree/commit, all gate hashes, final-review, invoking snapshots, finish result, resource disposition, and timestamps.

**Traceability:**
- Source AC: `AC-015`, `AC-016`, `AC-019`, `AC-022`, `AC-025`
- Design anchors: `D-006`, `D-007`, `D-011`, `D-013`, `D-015`, `D-016`
- Test cases: `TC-012`, `TC-014`, `TC-016`, `TC-020`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-review.test.mjs test/workflow.test.mjs test/skill-governance.test.mjs`
- `evidence_summary`: v2 accepts `SPEC_COMPLIANT + Approved + Minor`, rejects Critical/Important/cannot_verify/stale hashes, requires fresh fix/re-review, and finish placement revalidates before/after identities with owner/fence; legacy v1 remains read-only.
- `remaining_risk`: existing finish audit remains the user-facing decision owner; unified handoff only supplies verified input and cannot auto-merge/commit/PR.

**Review focus:**
- Verify `review-package` no longer treats cumulative `git diff` as one task and includes untracked/staged content through the exact delta index.
- Verify accepted review cannot be replayed against a new candidate tree or different observed reviewer/model identity.
- Verify finish crash/recovery branches preserve user changes and never force-remove unowned resources.

**Support lenses:** `architecture-designer`, `cli-developer`, `ddia:failure-review`

- [ ] **Step 1: Write RED v2/review/finish tests.** Cover valid Approved+Minor, Critical/Important/cannot_verify, missing/multiple blocks, stale input hashes, fix attempt requiring fresh delta, finish intent/token, before/after/unknown effect, dirty invoking checkout, stale epoch, and cleanup mismatch.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-review.test.mjs test/workflow.test.mjs`; expect current v1 parser/finish path to reject or ignore required v2 fields.
- [ ] **Step 3: Implement canonical v2 parser/acceptance.** Require exact schema fields and hash identities, persist raw message/rollout hash plus canonical result, allow Minor only with Approved, and map any blocking finding to `Needs fixes`.
- [ ] **Step 4: Update review package/artifact scripts.** Make `review-package` consume delta/evidence index paths and report hashes; make `review-artifact-verify` validate v2 provenance while retaining a read-only v1 compatibility branch for frozen legacy engine.
- [ ] **Step 5: Implement epoch-aware finish handoff.** Add internal finish begin/capture paths that persist intent/token, revalidate authoritative claim and full invoking snapshot before mutation, capture effect immediately, reconcile before/after/unknown, and let existing finish choice own disposition.
- [ ] **Step 6: Run focused tests to GREEN.** Run `node --test test/execution-review.test.mjs test/workflow.test.mjs test/skill-governance.test.mjs`; expect PASS.
- [ ] **Step 7: Record task evidence.** Record v2 artifacts, Minor/Important decisions, finish before/after identities, and blocked evidence retention.

## Plan Verification

```bash
node --test test/execution-workspace.test.mjs test/execution-delta.test.mjs test/execution-evidence.test.mjs test/execution-review.test.mjs
node --test test/workflow.test.mjs test/skill-governance.test.mjs
git diff --check
```

Expected: all focused/regression tests pass; current final-review six-stage responsibility remains; no invoking-checkout or unowned resource is mutated by fixtures.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/04-workspace-delta-quality.md
```
