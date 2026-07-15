# Parallel Subagent Exec Documentation And Release Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for independently delegable tasks or `loopx:exec` for tightly coupled or context-continuous work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-14-parallel-subagent-exec/需求设计文档.md`

**Goal:** Document and release-verify the bundled `parallel-subagent-exec` skill as an explicit manual experimental surface while proving that current automatic workflow routing and `subagent-exec` remain unchanged.

**Architecture:** Child plan `04` creates and registers the complete skill atomically so repository governance stays green. This exclusive release boundary adds concise bilingual/manual documentation and then inspects the package, installed surface, full test suite, compatibility negatives, and source coverage ledger.

**Tech Stack:** Markdown docs, Node.js ESM tests, npm package tarball inspection, Git compatibility checks.

**Support lenses:** `architecture-designer`, `cli-developer`, `lancet`

**Execution strategy recommendation:** `exec`

**Selection rationale:** Documentation, package inventory, compatibility assertions, and full release evidence should be evaluated together after all runtime and install surfaces are complete.

```loopx-parallel-plan
{
  "schema": "loopx.parallel-plan.v1",
  "max_parallel": 4
}
```

## Global Constraints

- Treat the completed bundled/install registration from child plan `04` as an input; do not relocate or duplicate installer ownership.
- Preserve and extend the user's current uncommitted governance/version changes; do not reset `plan-to-exec` execution-strategy work.
- Add only explicit manual/experimental documentation. Keep the default flow text centered on `(exec | subagent-exec)` and do not add a public CLI command or automatic recommendation.
- Do not modify any file under `skills/subagent-exec/`. Verify its final diff and tree identity.
- Do not track `.loopx/` runtime state or ad hoc live-agent output. Live multi-agent stress evaluation remains deferred until the user's manual testing.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Plan review verdict: approved
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Residual risk: native Codex/Claude/Cursor concurrency is contract-tested through deterministic adapters and simulations; live multi-agent stress evaluation is intentionally deferred until the user's manual testing.

---

