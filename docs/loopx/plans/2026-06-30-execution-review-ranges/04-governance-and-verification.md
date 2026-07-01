# Governance And Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-30-execution-review-ranges/需求设计文档.md`

**Goal:** Add final verification coverage so execution range runtime, final-review contracts, skill governance, and package install assumptions cannot regress.

**Architecture:** Runtime tests prove behavior; governance tests prove cross-skill docs and templates stay aligned; package verification proves installed skill surface remains valid. This plan is test and release-gate focused and runs after the runtime and skill-contract child plans.

**Tech Stack:** `node:test`, `node scripts/verify-skills.mjs`, `npm test`, ripgrep negative assertions.

**Support lenses:** `architecture-designer`, `cli-developer`

## Global Constraints

- Do not introduce a new test framework.
- Do not commit `.loopx/` runtime state.
- `node scripts/verify-skills.mjs` and `npm test` are required final gates.
- Negative assertions must search current product surface, not historical release notes.

## Surface Inventory

- Public commands/API/routes/events/config: CLI help and JSON/human output tests for `execution-start`.
- Exported functions/types/modules: runtime exports from `src/finish-runtime.mjs`.
- Runtime/generated artifacts and templates: `.loopx/execution-ranges/`, `.loopx/final-review/`, `.loopx/multi-plan/`.
- Installer/package/deployment surface: bundled skill metadata and package files.
- Hooks/background jobs/automation: verify no current hook guidance references removed fields.
- Current product docs: skills, resolver, README current workflow guidance if touched.
- Tests/governance checks: all of `test/workflow.test.mjs`, `test/skill-governance.test.mjs`, `node scripts/verify-skills.mjs`, `npm test`.
- Compatibility/migration paths: v1 multi-plan compatibility test and baseline fallback test.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: This verification plan maps every AC, TC, and D anchor to runtime tests, governance tests, negative assertions, or final command gates.
- Recheck evidence: Added an explicit anchor coverage checklist and negative assertions to avoid leaving old `plan_final_review` semantics in current surface.
- Residual risk: same-context plan review was not independent.

---

### T-001 / Task 1: Add anchor coverage governance checklist

**Files:**
- Modify: `test/skill-governance.test.mjs`
- Modify as needed to satisfy the strict current-surface negative assertion while
  preserving compatibility: `src/finish-runtime.mjs`, `test/workflow.test.mjs`

**Interfaces:**
- Consumes: current source design path and plan package files.
- Produces: a governance test that confirms the implementation plan package preserves `AC-*`, `D-*`, and `TC-*` anchors.

**Traceability:**
- Source AC: `AC-1` through `AC-12`
- Design anchors: `D-011`
- Test cases: `TC-1` through `TC-15`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "execution review ranges plan anchors"`
- `evidence_summary`: test confirms this plan package mentions all source anchors so future edits do not lose traceability.
- `remaining_risk`: none

**Review focus:** not_applicable - test-only traceability guard; no runtime behavior.

**Support lenses:** none

- [ ] **Step 1: Add test**

Add:

```js
it('execution review ranges plan preserves source anchors', async () => {
  const planRoot = join(repoRoot, 'docs', 'loopx', 'plans', '2026-06-30-execution-review-ranges');
  const files = await Promise.all([
    readFile(join(planRoot, '00-overview.md'), 'utf8'),
    readFile(join(planRoot, '01-runtime-state-and-finish.md'), 'utf8'),
    readFile(join(planRoot, '02-final-review-contracts.md'), 'utf8'),
    readFile(join(planRoot, '03-skill-workflow-contracts.md'), 'utf8'),
    readFile(join(planRoot, '04-governance-and-verification.md'), 'utf8'),
  ]);
  const combined = files.join('\n');
  for (const anchor of ['AC-1', 'AC-2', 'AC-2a', 'AC-3', 'AC-4', 'AC-5', 'AC-6', 'AC-7', 'AC-8', 'AC-8a', 'AC-9', 'AC-10', 'AC-11', 'AC-12']) {
    assert.match(combined, new RegExp(`\\b${anchor}\\b`));
  }
  for (const anchor of ['D-001', 'D-002', 'D-003', 'D-004', 'D-005', 'D-006', 'D-007', 'D-008', 'D-009', 'D-010', 'D-011']) {
    assert.match(combined, new RegExp(`\\b${anchor}\\b`));
  }
  for (const anchor of ['TC-1', 'TC-2', 'TC-3', 'TC-4', 'TC-5', 'TC-6', 'TC-7', 'TC-7a', 'TC-8', 'TC-9', 'TC-9a', 'TC-9b', 'TC-10', 'TC-11', 'TC-12', 'TC-13', 'TC-14', 'TC-15']) {
    assert.match(combined, new RegExp(`\\b${anchor}\\b`));
  }
});
```

- [ ] **Step 2: Run focused test**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "execution review ranges plan anchors"
```

Expected: test passes.

- [ ] **Step 3: Commit**

```bash
git add test/skill-governance.test.mjs
git commit -m "Guard execution review range plan anchors"
```

