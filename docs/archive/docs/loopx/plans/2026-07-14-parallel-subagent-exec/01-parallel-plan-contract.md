# Parallel Plan Contract Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for independently delegable tasks or `loopx:exec` for tightly coupled or context-continuous work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-14-parallel-subagent-exec/需求设计文档.md`

**Goal:** Add the strict versioned parallel plan/package/task contract, one shared parser/validator, and additive planning/review generation rules without changing executor recommendation.

**Architecture:** `skills/shared/parallel-plan-contract.md` owns the normative fence schemas, while `skills/shared/scripts/parallel-plan-contract.mjs` is the only parser and validator consumed by planning and execution. `plan-to-exec` emits the blocks and `plan-reviewer` verifies them, but both continue to recommend only `exec` or `subagent-exec`.

**Tech Stack:** Node.js ESM, built-in JSON/crypto/fs/path APIs, `node:test`, Markdown skill contracts.

**Support lenses:** `architecture-designer`, `cli-developer`

**Execution strategy recommendation:** `exec`

**Selection rationale:** The shared schema, parser, planning contract, reviewer contract, metadata versions, and governance assertions must change coherently. The current worktree already contains user changes in the same planning/governance files, so same-context execution is safer than independent workers editing overlapping surfaces.

```loopx-parallel-plan
{
  "schema": "loopx.parallel-plan.v1",
  "max_parallel": 4
}
```

## Global Constraints

- Preserve the current uncommitted evidence-based execution strategy changes in `skills/plan-to-exec/SKILL.md`, `skills/plan-to-exec/references/plan-schema.md`, `test/fixtures/skill-contract-matrix.json`, and `test/skill-governance.test.mjs`.
- Do not add `parallel-subagent-exec` to plan recommendation or handoff examples. Recommendation remains exactly `subagent-exec | exec`.
- Reject unknown schemas/fields, duplicate blocks, invalid JSON, invalid paths, cycles, missing dependencies, and concurrent exact-path overlaps. Do not infer dependencies from prose.
- Use a single shared validator owner; do not duplicate parsing rules in `plan-to-exec`, `plan-reviewer`, or the new executor.
- Add no dependency and do not modify `skills/subagent-exec/`.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Plan review verdict: approved
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Residual risk: native Codex/Claude/Cursor concurrency is contract-tested through deterministic adapters and simulations; live multi-agent stress evaluation is intentionally deferred until the user's manual testing.

---

### T-001 / Task 1: Implement the shared parallel plan contract and validator

**Files:**
- Create: `skills/shared/parallel-plan-contract.md`
- Create: `skills/shared/scripts/parallel-plan-contract.mjs`
- Create: `test/parallel-plan-contract.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-001",
  "depends_on": [],
  "write_scope": [
    "skills/shared/parallel-plan-contract.md",
    "skills/shared/scripts/parallel-plan-contract.mjs",
    "test/parallel-plan-contract.test.mjs"
  ],
  "parallel_safe": true
}
```

**Interfaces:**
- Consumes: current plan headings `### T-NNN / Task N`, exact JSON fence names from `D-002`, canonical repo root, and one single-plan/package input path.
- Produces: `inspectParallelInput({ inputPath, repoRoot, maxParallelOverride })`, `validateParallelManifest(manifest)`, strict schema constants, and CLI JSON for `manifest inspect` with a required output file.

**Traceability:**
- Source AC: `AC-010`, `AC-011`, `AC-012`
- Design anchors: `D-002`, `D-003`
- Test cases: `TC-008`, `TC-009`, `TC-010`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-plan-contract.test.mjs`
- `evidence_summary`: valid single/package fixtures normalize to `loopx.parallel-exec-manifest.v1`; every required invalid case exits before worker/runtime setup and returns stable error codes/details.
- `remaining_risk`: Markdown heading/fence parsing remains intentionally current-contract only.

**Review focus:**
- Verify field sets and schema identifiers exactly match `D-002`; unknown fields must fail instead of being ignored.
- Verify path normalization rejects absolute paths, `..`, glob syntax, duplicates, out-of-repo realpaths, cycles, missing dependencies, and undeclared concurrent exact-path overlap.
- Verify package write scopes are derived only from explicit child task blocks, never prose or `Interfaces` inference.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Write failing validator tests for valid manifests and strict rejection**

Add table-driven `node:test` cases covering:

```javascript
const invalidCases = [
  ['unknown schema', { schema: 'loopx.parallel-task.v2' }, 'parallel_schema_unsupported'],
  ['absolute write path', { write_scope: ['/tmp/app.mjs'] }, 'parallel_write_scope_invalid'],
  ['parent traversal', { write_scope: ['../app.mjs'] }, 'parallel_write_scope_invalid'],
  ['glob path', { write_scope: ['src/**/*.mjs'] }, 'parallel_write_scope_invalid'],
  ['missing dependency', { depends_on: ['T-999'] }, 'parallel_dependency_missing'],
];
```

Create temporary single-plan and package fixtures with exact fences. Add cycle, duplicate fence, unknown field, task-anchor mismatch, package-path mismatch, and two frontier nodes writing `src/shared.mjs` without a dependency.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test test/parallel-plan-contract.test.mjs
```

