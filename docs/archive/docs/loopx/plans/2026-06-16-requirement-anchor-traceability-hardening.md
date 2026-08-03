# Requirement Anchor Traceability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not execute phases out of order.

**Source:** Current design discussion on 2026-06-16 comparing loopx with SpecAnchor and approving a staged hardening plan for `spec -> plan-to-exec -> subagent-exec/build -> review` drift control.

**Goal:** Make upstream requirements and design constraints traceable as stable anchors, then require every downstream plan, build, and review stage to prove coverage or surface drift before work proceeds.

**Architecture:** Preserve the existing loopx workflow runtime and current `requirement-traceability.md` behavior, but add structured JSON artifacts beside it. Keep parsing and coverage logic outside `workflow.mjs` in focused modules. Upgrade context manifests only after anchor and coverage formats are stable. Update subagent prompts last, once the runtime artifacts have settled.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, `node:crypto`, existing loopx workflow runtime, existing skill governance tests.

---

## Cross-Agent Execution Rules

- Execute phases in this order only: Phase 1, Phase 2, Phase 3, Phase 4, then Phase 5 and Phase 6.
- Do not start Phase 4 until Phase 1, Phase 2, and Phase 3 are implemented, tested, and passing.
- Keep `workflow.mjs` as orchestration. New parsing and gate logic belongs in `src/requirement-anchors.mjs` and `src/requirement-coverage.mjs`.
- First version of scope expansion detection is warning-only. Do not block build on semantic expansion until real project examples justify it.
- Use `sha256` truncated to 8 or 12 hex characters for item hashes. Do not use `md5`.
- Keep existing Markdown `requirement-traceability.md` for humans and compatibility. Add JSON artifacts; do not replace the Markdown in the first implementation.
- Every phase must finish by running the focused test command for that phase and then `npm test`.
- Preserve user edits. Do not revert unrelated worktree changes.

## Existing Code Context

- `src/workflow.mjs` already contains source requirement extraction and Markdown traceability helpers around `sourceRequirementItems()` and `writeRequirementTraceabilityArtifact()`.
- `planStage()` already writes `requirement_traceability_path` into workflow state.
- Build readiness already checks whether `state.requirement_traceability_path` exists, but it does not yet validate structured coverage.
- `src/context-manifest.mjs` already writes build and review context manifests and includes `requirement-traceability`.
- `skills/subagent-exec/implementer-prompt.md` and `skills/subagent-exec/spec-reviewer-prompt.md` are prompt templates, not runtime-injected structured APIs.
- `test/skill-governance.test.mjs` verifies root skill files match plugin mirrors.

## Artifact Contract

Phase 1 creates:

```text
.loopx/workflows/<slug>/requirement-anchors.json
```

Phase 2 creates:

```text
.loopx/workflows/<slug>/requirement-coverage.json
```

These files are generated runtime artifacts and must not be committed unless a test fixture explicitly needs them.

## Phase 1: Requirement Anchors

**Goal:** Convert source requirements into stable JSON anchors that downstream stages can reference.

**Files:**
- Create: `src/requirement-anchors.mjs`
- Modify: `src/workflow.mjs`
- Test: `test/workflow.test.mjs`

- [ ] **Step 1: Write tests for anchor extraction and plan artifact creation**

Add tests covering:

- explicit requirement IDs are preserved when present
- missing IDs receive stable `REQ-001`, `REQ-002` style IDs
- each anchor has a truncated `sha256` hash
- `planStage()` writes `.loopx/workflows/<slug>/requirement-anchors.json`
- the legacy `requirement-traceability.md` still exists

Run:

```bash
node --test test/workflow.test.mjs -t "requirement anchors"
```

Expected: FAIL because `src/requirement-anchors.mjs` does not exist and `planStage()` does not write the JSON artifact.

- [ ] **Step 2: Add `src/requirement-anchors.mjs`**

Export these functions:

```js
export function extractRequirementAnchors(sourceText, options = {}) {}
export function hashRequirementText(text, length = 12) {}
export async function writeRequirementAnchorsArtifact({ root, sourceSpecPath, sourceText }) {}
export async function readRequirementAnchorsArtifact(path) {}
```

Anchor schema:

```json
{
  "schema_version": 1,
  "source_path": "docs/loopx/design/example.md",
  "source_hash": "b1946ac92492",
  "anchors": [
    {
      "id": "REQ-001",
      "kind": "acceptance",
      "source_heading": "Success Criteria",
      "text": "The workflow blocks build when required coverage is missing.",
      "hash": "a1b2c3d4e5f6",
      "required": true
    }
  ]
}
```

Implementation notes:

- Reuse the same extraction intent as existing `sourceRequirementItems()` without moving large blocks into `workflow.mjs`.
- Detect kind from source heading when practical: `scope`, `acceptance`, `constraint`, `decision-boundary`, `planning-handoff`, or `requirement`.
- Treat acceptance criteria, constraints, decision boundaries, explicit `SHALL` / `MUST`, and requirement headings as `required: true`.
- Keep extraction deterministic. No model calls.

- [ ] **Step 3: Wire anchors into `planStage()`**

In `src/workflow.mjs`, import the new writer and call it after `sourceSpecPath` and `sourceText` are resolved, before build context manifest generation.

State update:

```js
requirement_anchors_path: anchors.path
```

Keep existing:

```js
requirement_traceability_path: traceability.path
```

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
node --test test/workflow.test.mjs -t "requirement anchors"
npm test
```

Expected: PASS.

## Phase 2: Requirement Coverage Gate

**Goal:** Make build readiness validate structured coverage instead of checking only that traceability exists.

**Files:**
- Create: `src/requirement-coverage.mjs`
- Modify: `src/workflow.mjs`
- Test: `test/workflow.test.mjs`

- [ ] **Step 1: Write failing coverage tests**

Add tests covering:

- `planStage()` writes `.loopx/workflows/<slug>/requirement-coverage.json`
- required anchors with `not-covered` status block `buildStage()`
- `deferred-with-rationale` does not block build
- `scope-expansion-warning` is reported but does not block build

Run:

```bash
node --test test/workflow.test.mjs -t "requirement coverage"
```

Expected: FAIL because coverage JSON and gate logic do not exist yet.

- [ ] **Step 2: Add `src/requirement-coverage.mjs`**

Export these functions:

```js
export function buildRequirementCoverage({ anchors, plannerDraft, changeArtifactText = {} }) {}
export function coverageBlockers(coverageArtifact) {}
export async function writeRequirementCoverageArtifact({ root, anchorsArtifact, plannerDraft, changeArtifactPaths }) {}
export async function readRequirementCoverageArtifact(path) {}
```

Coverage schema:

```json
{
  "schema_version": 1,
  "anchors_path": ".loopx/workflows/example/requirement-anchors.json",
  "summary": {
    "covered": 3,
    "deferred": 1,
    "missing": 0,
    "scope_expansion_warnings": 0
  },
  "rows": [
    {
      "anchor_id": "REQ-001",
      "status": "covered",
      "covered_by_artifacts": ["plan.md", "development-plan.md"],
      "covered_by_tasks": [],
      "verification_refs": ["test-plan.md"],
      "rationale": ""
    }
  ],
  "warnings": []
}
```

Allowed row statuses:

- `covered`
- `deferred-with-rationale`
- `not-covered`
- `out-of-scope-with-rationale`

Warning type:

- `scope-expansion-warning`

Implementation notes:

- First version may use deterministic text matching similar to existing `sourceRequirementCovered()`.
- Do not implement broad natural-language semantic expansion detection in this phase.
- Scope expansion warnings can be produced only from explicit markers in generated artifacts or conservative pattern checks. Warnings must not block build.

- [ ] **Step 3: Wire coverage into `planStage()`**

After anchors and legacy traceability are written, write coverage JSON and update state:

```js
requirement_coverage_path: coverage.path
```

The legacy Markdown traceability artifact should remain unchanged unless small wording updates are needed to point to the JSON coverage artifact.

- [ ] **Step 4: Add build readiness gate**

In the existing readiness logic that currently checks `missing_requirement_traceability`, add:

- missing `requirement_anchors_path` blocks build
- missing `requirement_coverage_path` blocks build
- invalid coverage JSON blocks build
- required anchor row with `not-covered` blocks build
- `deferred-with-rationale` does not block build
- `scope-expansion-warning` appears in status/review context but does not block build

Suggested blocker codes:

```text
missing_requirement_anchors
missing_requirement_coverage
invalid_requirement_coverage
requirement_anchor_not_covered:<anchor_id>
```

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
node --test test/workflow.test.mjs -t "requirement coverage"
npm test
```

