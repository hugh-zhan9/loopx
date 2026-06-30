# Spec Design Contract Anchors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-30-spec-design-contract-anchors/需求设计文档.md`

**Goal:** Add `D-*` design contract anchor rules to the human-readable `spec` output contract, then carry those anchors through `plan-to-exec` and `review`.

**Architecture:** This is a skill-contract and governance-test change only. The single source of truth remains the unified human-readable design document; `D-*` anchors are inline decision references plus a detailed-design index, not a new runtime state, CLI command, or separate artifact. Downstream planning and review consume the anchors through existing markdown skill instructions.

**Tech Stack:** Node.js ESM package, Markdown skill contracts, `node:test`, `node:assert/strict`, `scripts/verify-skills.mjs`.

**Support lenses:** `architecture-designer`

## Global Constraints

- Preserve existing spec output paths: `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/设计提案.md` and `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`.
- Preserve Chinese detailed design template section order.
- Preserve intake package flow and `TC-*` coverage rules.
- Update bundled skill docs only for `spec`, `plan-to-exec`, and `review`.
- Bump only the changed skill `metadata.version` values.
- Do not introduce a runtime state machine, CLI command, state field, independent contract artifact, or artifact validator.
- Do not migrate historical design documents.
- Do not require proposal-only, research-only, explanatory, or no-implementation-output designs to invent `D-*` anchors.
- Do not make `final-review` full `D-*` matrix support part of this first slice.
- Run `node --test test/skill-governance.test.mjs`.
- Run `node scripts/verify-skills.mjs`.

---

## File Structure

- Modify `skills/spec/SKILL.md`: define `D-*` design anchor applicability, minimum contract fields, inline placement, final index table, support-lens merge rule, and not-applicable boundary. Bump `metadata.version` from `0.3.6` to `0.3.7`.
- Modify `skills/spec/DESIGN_SPEC_TEMPLATE.md`: add design-anchor guidance while preserving the existing section order; add `Verification Strategy / TC 覆盖映射` and `Design Contract Index / D-* 完整索引` under `十一、QA`.
- Modify `skills/plan-to-exec/SKILL.md`: require plans sourced from specs with `D-*` to preserve design anchors in tasks, verification, review focus, or deferred-with-rationale rows. Bump `metadata.version` from `0.3.6` to `0.3.7`.
- Modify `skills/review/SKILL.md`: require Stage 1 spec compliance to check `AC-*` and `D-*` coverage when a formal source contains design anchors. Bump `metadata.version` from `0.3.4` to `0.3.5`.
- Modify `test/skill-governance.test.mjs`: add governance assertions for `D-*` anchor rules across `spec`, the detailed template, `plan-to-exec`, and `review`.

## Surface Inventory

- Public commands/API/routes/events/config: no changes. Do not edit CLI commands, flags, JSON output, config keys, routes, or events.
- Exported functions/types/modules: no changes. Do not edit `src/` modules for this feature.
- Runtime/generated artifacts and templates: update only the canonical design template `skills/spec/DESIGN_SPEC_TEMPLATE.md`; do not change `.loopx/` runtime state or `templates/` intake files.
- Installer/package/deployment surface: bundled skill content changes only. `skills/spec/`, `skills/plan-to-exec/`, and `skills/review/` are already in the package skill surface.
- Hooks/background jobs/automation: no hook changes. Do not edit `scripts/codex-workflow-hook.mjs` or `scripts/claude-workflow-hook.mjs`.
- Current product docs: no README or CLI docs changes in this slice; the public CLI surface is unchanged.
- Tests/governance checks: update `test/skill-governance.test.mjs`, run targeted governance test and `scripts/verify-skills.mjs`.
- Compatibility/migration paths: historical design docs remain unchanged; `final-review` full `D-*` matrix support is deferred.

Caller Proof commands before implementation:

```bash
rg "D-\\*|Design Contract Index|Design anchors|Source AC|Stage 1 spec compliance|TC-\\*" skills test docs/loopx/design/2026-06-30-spec-design-contract-anchors
rg "skills/spec/|skills/plan-to-exec/|skills/review/" package.json src/install-discovery.mjs skills/RESOLVER.md
```

Expected before implementation:

- Existing design docs contain the new `D-*` target rules.
- `skills/spec/SKILL.md` has `TC-*` preservation but no `D-*` anchor contract yet.
- `skills/plan-to-exec/SKILL.md` has `AC-*`/`TC-*` rules but no design-anchor coverage rule yet.
- `skills/review/SKILL.md` has Stage 1 spec compliance but no `D-*` coverage rule yet.
- The package surface already includes the three changed skills.

Negative Assertions:

```bash
! rg "design-contract\\.json|contracts\\.md|artifact validator|runtime state machine|loopx design-anchor|loopx anchors" skills README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md src scripts package.json
! rg "final-review.*required.*D-\\*|D-\\*.*hard gate.*final-review" skills/final-review skills/spec skills/plan-to-exec skills/review test
BASE=$(node -e 'const fs=require("fs"); const p=".loopx/finish/baselines/spec-design-contract-anchors.json"; console.log(JSON.parse(fs.readFileSync(p,"utf8")).head)')
git diff --name-only "$BASE"..HEAD | rg "^(src/|scripts/codex-workflow-hook\\.mjs|scripts/claude-workflow-hook\\.mjs|templates/)" && exit 1 || true
```

Expected after implementation:

- No new separate contract artifact, artifact validator, runtime state machine, or `loopx` command is introduced.
- `final-review` is not made a hard first-slice gate for `D-*`.
- No `src/`, hook, or `templates/` file is changed by this feature.

Strict current product surface: `skills/spec/SKILL.md`, `skills/spec/DESIGN_SPEC_TEMPLATE.md`, `skills/plan-to-exec/SKILL.md`, `skills/review/SKILL.md`, `test/skill-governance.test.mjs`, `scripts/verify-skills.mjs`, `package.json`, `src/install-discovery.mjs`, `skills/RESOLVER.md`.

Historical context paths may mention older designs or plans: `docs/loopx/design/**`, `docs/loopx/plans/**`, `docs/release-notes/**`, `docs/articles/**`.

## Anchor Coverage Matrix

| Anchor | Source AC | Covered by |
|---|---|---|
| D-001 | AC-001 | Task 2 updates `spec` human-readable positioning; Task 4 governance assertions; Task 5 manual check TC-001 |
| D-002 | AC-001, AC-002 | Task 2 adds implementation-relevant/not-applicable boundary; Task 4 assertions; Task 5 TC-002 |
| D-003 | AC-002 | Task 2 adds minimum contract fields; Task 4 assertions |
| D-004 | AC-002 | Task 2 adds inline/index rules; Task 2 updates template index; Task 4 assertions |
| D-005 | AC-003 | Task 2 support lens merge wording; Task 4 assertions; Task 5 TC-003 |
| D-006 | AC-004 | Task 2 preserves TC mapping; Task 4 assertions; Task 5 TC-004 |
| D-007 | AC-005 | Task 3 updates `plan-to-exec`; Task 4 assertions; Task 5 TC-005 |
| D-008 | AC-005 | Task 3 updates `review`; Task 4 assertions; Task 5 TC-005 |
| D-009 | AC-001, AC-005 | Surface Inventory and negative assertions; Task 5 verifies no runtime/CLI/final-review scope expansion |

## Test Case Coverage Matrix

| TC | Source AC | Plan coverage |
|---|---|---|
| TC-001 | AC-001 | Task 2 keeps `spec` human-readable; Task 4 text assertions; Task 5 manual review of generated design docs |
| TC-002 | AC-002 | Task 2 adds inline/final index/not-applicable rules; Task 4 text assertions; Task 5 manual check |
| TC-003 | AC-003 | Task 2 support lens merge rule; Task 4 text assertions; Task 5 manual check |
| TC-004 | AC-004 | Task 2 retains intake `TC-*` verification strategy; Task 4 text assertions; Task 5 checks mapping |
| TC-005 | AC-005 | Task 3 updates `plan-to-exec` and `review`; Task 4 text assertions; Task 5 manual workflow check |

### Task 1: Add Failing Governance Assertions

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: existing test helpers `readFile`, `join`, `repoRoot`, and `assert`.
- Produces: a new failing governance test named `governs design contract anchors across spec planning and review`.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Inspect the current governance test location**

Run:

```bash
sed -n '560,700p' test/skill-governance.test.mjs
```

Expected: output includes the existing `plan-to-exec requires global constraints and task interfaces for subagent handoff` test and the `spec requires boundary scenarios in proposal and detailed design` test.

- [ ] **Step 2: Add the failing test**

Use `apply_patch` to insert this test immediately after the existing `spec requires boundary scenarios in proposal and detailed design` test and before `review and final-review actively trigger support lenses for domain-specific changes`:

```js
  it('governs design contract anchors across spec planning and review', async () => {
    const specSkill = await readFile(join(repoRoot, 'skills', 'spec', 'SKILL.md'), 'utf8');
    const template = await readFile(join(repoRoot, 'skills', 'spec', 'DESIGN_SPEC_TEMPLATE.md'), 'utf8');
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');

    assert.match(specSkill, /D-\*/);
    assert.match(specSkill, /implementation-relevant/i);
    assert.match(specSkill, /human-reviewed design document|human-readable design document/i);
    assert.match(specSkill, /Design anchors: not applicable/);
    assert.match(specSkill, /inline/i);
    assert.match(specSkill, /final complete index table|complete index table/i);
    assert.match(specSkill, /Source AC/);
    assert.match(specSkill, /contract type/i);
    assert.match(specSkill, /downstream expectation/i);
    assert.match(specSkill, /support lenses/i);
    assert.match(specSkill, /separate authoritative contract files/i);
    assert.match(specSkill, /TC-\*/);

    assert.match(template, /Design Contract Index \/ D-\*/);
    assert.match(template, /\| D anchor \| Source AC \| Contract type \| Decision summary \| Downstream expectation \|/);
    assert.match(template, /Verification Strategy \/ TC/);
    assert.match(template, /Design anchors: not applicable/);

    assert.match(planSkill, /D-\*/);
    assert.match(planSkill, /Design anchors/);
    assert.match(planSkill, /design anchor coverage/i);
    assert.match(planSkill, /deferred-with-rationale/);
    assert.match(planSkill, /return to `spec`/);

    assert.match(reviewSkill, /D-\*/);
    assert.match(reviewSkill, /AC-\*/);
    assert.match(reviewSkill, /Stage 1 spec compliance/i);
    assert.match(reviewSkill, /deferred rationale/i);
    assert.match(reviewSkill, /code quality/i);

    assert.doesNotMatch(specSkill, /design-contract\.json|contracts\.md/);
    assert.doesNotMatch(planSkill, /design-contract\.json|contracts\.md/);
    assert.doesNotMatch(reviewSkill, /design-contract\.json|contracts\.md/);
  });
```

- [ ] **Step 3: Run the targeted test and confirm it fails for the missing contract text**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: FAIL. The failure should be in `governs design contract anchors across spec planning and review`, with an assertion about missing `D-*`, `Design Contract Index`, `Design anchors`, or related contract text.

- [ ] **Step 4: Commit the failing test**

```bash
git add test/skill-governance.test.mjs
git commit -m "test: cover design contract anchors"
```

Expected: commit succeeds. If local workflow prefers one final commit, record this as a checkpoint instead of committing, but keep the test failure evidence in the task report.

### Task 2: Update Spec Skill And Detailed Design Template

**Files:**
- Modify: `skills/spec/SKILL.md`
- Modify: `skills/spec/DESIGN_SPEC_TEMPLATE.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: `AC-001`, `AC-002`, `AC-003`, `AC-004`; `D-001` through `D-006`.
- Produces: `spec` contract text that tells agents when and how to write `D-*`, and template sections that make the index discoverable.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Bump `spec` metadata version**

In `skills/spec/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.6"
```

to:

```yaml
metadata:
  version: "0.3.7"
```

- [ ] **Step 2: Add the design-anchor contract to `skills/spec/SKILL.md`**

Insert this section after the paragraph ending with `Do not re-litigate the direction in the detailed design; put unresolved direction questions back in the proposal and stop before planning if they block implementation.` and before `## Support Lens Activation`:

```markdown
## Design Contract Anchors

`spec` remains a human-reviewed design document generator. `D-*` design anchors add traceability; they do not replace narrative context, tradeoffs, rationale, boundary scenarios, or the required detailed design template.

For detailed designs with implementation-relevant decisions, assign stable `D-*` anchors such as `D-001`, `D-002`, and `D-003`. A decision is implementation-relevant when it affects behavior, API, data, state, CLI, permissions, compatibility, rollout, operations, downstream planning, or review.

Each design contract entry should name:

- `D-*` anchor
- Source AC, when an `AC-*` exists
- Contract type, such as behavior, data, state, CLI, compatibility, operations, or workflow contract
- Decision
- Boundary or non-goal
- Downstream expectation for `plan-to-exec` or `review`

Place each `D-*` anchor inline beside the relevant decision in the main design body, then include a final complete index table in the detailed design. The inline anchor keeps the design readable in context; the index table gives downstream skills one lookup surface.

Proposal-only, research-only, explanatory, or no-implementation-output designs may write `Design anchors: not applicable` with a short reason. Do not invent fake anchors for documents without implementation-relevant decisions.
```

- [ ] **Step 3: Extend support-lens wording in `skills/spec/SKILL.md`**

In the `Support Lens Activation` section, after:

```markdown
Record triggered support lenses in the design proposal and detailed design. If no support lens applies, state `Support lenses: none` so downstream planning does not guess.
```

add:

```markdown
Support lenses inform the unified design document. They must not create separate authoritative contract files that `plan-to-exec`, `review`, or implementers need to reconcile. Fold lens-specific conclusions into the proposal, detailed design sections, boundary scenarios, verification strategy, or `D-*` entries.
```

- [ ] **Step 4: Extend intake package verification wording in `skills/spec/SKILL.md`**

Replace the existing sentence:

```markdown
When the source is an intake package directory, the detailed design must reference the intake package path and its `requirements.md` and `test-cases.md` files. The verification strategy must preserve `TC-*` coverage by mapping requirement-stage acceptance/integration scenarios to design-level test strategy, manual checks, or deferred-with-rationale items.
```

with:

```markdown
When the source is an intake package directory, the detailed design must reference the intake package path and its `requirements.md` and `test-cases.md` files. The verification strategy must preserve `TC-*` coverage by mapping requirement-stage acceptance/integration scenarios to design-level test strategy, manual checks, or deferred-with-rationale items. If the detailed design also contains `D-*` anchors, the verification strategy should make the `AC-* -> D-* -> TC-*` relationship visible where that helps downstream planning.
```

- [ ] **Step 5: Add detailed-design output requirements to `skills/spec/SKILL.md`**

After the existing paragraph:

```markdown
The design proposal and detailed design must both cover boundary scenarios. Include normal boundaries, invalid inputs, permission failures, duplicate or repeated actions, concurrency races, partial failures, dependency timeouts, legacy data, migration overlap, rollback, and unchanged behavior where relevant. If a category does not apply, say why instead of omitting it.
```

add:

```markdown
For detailed designs with `D-*` anchors, include a `Design Contract Index / D-*` subsection under `十一、QA` or an equivalent final QA subsection. The index table must list every `D-*` anchor used in the document:

| D anchor | Source AC | Contract type | Decision summary | Downstream expectation |
|---|---|---|---|---|
| `D-001` | `AC-001` or `not_applicable` | `workflow contract` | `<short decision>` | `<what plan/review must preserve>` |

If design anchors are not applicable, include `Design anchors: not applicable` with a short reason instead of the table.
```

- [ ] **Step 6: Update the detailed design template QA section**

In `skills/spec/DESIGN_SPEC_TEMPLATE.md`, after the `### 11.2 待确认问题` table, append:

```markdown

### 11.3 Verification Strategy / TC 覆盖映射

当 source 包含 `test-cases.md` 时，列出每个相关 `TC-*` 如何映射到设计级验证策略、人工检查或 deferred-with-rationale。若本设计包含 `D-*`，在验证策略中体现 `AC-* -> D-* -> TC-*` 的关系。

| TC | Source AC | Related D anchors | 设计级验证策略 | 自动化/人工 | Deferred rationale |
|---|---|---|---|---|---|
| <TC-001> | <AC-001> | <D-001 或 not_applicable> | <策略> | <automation/manual> | <无或原因> |

### 11.4 Design Contract Index / D-* 完整索引

Design anchors: not applicable only when this detailed design has no implementation-relevant decisions, such as proposal-only, research-only, explanatory, or no-implementation-output work. Otherwise list every inline `D-*` anchor used in the document.

| D anchor | Source AC | Contract type | Decision summary | Downstream expectation |
|---|---|---|---|---|
| <D-001> | <AC-001 或 not_applicable> | <behavior/data/state/CLI/compatibility/operations/workflow contract> | <简短决策> | <plan-to-exec/review 必须保留的约束> |
```