Expected: FAIL because `skills/shared/scripts/parallel-plan-contract.mjs` does not exist.

- [ ] **Step 3: Write the normative shared contract**

Document exact allowed fields, fence placement, current-only schema identifiers, exclusive-barrier semantics, path rules, manifest shape, error codes, and the legacy fallback contract in `skills/shared/parallel-plan-contract.md`. Require each task `write_scope` to equal the normalized `Create:` plus `Modify:` file set; `Test:` entries are read-only verification inputs and must be excluded unless the task relabels them `Modify:`. Include this normalized shape:

```json
{
  "schema": "loopx.parallel-exec-manifest.v1",
  "scope": "single-plan",
  "input": {"path": "docs/loopx/plans/example.md", "sha256": "..."},
  "max_parallel": 4,
  "plans": [
    {
      "path": "docs/loopx/plans/example.md",
      "depends_on": [],
      "can_run_in_parallel": true,
      "tasks": []
    }
  ]
}
```

- [ ] **Step 4: Implement the pure parser/validator and JSON CLI**

Export these exact interfaces:

```javascript
export const PARALLEL_SCHEMA_IDS = Object.freeze({
  plan: 'loopx.parallel-plan.v1',
  task: 'loopx.parallel-task.v1',
  package: 'loopx.parallel-package.v1',
  manifest: 'loopx.parallel-exec-manifest.v1',
});

export async function inspectParallelInput({ inputPath, repoRoot, maxParallelOverride = null }) {
  // Resolve input, parse exact fences, normalize paths, validate both DAGs,
  // compute explicit write-scope unions, and return the immutable manifest.
}

export function validateParallelManifest(manifest) {
  // Return the validated manifest or throw an Error with a stable code.
}
```

When invoked directly, support:

```text
node skills/shared/scripts/parallel-plan-contract.mjs manifest inspect --input PATH [--max-parallel N] --output FILE
```

Write complete JSON to stdout, diagnostics to stderr, and use exit `2` for usage/schema validation.

- [ ] **Step 5: Run focused tests to GREEN**

Run:

```bash
node --test test/parallel-plan-contract.test.mjs
```

Expected: PASS for valid single/package input and all strict rejection cases.

- [ ] **Step 6: Record task evidence**

Record `T-001`, `AC-010`-`AC-012`, `D-002`/`D-003`, `TC-008`-`TC-010`, the focused test output, normalized manifest example, and remaining current-contract parser risk.

