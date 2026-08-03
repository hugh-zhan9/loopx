# Localized Review And Dated Spec Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `.loopx/intake/clarify-localized-review-and-dated-spec-paths-20260626T101111Z.md`

**Goal:** Make final-review reports stable for Chinese users with a concrete Chinese template, and make new spec outputs use dated design package directories.

**Architecture:** This is a workflow skill contract and documentation change only. `final-review` gains a concrete localized report template while preserving parseable readiness keys; `spec` changes future output paths to `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/` without migrating historical design files.

**Tech Stack:** Markdown skill contracts, Node.js ESM governance tests with `node:test` and `node:assert/strict`.

**Support lenses:** none

## Global Constraints

- Do not migrate existing design documents.
- Do not change runtime CLI behavior.
- Do not introduce a file mover or compatibility shim.
- Do not change `docs/loopx/specs/` long-lived spec memory behavior.
- New `spec` outputs use `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`.
- New spec file names are fixed Chinese names: `设计提案.md`, `需求设计文档.md`, plus optional `设计提案.html`, `需求设计文档.html`.
- `final-review` must preserve `Ready for finish?` and exact values `Yes`, `No`, and `With fixes`.

---

## File Structure

- Modify `test/skill-governance.test.mjs`: add assertions for the Chinese final-review template and dated spec output path.
- Modify `skills/final-review/SKILL.md`: add the Chinese final-review report template and bump skill metadata version.
- Modify `skills/spec/SKILL.md`: replace old sibling output paths with dated design package paths and bump skill metadata version.
- Modify `skills/clarify/SKILL.md`: update `needs_spec` output and handoff path.
- Modify `skills/plan-to-exec/SKILL.md`: update accepted design spec source path.
- Modify `skills/spec/DESIGN_SPEC_TEMPLATE.md`: update embedded plan-to-exec handoff path.
- Modify `docs/loopx/skills.md` and `docs/loopx/skills.zh-CN.md`: update current product docs and examples.
- Do not modify historical design files or old plans except current product docs listed above.

## Surface Inventory

- Public commands/API/routes/events/config: none changed.
- Exported functions/types/modules: none changed.
- Runtime/generated artifacts and templates: future skill-generated design docs move to dated package directories.
- Installer/package/deployment surface: no package file list change; modified skill files are already packaged.
- Hooks/background jobs/automation: none changed.
- Current product docs: `docs/loopx/skills.md`, `docs/loopx/skills.zh-CN.md`, skill contracts.
- Tests/governance checks: `test/skill-governance.test.mjs`, `npm test`.
- Compatibility/migration paths: old design files remain valid historical artifacts; new `spec` outputs use new paths.

Caller proof:

```bash
rg "<需求名>设计提案|<需求名>需求设计文档|docs/loopx/design/<需求名>|docs/loopx/design/YYYY-MM-DD|Final Review Report|最终评审报告|Change Summary|修改摘要" skills test docs/loopx README.md README.zh-CN.md
```

Decision rule:

- current product docs and skills must use the new path contract
- historical design docs, release notes, and old plans may keep old paths
- no runtime code changes are required

Negative assertions:

```bash
! rg "docs/loopx/design/<需求名>设计提案|docs/loopx/design/<需求名>需求设计文档" skills test docs/loopx/skills.md docs/loopx/skills.zh-CN.md
! rg "produce both `<需求名>设计提案.md` and `<需求名>需求设计文档.md`" docs/loopx/skills.md
! rg "同时产出 `<需求名>设计提案.md` 和 `<需求名>需求设计文档.md`" docs/loopx/skills.zh-CN.md
```

Expected: all commands succeed after implementation.

### Task 1: Govern The New Contracts

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: `skills/final-review/SKILL.md`, `skills/spec/SKILL.md`, `skills/clarify/SKILL.md`, `skills/plan-to-exec/SKILL.md`, `skills/spec/DESIGN_SPEC_TEMPLATE.md`, `docs/loopx/skills.md`, `docs/loopx/skills.zh-CN.md`.
- Produces: regression tests for localized final-review templates and dated spec paths.

