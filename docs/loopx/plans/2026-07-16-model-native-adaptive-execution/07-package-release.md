# Package Fan-In, Supersession Audit, Compatibility, And Release Verification Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for independent package/coverage and release/fault lanes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md` (sections 4.13, 4.17-4.19, 8.3-8.4, 11.3-11.5)

**Canonical contract:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

**Goal:** Preserve package child/plan/spec review ownership, audit every superseded clause and AC/TC disposition, update long-lived installation/docs wording, and prove the complete feature through release/compatibility tests.

**Architecture:** `package-lib.mjs` coordinates child fan-in and stable boundary commits without changing review ownership. A release test derives package inventory and route/surface negatives from canonical files, runs the full default suite including the plugin installer suite, and checks exact current/legacy/unknown behavior. Documentation updates describe fresh unified routes plus frozen current resume while retaining the existing public CLI and install contracts.

**Tech Stack:** Node.js ESM, Git CLI, Markdown docs/specs, `node:test`, `npm pack --dry-run --json`.

**Support lenses:** `architecture-designer`, `cli-developer`, `ddia:failure-review`

**Execution strategy recommendation:** `subagent-exec`

**Selection rationale:** Package fan-in code and the read-only supersession audit are independent foundations. Once both are reviewed, release/docs verification and composed fault verification have disjoint write scopes and can run concurrently before the combined release gate.

```loopx-parallel-plan
{"schema":"loopx.parallel-plan.v1","max_parallel":2}
```

## Global Constraints

- Single-plan root has one formal boundary; each multi-plan child has one reviewed boundary commit; the package has exactly one spec-level final-review and canonical report. Task review never substitutes for child/spec review.
- Child boundary order remains the declared stable manifest order even when future early integration changes internal timing. Blocked siblings do not contaminate independent branches; reconciliation is bounded to two attempts.
- Every superseded old clause is marked `replaced`, `carried_forward`, `unchanged`, or `deferred` with successor AC/TC/D disposition. Safety, review, recovery, Git ownership, and dirty-worktree clauses remain carried forward unless explicitly superseded.
- Current public CLI/skill/install/human/JSON/non-TTY/exit behavior remains unchanged. Fresh unified/current legacy/unknown routing follows child `05`; pre-v2 remains unsupported and no legacy engine is deleted by this package.
- Release gates include `npm test`, `node scripts/verify-skills.mjs`, plugin installer tests, `npm pack --dry-run --json`, `git diff --check`, and negative assertions for public routes, stale/duplicate effects, unowned cleanup, secrets, and tracked runtime state.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md` — all three Important findings closed
- Residual risk: live native multi-agent stress and provider-specific performance claims remain explicitly deferred evaluation evidence.

---

### T-001 / Task 1: Implement package fan-in and child/spec review ownership

**Files:**
- Create: `skills/shared/execution/package-lib.mjs`
- Create: `test/execution-package.test.mjs`
- Modify: `skills/shared/execution/runtime.mjs`
- Modify: `skills/shared/execution/state-lib.mjs`
- Modify: `skills/final-review/SKILL.md`
- Modify: `skills/finish/SKILL.md`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-001","depends_on":[],"write_scope":["skills/shared/execution/package-lib.mjs","test/execution-package.test.mjs","skills/shared/execution/runtime.mjs","skills/shared/execution/state-lib.mjs","skills/final-review/SKILL.md","skills/finish/SKILL.md"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: package child DAG, task review v2 artifacts, verified child trees, declared stable boundary order, plan-level review state, and spec-level final-review contract.
- Produces: `computeChildFrontier`, `createChildBoundaryCommit`, `applyBoundaryInStableOrder`, `rebuildChildAfterConflict`, `validatePackageReviewState`, and one spec-level finish handoff.

**Traceability:**
- Source AC: `AC-015`, `AC-016`, `AC-018`, `AC-022`, `AC-024`, `AC-025`
- Design anchors: `D-006`, `D-007`, `D-011`, `D-013`, `D-015`
- Test cases: `TC-011`, `TC-012`, `TC-018`, `TC-019`, `TC-020`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-package.test.mjs`
- `evidence_summary`: child frontier waits for predecessors; each child boundary requires matching row/review/tree hashes; boundary commits apply in stable order; conflict rebuild creates fresh delta/review and at most two reconciliations; only one package spec-level final-review can unlock finish.
- `remaining_risk`: package state is local and owner-only; cross-repo fan-in is out of scope.

