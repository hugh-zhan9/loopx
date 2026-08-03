# Unified State, Writer Lease, And Internal Facade Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for the independent state and lease foundations. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md` (sections 4.3, 4.9, 4.10, 4.11)

**Canonical contract:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

**Goal:** Add the versioned run/task/reservation state machine, append-only writer lease/fencing, durable event checkpoints, and token-bound internal JSON facade required for deterministic prepare/resume/recovery.

**Architecture:** `state-lib.mjs` owns immutable manifest references, epoch-scoped state/events, CAS transitions, operation idempotency, and completion. `lease-lib.mjs` owns Git-common-dir cooperative authorization and append-only epoch claims. `runtime.mjs` is the only mutation facade; controller shims consume `next_actions` and never calculate DAG/state or write central artifacts directly.

**Tech Stack:** Node.js ESM, owner-only filesystem artifacts, `O_EXCL`, atomic rename/fsync-compatible writes, `node:crypto`, `node:test`, Git metadata paths.

**Support lenses:** `architecture-designer`, `ddia:failure-review`, `cli-developer`

**Execution strategy recommendation:** `subagent-exec`

**Selection rationale:** State transitions and lease claims have disjoint files and explicit injected interfaces, so their foundations can be implemented and reviewed independently. The runtime facade remains gated on both reviewed results and owns their combined fault-injection behavior.

```loopx-parallel-plan
{"schema":"loopx.parallel-plan.v1","max_parallel":2}
```

## Global Constraints

- State schema is `loopx.execution-state.v1`; event schema is `loopx.execution-event.v1`; request/response schemas are `loopx.execution-request.v1` and `loopx.execution-response.v1`.
- State mutations require `operation_id`, request digest, expected revision, matching `lease_id + epoch`, and the epoch-local mutex. Unknown schemas/fields/events, gaps, forks, hash mismatches, and identity mismatches fail closed.
- Epoch claims are append-only under the real Git common dir. `current.json` is a rebuildable cache only. Heartbeats and elapsed time are diagnostic, never takeover proof.
- `busy` produces zero `.loopx/runs`, worktree, ref, cache, or state mutation. Read-only runs do not take the writer lease. Cross-repo capacity is not implemented.
- Native spawn persist gaps become `uncertain`; late/unbound results are rejected. Replacement is allowed only after adapter/process evidence proves the original terminal, and is bounded to one default replacement.
- Internal facade is not a public CLI: owner-only request file, one JSON stdout response, diagnostics on stderr, no shell-encoded JSON or human-prose branching.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md` — all three Important findings closed
- Residual risk: process termination evidence depends on adapter capabilities; the kernel must block rather than guess when evidence is absent.

---

### T-001 / Task 1: Implement epoch-scoped state, event checkpoints, and recovery replay

**Files:**
- Create: `skills/shared/execution/state-lib.mjs`
- Create: `test/execution-state.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-001","depends_on":[],"write_scope":["skills/shared/execution/state-lib.mjs","test/execution-state.test.mjs"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: immutable manifest from child `02`, the injected fence interface `assertFence({ commonDir, leaseId, epoch, mutationKind })`, and transition payloads from the runtime facade. This task’s unit tests use a strict fake fence; `T-002` supplies the production `lease-lib.mjs` implementation before the facade is executable.
- Produces: `createInitialExecutionState`, `readExecutionState`, `transitionExecutionState`, `replayAdjacentEvent`, `verifyExecutionIdentity`, `writeCompletionRecord`, status/transition constants, and task/reservation acceptance helpers. The state object requires `schema`, `revision`, `run_id`, `epoch`, `lease`, `status`, `manifest_sha256`, `repo`, `profile`, `risk`, `tasks`, `reservations`, `children`, `integration`, `review`, `finish`, `updated_at`, and `last_error`.

