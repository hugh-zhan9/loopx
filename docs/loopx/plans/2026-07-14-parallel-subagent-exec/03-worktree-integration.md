# Parallel Worktree Integration Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for independently delegable tasks or `loopx:exec` for tightly coupled or context-continuous work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-14-parallel-subagent-exec/需求设计文档.md`

**Goal:** Implement controller-owned Git worktree topology, scope validation, ephemeral task commits, deterministic no-commit integration, index-tree recovery, conflict evidence, and owned-resource cleanup.

**Architecture:** One Git library wraps `execFile` operations and validates every path/ref against a recorded ownership descriptor. Task branches produce controller-created ephemeral commits; integration worktrees accumulate them through `cherry-pick --no-commit`, with `git write-tree` snapshots restoring prior accumulated state after conflict.

**Tech Stack:** Node.js ESM, Git CLI, `node:child_process`, `node:fs/promises`, `node:path`, `node:test` temporary repositories.

**Support lenses:** `architecture-designer`, `cli-developer`

**Execution strategy recommendation:** `exec`

**Selection rationale:** Worktree ownership, branch naming, index snapshots, conflict recovery, and cleanup operate on one real Git graph. Continuous debugging in temporary repositories is safer than parallel edits to the same helper and fixtures.

```loopx-parallel-plan
{
  "schema": "loopx.parallel-plan.v1",
  "max_parallel": 4
}
```

## Global Constraints

- Use `execFile` argument arrays; never interpolate plan paths, branch names, or commit ids into shell commands.
- Never reset, clean, checkout, stage, commit, or remove anything in the invoking checkout. Destructive recovery is allowed only after exact owned-worktree verification.
- Require an ignored primary-root `.worktrees/parallel-subagent-exec/<run-id>/`; do not edit `.gitignore` automatically and do not create nested worktrees inside a linked invoking worktree.
- Permit uncommitted source plan/design artifacts as read-only hashed inputs; reject tracked code changes and untracked paths that overlap declared `write_scope`.
- Workers do not stage or commit. Controller-only methods create ephemeral/formal commits and integrate them.
- Do not modify `skills/using-git-worktrees/` or `skills/subagent-exec/`; this owning workflow has a distinct multi-worktree contract.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Plan review verdict: approved
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Residual risk: native Codex/Claude/Cursor concurrency is contract-tested through deterministic adapters and simulations; live multi-agent stress evaluation is intentionally deferred until the user's manual testing.

---

### T-001 / Task 1: Implement Git topology discovery and owned worktree lifecycle

**Files:**
- Create: `skills/parallel-subagent-exec/scripts/git-lib.mjs`
- Create: `test/parallel-exec-git.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-001",
  "depends_on": [],
  "write_scope": [
    "skills/parallel-subagent-exec/scripts/git-lib.mjs",
    "test/parallel-exec-git.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: invoking cwd, run id, owned branch/worktree descriptor, baseline commit, declared write scopes.
- Produces: Git topology evidence, dirty-path classification, deterministic branch/path ids, worktree create/verify/remove primitives.

**Traceability:**
- Source AC: `AC-004`, `AC-025`, `AC-032`, `AC-033`
- Design anchors: `D-005`, `D-016`, `D-017`
- Test cases: `TC-004`, `TC-021`, `TC-027`, `TC-028`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-exec-git.test.mjs --test-name-pattern='topology|ownership|dirty|create|cleanup'`
- `evidence_summary`: temporary repositories prove primary-root discovery, ignored-root enforcement, non-nested worktrees, dirty-path rejection, ownership mismatch rejection, and success/block cleanup boundaries.
- `remaining_risk`: Git behavior outside supported current command set/platform filesystem semantics is not normalized.

**Review focus:**
- Verify every mutating operation requires repo/common-dir/worktree/branch identity equality.
- Verify invoking checkout status and content are byte-identical before and after every test.
- Verify source plan/design untracked files are allowed but overlapping untracked implementation files are blocked.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Write failing real-Git lifecycle tests**