**Support lenses:** none

- [ ] **Step 1: Add failing assertions for spec output paths**

In `test/skill-governance.test.mjs`, inside `it('spec requires boundary scenarios in proposal and detailed design', ...)`, add reads for clarify, plan-to-exec, and docs:

```js
    const clarifySkill = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    const planToExecSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const skillsDoc = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsDocZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');
```

Then add:

```js
    for (const text of [specSkill, clarifySkill, planToExecSkill, template, skillsDoc, skillsDocZh]) {
      assert.match(text, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/需求设计文档\.md/);
    }
    assert.match(specSkill, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/设计提案\.md/);
    assert.match(specSkill, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/设计提案\.html/);
    assert.match(specSkill, /docs\/loopx\/design\/YYYY-MM-DD-<kebab-slug>\/需求设计文档\.html/);
    assert.match(specSkill, /Derive `<kebab-slug>`/);
    assert.doesNotMatch(specSkill, /docs\/loopx\/design\/<需求名>设计提案\.md/);
    assert.doesNotMatch(specSkill, /docs\/loopx\/design\/<需求名>需求设计文档\.md/);
```

- [ ] **Step 2: Add failing assertions for Chinese final-review template**

In `it('final-review persists a human-reviewable report artifact before finish', ...)`, add:

```js
    assert.match(finalReviewSkill, /# 最终评审报告/);
    assert.match(finalReviewSkill, /## 修改摘要/);
    assert.match(finalReviewSkill, /## 需求 \/ 设计一致性/);
    assert.match(finalReviewSkill, /## 需求覆盖矩阵/);
    assert.match(finalReviewSkill, /## 总体结论/);
    assert.match(finalReviewSkill, /\*\*Ready for finish\?\*\* \[Yes \| No \| With fixes\]/);
```

- [ ] **Step 3: Run targeted governance tests and confirm failure**

Run:

```bash
node --test --test-name-pattern "spec requires boundary scenarios|final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: FAIL because the skill/doc contracts still use old spec paths and final-review still has only English output headings.

- [ ] **Step 4: Commit failing tests**

```bash
git add test/skill-governance.test.mjs
git commit -m "test: require localized review and dated spec paths"
```

### Task 2: Localize Final Review Template

**Files:**
- Modify: `skills/final-review/SKILL.md`

**Interfaces:**
- Consumes: existing final-review language rule and output template.
- Produces: final-review contract with a concrete Chinese report template for Chinese users while retaining parseable readiness fields.

**Support lenses:** none

- [ ] **Step 1: Bump final-review metadata version**

Change:

```yaml
metadata:
  version: "0.3.5"
```

to:

```yaml
metadata:
  version: "0.3.6"
```

- [ ] **Step 2: Add Chinese template guidance**

In `skills/final-review/SKILL.md`, under `## Final Review Output`, replace:

```markdown
The complete final review output should include:
```

with:

```markdown
The complete final review output should include the template that matches the user's language.

For Chinese users, use this concrete structure:
```

- [ ] **Step 3: Insert Chinese report template before the existing English template**

Insert this fenced template:

````markdown
```markdown
# 最终评审报告

## 修改摘要
[面向用户说明本次完成了哪些改动，涉及哪些主要文件/模块，以及交付了什么行为。]

## 需求 / 设计一致性
| 需求 / 设计点 | 实现证据 | 状态 | 说明 |
|---|---|---|---|
| [需求文本] | [file:function 或测试证据] | 一致 / 部分一致 / 不一致 | [简短原因] |

## 需求覆盖矩阵
[来自 Phase 1]

## 专项风险检查
[来自 Phase 2]

## 运行验证结果
[来自 Phase 3]

## 代码评审发现
[来自 Phase 5 - reviewer output]

## 回归评估
[来自 Phase 4]

## 总体结论

**Ready for finish?** [Yes | No | With fixes]

**Coverage:** X/Y requirements fully covered
**Runtime:** [Validated / Not validated + reason]
**Regression:** [Clean / Issues found]

**Blocking issues:** [list or "none"]
```
````