**Traceability:**
- Source AC: `AC-004`, `AC-006`, `AC-008`, `AC-012`, `AC-013`, `AC-014`, `AC-022`
- Design anchors: `D-003`, `D-009`, `D-011`, `D-015`
- Test cases: `TC-003`, `TC-004`, `TC-007`, `TC-009`, `TC-010`, `TC-016`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-state.test.mjs`
- `evidence_summary`: valid graph transitions persist immutable events then state; duplicate operation IDs return the same result; stale revisions/epochs, unknown schema, event gaps/forks, and mismatched identity block; terminal completion is idempotent.
- `remaining_risk`: native worker identity reconciliation is exercised through adapter fixtures in child `04`.

**Review focus:**
- Check state graphs exactly match the source, especially `decision_required`, `finish_in_flight`, `superseded`, and terminal idempotency.
- Check state and event hashes form adjacent replay proof and that state mutex records are not deleted by TTL.
- Check task-stage acceptance prevents old/late results from replacing `current_candidate`.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED state tests.** Cover initial prepare, all legal run/task/reservation transitions, duplicate terminal operations, revision CAS loss, event/state crash windows, unknown schema/event, stale epoch mutation, and accepted-result deduplication.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-state.test.mjs`; expect missing module/export failures.
- [ ] **Step 3: Implement state layout and constants.** Use `.loopx/runs/<run-id>/.gitignore` with `*`, `epochs/e000001/`, owner-only modes, immutable `manifest.json`, `events/NNNNNNNN-operation.json`, task attempt paths, conflict/review/completion paths.
- [ ] **Step 4: Implement atomic transition protocol.** Acquire epoch-local `state.mutex` with `O_EXCL`, re-read authoritative lease/epoch and revision, validate expected identity, compute complete next snapshot, atomically rename event then state, and release the mutex.
- [ ] **Step 5: Implement deterministic recovery and completion.** Accept only one adjacent event whose previous revision/before hash matches; treat state already at after hash as completed; otherwise fail closed. Write an immutable completion record and return the same record on retries.
- [ ] **Step 6: Run focused tests to GREEN.** Run `node --test test/execution-state.test.mjs`; expect PASS.
- [ ] **Step 7: Record task evidence.** Capture status graph fixture results, event/state hashes, duplicate operation result, and zero-mutation rejection evidence.

### T-002 / Task 2: Implement Git-common-dir writer lease and fencing epochs

**Files:**
- Create: `skills/shared/execution/lease-lib.mjs`
- Create: `test/execution-lease.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-002","depends_on":[],"write_scope":["skills/shared/execution/lease-lib.mjs","test/execution-lease.test.mjs"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: realpath-normalized Git common dir and prepare identity `{run_id,generation,workspace_strategy,operation_id,request_sha256}`.
- Produces: `acquireWriterLease`, `releaseWriterLease`, `recoverWriterLease`, `readAuthoritativeClaim`, `assertFence`, `recordHeartbeat`, and structured errors `busy`, `lease_recovery_blocked`, `stale_fence`, `legacy_owner_unfenced`.

**Traceability:**
- Source AC: `AC-005`, `AC-009`, `AC-010`, `AC-011`, `AC-022`, `AC-026`
- Design anchors: `D-005`, `D-010`, `D-014`, `D-015`
- Test cases: `TC-006`, `TC-007`, `TC-008`, `TC-015`, `TC-016`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-lease.test.mjs`
- `evidence_summary`: linked worktree writer race yields one winner/one structured busy with zero run mutation; new epoch rejects five stale mutation classes; paused legacy/finish/mutex owners cannot be taken over without terminal evidence; released epoch cannot be reactivated through cache edits.
- `remaining_risk`: cooperative lease does not govern external/manual Git writers, exactly as the source non-goal states.

**Review focus:**
- Verify authorization key is `realpath(git rev-parse --git-common-dir)` and claims are append-only `O_EXCL` files under `loopx/execution-writer/claims/`.
- Verify `current.json` is derived-only and every mutation recomputes authoritative maximum epoch from claims/releases.
- Verify heartbeats never release ownership and no elapsed-time shortcut allows takeover.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED race/fence fixtures.** Use temporary Git repositories and linked worktrees to test two writers, two repos, read-only run, stale mutex, released claim, old cache rewrite, paused unified owner, paused unfenced legacy owner, and finish/state mutex holders.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-lease.test.mjs`; expect missing module/export failures.
- [ ] **Step 3: Implement claim/release schemas.** Persist `loopx.repo-writer-lease-claim.v1` with common-dir hash, lease/epoch/run/generation, owner identity, prepare operation/digest, predecessor claim hash, heartbeat path, and `recoverable`; persist matching release claim without rewriting acquire files.
- [ ] **Step 4: Implement acquire/busy/recovery.** Serialize only short claim operations with `O_EXCL` mutex. Return structured busy before creating any run/worktree/ref. Recover only with terminal evidence and create append-only next epoch; quarantine stale mutex only after terminal proof.
- [ ] **Step 5: Implement fence assertions.** Require matching lease ID/epoch on state, Git, integration, completion, and cleanup mutation; reject stale pointers/cache writes.
- [ ] **Step 6: Run focused tests to GREEN.** Run `node --test test/execution-lease.test.mjs`; expect PASS.
- [ ] **Step 7: Record task evidence.** Record claim history, busy payload, stale-fence codes, and old-cache negative assertion.

### T-003 / Task 3: Expose the internal JSON runtime facade and reservation binding

**Files:**
- Create: `skills/shared/execution/runtime.mjs`
- Create: `skills/shared/execution/scheduler-lib.mjs`
- Create: `test/execution-runtime.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-003","depends_on":["T-001","T-002"],"write_scope":["skills/shared/execution/runtime.mjs","skills/shared/execution/scheduler-lib.mjs","test/execution-runtime.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: `contracts.mjs`, `compiler-lib.mjs`, `state-lib.mjs`, `lease-lib.mjs`, the baseline pure scheduler interface `computeReadyStages({ manifest, state })`/`selectNextStages({ manifest, state, capacity })`, plus owner-only request JSON.
- Produces: executable `prepare`, `next`, `reserve`, `transition`, `finish_begin`, `finish_capture`, `complete`, and `lease_recover` operations plus the authoritative baseline `scheduler-lib.mjs` owner that child `06` extends without replacing. Request fields are exactly `operation`, `operation_id`, `request_sha256`, `run_id`, `expected_revision`, `lease`, and `payload`. Response fields are exactly `ok`, `operation`, `operation_id`, `run_id`, `revision`, `status`, `result`, `next_actions`, and `error`; statuses are `ok`, `idle`, `busy`, `backpressure`, `decision_required`, `blocked`, and `error`. Allowed `next_actions` are only `create_worker`, `wait_worker`, `cancel_worker`, and `capture_result`.