### T-002 / Task 2: Make planning emit and review the strict metadata

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/plan-to-exec/references/plan-schema.md`
- Modify: `skills/plan-reviewer/SKILL.md`
- Modify: `test/fixtures/skill-contract-matrix.json`
- Modify: `test/skill-governance.test.mjs`
- Modify: `test/parallel-plan-contract.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-002",
  "depends_on": ["T-001"],
  "write_scope": [
    "skills/plan-to-exec/SKILL.md",
    "skills/plan-to-exec/references/plan-schema.md",
    "skills/plan-reviewer/SKILL.md",
    "test/fixtures/skill-contract-matrix.json",
    "test/skill-governance.test.mjs",
    "test/parallel-plan-contract.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: shared fence schemas/validator from `01-parallel-plan-contract/T-001`; current `plan-to-exec` version `0.3.19` changes already in the worktree.
- Produces: additive plan/package/task metadata instructions, plan-reviewer validation rubric, version bumps `plan-to-exec 0.3.20` and `plan-reviewer 0.1.5`, and governance checks that recommendation remains `subagent-exec | exec`.

**Traceability:**
- Source AC: `AC-010`, `AC-023`, `AC-024`
- Design anchors: `D-002`, `D-013`, `D-015`
- Test cases: `TC-008`, `TC-019`, `TC-020`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-plan-contract.test.mjs test/skill-governance.test.mjs`; `node scripts/verify-skills.mjs`
- `evidence_summary`: generated-plan contract contains all three fence schemas and `max_parallel: 4`; plan review blocks invalid DAG metadata; execution recommendation/handoff remains only current executors.
- `remaining_risk`: plan generation remains agent-authored Markdown, mitigated by mandatory validator and plan-review gate.

**Review focus:**
- Preserve the user's current execution-strategy edits and version `0.3.19` baseline; make a forward bump rather than reverting them.
- Verify `parallel-subagent-exec` never appears as an automatic recommendation or core resolver handoff.
- Verify plan-reviewer consumes the shared validator and does not duplicate parser logic or inspect implementation code.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Extend governance tests first**

Add assertions that current `plan-to-exec` output contract contains the required fences and that validator fixtures reject a task whose `write_scope` includes a read-only `Test:` entry or omits a `Create:`/`Modify:` entry:

```javascript
assert.match(planSkill, /loopx-parallel-plan/);
assert.match(planSkill, /loopx-parallel-task/);
assert.match(planSkill, /loopx-parallel-package/);
assert.match(planSkill, /depends_on/);
assert.match(planSkill, /write_scope/);
assert.match(planSkill, /parallel_safe/);
assert.match(planSkill, /max_parallel/);
assert.doesNotMatch(planSkill, /Execution strategy recommendation:\s*\[`parallel-subagent-exec`/);
```

Add plan-reviewer assertions for shared validator use, cycle/missing-dependency/path/overlap checks, and zero implementation-code inspection.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
node --test test/parallel-plan-contract.test.mjs test/skill-governance.test.mjs
```

Expected: FAIL because planning/reviewer contracts do not yet emit or govern parallel metadata.

- [ ] **Step 3: Update plan-to-exec without changing strategy selection**

Add the exact plan/package/task fence templates from the shared contract. Require `max_parallel: 4` by default, exact paths in `write_scope`, explicit task dependencies, and package child dependencies/capability. State that current package execution remains strictly sequential and the new executor is manual-only.

Preserve this existing recommendation surface exactly:

```text
Execution strategy recommendation: subagent-exec | exec
```

Bump `metadata.version` from the current worktree value `0.3.19` to `0.3.20`.

- [ ] **Step 4: Update plan-reviewer to validate metadata through the shared owner**

Add source-to-plan rubric entries requiring a successful shared validator result and checking that `write_scope` exactly matches `Create:`/`Modify:` entries while excluding read-only `Test:` entries. Do not make the reviewer infer missing edges or rewrite the plan. Bump `metadata.version` from `0.1.4` to `0.1.5`.

- [ ] **Step 5: Synchronize the semantic matrix and tests**

Update the two changed skill versions in `test/fixtures/skill-contract-matrix.json` and all exact version assertions in `test/skill-governance.test.mjs`. Preserve the user's current `0.3.19` execution-strategy assertions and extend them rather than replacing them.

- [ ] **Step 6: Run verification to GREEN**

Run:

```bash
node --test test/parallel-plan-contract.test.mjs test/skill-governance.test.mjs
node scripts/verify-skills.mjs
```

Expected: all commands exit `0`; no automatic new-executor recommendation appears.

- [ ] **Step 7: Record task evidence**

Record `T-002`, the changed skill versions, exact validator invocation evidence, negative recommendation assertions, commands, output summaries, and residual agent-authored-plan risk.

## Plan Verification

Run after both tasks:

```bash
node --test test/parallel-plan-contract.test.mjs test/skill-governance.test.mjs
node scripts/verify-skills.mjs
git diff --check
```

Expected: all pass; current planning strategy changes remain present; no file under `skills/subagent-exec/` changes.

## Execution Handoff

Execute this child only through existing executors. `parallel-subagent-exec` does not exist yet.

```text
$exec docs/loopx/plans/2026-07-14-parallel-subagent-exec/01-parallel-plan-contract.md
```