**Review focus:**
- Verify plan-level final-review updates only matching child state and never writes a canonical package report; spec-level review is unique.
- Verify child boundary conflicts block descendants but permit independent siblings and preserve evidence.
- Verify package completion cannot bypass task review, child review, spec review, or finish gates.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Write RED package fixtures.** Cover single plan, multi-plan frontier, blocked sibling, stable boundary order, missing/mismatched row, child conflict/rebuild, two failed reconciliations, and duplicate package completion.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/execution-package.test.mjs`; expect missing package APIs.
- [ ] **Step 3: Implement child frontier/boundary logic.** Require all predecessor boundaries integrated; validate matching manifest/tree/review hashes; create one reviewed boundary commit per child; apply in declared order.
- [ ] **Step 4: Implement conflict rebuild/review.** Rebuild from latest verified package tree, replay declared stable task order, capture fresh exact delta/evidence/review, cap reconciliation at two, block descendants while independent siblings continue.
- [ ] **Step 5: Wire final-review/finish state.** Enforce one spec-level final-review and `ready_for_finish` handoff; keep finish’s existing user Git disposition.
- [ ] **Step 6: Run focused tests to GREEN.** Run `node --test test/execution-package.test.mjs`; expect PASS.
- [ ] **Step 7: Record task evidence.** Record child/package state excerpts, boundary commit order, reconciliation count, and finish-blocking fixtures.

### T-002 / Task 2: Audit supersession and source-to-plan coverage at release time

**Files:**
- Create: `test/execution-supersession.test.mjs`
- Test: `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md`
- Test: `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-002","depends_on":[],"write_scope":["test/execution-supersession.test.mjs"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: source sections 4.17, 11.3-11.5, all child-plan anchors, and exact old-clause disposition table.
- Produces: automated coverage audit for `AC-001`-`AC-026`, `D-001`-`D-016`, `TC-001`-`TC-020`, plus the qualified legacy fixture list and explicit deferred rationale.

**Traceability:**
- Source AC: `AC-001`-`AC-026`
- Design anchors: `D-001`-`D-016`
- Test cases: `TC-001`-`TC-020`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-supersession.test.mjs`
- `evidence_summary`: every anchor maps to a child task/verification/deferred row; every old clause has disposition and successor; missing carry-forward safety or accidental activation of deferred behavior fails the audit.
- `remaining_risk`: the audit checks declared source/plan anchors, not implementation correctness; runtime evidence remains in the child tests/final-review.

**Review focus:**
- Verify the matrix never treats deferred as implemented and never drops carried-forward safety/review/recovery/dirty-worktree clauses.
- Verify the contract/design documents remain internally consistent; no new product decision is invented while closing coverage.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Write RED coverage audit.** Parse source anchor tables and child plans; assert all exact IDs exist and each deferred item has a rationale.
- [ ] **Step 2: Run focused test and confirm RED.** Run `node --test test/execution-supersession.test.mjs`; expect missing coverage mappings before the final plan paths are present.
- [ ] **Step 3: Implement the read-only package coverage audit.** Parse the approved design/contract trace tables plus this package’s child tasks; preserve the approved source files byte-for-byte and fail when a source anchor, old-clause disposition, qualified legacy fixture, or deferred rationale is missing.
- [ ] **Step 4: Run focused test to GREEN.** Run `node --test test/execution-supersession.test.mjs`; expect PASS for all AC/D/TC and old-clause mappings.
- [ ] **Step 5: Record task evidence.** Record coverage counts and deferred list; any missing anchor is release-blocking.

### T-003 / Task 3: Update long-lived docs and run package/release compatibility verification

**Files:**
- Modify: `docs/loopx/specs/installation.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`
- Modify: `test/skill-governance.test.mjs`
- Modify: `plugins/loopx/scripts/plugin-install.test.mjs`
- Create: `test/execution-release.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-003","depends_on":["T-002"],"write_scope":["docs/loopx/specs/installation.md","README.md","README.zh-CN.md","docs/loopx/skills.md","docs/loopx/skills.zh-CN.md","test/skill-governance.test.mjs","plugins/loopx/scripts/plugin-install.test.mjs","test/execution-release.test.mjs"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: complete shared runtime/package surface, phase routing matrix, installer/plugin ownership, existing public CLI/skill/docs snapshots, and package files list.
- Produces: revised long-lived installation rule (“fresh migrated aliases may create unified generation; recognized current state resumes frozen adjacent engine; pre-v2 unsupported”), bilingual/manual documentation, release test, and final evidence commands.

