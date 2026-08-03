# Final Review Template References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `.loopx/intake/final-review-template-references-20260626T110000Z.md`

**Goal:** Split final-review report templates out of `SKILL.md` into language-specific reference files while preserving the final-review artifact and readiness contracts.

**Architecture:** This is a skill packaging and governance change only. `skills/final-review/SKILL.md` remains the core workflow and routing contract; language-specific full report templates move to `skills/final-review/references/` and are loaded only when writing the final-review artifact.

**Tech Stack:** Markdown skill contracts, bundled skill resources, Node.js ESM governance tests with `node:test` and `node:assert/strict`.

**Support lenses:** none

## Global Constraints

- Move the complete Chinese final-review report template into `skills/final-review/references/report-template.zh-CN.md`.
- Move the complete English final-review report template into `skills/final-review/references/report-template.en.md`.
- Keep core final-review workflow, report artifact path, language selection, readiness gates, and finish handoff rules in `skills/final-review/SKILL.md`.
- `skills/final-review/SKILL.md` must explicitly instruct agents to read the matching template reference before writing the final-review artifact.
- Preserve exact parseable field `Ready for finish?` and exact values `Yes`, `No`, `With fixes` in every template.
- Preserve `.loopx/final-review/<timestamp>-<slug>.md` as the report artifact path.
- Do not change runtime CLI behavior.
- Do not modify generated plugin skill mirrors; this repo currently has no `plugins/loopx/skills/` mirror.
- Add governance coverage so future changes cannot silently inline or drop the templates.

---

## File Structure

- Modify `test/skill-governance.test.mjs`: read the new template reference files, assert `SKILL.md` links to them, assert both templates preserve required headings/readiness fields, and assert the full templates no longer live inline in `SKILL.md`.
- Modify `skills/final-review/SKILL.md`: bump metadata version, replace inline templates with reference-loading instructions, and keep report artifact / finish gating rules in the main skill.
- Create `skills/final-review/references/report-template.zh-CN.md`: Chinese final-review report template.
- Create `skills/final-review/references/report-template.en.md`: English final-review report template.

## Surface Inventory

- Public commands/API/routes/events/config: none changed.
- Exported functions/types/modules: none changed.
- Runtime/generated artifacts and templates: `final-review` skill template resources move from inline Markdown to `skills/final-review/references/`.
- Installer/package/deployment surface: `package.json` already includes `skills/final-review/`, so nested `references/` files are packaged with the skill; no package list change required.
- Hooks/background jobs/automation: none changed.
- Current product docs: no public docs change required unless tests reveal stale current-product claims.
- Tests/governance checks: `test/skill-governance.test.mjs`, `node scripts/verify-skills.mjs`, `npm test`.
- Compatibility/migration paths: existing report artifact path remains `.loopx/final-review/<timestamp>-<slug>.md`; no migration needed.

Caller proof:

```bash
rg "Final Review Output|report-template|# 最终评审报告|# Final Review Report|Ready for finish\\?|\\.loopx/final-review/<timestamp>-<slug>\\.md" skills/final-review test/skill-governance.test.mjs package.json scripts/verify-skills.mjs
```

Decision rule:

- `skills/final-review/SKILL.md` keeps the procedural contract and links to local template references.
- `skills/final-review/references/report-template.zh-CN.md` and `skills/final-review/references/report-template.en.md` own the full report structures.
- `test/skill-governance.test.mjs` must treat the reference files as governed product surface.
- `scripts/verify-skills.mjs` should continue to pass because local `references/...` links from `SKILL.md` must resolve.

Negative assertions:

```bash
! rg "^# 最终评审报告|^# Final Review Report|^## 修改摘要|^## Change Summary" skills/final-review/SKILL.md
test -f skills/final-review/references/report-template.zh-CN.md
test -f skills/final-review/references/report-template.en.md
```

Expected: the inline full-template headings are absent from `SKILL.md`; both reference files exist.

### Task 1: Govern Template References

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: `skills/final-review/SKILL.md`, `skills/final-review/references/report-template.zh-CN.md`, `skills/final-review/references/report-template.en.md`, `skills/finish/SKILL.md`.
- Produces: governance coverage for reference-based final-review report templates.

**Support lenses:** none

- [ ] **Step 1: Add reads for the template reference files**

In `test/skill-governance.test.mjs`, inside `it('final-review persists a human-reviewable report artifact before finish', ...)`, add these reads after `finalReviewSkill` and `finishSkill`:

```js
    const zhTemplate = await readFile(
      join(repoRoot, 'skills', 'final-review', 'references', 'report-template.zh-CN.md'),
      'utf8',
    );
    const enTemplate = await readFile(
      join(repoRoot, 'skills', 'final-review', 'references', 'report-template.en.md'),
      'utf8',
    );
```

- [ ] **Step 2: Replace inline-template assertions with reference assertions**

In the same test, keep existing assertions for artifact path, writing the complete report, human review, readiness, language matching, and `finish` integration. Replace the assertions that expect `# 最终评审报告`, `## 修改摘要`, `## 需求 / 设计一致性`, `## 需求覆盖矩阵`, `## 总体结论`, `## Change Summary`, and `## Requirements / Design Alignment` inside `finalReviewSkill` with these assertions:

```js
    assert.match(finalReviewSkill, /references\/report-template\.zh-CN\.md/);
    assert.match(finalReviewSkill, /references\/report-template\.en\.md/);
    assert.match(finalReviewSkill, /read the report template matching the user's language/i);
    assert.match(finalReviewSkill, /before writing the final-review artifact/i);

    assert.match(zhTemplate, /# 最终评审报告/);
    assert.match(zhTemplate, /## 修改摘要/);
    assert.match(zhTemplate, /## 需求 \/ 设计一致性/);
    assert.match(zhTemplate, /## 需求覆盖矩阵/);
    assert.match(zhTemplate, /## 总体结论/);
    assert.match(zhTemplate, /\*\*Ready for finish\?\*\* \[Yes \| No \| With fixes\]/);

    assert.match(enTemplate, /# Final Review Report/);
    assert.match(enTemplate, /## Change Summary/);
    assert.match(enTemplate, /## Requirements \/ Design Alignment/);
    assert.match(enTemplate, /## Requirements Coverage Matrix/);
    assert.match(enTemplate, /## Overall Assessment/);
    assert.match(enTemplate, /\*\*Ready for finish\?\*\* \[Yes \| No \| With fixes\]/);

    assert.doesNotMatch(finalReviewSkill, /^# 最终评审报告/m);
    assert.doesNotMatch(finalReviewSkill, /^# Final Review Report/m);
    assert.doesNotMatch(finalReviewSkill, /^## 修改摘要/m);
    assert.doesNotMatch(finalReviewSkill, /^## Change Summary/m);
```

- [ ] **Step 3: Run focused governance test and confirm failure**

Run:

```bash
node --test --test-name-pattern "final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: FAIL because `skills/final-review/references/report-template.zh-CN.md` and `skills/final-review/references/report-template.en.md` do not exist yet, and `SKILL.md` still owns the inline full templates.

- [ ] **Step 4: Commit failing test**

```bash
git add test/skill-governance.test.mjs
git commit -m "test: require final-review template references"
```

### Task 2: Move Final Review Templates To References

**Files:**
- Modify: `skills/final-review/SKILL.md`
- Create: `skills/final-review/references/report-template.zh-CN.md`
- Create: `skills/final-review/references/report-template.en.md`

**Interfaces:**
- Consumes: inline Chinese and English report templates currently in `skills/final-review/SKILL.md`.
- Produces: language-specific reference templates and a lean `SKILL.md` that routes agents to the correct template.

**Support lenses:** none

- [ ] **Step 1: Create the references directory and Chinese template**

Create `skills/final-review/references/report-template.zh-CN.md` with exactly:

```markdown
# 最终评审报告

## 修改摘要
[面向用户说明本次完成的修改，包括主要涉及的文件/模块以及交付的预期行为。]

## 需求 / 设计一致性
| 设计点 / 需求 | 实现证据 | 状态 | 备注 |
|---|---|---|---|
| [需求文本] | [file:function 或测试证据] | 已一致 / 部分一致 / 不一致 | [简短原因] |

## 需求覆盖矩阵
[来自 Phase 1]

## 支持视角风险扫描
[来自 Phase 2]

## 运行时验证结果
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

- [ ] **Step 2: Create the English template**

Create `skills/final-review/references/report-template.en.md` with exactly:

```markdown
# Final Review Report

## Change Summary
[User-readable summary of the completed change, including main files/modules touched and the intended behavior delivered.]

## Requirements / Design Alignment
| Design Point / Requirement | Implementation Evidence | Status | Notes |
|---|---|---|---|
| [requirement text] | [file:function or test evidence] | aligned / partial / not aligned | [short reason] |

## Requirements Coverage Matrix
[from Phase 1]

## Support Lens Risk Scan
[from Phase 2]

## Runtime Validation Results
[from Phase 3]

## Code Review Findings
[from Phase 5 - reviewer output]

## Regression Assessment
[from Phase 4]

## Overall Assessment

**Ready for finish?** [Yes | No | With fixes]

**Coverage:** X/Y requirements fully covered
**Runtime:** [Validated / Not validated + reason]
**Regression:** [Clean / Issues found]

**Blocking issues:** [list or "none"]
```

- [ ] **Step 3: Bump final-review skill metadata**

In `skills/final-review/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.6"
```

to:

```yaml
metadata:
  version: "0.3.7"
```

- [ ] **Step 4: Replace inline templates with reference-loading instructions**

In `skills/final-review/SKILL.md`, replace the current `## Final Review Output` section from:

```markdown
## Final Review Output

The complete final review output should include the template that matches the user's language.

For Chinese users, use this concrete structure:
...
For English users, use this structure:
...
After writing the artifact, tell the user:
...
Do not proceed to `finish` when the report says `Ready for finish? No` or unresolved Critical/Important findings remain.
```

with:

```markdown
## Final Review Output

Before writing the final-review artifact, read the report template matching the user's language:

- Chinese users: `references/report-template.zh-CN.md`
- English users: `references/report-template.en.md`

Use the selected template as the complete report structure. Keep `Ready for finish?` and exact status values `Yes`, `No`, and `With fixes` unchanged.

After writing the artifact, tell the user:

```text
Final review report saved to `.loopx/final-review/<timestamp>-<slug>.md`.
Ready for finish: <Yes | No | With fixes>
Blocking issues: <none | summary>
```

Do not proceed to `finish` when the report says `Ready for finish? No` or unresolved Critical/Important findings remain.
```

- [ ] **Step 5: Run focused governance test**

Run:

```bash
node --test --test-name-pattern "final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run skill verifier**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: PASS, proving `references/report-template.zh-CN.md` and `references/report-template.en.md` resolve from `SKILL.md`.

- [ ] **Step 7: Commit**

```bash
git add skills/final-review/SKILL.md skills/final-review/references/report-template.zh-CN.md skills/final-review/references/report-template.en.md
git commit -m "docs: move final-review templates to references"
```

### Task 3: Full Verification And Final Review

**Files:**
- Verify: `skills/final-review/SKILL.md`
- Verify: `skills/final-review/references/report-template.zh-CN.md`
- Verify: `skills/final-review/references/report-template.en.md`
- Verify: `test/skill-governance.test.mjs`
- Verify: `docs/loopx/plans/2026-06-26-final-review-template-references.md`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 changes.
- Produces: final verification evidence and finish-ready review artifact.

**Support lenses:** none

- [ ] **Step 1: Run caller proof and negative assertions**

Run:

```bash
rg "Final Review Output|report-template|# 最终评审报告|# Final Review Report|Ready for finish\\?|\\.loopx/final-review/<timestamp>-<slug>\\.md" skills/final-review test/skill-governance.test.mjs package.json scripts/verify-skills.mjs
! rg "^# 最终评审报告|^# Final Review Report|^## 修改摘要|^## Change Summary" skills/final-review/SKILL.md
test -f skills/final-review/references/report-template.zh-CN.md
test -f skills/final-review/references/report-template.en.md
```

Expected: caller proof shows template references and governed template files; negative assertions pass.

- [ ] **Step 2: Run targeted governance test**

Run:

```bash
node --test --test-name-pattern "final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run full repository tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat HEAD~2..HEAD
git diff --name-only HEAD~2..HEAD
```

Expected changed files:

```text
docs/loopx/plans/2026-06-26-final-review-template-references.md
skills/final-review/SKILL.md
skills/final-review/references/report-template.en.md
skills/final-review/references/report-template.zh-CN.md
test/skill-governance.test.mjs
```

- [ ] **Step 5: Commit this plan if it is still uncommitted**

If `docs/loopx/plans/2026-06-26-final-review-template-references.md` is uncommitted, run:

```bash
git add docs/loopx/plans/2026-06-26-final-review-template-references.md
git commit -m "docs: plan final-review template references"
```

- [ ] **Step 6: Run final-review**

Use `loopx:final-review` on the complete feature range. Because the user is Chinese, write the report using `skills/final-review/references/report-template.zh-CN.md` after Task 2 exists.

Write the report to:

```text
.loopx/final-review/<timestamp>-final-review-template-references.md
```

Expected conclusion if verification is clean:

```text
Ready for finish: Yes
Blocking issues: none
```

- [ ] **Step 7: Finish audit**

Run:

```bash
node src/cli.mjs finish-start final-review-template-references --source docs/loopx/plans/2026-06-26-final-review-template-references.md --json
node src/cli.mjs finish-audit final-review-template-references --json
```

Review generated memory/spec candidates. Reject redundant candidates when the durable rule is already captured in committed skill contracts, reference templates, governance tests, and this plan.

- [ ] **Step 8: Record finish choice**

If work remains on current branch:

```bash
node src/cli.mjs finish-record <audit-id> --action keep --status done --summary "Work remains on main: final-review templates moved to references" --json
```

Expected: finish record succeeds.

## Self-Review

- **Spec coverage:** The plan covers splitting both language templates into `references/`, keeping core workflow and report artifact rules in `SKILL.md`, preserving readiness values, adding governance tests, and avoiding runtime changes.
- **Placeholder scan:** No `TBD`, `TODO`, or open-ended implementation placeholders remain. Template bracket fields are intentional template placeholders used by report authors.
- **Type consistency:** Paths are consistent: `skills/final-review/references/report-template.zh-CN.md`, `skills/final-review/references/report-template.en.md`, and `.loopx/final-review/<timestamp>-<slug>.md`.
- **Design drift:** The plan does not add runtime commands, package file-list changes, plugin mirrors, or new report semantics.
- **Anchor coverage:** The intake requirements map to Tasks 1-3.
- **Surface-change coverage:** The plan includes Surface Inventory, caller proof, negative assertions, package/verifier checks, and current/historical surface boundaries.
- **Support lens coverage:** No support lenses were named in the source.
- **Subagent handoff readiness:** Each task includes exact files, commands, expected output, and commit boundaries.
