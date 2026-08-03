# Parallel Execution State And Scheduler Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for independently delegable tasks or `loopx:exec` for tightly coupled or context-continuous work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-14-parallel-subagent-exec/需求设计文档.md`

**Goal:** Implement the versioned atomic run state and deterministic bounded scheduler as pure Node.js modules, independent of Git worktree operations and platform-specific agent tools.

**Architecture:** `state-lib.mjs` owns schema v1, atomic CAS transitions, run identity, resume snapshots, and completion compaction. `scheduler-lib.mjs` consumes the normalized manifest plus state to calculate ready stages, priority, exclusive barriers, global worker reservations, and capacity backpressure without spawning agents itself.

**Tech Stack:** Node.js ESM, `node:fs/promises`, `node:crypto`, `node:path`, `node:test`.

**Support lenses:** `architecture-designer`, `cli-developer`

**Execution strategy recommendation:** `exec`

**Selection rationale:** State statuses, revision CAS, readiness, reservation, retry counters, and scheduler priority are one state machine. Continuous same-context debugging is more important than fresh worker isolation.

```loopx-parallel-plan
{
  "schema": "loopx.parallel-plan.v1",
  "max_parallel": 4
}
```

## Global Constraints

- Depend on the normalized manifest exported by `01-parallel-plan-contract`; do not parse Markdown or duplicate schema rules.
- Persist every reservation before external dispatch; reject stale `expected_revision` and unknown state schemas.
- Count all leaf worker roles in the same global budget; controller-side state/Git operations do not consume worker slots.
- Capacity exhaustion is backpressure, not a task attempt or failure.
- Do not add platform tool calls, Git commands, public CLI commands, or npm dependencies in this child plan.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Plan review verdict: approved
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Residual risk: native Codex/Claude/Cursor concurrency is contract-tested through deterministic adapters and simulations; live multi-agent stress evaluation is intentionally deferred until the user's manual testing.

---

### T-001 / Task 1: Implement atomic run state and strict resume snapshots

**Files:**
- Create: `skills/parallel-subagent-exec/scripts/state-lib.mjs`
- Create: `test/parallel-exec-state.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-001",
  "depends_on": [],
  "write_scope": [
    "skills/parallel-subagent-exec/scripts/state-lib.mjs",
    "test/parallel-exec-state.test.mjs"
  ],
  "parallel_safe": true
}
```

**Interfaces:**
- Consumes: `loopx.parallel-exec-manifest.v1`, canonical control-root/source/baseline identities, root integration/startup artifact identities, state operation objects, expected revision.
- Produces: `createInitialState`, `readRunState`, `transitionRunState`, `verifyRunIdentity`, `writeCompletionState`, task/child/run status constants, and persisted root-worktree startup ownership.

**Traceability:**
- Source AC: `AC-030`, `AC-031`, `AC-032`, `AC-033`
- Design anchors: `D-010`, `D-012`, `D-016`
- Test cases: `TC-025`, `TC-026`, `TC-027`, `TC-028`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-exec-state.test.mjs`
- `evidence_summary`: same-directory temporary writes and rename produce monotonic revision snapshots; stale revisions and identity mismatches dispatch nothing; completion compaction preserves required evidence.
- `remaining_risk`: process crash durability is bounded by filesystem rename semantics; no cross-host guarantee is claimed.

**Review focus:**
- Verify all design-specified run/task/child statuses are explicit and illegal transitions are rejected.
- Verify state files use mode `0600`, workspace `.gitignore` content is `*\n`, and unknown schemas are not normalized.
- Verify repeated completed invocation is idempotent and blocked/interrupted state is never cleaned as success.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Write failing state transition and filesystem tests**

Cover initial state creation, every legal task/child/run transition, illegal transition rejection, stale revision, atomic temp cleanup, missing/unknown schema, matching resume, baseline/input/worktree/startup-artifact mismatch, repeated completed invocation, success compaction, and blocked preservation.

Use exact state constants:

```javascript
export const RUN_STATUSES = Object.freeze([
  'initializing', 'running', 'blocked', 'reviewing', 'ready_for_finish', 'complete', 'interrupted',
]);

export const TASK_STATUSES = Object.freeze([
  'pending', 'ready', 'dispatch_reserved', 'capacity_wait', 'implementing',
  'awaiting_review', 'reviewing', 'needs_fix', 'fixing', 'review_passed',
  'integration_queued', 'integrating', 'reconciling', 'integrated', 'blocked',
]);

export const CHILD_STATUSES = Object.freeze([
  'pending', 'ready', 'running', 'plan_reviewing', 'reviewed',
  'commit_ready', 'integrating', 'integrated', 'rebuilding', 'blocked',
]);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test test/parallel-exec-state.test.mjs
```

Expected: FAIL because `state-lib.mjs` does not exist.

- [ ] **Step 3: Implement the v1 state schema and deterministic run identity**

Export:

```javascript
export const PARALLEL_STATE_SCHEMA = 'loopx.parallel-exec-state.v1';

export function createRunId({ sourceSlug, baselineCommit, sourceSha256 }) {
  return `${sourceSlug}-${baselineCommit.slice(0, 12)}-${sourceSha256.slice(0, 8)}`;
}

