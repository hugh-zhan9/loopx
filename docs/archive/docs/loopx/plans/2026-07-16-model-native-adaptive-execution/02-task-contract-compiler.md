# Task Contract, Immutable Manifest, And Prompt Compiler Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:exec` for tightly coupled work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md` (section 4.2 and planning handoff)

**Canonical contract:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

**Goal:** Make the plan task contract the single human/machine source that compiles once into a strict immutable execution manifest and minimal role-specific prompts without guessing dependencies or write safety.

**Architecture:** `contracts.mjs` owns exact schema validation. `compiler-lib.mjs` hashes validated source snapshots, emits immutable manifest/prompt artifacts, and records model/policy/adapter provenance. `plan-to-exec` and `plan-reviewer` consume the same validator and preserve `T-*`/AC/D/TC traceability while removing default implementation transcription and repeated schema prose from newly generated contracts.

**Tech Stack:** Node.js ESM, `node:crypto`, `node:fs/promises`, `node:path`, JSON, `node:test`, Markdown contract skills.

**Support lenses:** `architecture-designer`, `cli-developer`

**Execution strategy recommendation:** `exec`

**Selection rationale:** The schema, compiler, prompt projection, and plan/reviewer wording must stay byte-for-byte compatible. Tests and skill contracts intentionally share files and cannot be delegated independently without drift.

```loopx-parallel-plan
{"schema":"loopx.parallel-plan.v1","max_parallel":1}
```

## Global Constraints

- Canonical schema IDs are `loopx.task-contract.v1` and `loopx.execution-manifest.v1`; unknown fields, missing required fields, invalid paths, cycles, ambiguous dependencies, and unauthorized exact payloads fail closed before lease/run mutation.
- Every new task contains stable `task_anchor`, outcome, source AC, design anchors, test scenarios, surfaces, allowed writes, interfaces, semantic dependencies, exclusive resources, verification, expected evidence, review focus, residual risk, and `exact_payloads` (empty unless an approved D anchor authorizes it).
- The compiler never infers semantic dependencies or write boundaries from prose, file names, or prompt similarity. If safety cannot be proven, select concurrency `1` or reject before dispatch.
- Manifest identity records source/requirements/design/plan hashes, repository/baseline/snapshot identity, engine/compiler/contract/policy/prompt/model-policy/adapter versions and hashes, profile, risk, task DAG, and package boundaries. Prompt artifacts are immutable after compile.
- Existing task anchors and current plan-review traceability remain; history is not batch-rewritten.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md` — all three Important findings closed
- Residual risk: compiler output is filesystem-local and content-addressed; no external schema registry is introduced.

---

### T-001 / Task 1: Implement the strict task-contract validator

**Files:**
- Create: `skills/shared/execution/contracts.mjs`
- Create: `test/execution-contracts.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-001","depends_on":[],"write_scope":["skills/shared/execution/contracts.mjs","test/execution-contracts.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: plain task-contract objects and repository-relative path base.
- Produces: `TASK_CONTRACT_SCHEMA`, `validateTaskContract(contract, { repoRoot })`, `normalizeTaskContract(contract, { repoRoot })`, and `validateTaskGraph(tasks)`; failures use stable codes such as `task_contract_fields_invalid`, `task_contract_path_invalid`, `task_contract_dependency_ambiguous`, and `task_contract_payload_unauthorized`.