**Traceability:**
- Source AC: `AC-020`, `AC-021`, `AC-022`, `AC-024`, `AC-026`
- Design anchors: `D-001`, `D-004`, `D-014`, `D-015`
- Test cases: `TC-015`, `TC-016`, `TC-018`, `TC-020`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-release.test.mjs`; `npm test`; `npm pack --dry-run --json`; `node scripts/verify-skills.mjs`; `git diff --check`; `git diff --name-only -- 'skills/subagent-exec/**'`
- `evidence_summary`: package tarball contains all canonical shared execution files and no mirror; default suite includes plugin tests; public commands/flags/docs/default route remain unchanged; current/unknown/rollback/cleanup/secret/duplicate negatives pass; no tracked `.loopx` state exists.
- `remaining_risk`: live provider/native stress and performance graduation remain explicitly deferred and documented.

**Review focus:**
- Verify installation docs do not claim an unsupported migration window or public mode/risk CLI.
- Verify English/Chinese docs agree on fresh unified/current legacy/unknown behavior and do not make parallel automatic/default.
- Treat missing package files, omitted plugin tests, changed public output, changed old state, tracked runtime state, stale cleanup acceptance, or `subagent-exec` changes outside the explicit v2 surfaces as release-blocking.

**Support lenses:** `architecture-designer`, `cli-developer`, `ddia:failure-review`

- [ ] **Step 1: Write release assertions first.** Parse `npm pack --dry-run --json`; derive expected `skills/shared/execution/` files from the source tree; assert no `plugins/loopx/skills/` mirror and no new `src/cli.mjs` public command/flag.
- [ ] **Step 2: Run release test and confirm RED.** Run `node --test test/execution-release.test.mjs`; expect failures until docs, package inventory, and final negatives are wired.
- [ ] **Step 3: Update installation spec and docs.** Replace only the old current-only wording with the approved fresh-unified/current-frozen/pre-v2 rule; keep public CLI/install/dry-run/JSON/non-TTY/uninstall contracts. Document disabled-by-default rungs and local-only evidence in both languages.
- [ ] **Step 4: Add compatibility/cleanliness assertions.** Check route matrices, plugin/default suite, exact cleanup/secret/duplicate negatives, `git diff --check`, no tracked `.loopx`, and explicit current-state preservation. Verify `skills/subagent-exec/` diff is limited to the v2 review/routing changes named in child `04`/`05`.
- [ ] **Step 5: Run full release verification.** Run `node --test test/execution-release.test.mjs`, `node scripts/verify-skills.mjs`, `npm test`, `npm pack --dry-run --json`, and `git diff --check`; expect PASS.
- [ ] **Step 6: Record task evidence.** Record tarball inventory, full test summary, docs snapshots, route negatives, source coverage counts, no-runtime-state proof, and deferred live-eval note.

### T-004 / Task 4: Add composed kill/resume fault-integration verification

**Files:**
- Create: `test/execution-fault-integration.test.mjs`
- Test: `skills/shared/execution/runtime.mjs`
- Test: `skills/shared/execution/lease-lib.mjs`
- Test: `skills/shared/execution/state-lib.mjs`
- Test: `skills/shared/execution/workspace-lib.mjs`
- Test: `skills/shared/execution/delta-lib.mjs`
- Test: `skills/shared/execution/review-lib.mjs`
- Test: `src/finish-runtime.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-004","depends_on":["T-001","T-002"],"write_scope":["test/execution-fault-integration.test.mjs"],"parallel_safe":true}
```

**Interfaces:**
- Consumes: complete prepared-run facade, lease/state/workspace/delta/review/integration/finish APIs and real temporary Git repositories.
- Produces: one end-to-end fault suite that kills/restarts at prepare claim/manifest/e1, next/reserve, dispatch capture, review persistence, Git apply checkpoint, finish intent/effect/capture, and cleanup, then verifies deterministic replay or fail-closed blocking.

**Traceability:**
- Source AC: `AC-005`, `AC-006`, `AC-010`, `AC-012`, `AC-013`, `AC-014`, `AC-016`, `AC-022`, `AC-025`
- Design anchors: `D-003`, `D-005`, `D-006`, `D-007`, `D-009`, `D-010`, `D-011`, `D-015`
- Test cases: `TC-004`, `TC-006`, `TC-007`, `TC-009`, `TC-010`, `TC-012`, `TC-016`, `TC-020`
- Task anchor: `T-004`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-fault-integration.test.mjs`
- `evidence_summary`: each injected crash resumes to exactly one accepted result/review/integration/completion/cleanup or a structured block; stale epoch writes in state/Git/integration/completion/cleanup all fail; invoking checkout HEAD/index/tracked/untracked snapshot remains byte-identical until an authorized finish effect; task review and full final-review gates cannot be bypassed.
- `remaining_risk`: native provider process-control gaps are represented as `uncertain/blocked`; the suite never assumes terminal evidence it cannot observe.