Do not delete or reorder any existing top-level section from `一、修订历史` through `十一、QA`.

- [ ] **Step 7: Run the targeted test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: still FAIL because `skills/plan-to-exec/SKILL.md` and `skills/review/SKILL.md` have not yet been updated. The previous `spec` and template assertion failures should be gone.

- [ ] **Step 8: Commit the spec/template update**

```bash
git add skills/spec/SKILL.md skills/spec/DESIGN_SPEC_TEMPLATE.md
git commit -m "docs: add spec design anchor contract"
```

Expected: commit succeeds, or checkpoint recorded if using one final commit.

### Task 3: Update Plan-To-Exec And Review Consumption Rules

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/review/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: `D-007`, `D-008`, `D-009`; generated detailed design with `Design Contract Index / D-*`.
- Produces: downstream skill rules that preserve `D-*` in plans and spec compliance review findings.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Bump changed skill metadata versions**

In `skills/plan-to-exec/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.6"
```

to:

```yaml
metadata:
  version: "0.3.7"
```

In `skills/review/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.4"
```

to:

```yaml
metadata:
  version: "0.3.5"
```

- [ ] **Step 2: Add design-anchor planning rules to `skills/plan-to-exec/SKILL.md`**

After the paragraph ending with:

```markdown
The plan must preserve `AC-*` anchors from `requirements.md` and cover `TC-*` scenarios from `test-cases.md` through tasks, verification commands, or deferred-with-rationale rows. For legacy clarify bundles or spec source documents, preserve and cover generated requirement anchors from the source. It must not introduce uncovered product/API/data/permission behavior; add explicit rationale for non-product infrastructure, docs-only, test-only, or refactor-only work that has no direct anchor.
```

add:

```markdown
When a source design spec contains `D-*` design anchors or a `Design Contract Index / D-*` table, preserve those anchors in the plan. Each implementation-relevant `D-*` must map to at least one task, verification step, review focus, or deferred-with-rationale row. Task briefs should include `Design anchors: D-001, D-002` alongside `Source AC`. If a `D-*` anchor is missing, contradictory, or would require a new design decision to plan safely, return to `spec` instead of inventing the decision in the plan.
```

- [ ] **Step 3: Update the task structure example in `skills/plan-to-exec/SKILL.md`**

In the `Task Structure` template, add this line after the `**Interfaces:**` block and before `**Support lenses:**`:

```markdown
**Traceability:**
- Source AC: [exact `AC-*` ids or `not_applicable` with rationale]
- Design anchors: [exact `D-*` ids, `not_applicable`, or `deferred-with-rationale`]
- Test cases: [exact `TC-*` ids, manual check, or deferred-with-rationale]
```

- [ ] **Step 4: Extend `plan-to-exec` self-review**

In `skills/plan-to-exec/SKILL.md`, replace the self-review item:

```markdown
5. **Anchor coverage:** Does each generated requirement anchor map to a task, verification step, or deferred-with-rationale row? If not, fix the plan before handoff.
```

with:

```markdown
5. **Anchor coverage:** Does each generated requirement anchor and each `D-*` design anchor map to a task, verification step, review focus, or deferred-with-rationale row? If not, fix the plan before handoff.
```

Then add this sentence to the `Remember` list after `Preserve anchor coverage for every generated requirement anchor`:

```markdown
- Preserve design anchor coverage for every `D-*` in the source design spec.
```

- [ ] **Step 5: Add `D-*` Stage 1 rules to `skills/review/SKILL.md`**

After the Stage 1 purpose text:

```markdown
**Purpose:** Verify the implementation matches the plan/requirements — nothing missing, nothing extra.
```

add:

```markdown
When the formal plan or spec contains `D-*` design anchors, Stage 1 spec compliance must check those anchors alongside `AC-*` requirements. Verify that implemented behavior covers the relevant `D-*`, that uncovered anchors have explicit deferred rationale, and that the diff does not introduce behavior outside the approved `AC-*`/`D-*` contract.
```

- [ ] **Step 6: Update the review dispatch prompt**

In the `Spec Compliance Check` block in `skills/review/SKILL.md`, replace the `Verify:` list with:

```text
Verify:
1. Everything requested is implemented (nothing missing)
2. Nothing unrequested was added (nothing extra)
3. Intent matches, not just literal words
4. Outputs match what downstream tasks expect
5. If `AC-*` anchors exist, findings or coverage notes reference the relevant `AC-*`
6. If `D-*` design anchors exist, findings or coverage notes reference the relevant `D-*`
7. Any uncovered `D-*` has explicit deferred rationale; otherwise treat it as a spec compliance gap
```

- [ ] **Step 7: Run the targeted test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: PASS for `governs design contract anchors across spec planning and review` and no regressions in the rest of `skill-governance.test.mjs`.

- [ ] **Step 8: Commit downstream skill updates**

```bash
git add skills/plan-to-exec/SKILL.md skills/review/SKILL.md
git commit -m "docs: thread design anchors through planning and review"
```

Expected: commit succeeds, or checkpoint recorded if using one final commit.

### Task 4: Harden Governance Assertions And Scope Guards

**Files:**
- Modify: `test/skill-governance.test.mjs`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: changed skill docs from Tasks 2 and 3.
- Produces: final governance assertions that guard against losing `D-*` rules or expanding scope into runtime/CLI/final-review.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Add negative scope assertions**

In the test added in Task 1, after the existing `assert.doesNotMatch(... design-contract...)` lines, add:

```js
    assert.doesNotMatch(specSkill, /runtime state machine|new CLI command|artifact validator/i);
    assert.doesNotMatch(planSkill, /runtime state machine|new CLI command|artifact validator/i);
    assert.doesNotMatch(reviewSkill, /runtime state machine|new CLI command|artifact validator/i);
    assert.doesNotMatch(reviewSkill, /final-review.*hard gate|hard gate.*final-review/i);
```

- [ ] **Step 2: Add changed-version assertions for the three skills**

In the same test, after reading `reviewSkill`, add:

```js
    const specFields = parseFrontmatter(specSkill);
    const planFields = parseFrontmatter(planSkill);
    const reviewFields = parseFrontmatter(reviewSkill);
```

Then add assertions:

```js
    assert.equal(specFields['metadata.version'], '0.3.7');
    assert.equal(planFields['metadata.version'], '0.3.7');
    assert.equal(reviewFields['metadata.version'], '0.3.5');
```

These exact versions reflect the current file versions at plan time. If another merged change has already bumped one of these skills before execution starts, increment that skill by one patch version and update these assertions in the same task.

- [ ] **Step 3: Run targeted governance test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run scope negative assertions**

Run:

```bash
! rg "design-contract\\.json|contracts\\.md|artifact validator|runtime state machine|loopx design-anchor|loopx anchors" skills README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md src scripts package.json
! rg "final-review.*required.*D-\\*|D-\\*.*hard gate.*final-review" skills/final-review skills/spec skills/plan-to-exec skills/review test
BASE=$(node -e 'const fs=require("fs"); const p=".loopx/finish/baselines/spec-design-contract-anchors.json"; console.log(JSON.parse(fs.readFileSync(p,"utf8")).head)')
git diff --name-only "$BASE"..HEAD | rg "^(src/|scripts/codex-workflow-hook\\.mjs|scripts/claude-workflow-hook\\.mjs|templates/)" && exit 1 || true
```

Expected:

- First two commands exit 0 because `rg` finds no forbidden scope-expansion text.
- Third command exits 0 and prints nothing, proving this feature did not touch runtime, hooks, or intake templates.

- [ ] **Step 5: Commit governance hardening**

```bash
git add test/skill-governance.test.mjs
git commit -m "test: harden design anchor governance"
```

Expected: commit succeeds, or checkpoint recorded if using one final commit.

### Task 5: Run Release Gates And Manual Contract Review