**Traceability:**
- Source AC: `AC-002`, `AC-003`, `AC-024`
- Design anchors: `D-002`
- Test cases: `TC-002`, `TC-018`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-contracts.test.mjs`
- `evidence_summary`: valid normal and exact-payload contracts normalize deterministically; unknown fields, path escapes, missing/duplicate dependencies, cycles, overlap without dependency, and unauthorized payloads fail before any filesystem mutation.
- `remaining_risk`: task-contract parsing covers current Markdown extraction only; legacy parallel fences remain legacy-router input.

**Review focus:**
- Verify all required top-level fields and allowed enum values are exact; no permissive normalization of unknown data.
- Verify `semantic_dependencies` are qualified task IDs with explicit reasons and are never inferred from `interfaces`, path overlap, or prose.
- Verify `exact_payloads` require source D anchor, kind, content/hash, and otherwise remain empty.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Write failing validator tests.** Add fixtures for a complete normal contract, authorized wire-format payload, unknown field, absolute/`..` path, missing `T-*`, duplicate operation, cycle, ambiguous dependency, overlapping writes without dependency, malformed verification, and secret-bearing exact payload.
- [ ] **Step 2: Run the focused test and confirm RED.** Run `node --test test/execution-contracts.test.mjs`; expect module-not-found failure.
- [ ] **Step 3: Implement exact schema constants and validators.** Export the interfaces above; normalize slash-separated repo-relative paths, sort stable arrays only where the contract permits, retain declaration order for semantic dependency reasons, and return a deep-frozen normalized object.
- [ ] **Step 4: Run focused tests to GREEN.** Run `node --test test/execution-contracts.test.mjs`; expect PASS for all valid/invalid fixtures.
- [ ] **Step 5: Record task evidence.** Record stable error codes, normalized example JSON, and proof that no lease/worktree/run directory is touched by validation.

### T-002 / Task 2: Compile immutable manifests and minimal role prompts

**Files:**
- Create: `skills/shared/execution/compiler-lib.mjs`
- Create: `skills/shared/execution/prompts/implementer.md`
- Create: `skills/shared/execution/prompts/reviewer.md`
- Create: `skills/shared/execution/prompts/fixer.md`
- Create: `skills/shared/execution/prompts/final-reviewer.md`
- Create: `test/execution-compiler.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-002","depends_on":["T-001"],"write_scope":["skills/shared/execution/compiler-lib.mjs","skills/shared/execution/prompts/implementer.md","skills/shared/execution/prompts/reviewer.md","skills/shared/execution/prompts/fixer.md","skills/shared/execution/prompts/final-reviewer.md","test/execution-compiler.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: validated task contracts, source snapshot descriptors, repo topology/baseline, pinned profile/policy/version inputs.
- Produces: `compileExecutionManifest(input)`, `projectRolePrompt({ manifest, taskId, role })`, `writeManifestArtifacts({ runRoot, manifest, prompts })`, immutable `manifest.json`/`manifest.sha256`, and prompt artifacts containing template/version/hash.

**Traceability:**
- Source AC: `AC-003`, `AC-004`, `AC-019`, `AC-024`
- Design anchors: `D-002`, `D-004`, `D-016`
- Test cases: `TC-002`, `TC-003`, `TC-014`, `TC-018`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/execution-compiler.test.mjs`
- `evidence_summary`: same input produces identical manifest/prompt hashes; role prompts contain only role-relevant outcome/AC-D-TC/boundary/verification/evidence/stop conditions; requested/observed model and adapter versions are pinned; unresolved safety selects serial or rejects.
- `remaining_risk`: prompt token/latency graduation remains a later eval lane and does not alter quality gates here.

**Review focus:**
- Verify `run_id` shape, qualified task IDs, source hashes, profile/policy/compiler/prompt/model/adapter provenance, and package boundary order match the design.
- Verify prompts do not copy full implementation code, fixed 2-5 minute microsteps, unrelated roles, or the entire registry.
- Verify resume never recompiles or silently replaces a persisted prompt bundle.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Write compiler tests.** Assert deterministic hashes, exact `run_id` pattern, content-addressed source snapshots, qualified task IDs, role projection allowlists, serial fallback for unresolved safety, and rejection of prompt drift.
- [ ] **Step 2: Run the focused test and confirm RED.** Run `node --test test/execution-compiler.test.mjs`; expect missing-export failures.
- [ ] **Step 3: Implement compile functions.** Use `createHash('sha256')`, canonical JSON serialization, and owner-only writes. Bind the manifest to source/compiler/policy/prompt/model-policy/adapter versions and all task contract hashes.
- [ ] **Step 4: Implement role projections.** Keep implementer/reviewer/fixer/final-reviewer templates declarative; inject only the task’s relevant fields, shared leaf-only clause, and exact stop conditions.
- [ ] **Step 5: Run focused tests to GREEN.** Run `node --test test/execution-compiler.test.mjs`; expect PASS.
- [ ] **Step 6: Record task evidence.** Record manifest and prompt hashes, a redacted role projection, and serial/reject reason for an ambiguous dependency fixture.

### T-003 / Task 3: Make planning and plan review emit/consume the canonical contract

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/plan-to-exec/references/plan-schema.md`
- Modify: `skills/plan-reviewer/SKILL.md`
- Modify: `test/skill-governance.test.mjs`
- Modify: `test/fixtures/skill-contract-matrix.json`
- Modify: `test/execution-contracts.test.mjs`