**Traceability:**
- Source AC: `AC-003`, `AC-012`, `AC-013`, `AC-014`, `AC-021`
- Design anchors: `D-003`, `D-009`, `D-011`, `D-016`
- Test cases: `TC-002`, `TC-003`, `TC-009`, `TC-010`, `TC-014`, `TC-015`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-runtime.test.mjs`; `node skills/shared/execution/runtime.mjs prepare --request <owner-only-json>`; same command with stale token/unknown field fixtures.
- `evidence_summary`: valid calls return exactly one complete JSON response and stable exit codes; `next -> reserve` selection token is bound to revision/policy/capability; nested/unbound/duplicate results are rejected; prepare retry with same digest is idempotent.
- `remaining_risk`: aliases are not cut over until child `05`; this task exposes only the internal facade.

**Review focus:**
- Verify caller-supplied `run_id`, `operation_id`, and request digest are required before lease mutation and are reused on retry.
- Verify the controller shim cannot supply arbitrary stages or actions; reserve recomputes readiness inside the state mutex.
- Verify stdout contains one JSON object, diagnostics go to stderr, and internal exit codes do not change public CLI exits.

**Support lenses:** `cli-developer`, `ddia:failure-review`

- [ ] **Step 1: Write RED facade tests.** Cover every operation, unknown field, malformed owner-only request, duplicate digest conflict, stale selection token, revision mismatch, invalid reservation result, nested agent action, and stdout/stderr/exit behavior.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-runtime.test.mjs`; expect missing facade failures.
- [ ] **Step 3: Implement the authoritative baseline scheduler and request parsing.** Create `scheduler-lib.mjs` with pure explicit-DAG ready selection, stable topological/path/anchor ordering, and bounded capacity input; read only owner-only JSON files, canonicalize `{operation,run_id,expected_revision,lease,payload}`, and map errors to `0/2/3/4/5/6/7/130` without prose parsing.
- [ ] **Step 4: Implement operations.** `prepare` validates/compiles/acquires/persists; `next` calls the baseline scheduler and returns an opaque token; `reserve` rechecks token/readiness with the same scheduler version inside the mutex; `transition` records effect/result; finish/complete calls remain fence-bound and idempotent.
- [ ] **Step 5: Implement orphan/uncertain dispatch handling.** Persist reservation before create action; accept late results only with reservation binding; permit one replacement only after terminal evidence, otherwise block.
- [ ] **Step 6: Run focused tests to GREEN.** Run `node --test test/execution-runtime.test.mjs`; expect PASS.
- [ ] **Step 7: Record task evidence.** Record sample JSON envelopes, exit codes, selection token hash, and uncertain/orphan branch evidence.

## Plan Verification

```bash
node --test test/execution-state.test.mjs test/execution-lease.test.mjs test/execution-runtime.test.mjs
git diff --check
```

Expected: focused tests pass; invalid runtime usage is covered by the test suite without creating `.loopx/runs`; state/lease artifacts remain owner-only and gitignored.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/03-state-lease-facade.md
```