Expected: PASS.

## Phase 3: Context Manifest v2

**Goal:** Upgrade context manifests from file lists to read receipts with content hashes and freshness checks.

**Files:**
- Modify: `src/context-manifest.mjs`
- Modify: `src/loopx-context-artifacts.mjs`
- Test: `test/trellis-hardening.test.mjs`

- [ ] **Step 1: Write failing manifest v2 tests**

Add tests covering:

- new manifests use `schema_version: 2`
- v1 manifests remain readable for compatibility
- generated build manifest includes anchors and coverage rows
- generated review manifest includes anchors and coverage rows
- stale source or stale coverage is detected when content hash changes

Run:

```bash
node --test test/trellis-hardening.test.mjs -t "context manifest"
```

Expected: FAIL on v2 fields and anchors/coverage rows.

- [ ] **Step 2: Upgrade manifest row schema**

Change:

```js
export const CONTEXT_MANIFEST_SCHEMA_VERSION = 2;
```

New row fields:

```json
{
  "content_hash": "sha256:abcd1234",
  "anchor_ids": ["REQ-001"],
  "freshness": "fresh"
}
```

Freshness values:

- `fresh`
- `stale`
- `unknown`

Do not add `selected_by`. Continue using the existing `reason` field as the selection explanation.

- [ ] **Step 3: Keep v1 compatibility**

Update `readContextManifest()` so:

- v1 rows are accepted if all v1-required fields are valid
- v2 rows require v2 fields
- generated rows are always v2
- missing required files still invalidate the manifest
- stale required rows invalidate the manifest only when the row can be checked deterministically

- [ ] **Step 4: Include anchors and coverage in manifests**

Add build and review rows for:

```text
requirement-anchors
requirement-coverage
```

These rows should point to `state.requirement_anchors_path` and `state.requirement_coverage_path`.

- [ ] **Step 5: Improve repo spec selection reasons**

In `src/loopx-context-artifacts.mjs`, replace generic relevance explanations where possible with stable reasons such as:

```text
index_included
inbox_included
filename_match
applies_to_match
no_changed_files_fallback
```

Keep existing behavior bounded to `MAX_SPEC_CONTEXT_FILES`.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
node --test test/trellis-hardening.test.mjs -t "context manifest"
npm test
```

Expected: PASS.

## Phase 4: Subagent Anchor Context

**Goal:** Ensure subagent implementation and spec review operate on anchor context, not only local task text.

**Prerequisite:** Do not start until Phase 1, Phase 2, and Phase 3 are merged or present in the current branch with passing tests.

**Files:**
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `skills/subagent-exec/implementer-prompt.md`
- Modify: `skills/subagent-exec/spec-reviewer-prompt.md`
- Modify: `plugins/loopx/skills/subagent-exec/SKILL.md`
- Modify: `plugins/loopx/skills/subagent-exec/implementer-prompt.md`
- Modify: `plugins/loopx/skills/subagent-exec/spec-reviewer-prompt.md`
- Test: `test/skill-governance.test.mjs`

- [ ] **Step 1: Write failing governance assertions**

Add assertions that root and plugin prompt files include:

- `anchor_coverage`
- `implemented_anchor_ids`
- `extra_behavior`
- `missing_context`
- instruction that spec review must compare anchors, coverage, diff, and task text

Run:

```bash
node --test test/skill-governance.test.mjs -t "subagent"
```

Expected: FAIL until prompt templates are updated and mirrors synchronized.

- [ ] **Step 2: Update `subagent-exec` process instructions**

Require controller agents to provide each implementer with:

```text
ANCHOR_CONTEXT:
- anchor ids relevant to this task
- original anchor text summary
- coverage rows relevant to this task
- source requirement path
```

If a task has no anchors, the controller must classify it as one of:

```text
infrastructure
test-only
docs-only
refactor-only
```

and explain why it is not directly tied to a product requirement.

- [ ] **Step 3: Update implementer report format**

Add this required report block:

```yaml
anchor_coverage:
  REQ-001: implemented
  REQ-002: tested
implemented_anchor_ids:
  - REQ-001
tests_for_anchor_ids:
  - REQ-002