```loopx-parallel-task
{"schema":"loopx.parallel-task.v1","task_anchor":"T-003","depends_on":["T-002"],"write_scope":["skills/plan-to-exec/SKILL.md","skills/plan-to-exec/references/plan-schema.md","skills/plan-reviewer/SKILL.md","test/skill-governance.test.mjs","test/fixtures/skill-contract-matrix.json","test/execution-contracts.test.mjs"],"parallel_safe":false}
```

**Interfaces:**
- Consumes: `validateTaskContract`/`compileExecutionManifest` from `T-001`/`T-002`, current plan-local `T-*` anchors, and the existing plan-review gate.
- Produces: one canonical `loopx-task-contract.v1` block per task, no default implementation transcription/microstep/schema duplication, shared-validator plan review, and current `exec | subagent-exec` execution recommendation until later route release.

**Traceability:**
- Source AC: `AC-001`, `AC-002`, `AC-003`, `AC-021`, `AC-024`
- Design anchors: `D-001`, `D-002`, `D-013`, `D-015`
- Test cases: `TC-001`, `TC-002`, `TC-015`, `TC-018`, `TC-020`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/skill-governance.test.mjs test/execution-contracts.test.mjs`; `node scripts/verify-skills.mjs`
- `evidence_summary`: governance sees exact contract fields and shared validator use; generated plan keeps anchors/review/evidence fields, rejects prose-inferred dependency/write safety, and does not recommend a new public executor.
- `remaining_risk`: agent-authored Markdown remains the human source; compiler validation and independent plan review are the enforcement layer.

**Review focus:**
- Verify the change is additive to current skill discovery and preserves `T-*`/AC/D/TC traceability, `Review focus`, and `Expected execution evidence`.
- Verify the new contract does not introduce a public CLI/skill or automatic parallel route.
- Verify plan-reviewer validates through the shared executable owner rather than copying parser logic or reviewing implementation code.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Extend governance tests first.** Add assertions for canonical contract fields, no implementation-code default, exact payload authorization, shared validator invocation, and unchanged `Execution strategy recommendation: subagent-exec | exec`.
- [ ] **Step 2: Run focused tests and confirm RED.** Run `node --test test/skill-governance.test.mjs test/execution-contracts.test.mjs`; expect the current prose-only planning contract to fail the new assertions.
- [ ] **Step 3: Update plan-to-exec contract text.** Require the canonical block, stable task anchors, outcome/boundary/interfaces/dependency/resource/verification/evidence/review fields, and explicit serial-or-reject behavior for unknown safety. Keep exact payload examples only when source D anchors authorize them.
- [ ] **Step 4: Update plan-reviewer.** Require shared validator execution, source-to-plan coverage for every AC/D/TC, exact `Create:`/`Modify:`/`Test:` surface mapping, and a negative check that no implementation code or prose-inferred dependency enters the contract.
- [ ] **Step 5: Synchronize metadata/version fixtures.** Update only the skill metadata versions and contract matrix entries whose behavior changed; preserve user edits in the current worktree.
- [ ] **Step 6: Run focused verification to GREEN.** Run `node --test test/skill-governance.test.mjs test/execution-contracts.test.mjs` and `node scripts/verify-skills.mjs`; expect PASS and no new public executor recommendation.
- [ ] **Step 7: Record task evidence.** Record one normal and one authorized exact-payload plan fixture, version assertions, validator command, and negative route checks.

## Plan Verification

```bash
node --test test/execution-contracts.test.mjs test/execution-compiler.test.mjs
node --test test/skill-governance.test.mjs
node scripts/verify-skills.mjs
git diff --check
```

Expected: all pass; no runtime state is created; source task traceability remains intact; current executor recommendation remains unchanged.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/02-task-contract-compiler.md
```
