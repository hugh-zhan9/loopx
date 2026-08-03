# Shared Kernel Foundation And Install Ownership Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:exec` for tightly coupled work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md` (sections 4.1, 5.2, 8.1, 8.3)

**Canonical contract:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

**Goal:** Establish the canonical `skills/shared/execution/` ownership boundary, executable constraint registry, and per-managed-item install migration without creating unified runtime state or changing public commands.

**Architecture:** The new execution subtree is installed as one atomic managed item with its own provenance row. `constraint-registry.json` is the executable inventory for hard invariants, quality contracts, risk gates, and heuristics. Normal and plugin installers use the same per-item ownership algorithm; unknown or user-modified items are preserved and reported.

**Tech Stack:** Node.js ESM, `node:fs/promises`, `node:crypto`, JSON, `node:test`, package/plugin install scripts.

**Support lenses:** `architecture-designer`, `cli-developer`

**Execution strategy recommendation:** `exec`

**Selection rationale:** Installer lock shape, package files, plugin release coverage, and the new registry must change as one ownership contract. The tasks touch overlapping installer/test surfaces and require same-context verification.

```loopx-parallel-plan
{"schema":"loopx.parallel-plan.v1","max_parallel":1}
```

## Global Constraints

- `skills/shared/execution/` is the only unified-kernel owner; legacy executor state and Git paths are not migrated here.
- `execution/` is installed and upgraded as an atomic subtree; unknown target files are never deleted and user-modified managed items are preserved with scoped conflict evidence.
- Normal installs, Claude installs, Codex installs, and `plugins/loopx/scripts/plugin-install.mjs` use the same ownership algorithm and canonical root `skills/` source.
- Keep `LOOPX_BUNDLED_SKILLS`, package `files`, frontmatter discovery, public CLI output, dry-run behavior, and uninstall semantics unchanged except for the explicitly required managed-item provenance and release-gate additions.
- Use no new dependency; all lock/artifact files are owner-only and local.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md` — all three Important findings closed
- Residual risk: registry ownership is contract-tested locally; provider-specific filesystem enforcement is owned by later child `04`.

---

### T-001 / Task 1: Add the execution ownership registry and shared-tree contract

**Files:**
- Create: `skills/shared/execution/constraint-registry.json`
- Create: `skills/shared/execution/README.md`
- Create: `test/execution-constraint-registry.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-001","depends_on":[],"write_scope":["skills/shared/execution/constraint-registry.json","skills/shared/execution/README.md","test/execution-constraint-registry.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: source owner boundaries in design `D-001`, exact `C-*` registry field requirements, and current `skills/shared/` package discovery.
- Produces: a JSON array of entries with `{id,category,accountable_owner,failure_mode,enforcement_owners,eval_cases,sunset_condition}` and a README stating that executable validators/runtime are authoritative over prose.

**Traceability:**
- Source AC: `AC-001`, `AC-024`
- Design anchors: `D-001`
- Test cases: `TC-001`, `TC-018`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-constraint-registry.test.mjs`
- `evidence_summary`: duplicate-owner, missing-enforcement, missing-eval, and heuristic-without-sunset fixtures fail with stable codes; valid registry covers every hard/quality/risk/heuristic category.
- `remaining_risk`: registry entries are initial versioned policy data; later policy child owns runtime use.

**Review focus:**
- Verify every registry row has exactly one accountable owner and at least one enforcement/eval reference.
- Verify only heuristic rows require non-null `sunset_condition`; no entry changes public behavior or claims ownership of legacy engines.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Write registry governance tests first.** Add `node:test` fixtures for valid rows, duplicate `accountable_owner` per invariant, empty `enforcement_owners`, empty `eval_cases`, and heuristic `sunset_condition: null`.
- [ ] **Step 2: Run the focused test and confirm RED.** Run `node --test test/execution-constraint-registry.test.mjs`; expect failure because the registry files do not exist.
- [ ] **Step 3: Add the executable registry and ownership README.** Use exact JSON keys from `D-001`; include rows for write ownership, CAS/epoch fencing, quality review, risk guard, and heuristic scheduling thresholds. Keep deferred behavior marked in the row’s `sunset_condition`/policy reference rather than enabling it.
- [ ] **Step 4: Run the focused test to GREEN.** Run `node --test test/execution-constraint-registry.test.mjs`; expect PASS.
- [ ] **Step 5: Record task evidence.** Persist the registry hash, fixture names, command result, and the statement that no unified state is created by this task.

### T-002 / Task 2: Migrate shared installation to managed per-item provenance

**Files:**
- Modify: `src/install-discovery.mjs`
- Modify: `test/workflow.test.mjs`
- Create: `test/execution-install-ownership.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-002","depends_on":["T-001"],"write_scope":["src/install-discovery.mjs","test/workflow.test.mjs","test/execution-install-ownership.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: `sharedContractsSourceDir`, `installedSharedContractsDir`, `readSkillLock`, `writeSkillLock`, and existing `sharedContractsHash` call sites in `src/install-discovery.mjs`.
- Produces: lock schema version `4` with `shared_items` rows keyed by normalized managed item path; atomic subtree install/upgrade; scoped conflict results in `inspectInstallState`, `verifyInstallState`, and `installBundledSkills`; version-3 locks are read and upgraded without losing `skills` rows.