### T-001 / Task 1: Document the explicit experimental surface and uninstall path

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`
- Modify: `docs/loopx/specs/installation.md`
- Modify: `test/skill-governance.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-001",
  "depends_on": [],
  "write_scope": [
    "README.md",
    "README.zh-CN.md",
    "docs/loopx/skills.md",
    "docs/loopx/skills.zh-CN.md",
    "docs/loopx/specs/installation.md",
    "test/skill-governance.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: bundled skill/manual resolver contract from `04-skill-orchestration`; existing English/Chinese workflow and installation documentation structure.
- Produces: concise bilingual experimental documentation, invocation/eligibility/metadata-handoff wording, runtime-capability hard-stop wording, and uninstall commands for both supported skill roots.

**Traceability:**
- Source AC: `AC-001`, `AC-007`, `AC-023`, `AC-024`, `AC-029`, `AC-034`
- Design anchors: `D-001`, `D-013`, `D-014`, `D-015`, `D-017`
- Test cases: `TC-001`, `TC-006`, `TC-019`, `TC-020`, `TC-024`, `TC-029`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs`; `node scripts/verify-skills.mjs`
- `evidence_summary`: English/Chinese docs describe the same manual experimental behavior, strict metadata requirement, metadata/direct-child same-path conservative handoff, runtime-capability exit without fallback, and uninstall surface while preserving the canonical default flow line.
- `remaining_risk`: detailed execution semantics remain in skill references rather than public overview docs by design.

**Review focus:**
- Verify docs never imply automatic selection, production-default status, or silent fallback.
- Verify both languages preserve `(exec | subagent-exec)` as the normal workflow.
- Verify uninstall commands include the new skill for both `~/.agents` and `~/.claude` roots.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Add failing documentation assertions**

Require both languages to contain the explicit invocation, `experimental`/`实验性`, strict metadata requirement, default max `4`, `--max-parallel`, direct-child exclusion, metadata/direct-child `$subagent-exec` same-path handoff, and runtime-capability stop without fallback. Retain existing regex assertions for the normal workflow line.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
node --test test/skill-governance.test.mjs
```

Expected: FAIL because public and installation docs do not mention the new manual surface.

- [ ] **Step 3: Update public English and Chinese docs**

Add one compact manual/experimental entry and example. Explain eligibility from machine-readable metadata, default/override concurrency, direct-child exclusion, the metadata-only handoff, and the runtime-capability hard stop. Do not place the new skill in the main workflow arrow or recommend it as the normal executor.

- [ ] **Step 4: Update installation ownership and uninstall commands**

Include `parallel-subagent-exec` in both removal brace lists and state that it is bundled but manually selected. Preserve the canonical-root and plugin no-payload installation model.

- [ ] **Step 5: Run focused verification to GREEN**

```bash
node --test test/skill-governance.test.mjs
node scripts/verify-skills.mjs
```

Expected: bilingual/manual/install assertions pass.

- [ ] **Step 6: Record task evidence**

Record matching English/Chinese claims, unchanged workflow-line matches, uninstall excerpts, and negative automatic-selection assertions.

### T-002 / Task 2: Run package, compatibility, and release verification

**Files:**
- Create: `test/parallel-subagent-exec-release.test.mjs`
- Test: `test/parallel-plan-contract.test.mjs`
- Test: `test/parallel-exec-state.test.mjs`
- Test: `test/parallel-exec-scheduler.test.mjs`
- Test: `test/parallel-exec-git.test.mjs`
- Test: `test/parallel-exec-cli.test.mjs`
- Test: `test/parallel-subagent-exec.test.mjs`
- Test: `test/workflow.test.mjs`
- Test: `test/skill-governance.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-002",
  "depends_on": ["T-001"],
  "write_scope": [
    "test/parallel-subagent-exec-release.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: complete package/install/docs surface, repository test suite, `npm pack --dry-run --json`, source traceability, and baseline Git tree identity for `skills/subagent-exec/`.
- Produces: release evidence for packaged files, clean full tests, unchanged conservative executor, no public CLI/default route, and 34/34 AC plus 29/29 TC coverage.

**Traceability:**
- Source AC: `AC-001`-`AC-034`
- Design anchors: `D-001`-`D-017`
- Test cases: `TC-001`-`TC-029`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-subagent-exec-release.test.mjs`; `npm test`; `npm pack --dry-run --json`; `git diff --check`; `git diff -- skills/subagent-exec`
- `evidence_summary`: tarball inventory contains the full skill and shared validator, all tests/skill verification pass, default/public routing remains unchanged, no generated runtime state is tracked, and conservative executor diff is empty.
- `remaining_risk`: a live multi-agent stress evaluation is intentionally deferred until the user completes manual testing.

**Review focus:**
- Treat any missing packaged reference/script, default route mention, changed `subagent-exec` file, failing test, or tracked runtime artifact as release-blocking.
- Verify the release test derives expected package files from canonical surfaces rather than hard-coding a partial list.
- Verify no cleanup assertion deletes user-owned worktrees/branches or pre-existing dirty files.

**Support lenses:** `architecture-designer`, `cli-developer`, `lancet`

- [ ] **Step 1: Write release assertions before final commands**

Parse `npm pack --dry-run --json` output and assert the full new skill tree plus shared plan contract/script are present. Assert no `src/cli.mjs`, `src/workflow.mjs`, `src/next-skill.mjs`, or automatic `plan-to-exec` route contains the new executor; assert `.loopx/parallel-subagent-exec/` files are absent from Git.

- [ ] **Step 2: Run the release test and resolve only in-scope failures**

```bash
node --test test/parallel-subagent-exec-release.test.mjs
```

Expected: PASS. Fix only the release-test implementation in this task; documentation defects return to `T-001`, and runtime/install defects return to their owning child evidence instead of being masked by broader writes.

- [ ] **Step 3: Run complete repository verification**

```bash
npm test
npm pack --dry-run --json
git diff --check
```

Expected: every command exits `0`; inspect tarball JSON for the complete planned surface.

- [ ] **Step 4: Run compatibility and cleanliness assertions**

```bash
git diff -- skills/subagent-exec
git diff --name-only | rg '^skills/subagent-exec/' && exit 1 || true
if rg -n "parallel-subagent-exec" src/cli.mjs src/workflow.mjs src/next-skill.mjs; then exit 1; fi
git status --short
```

Expected: both conservative-executor diff commands are empty/successful; CLI/workflow search has no automatic route; status contains no tracked runtime state and preserves unrelated user changes.

- [ ] **Step 5: Complete the source coverage ledger**

Map every `AC-001`-`AC-034`, `D-001`-`D-017`, and `TC-001`-`TC-029` to passing test evidence or a bounded platform-contract assertion. Mark live multi-agent stress evaluation as deferred, not silently passed.

- [ ] **Step 6: Record task evidence**

Record full command summaries, tarball inventory, source coverage counts, baseline/final `subagent-exec` tree identity, negative route results, dirty-worktree preservation, and the deferred live evaluation.

## Plan Verification

```bash
node --test test/parallel-subagent-exec-release.test.mjs
npm test
npm pack --dry-run --json
git diff --check
git diff -- skills/subagent-exec
git status --short
```

Expected: all release gates pass, no conservative-executor diff exists, no runtime state is tracked, and unrelated user edits remain intact.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-14-parallel-subagent-exec/05-install-governance-and-release.md
```