export function createInitialState({ runId, manifest, repo, config, now }) {
  return {
    schema: PARALLEL_STATE_SCHEMA,
    revision: 1,
    run_id: runId,
    status: 'initializing',
    input: manifest.input,
    repo,
    config,
    root_integration: null,
    tasks: {},
    children: {},
    active_workers: {},
    updated_at: now,
    last_error: null,
  };
}
```

Populate task/child records from the manifest without inventing dependencies or write scopes.
When the owned root integration worktree is created, require one CAS operation to populate:

```javascript
state.root_integration = {
  worktree: '/canonical/primary/.worktrees/parallel-subagent-exec/<run-id>/root',
  branch: 'loopx/parallel/<run-id>/root',
  head: '<baseline-commit>',
  index_tree: '<tree-id>',
  execution_start: { artifact_path: '<absolute-path>', requirement_start_commit: '<commit>' },
  finish_start: { artifact_path: '<absolute-path>', finish_baseline_commit: '<commit>' },
  canonical_final_review_report: '<absolute-path>',
};
```

The startup fields remain unset until both root-worktree commands complete; dispatch reservation is illegal while any required field is missing.

- [ ] **Step 4: Implement atomic CAS transitions and identity verification**

Use same-directory `state.json.tmp-<pid>-<revision>` writes, `writeFile(..., { mode: 0o600 })`, then `rename`. Require `expectedRevision === state.revision`; increment once per successful operation. Export:

```javascript
export async function transitionRunState({ statePath, expectedRevision, operation, now }) {}
export async function verifyRunIdentity({ state, observed }) {}
export async function writeCompletionState({ runRoot, state, summary, now }) {}
```

`verifyRunIdentity` returns a complete mismatch list and never mutates state.

- [ ] **Step 5: Run state tests to GREEN**

Run:

```bash
node --test test/parallel-exec-state.test.mjs
```

Expected: PASS, including simulated concurrent stale-revision transitions and interrupted resume cases.

- [ ] **Step 6: Record task evidence**

Record `T-001`, `AC-030`-`AC-033`, `D-010`/`D-016`, `TC-025`-`TC-028`, state schema output, focused test result, and filesystem durability limitation.

### T-002 / Task 2: Implement the bounded priority scheduler and capacity backpressure

**Files:**
- Create: `skills/parallel-subagent-exec/scripts/scheduler-lib.mjs`
- Create: `test/parallel-exec-scheduler.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-002",
  "depends_on": ["T-001"],
  "write_scope": [
    "skills/parallel-subagent-exec/scripts/scheduler-lib.mjs",
    "test/parallel-exec-scheduler.test.mjs"
  ],
  "parallel_safe": true
}
```

**Interfaces:**
- Consumes: validated manifest, current state snapshot, configured/known runtime capacity, completed worker observations.
- Produces: deterministic ready stages, sorted reservations, effective worker limit, capacity-wait operations, blocked dependency propagation.

**Traceability:**
- Source AC: `AC-002`, `AC-013`, `AC-014`, `AC-017`, `AC-022`
- Design anchors: `D-004`, `D-008`, `D-011`
- Test cases: `TC-002`, `TC-011`, `TC-012`, `TC-014`, `TC-018`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-exec-state.test.mjs test/parallel-exec-scheduler.test.mjs`
- `evidence_summary`: scheduler never exceeds the minimum cap, prioritizes reconcile/fix/review before implementation, honors task/child exclusive barriers, and propagates blocked dependencies without blocking independent branches.
- `remaining_risk`: runtime-specific capacity classification remains adapter-owned in child plan `04`.

**Review focus:**
- Verify task readiness requires predecessor integration, not merely review completion.
- Verify child readiness requires predecessor boundary commit integration.
- Verify completion timing cannot change tie ordering: topological level, child path, task anchor.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Write failing scheduler tests**

Create deterministic fixtures for more ready nodes than cap, unknown capacity, capacity-exhausted response, fix/review priority, `parallel_safe: false`, `can_run_in_parallel: false`, dependency integration gates, two failed reconciliation attempts, and independent-branch continuation.

- [ ] **Step 2: Run the scheduler test and confirm RED**

Run:

```bash
node --test test/parallel-exec-scheduler.test.mjs
```

Expected: FAIL because `scheduler-lib.mjs` does not exist.

- [ ] **Step 3: Implement effective limits and ordered ready stages**

Export:

```javascript
export const STAGE_PRIORITIES = Object.freeze({
  reconciliation: 0,
  fix: 0,
  task_review: 1,
  plan_review: 1,
  implementation: 2,
});

export function effectiveWorkerLimit({ configuredLimit, runtimeCapacity, readyCount }) {
  const capacity = runtimeCapacity == null ? configuredLimit : runtimeCapacity;
  return Math.min(configuredLimit, capacity, readyCount);
}

export function computeReadyStages({ manifest, state }) {}
export function reserveNextStages({ manifest, state, runtimeCapacity }) {}
```

Sort by priority, topological level, child path, task anchor, then role. Return state operations; do not mutate snapshots in place.

- [ ] **Step 4: Implement backpressure and blocked-path propagation**

Capacity exhaustion creates a `capacity_wait` operation with no attempt increment. Reconciliation count `>= 2` blocks that node and descendants only. Exclusive barriers must wait for active work in their integration scope to drain.

- [ ] **Step 5: Run focused tests to GREEN**

Run:

```bash
node --test test/parallel-exec-state.test.mjs test/parallel-exec-scheduler.test.mjs
```

Expected: PASS with stable ordering across randomized completion sequences.

- [ ] **Step 6: Record task evidence**

Record `T-002`, cap/priority/barrier/blocked-branch fixtures, test output, and adapter-owned residual risk.

## Plan Verification

```bash
node --test test/parallel-exec-state.test.mjs test/parallel-exec-scheduler.test.mjs
git diff --check
```

Expected: all pass; modules have no Git, agent-tool, or Markdown parsing dependencies.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-14-parallel-subagent-exec/02-state-and-scheduler.md
```