**Traceability:**
- Source AC: `AC-001`, `AC-021`, `AC-022`, `AC-024`
- Design anchors: `D-001`, `D-015`
- Test cases: `TC-001`, `TC-015`, `TC-016`, `TC-018`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-install-ownership.test.mjs test/workflow.test.mjs`
- `evidence_summary`: missing `execution/` installs; exact bootstrap is claimed; unchanged/user-modified subtree reports `shared_item_conflict` without deleting it; unknown shared files survive; install verification remains compatible.
- `remaining_risk`: existing non-execution shared files continue under their current governance until a later explicit item migration.

**Review focus:**
- Check migration never compares or replaces the whole `skills/shared/` tree when only `execution/` changed.
- Check lock rows record source/installed paths, item kind, previous/installed hash, channel, method, and timestamps; conflict paths remain actionable.
- Check no install path mutates `.gitignore`, public CLI output, or user-owned files.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Add failing fixtures.** Create temp homes with missing subtree, exact bootstrap, last-installed subtree modified by user, unknown sibling file, and removed-managed-item cases; assert expected result codes and zero deletion of unknown files.
- [ ] **Step 2: Run the focused test and confirm RED.** Run `node --test test/execution-install-ownership.test.mjs`; expect the existing whole-tree drift behavior to fail the per-item cases.
- [ ] **Step 3: Implement managed-item helpers and lock migration.** Bump the lock to schema version `4`; preserve existing version-3 `skills` rows; add pure helpers such as `sharedManagedItems()`, `sharedItemHash(path)`, and `migrateManagedSharedItems({ sourceRoot, targetRoot, lock })`. Treat `execution/` as `kind: "subtree"`; stage to an owner-only sibling path, verify source hash, then rename atomically. Preserve unknown/user-modified items and return scoped conflict records.
- [ ] **Step 4: Wire inspection/install/verification.** Replace `sharedContractsHash` equality as the sole discovery rule with per-item rows while retaining compatibility fields for callers that only need a boolean. Update lock writes atomically and keep `verifyInstallState().ok`/failure semantics stable.
- [ ] **Step 5: Run focused and regression tests.** Run `node --test test/execution-install-ownership.test.mjs test/workflow.test.mjs`; expect PASS.
- [ ] **Step 6: Record task evidence.** Capture lock JSON excerpts, conflict/unknown-file assertions, and proof that no broad shared-tree replacement occurs.

### T-003 / Task 3: Make the plugin installer suite part of the default release gate

**Files:**
- Modify: `package.json`
- Modify: `plugins/loopx/scripts/plugin-install.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-003","depends_on":["T-002"],"write_scope":["package.json","plugins/loopx/scripts/plugin-install.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: current `npm test` script, plugin `verifyInstallState`/`installBundledSkills` entry points, and canonical root package files.
- Produces: a default test command that executes `plugins/loopx/scripts/plugin-install.test.mjs` in addition to `test/*.test.mjs`, plus assertions that plugin and normal installs share the managed-item algorithm.

**Traceability:**
- Source AC: `AC-021`, `AC-024`
- Design anchors: `D-001`
- Test cases: `TC-015`, `TC-018`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `npm test`; `node --test plugins/loopx/scripts/plugin-install.test.mjs`
- `evidence_summary`: the default suite visibly executes plugin installer tests; plugin manifest has no payload mirror; canonical-root and install ownership parity assertions pass.
- `remaining_risk`: native plugin-loader integration remains covered by existing fixture assertions, not a networked install.

**Review focus:**
- Verify the package script does not drop existing `node --test test/*.test.mjs` coverage.
- Verify plugin tests use canonical `skills/` and do not create or require `plugins/loopx/skills/`.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Add a plugin release assertion that the plugin suite is in `npm test`.** In `plugins/loopx/scripts/plugin-install.test.mjs`, assert the package script contains the explicit plugin test path and still runs `scripts/verify-skills.mjs` and `test/*.test.mjs`.
- [ ] **Step 2: Run the focused plugin test and confirm RED.** Run `node --test plugins/loopx/scripts/plugin-install.test.mjs`; expect failure against the current package script omission.
- [ ] **Step 3: Update package/test wiring.** Extend `package.json` `test` to run `node --test plugins/loopx/scripts/plugin-install.test.mjs` after repository tests. Add parity assertions for `shared_items`, plugin channel, and canonical-root source.
- [ ] **Step 4: Run plugin and full tests.** Run `node --test plugins/loopx/scripts/plugin-install.test.mjs` and then `npm test`; expect PASS.
- [ ] **Step 5: Record task evidence.** Record the exact test command line and plugin package inventory.

## Plan Verification

```bash
node --test test/execution-constraint-registry.test.mjs test/execution-install-ownership.test.mjs
node --test plugins/loopx/scripts/plugin-install.test.mjs
node scripts/verify-skills.mjs
npm test
git diff --check
```

Expected: all commands exit `0`; no `.loopx/` runtime state is created; public install output remains compatible; `skills/shared/execution/` is the only new managed subtree.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/01-foundation-install.md
```