**Review focus:**
- Verify this is a composed runtime test, not a repetition of unit mocks: it must use real Git repositories, persisted files, restart/reload boundaries, and the same public internal facade entry.
- Verify before/after snapshots include HEAD, index tree, tracked content hashes, existing untracked/placement-sensitive ignored items, owned refs/worktrees, and completion/cleanup identities.
- Verify each fault point has an exact duplicate/stale negative assertion and no test normalizes unknown state to success.

**Support lenses:** `architecture-designer`, `ddia:failure-review`

- [ ] **Step 1: Build the end-to-end fixture harness.** Create a temp Git repo with ignored `.loopx/runs`/`.worktrees/loopx-execution`, dirty invoking content, one delegated task, deterministic fake adapter terminal evidence, exact verification command, task reviewer result, and finish placement stub.
- [ ] **Step 2: Add kill-point table cases.** Parameterize prepare claim/manifest/e1, next/reserve, dispatch, result capture, review, integration intent/effect/result, finish intent/effect/capture, completion, and cleanup; restart by rereading only persisted artifacts.
- [ ] **Step 3: Add stale/duplicate/invariance assertions.** After epoch recovery, inject old state/Git/integration/completion/cleanup calls and require fence errors; replay accepted result/review/integration/complete/cleanup and require identical result/no duplicate effect; compare invoking checkout snapshot before authorized finish.
- [ ] **Step 4: Run the composed suite.** Run `node --test test/execution-fault-integration.test.mjs`; expect PASS for deterministic replay/block branches and zero unrelated mutation.
- [ ] **Step 5: Record task evidence.** Record every kill point, terminal/recovery evidence, final tree/test result, snapshot hashes, duplicate counts, and blocked uncertain-worker branch.

## Plan Verification

```bash
node --test test/execution-package.test.mjs test/execution-supersession.test.mjs test/execution-release.test.mjs test/execution-fault-integration.test.mjs
node scripts/verify-skills.mjs
npm test
npm pack --dry-run --json
git diff --check
git status --short
```

Expected: all release gates pass; package/plan/spec review ownership is intact; no public surface or unsupported migration is introduced; no generated runtime state is tracked.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/07-package-release.md
```