**Files:**
- Verify: `skills/spec/SKILL.md`
- Verify: `skills/spec/DESIGN_SPEC_TEMPLATE.md`
- Verify: `skills/plan-to-exec/SKILL.md`
- Verify: `skills/review/SKILL.md`
- Verify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: all previous task changes.
- Produces: verification evidence that the skill contract is coherent, packaged, and scoped.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Run skill governance tests**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: PASS. The output should show no failing subtests.

- [ ] **Step 2: Run bundled skill verifier**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: PASS with no metadata, package surface, resolver, or plugin install assumption errors.

- [ ] **Step 3: Run full repository tests**

Run:

```bash
npm test
```

Expected: PASS for all `node --test test/*.test.mjs` suites. If unrelated dirty worktree changes cause failures, record the failing test and prove whether the failure exists before this feature's commits before proceeding.

- [ ] **Step 4: Manual TC review**

Open the generated design source:

```bash
sed -n '1,220p' docs/loopx/design/2026-06-30-spec-design-contract-anchors/需求设计文档.md
sed -n '583,605p' docs/loopx/design/2026-06-30-spec-design-contract-anchors/需求设计文档.md
```

Check and record:

- TC-001: `spec` remains human-readable; `D-*` anchors are additive.
- TC-002: implementation-relevant decisions have inline anchors and a final index table; not-applicable boundary exists.
- TC-003: support lenses merge into the unified design document.
- TC-004: `TC-*` verification strategy is preserved.
- TC-005: `plan-to-exec` and `review` consume `D-*`; `final-review` full matrix is deferred.

Expected: all five checks pass.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
BASE=$(node -e 'const fs=require("fs"); const p=".loopx/finish/baselines/spec-design-contract-anchors.json"; console.log(JSON.parse(fs.readFileSync(p,"utf8")).head)')
git diff --stat "$BASE"..HEAD
git diff "$BASE"..HEAD -- skills/spec/SKILL.md skills/spec/DESIGN_SPEC_TEMPLATE.md skills/plan-to-exec/SKILL.md skills/review/SKILL.md test/skill-governance.test.mjs
```

Expected:

- Only the five planned files are changed for this feature.
- The diff includes version bumps for `spec`, `plan-to-exec`, and `review`.
- The diff includes no `src/`, hook, CLI docs, README, `templates/`, package, or runtime-state changes for this feature.

- [ ] **Step 6: Final commit**

If prior tasks used checkpoint commits, skip this step. If prior tasks recorded checkpoints but did not commit, run:

```bash
git add skills/spec/SKILL.md skills/spec/DESIGN_SPEC_TEMPLATE.md skills/plan-to-exec/SKILL.md skills/review/SKILL.md test/skill-governance.test.mjs
git commit -m "docs: add spec design contract anchors"
```

Expected: commit succeeds.

## Deferred Items

| Item | Reason | Follow-up |
|---|---|---|
| `final-review` full `AC-* -> D-* -> task -> verification` matrix | Explicitly deferred by requirements and design. First slice only updates `spec`, `plan-to-exec`, and `review`. | Run a separate clarify/spec cycle for final-review matrix support. |
| Artifact validator for `D-*` index completeness | Design says no new runtime/validator in first slice. Governance text assertions plus manual checks are sufficient for this slice. | Revisit after the rule stabilizes across real specs. |
| Historical design doc migration | Design says not to migrate history. | None for this slice. |

## Self-Review

- Spec coverage: Tasks 2 through 5 cover D-001 through D-009 and AC-001 through AC-005.
- Placeholder scan: no forbidden placeholder terms or incomplete task instructions are present.
- Type consistency: no runtime types or APIs are introduced.
- Design drift: the plan does not add runtime state, CLI commands, separate artifacts, artifact validators, or final-review hard gates.
- Anchor coverage: every `D-*` maps to a task or explicit deferred row.
- Surface-change coverage: Surface Inventory, Caller Proof, Negative Assertions, and package/deployment checks are included.
- Support lens coverage: every task lists `architecture-designer` because the source design names it.
- Subagent handoff readiness: every task names files, interfaces, traceability, support lens, commands, expected output, and commit/checkpoint action.
- Test-case coverage: TC-001 through TC-005 map to Tasks 2 through 5.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-30-spec-design-contract-anchors.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