extra_behavior: none
missing_context: none
```

Allowed anchor statuses:

```text
implemented
tested
not_applicable
blocked
needs_context
```

- [ ] **Step 4: Update spec reviewer rules**

Spec reviewer must check:

- task text
- relevant anchor IDs and original anchor text
- coverage row expectations
- changed files and diff
- tests and execution evidence

Spec reviewer must not approve when:

- an anchor is marked implemented but no diff or test evidence supports it
- implementation adds product/API/data/permission behavior with no anchor or explicit plan rationale
- required anchor context is missing
- review is based only on the local task text

- [ ] **Step 5: Synchronize plugin mirrors**

Copy or patch root skill prompt files into `plugins/loopx/skills/subagent-exec/`.

Run:

```bash
node --test test/skill-governance.test.mjs -t "subagent"
npm test
```

Expected: PASS.

## Phase 5: CLI And Status Visibility

**Goal:** Make coverage and drift visible in `status`, `next`, and JSON output.

**Files:**
- Modify: `src/workflow.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/next-skill.mjs` if next-step routing needs dedicated helper changes
- Optionally modify: `src/html-views.mjs`
- Test: `test/workflow.test.mjs`

- [ ] **Step 1: Write status tests**

Add tests covering:

- all anchors covered
- one missing required anchor
- one deferred anchor
- stale context after source hash changes

Run:

```bash
node --test test/workflow.test.mjs -t "status"
```

Expected: FAIL until status summary reads anchors and coverage.

- [ ] **Step 2: Extend `statusSummary()`**

Return direct JSON content for anchors and coverage:

```js
{
  requirement_anchors: { ... },
  requirement_coverage: { ... },
  requirement_coverage_summary: {
    anchors: 12,
    covered: 10,
    deferred: 1,
    missing: 1,
    scope_expansion_warnings: 0,
    stale: 0
  }
}
```

Do not wrap these artifacts in another invented abstraction.

- [ ] **Step 3: Extend human CLI output**

For `loopx status <slug>`, show a concise line:

```text
requirements: 12 anchors, 10 covered, 1 deferred, 1 missing, 0 stale
```

For `loopx next <slug>`, route:

- missing required coverage -> recommend rerunning `plan-to-exec`
- stale source or stale coverage -> recommend rerunning `plan-to-exec`
- scope expansion warnings -> recommend review or `spec` depending on stage, but do not block by default

- [ ] **Step 4: Run verification**

Run:

```bash
node --test test/workflow.test.mjs -t "status"
npm test
```

Expected: PASS.

## Phase 6: Documentation And Skill Contract Updates

**Goal:** Update public documentation after runtime behavior is stable.

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `skills/spec/SKILL.md`
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `plugins/loopx/skills/spec/SKILL.md`
- Modify: `plugins/loopx/skills/plan-to-exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

- [ ] **Step 1: Update docs**

Document:

- `spec` and clarify outputs are anchor sources
- `plan-to-exec` must preserve anchor coverage
- build/review manifests include anchors and coverage
- current user instructions remain higher priority than source docs
- priority order remains: current user instruction, source document, repo specs, memory

- [ ] **Step 2: Update skills**

In `skills/spec/SKILL.md`, state that the design document should make requirements, non-goals, decision boundaries, and planning handoff easy to anchor.

In `skills/plan-to-exec/SKILL.md`, state that the plan must preserve and cover generated requirement anchors and must not introduce uncovered product/API/data/permission behavior.

Synchronize plugin mirrors.

- [ ] **Step 3: Run governance and full verification**

Run:

```bash
node --test test/skill-governance.test.mjs
npm test
```

Expected: PASS.

## Final Acceptance Criteria

- `planStage()` writes `requirement-anchors.json`, `requirement-coverage.json`, and the existing `requirement-traceability.md`.
- Build readiness blocks when a required anchor is not covered.
- Deferred anchors with rationale are visible but do not block.
- Scope expansion is warning-only in the first implementation.
- Build and review context manifests include anchors and coverage and can detect stale required context.
- `subagent-exec` prompts require structured anchor coverage reporting.
- `loopx status` and `loopx next` expose missing, deferred, warning, and stale states.
- Root skills and plugin mirrors stay byte-for-byte aligned where governance expects alignment.
- `npm test` passes after every phase.

## Suggested Commit Boundaries

Use one commit per phase:

```text
feat: add requirement anchor artifacts
feat: gate build on requirement coverage
feat: upgrade context manifests for requirement freshness
docs: require anchor context in subagent execution
feat: show requirement coverage in loopx status
docs: document requirement anchor workflow
```