- [ ] **Step 4: Label the existing English template**

Immediately before the existing English fenced template, add:

```markdown
For English users, use this structure:
```

Keep the existing English headings intact.

- [ ] **Step 5: Run focused final-review governance test**

Run:

```bash
node --test --test-name-pattern "final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: PASS for final-review template assertions.

- [ ] **Step 6: Commit**

```bash
git add skills/final-review/SKILL.md
git commit -m "docs: add Chinese final-review template"
```

### Task 3: Update Spec Path Contracts

**Files:**
- Modify: `skills/spec/SKILL.md`
- Modify: `skills/clarify/SKILL.md`
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/spec/DESIGN_SPEC_TEMPLATE.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`

**Interfaces:**
- Consumes: new spec output path contract from clarify bundle.
- Produces: synchronized skill and current product docs using dated design package directories.

**Support lenses:** none

- [ ] **Step 1: Bump changed skill metadata versions**

In `skills/spec/SKILL.md`, change `metadata.version` from `0.3.4` to `0.3.5`.

In `skills/clarify/SKILL.md`, change `metadata.version` from `0.3.3` to `0.3.4`.

In `skills/plan-to-exec/SKILL.md`, change `metadata.version` from `0.3.3` to `0.3.4`.

Do not bump `DESIGN_SPEC_TEMPLATE.md` because it has no metadata.

- [ ] **Step 2: Update `skills/spec/SKILL.md` default outputs**

Replace the default two-document paths with:

```markdown
1. `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/设计提案.md`
2. `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`
```

Add:

```markdown
Derive `<kebab-slug>` from the clarified requirement title or the user's own wording. Use a stable terminal-friendly kebab-case slug instead of raw Chinese text in the directory name. Keep the file names fixed as `设计提案.md` and `需求设计文档.md`.

Do not migrate existing historical design files. The new dated directory layout applies to new `spec` outputs only.
```

- [ ] **Step 3: Update `skills/spec/SKILL.md` output section**

Replace output Markdown paths with:

```markdown
- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/设计提案.md`
- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`
```

Replace optional HTML paths with:

```markdown
- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/设计提案.html`
- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.html`
```

Replace handoff command with:

```text
$plan-to-exec docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
```

- [ ] **Step 4: Update `skills/clarify/SKILL.md` handoff paths**

Replace every current-product example of:

```text
docs/loopx/design/<需求名>需求设计文档.md
```

with:

```text
docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
```

If the skill mentions `spec` writes a detailed design, make it say:

```text
`spec` writes a dated design package under `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`.
```

- [ ] **Step 5: Update `skills/plan-to-exec/SKILL.md` accepted source path**

Replace:

```text
docs/loopx/design/<需求名>需求设计文档.md
```

with:

```text
docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
```

- [ ] **Step 6: Update `skills/spec/DESIGN_SPEC_TEMPLATE.md` embedded handoff**

Replace the old `$plan-to-exec` path with:

```text
$plan-to-exec docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
```

- [ ] **Step 7: Update current skills docs**

In `docs/loopx/skills.md`, change the `spec` output description to mention:

```text
`docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`
```

Replace the risky architecture example with:

```text
A risky architecture change should have `spec` produce both `设计提案.md` and `需求设计文档.md` inside `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`.
```

In `docs/loopx/skills.zh-CN.md`, make the equivalent Chinese update:

```text
默认在 `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/` 下同时产出 `设计提案.md` 和 `需求设计文档.md`。
```

- [ ] **Step 8: Run caller proof and negative assertions**

Run:

```bash
rg "<需求名>设计提案|<需求名>需求设计文档|docs/loopx/design/<需求名>|docs/loopx/design/YYYY-MM-DD|Final Review Report|最终评审报告|Change Summary|修改摘要" skills test docs/loopx README.md README.zh-CN.md
! rg "docs/loopx/design/<需求名>设计提案|docs/loopx/design/<需求名>需求设计文档" skills test docs/loopx/skills.md docs/loopx/skills.zh-CN.md
! rg "produce both `<需求名>设计提案.md` and `<需求名>需求设计文档.md`" docs/loopx/skills.md
! rg "同时产出 `<需求名>设计提案.md` 和 `<需求名>需求设计文档.md`" docs/loopx/skills.zh-CN.md
```

Expected: caller proof shows only accepted new paths in current skill/docs; negative assertions pass.

- [ ] **Step 9: Run targeted spec governance test**

Run:

```bash
node --test --test-name-pattern "spec requires boundary scenarios" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add skills/spec/SKILL.md skills/clarify/SKILL.md skills/plan-to-exec/SKILL.md skills/spec/DESIGN_SPEC_TEMPLATE.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md
git commit -m "docs: use dated spec design packages"
```

### Task 4: Full Verification And Final Review

**Files:**
- Verify: `skills/final-review/SKILL.md`
- Verify: `skills/spec/SKILL.md`
- Verify: `skills/clarify/SKILL.md`
- Verify: `skills/plan-to-exec/SKILL.md`
- Verify: `skills/spec/DESIGN_SPEC_TEMPLATE.md`
- Verify: `docs/loopx/skills.md`
- Verify: `docs/loopx/skills.zh-CN.md`
- Verify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: all modified contract files.
- Produces: verification evidence and final-review artifact.

**Support lenses:** none

- [ ] **Step 1: Run targeted governance tests**

Run:

```bash
node --test --test-name-pattern "spec requires boundary scenarios|final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full repository tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git diff --stat HEAD~3..HEAD
git diff --name-only HEAD~3..HEAD
```

Expected changed files:

```text
docs/loopx/skills.md
docs/loopx/skills.zh-CN.md
skills/clarify/SKILL.md
skills/final-review/SKILL.md
skills/plan-to-exec/SKILL.md
skills/spec/DESIGN_SPEC_TEMPLATE.md
skills/spec/SKILL.md
test/skill-governance.test.mjs
docs/loopx/plans/2026-06-26-localized-review-and-dated-spec-paths.md
```

- [ ] **Step 4: Write final-review artifact**

Write a final-review report to:

```text
.loopx/final-review/<timestamp>-localized-review-and-dated-spec-paths.md
```

Because the current user is Chinese, use the Chinese final-review template and keep `Ready for finish?` with `Yes`.

- [ ] **Step 5: Finish audit**

Run:

```bash
node src/cli.mjs finish-start localized-review-and-dated-spec-paths --source docs/loopx/plans/2026-06-26-localized-review-and-dated-spec-paths.md --json
node src/cli.mjs finish-audit localized-review-and-dated-spec-paths --json
```

Review generated memory/spec candidates. Reject redundant candidates when the durable rule is already captured in committed skill contracts, governance tests, and current product docs.

- [ ] **Step 6: Record finish choice**

If work remains on current branch:

```bash
node src/cli.mjs finish-record <audit-id> --action keep --status done --summary "Work remains on main: localized final-review template and dated spec paths" --json
```

Expected: finish record succeeds.

## Self-Review

- **Spec coverage:** The plan covers Chinese final-review template stability, dated spec output directories, fixed Chinese filenames, handoff path updates, docs updates, governance tests, and no historical migration.
- **Placeholder scan:** No `TBD`, `TODO`, or unspecified placeholders remain.
- **Type consistency:** The path `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md` is used consistently as the detailed design handoff path.
- **Design drift:** The plan does not add runtime commands, file migration, or compatibility shims.
- **Anchor coverage:** All clarify success criteria map to Tasks 1-4.
- **Surface-change coverage:** The plan includes surface inventory, caller proof, negative assertions, current product docs, and compatibility scope.
- **Support lens coverage:** No support lenses were named in the source.
- **Subagent handoff readiness:** Each task includes exact files, commands, expected output, and contract text.