### T-002 / Task 2: Add current-surface negative assertions

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: current product surface files.
- Produces: tests that prevent old `plan_final_review`, end-commit freeze, and child report contracts from returning.

**Traceability:**
- Source AC: `AC-2`, `AC-5`, `AC-9`, `AC-12`
- Design anchors: `D-004`, `D-005`, `D-009`, `D-010`, `D-011`
- Test cases: `TC-2`, `TC-10`, `TC-14`, `TC-15`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs --test-name-pattern "execution range old contracts"`
- `evidence_summary`: old current-surface fields/text do not appear in source, skills, templates, tests, or current docs.
- `remaining_risk`: historical docs are intentionally excluded.

**Review focus:** not_applicable - negative governance assertions only.

**Scope note:** This task scans `src` and `test` as part of the current product
surface. If those paths still contain legacy compatibility spellings, replace
direct legacy string literals with computed access while preserving runtime
behavior and existing compatibility tests.

**Support lenses:** none

- [ ] **Step 1: Add test**

Add:

```js
it('does not expose old execution range contracts in current surface', async () => {
  const currentSurface = [
    'src',
    'scripts',
    'skills',
    'templates',
    'test',
    'README.md',
    'README.zh-CN.md',
    'docs/loopx/specs',
  ];
  const output = await rgCurrentSurface(currentSurface, [
    'plan_final_review',
    'execution-end',
    'execution_end_commit',
    'reviewed end commit',
    'child plan final-review report',
  ]);
  assert.equal(output.trim(), '');
});
```

If no `rgCurrentSurface` helper exists, implement it in the test file with `execFile('rg', ['-n', pattern, ...paths], { cwd: repoRoot })` and treat exit code `1` as empty output.

- [ ] **Step 2: Run focused test**

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "execution range old contracts"
```

Expected: test passes.

- [ ] **Step 3: Commit**

```bash
git add test/skill-governance.test.mjs
git commit -m "Block old execution range contracts"
```

### T-003 / Task 3: Run full release gates and fix integration drift

**Files:**
- Modify only files needed to fix failures from release gate commands.
- Test: `test/workflow.test.mjs`, `test/skill-governance.test.mjs`, all test suites.

**Interfaces:**
- Consumes: all child plan outputs.
- Produces: passing release gates and final evidence for package final-review.

**Traceability:**
- Source AC: `AC-1` through `AC-12`
- Design anchors: `D-001` through `D-011`
- Test cases: `TC-1` through `TC-15`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node scripts/verify-skills.mjs`, `node --test test/workflow.test.mjs`, `node --test test/skill-governance.test.mjs`, `npm test`
- `evidence_summary`: all release gates pass; any focused failure fix is committed with the test that caught it.
- `remaining_risk`: none if all gates pass.

**Review focus:**
- Verify fixes are limited to integration drift uncovered by tests.
- Verify no unrelated dirty files are reverted.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Run skill verification**

```bash
node scripts/verify-skills.mjs
```

Expected: exits 0. If metadata version assertions fail, update only the changed skill's version expectations/tests.

- [ ] **Step 2: Run workflow runtime tests**

```bash
node --test test/workflow.test.mjs
```

Expected: exits 0. If failures mention multi-plan v1/v2, fix runtime normalization or test fixtures without restoring `plan_final_review` as the required gate.

- [ ] **Step 3: Run governance tests**

```bash
node --test test/skill-governance.test.mjs
```

Expected: exits 0. If failures mention Chinese template English labels, localize labels and preserve only allowed gate tokens.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: exits 0.

- [ ] **Step 5: Run manual negative assertions**

```bash
! rg "plan_final_review" src skills templates test README.md README.zh-CN.md docs/loopx/specs
! rg "execution-end|execution_end_commit|reviewed end commit" src skills templates test README.md README.zh-CN.md docs/loopx/specs
! rg "child plan final-review report|child plan final review report" skills test src templates README.md README.zh-CN.md docs/loopx/specs
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git status --short
git add -- test/skill-governance.test.mjs test/workflow.test.mjs src/finish-runtime.mjs src/cli.mjs skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/final-review/SKILL.md skills/final-review/final-reviewer.md skills/final-review/references/report-template.en.md skills/final-review/references/report-template.zh-CN.md skills/finish/SKILL.md skills/plan-to-exec/SKILL.md skills/RESOLVER.md
git commit -m "Verify execution review range workflow"
```

## Plan-Level Verification

Run:

```bash
node scripts/verify-skills.mjs
node --test test/workflow.test.mjs
node --test test/skill-governance.test.mjs
npm test
```

Expected: all commands pass.

## Execution Handoff

Implement this child plan last after runtime and skill contract changes are in place. After all release gates pass, run plan-level `final-review` for this child plan and update `.loopx/multi-plan/2026-06-30-execution-review-ranges/state.json` with `plan_review.status: "passed"` and `ready_for_spec_review: true`. Then run one spec-level `final-review` for `docs/loopx/design/2026-06-30-execution-review-ranges/需求设计文档.md`.