Create a temporary repository helper that initializes user name/email, commits a baseline, and can add a linked invoking worktree. Cover normal and linked invocation, ignored/missing-ignore `.worktrees`, paths with spaces, sanitized long ids, tracked dirty code, allowed untracked plan, overlapping untracked code, permission failure, ownership mismatch, and cleanup.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test test/parallel-exec-git.test.mjs --test-name-pattern='topology|ownership|dirty|create|cleanup'
```

Expected: FAIL because `git-lib.mjs` does not exist.

- [ ] **Step 3: Implement topology and baseline inspection**

Export:

```javascript
export async function inspectGitTopology({ cwd }) {}
export async function inspectInvokingWorktree({ cwd, sourcePaths, writeScope }) {}
export function ownedRefNames({ runId, kind, qualifiedId, attempt = 1 }) {}
export async function assertWorktreeRootIgnored({ primaryRoot, worktreeRoot }) {}
```

`inspectGitTopology` must use `git rev-parse`, `git worktree list --porcelain`, and realpaths to return invoking root, primary root, common dir, branch, and HEAD. `inspectInvokingWorktree` rejects any tracked change and only rejects untracked paths that overlap normalized exact write scope; source paths are recorded separately as read-only inputs.

- [ ] **Step 4: Implement owned worktree create/verify/remove**

Export:

```javascript
export async function createOwnedWorktree({ topology, descriptor, baseCommit }) {}
export async function verifyOwnedWorktree({ topology, descriptor }) {}
export async function removeOwnedWorktree({ topology, descriptor, removeBranch }) {}
```

Use exact descriptors persisted by the controller. Reject branch/path reuse with mismatched HEAD or common dir. Cleanup must never infer ownership from name prefix alone.

- [ ] **Step 5: Run lifecycle tests to GREEN**

Run the focused command from Step 2. Expected: PASS and invoking checkout content/status unchanged.

- [ ] **Step 6: Record task evidence**

Record topology payloads, owned descriptor examples, dirty/untracked classifications, cleanup results, command output, and invoking-checkout negative evidence.

### T-002 / Task 2: Implement ephemeral commits and deterministic no-commit fan-in

**Files:**
- Modify: `skills/parallel-subagent-exec/scripts/git-lib.mjs`
- Modify: `test/parallel-exec-git.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-002",
  "depends_on": ["T-001"],
  "write_scope": [
    "skills/parallel-subagent-exec/scripts/git-lib.mjs",
    "test/parallel-exec-git.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: reviewed task worktree descriptor, declared write scope, integration descriptor, deterministic queue item.
- Produces: validated ephemeral commit, pre-apply index tree snapshot, no-commit task apply result, formal boundary commit helper, and normal child-boundary cherry-pick preserving one commit per child.

**Traceability:**
- Source AC: `AC-018`, `AC-019`, `AC-020`, `AC-027`
- Design anchors: `D-007`, `D-009`
- Test cases: `TC-015`, `TC-016`, `TC-022`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-exec-git.test.mjs --test-name-pattern='ephemeral|fan-in|order|snapshot'`
- `evidence_summary`: controller creates task commits only after scope validation; no-commit task fan-in preserves deterministic content; single-plan/child histories contain only formal boundaries; package history retains one ordered commit per child.
- `remaining_risk`: semantic merge correctness still requires task/plan review, not Git mechanics alone.

**Review focus:**
- Verify `git add --all` and commit run only in an owned reviewed task worktree.
- Verify integration branches do not receive task-level commits.
- Verify completion order permutations produce identical integrated tree and formal commit content.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Add failing commit/fan-in tests**

Create two task worktrees from the same base, change disjoint files, create controller commits, and integrate in the required queue order. Add a third test that completes tasks in reverse order but asserts identical final tree. Assert `git log` on the integration branch contains one formal boundary commit and no task subjects. Add two child boundary commits and assert normal ordered cherry-pick retains exactly one visible commit per child without exposing ephemeral task subjects.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
node --test test/parallel-exec-git.test.mjs --test-name-pattern='ephemeral|fan-in|order|snapshot'
```

Expected: FAIL because commit/fan-in exports are missing.

- [ ] **Step 3: Implement scope validation and ephemeral commit creation**

Export:

```javascript
export async function createEphemeralTaskCommit({ topology, descriptor, writeScope, message }) {}
export async function snapshotIntegrationTree({ topology, descriptor }) {}
```

Compare `git status --porcelain` changed paths with exact `writeScope` before staging. Store HEAD, index tree, and status in the snapshot.

- [ ] **Step 4: Implement no-commit apply and formal boundary commit**

Export:

```javascript
export async function applyEphemeralCommit({ topology, integration, taskCommit, snapshot }) {}
export async function createBoundaryCommit({ topology, integration, message }) {}
export async function applyBoundaryCommit({ topology, integration, boundaryCommit, snapshot }) {}
```

Apply task commits with `git cherry-pick --no-commit <taskCommit>`. On success, retain staged accumulated changes. Formal commit occurs once at plan/child boundary. Apply reviewed child boundary commits with normal `git cherry-pick <boundaryCommit>` in overview order so the package history contains one commit per child; return conflict evidence without committing an unresolved index.

- [ ] **Step 5: Run focused tests to GREEN**

Run the command from Step 2. Expected: PASS with identical trees across completion-order permutations and no task commits in integration history.

- [ ] **Step 6: Record task evidence**

Record task commit ids, integration tree hashes, final log subjects, order permutation results, and scope validation evidence.

### T-003 / Task 3: Implement conflict evidence, tree restoration, and preserved cleanup states

**Files:**
- Modify: `skills/parallel-subagent-exec/scripts/git-lib.mjs`
- Modify: `test/parallel-exec-git.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-003",
  "depends_on": ["T-002"],
  "write_scope": [
    "skills/parallel-subagent-exec/scripts/git-lib.mjs",
    "test/parallel-exec-git.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: failed no-commit apply, pre-apply snapshot, conflict artifact output path, owned resource list, completion disposition.
- Produces: restored accumulated index/worktree, structured conflict evidence, success cleanup or blocked preservation summary.

**Traceability:**
- Source AC: `AC-005`, `AC-021`, `AC-022`, `AC-027`, `AC-033`
- Design anchors: `D-008`, `D-009`, `D-016`, `D-017`
- Test cases: `TC-006`, `TC-017`, `TC-018`, `TC-022`, `TC-028`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-exec-git.test.mjs`
- `evidence_summary`: forced conflicts restore the exact pre-apply tree without losing earlier accumulated task changes; conflict artifacts identify paths/hunks; blocked resources remain and successful temporary resources are removed.
- `remaining_risk`: reconciliation worker behavior is orchestrated in child plan `04`; this task proves deterministic Git recovery inputs.

**Review focus:**
- Verify restoration acts only on the exact owned integration worktree and snapshot.
- Verify cleanup never removes the root integration worktree before `finish` ownership.
- Verify conflict artifact content is sufficient for a fresh reconciliation worker without leaving the integration index conflicted.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Add failing conflict and disposition tests**

Create an integration worktree with one earlier staged task, then apply a conflicting second task. Assert recovery restores the earlier staged tree exactly. Add success cleanup, blocked preservation, child-boundary conflict, invalid snapshot, and root-preservation cases.

- [ ] **Step 2: Run the full Git test and confirm RED**

Run:

```bash
node --test test/parallel-exec-git.test.mjs
```

Expected: FAIL because recovery/conflict/cleanup exports are missing.

- [ ] **Step 3: Implement conflict collection and exact tree restoration**

Export:

```javascript
export async function collectConflictEvidence({ topology, integration, sourceCommit, sourceKind, outputPath }) {}
export async function restoreIntegrationTree({ topology, integration, snapshot }) {}
```

Collect status, unmerged paths, source task/child commit diff/stat, source kind, pre-apply HEAD/tree, and Git stderr. Restore the saved tree and verify `git write-tree` equals `snapshot.indexTree` before returning success.

- [ ] **Step 4: Implement disposition-based cleanup**

Export:

```javascript
export async function cleanupOwnedResources({ topology, resources, disposition }) {}
```

For `complete`, remove task/retry/child worktrees and temp branches but preserve root integration. For `blocked`/`interrupted`, remove nothing and return the preserved path/ref list. Reject unknown dispositions.

- [ ] **Step 5: Run all Git tests to GREEN**

Run:

```bash
node --test test/parallel-exec-git.test.mjs
```

Expected: PASS; invoking checkout remains unchanged; prior staged integration state survives forced conflict.

- [ ] **Step 6: Record task evidence**

Record conflict artifacts, pre/post tree hashes, cleanup/preservation lists, child-boundary conflict evidence, and full test output.

## Plan Verification

```bash
node --test test/parallel-exec-git.test.mjs
git diff --check
```

Expected: all tests pass in temporary repositories; no file under `skills/using-git-worktrees/` or `skills/subagent-exec/` changes.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-14-parallel-subagent-exec/03-worktree-integration.md
```
