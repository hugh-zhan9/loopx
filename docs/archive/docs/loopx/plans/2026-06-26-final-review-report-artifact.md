# Final Review Report Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `.loopx/intake/clarify-final-review-report-artifact-20260626T093129Z.md`

**Goal:** Make `final-review` save its complete report to `.loopx/final-review/<timestamp>-<slug>.md` and make `finish` cite that report before completion choices.

**Architecture:** This is a skill contract change only. `final-review` owns the human-reviewable completion report and design-alignment judgment; `finish` only reads or cites the latest report as pre-finish evidence while keeping branch placement, PR, merge, keep, discard, audit, and cleanup responsibilities unchanged.

**Tech Stack:** Markdown skill contracts, Node.js ESM governance tests with `node:test` and `node:assert/strict`.

**Support lenses:** none

## Global Constraints

- Do not add a CLI/runtime command for final-review report generation.
- Do not write final-review reports under `docs/loopx/` by default.
- Do not make `finish` generate or own requirements/design alignment review.
- Do not create `plugins/loopx/skills/`; current `scripts/verify-skills.mjs` asserts that directory is absent.
- Bump `metadata.version` only for changed skill files.
- Keep report artifacts local under `.loopx/final-review/<timestamp>-<slug>.md`.

---

## File Structure

- Modify `skills/final-review/SKILL.md`: add the report artifact contract, `Change Summary`, `Requirements / Design Alignment`, path naming, and version bump.
- Modify `skills/finish/SKILL.md`: add latest final-review report lookup and completion summary citation, plus version bump.
- Modify `test/skill-governance.test.mjs`: add governance assertions for the final-review report artifact path, report sections, and finish citation behavior.
- Do not modify `skills/final-review/final-reviewer.md` unless implementation reveals the reviewer prompt contradicts the new orchestrator-owned report artifact contract.
- Do not modify `plugins/loopx/skills/`; the current repository intentionally excludes plugin skill payload mirrors.

## Surface Inventory

- Public commands/API/routes/events/config: none changed.
- Exported functions/types/modules: none changed.
- Runtime/generated artifacts and templates: skill contract introduces local `.loopx/final-review/<timestamp>-<slug>.md` artifact.
- Installer/package/deployment surface: no package file changes; `skills/final-review/` and `skills/finish/` are already packaged.
- Hooks/background jobs/automation: none changed.
- Current product docs: `skills/final-review/SKILL.md`, `skills/finish/SKILL.md`, governance tests.
- Tests/governance checks: `test/skill-governance.test.mjs`, `npm test`.
- Compatibility/migration paths: existing chat-only final-review output remains allowed as a summary, but the complete report must be written to the local artifact.

Caller proof:

```bash
rg "Final Review Report|final-review|\\.loopx/final-review|Completion Summary Contract" skills test README.md README.zh-CN.md docs src scripts package.json
```

Decision rule:

- retained caller exists in current source/runtime code -> keep it and name the caller in the plan
- only historical docs, release notes, old plans, or frozen external content reference it -> do not count that as a retained caller
- no retained caller -> delete it or remove it from current governance/package/docs

Negative assertions:

```bash
test ! -d plugins/loopx/skills
! rg "sync-plugin-skills" package.json scripts src test
```

Expected: both commands succeed because plugin skill payload sync is intentionally absent.

### Task 1: Govern The Final Review Artifact Contract

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: `skills/final-review/SKILL.md` and `skills/finish/SKILL.md` text.
- Produces: regression tests that require the new artifact contract before skill edits can pass.

**Support lenses:** none

- [ ] **Step 1: Add the failing governance test**

In `test/skill-governance.test.mjs`, near the existing final-review and finish governance tests, add:

```js
  it('final-review persists a human-reviewable report artifact before finish', async () => {
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const finishSkill = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');

    assert.match(finalReviewSkill, /\.loopx\/final-review\/<timestamp>-<slug>\.md/);
    assert.match(finalReviewSkill, /Write the complete final review report/);
    assert.match(finalReviewSkill, /## Change Summary/);
    assert.match(finalReviewSkill, /## Requirements \/ Design Alignment/);
    assert.match(finalReviewSkill, /human/i);
    assert.match(finalReviewSkill, /Ready for finish\?/);

    assert.match(finishSkill, /latest `.loopx\/final-review\/<timestamp>-<slug>\.md`/);
    assert.match(finishSkill, /Final review:/);
    assert.match(finishSkill, /report path/);
    assert.match(finishSkill, /blocking issues/);
    assert.match(finishSkill, /must not generate/i);
  });
```

- [ ] **Step 2: Run the new governance test and confirm it fails**

Run:

```bash
node --test --test-name-pattern "final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: FAIL because `skills/final-review/SKILL.md` does not yet mention `.loopx/final-review/<timestamp>-<slug>.md`, `Change Summary`, or `Requirements / Design Alignment`, and `skills/finish/SKILL.md` does not yet cite final-review artifacts.

- [ ] **Step 3: Commit the failing test if using TDD commits**

```bash
git add test/skill-governance.test.mjs
git commit -m "test: require final-review report artifact"
```

If working in a single uncommitted change set, skip this commit and keep the file staged later with implementation.

### Task 2: Make Final Review Write The Complete Report Artifact

**Files:**
- Modify: `skills/final-review/SKILL.md`

**Interfaces:**
- Consumes: full feature git range, source requirements, implementation summary, verification evidence, per-task review artifacts.
- Produces: complete Markdown report at `.loopx/final-review/<timestamp>-<slug>.md`.

**Support lenses:** none

- [ ] **Step 1: Bump the skill metadata version**

In `skills/final-review/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.3"
```

to:

```yaml
metadata:
  version: "0.3.4"
```

- [ ] **Step 2: Add the report artifact path to required inputs or output setup**

In `skills/final-review/SKILL.md`, after the `Required Inputs` section, add:

```markdown
## Report Artifact

Write the complete final review report to:

```text
.loopx/final-review/<timestamp>-<slug>.md
```

Use a UTC timestamp such as `YYYYMMDDTHHMMSSZ`. Derive `<slug>` from the plan, spec, issue, task brief, or feature name. If no source slug is available, use `final-review`.

The report artifact is local workflow state for human inspection before `finish`. It is not repo-tracked by default. Do not move it under `docs/loopx/` unless the user explicitly asks for repo-tracked review records.

The chat response may summarize the result, but the complete report must be in the artifact file.
```

- [ ] **Step 3: Add human-readable change and alignment sections to the output contract**

In the `Final Review Output` Markdown example, change the body to:

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
[from Phase 5 — reviewer output]

## Regression Assessment
[from Phase 4]

## Overall Assessment

**Ready for finish?** [Yes | No | With fixes]

**Coverage:** X/Y requirements fully covered
**Runtime:** [Validated / Not validated + reason]
**Regression:** [Clean / Issues found]

**Blocking issues:** [list or "none"]
```

- [ ] **Step 4: Add the artifact path to final-review completion behavior**

After the output template, add:

```markdown
After writing the artifact, tell the user:

```text
Final review report saved to `.loopx/final-review/<timestamp>-<slug>.md`.
Ready for finish: <Yes | No | With fixes>
Blocking issues: <none | summary>
```

Do not proceed to `finish` when the report says `Ready for finish? No` or unresolved Critical/Important findings remain.
```

- [ ] **Step 5: Run the final-review governance test**

Run:

```bash
node --test --test-name-pattern "final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: still FAIL until `skills/finish/SKILL.md` is updated.

### Task 3: Make Finish Consume The Final Review Report Evidence

**Files:**
- Modify: `skills/finish/SKILL.md`

**Interfaces:**
- Consumes: latest `.loopx/final-review/<timestamp>-<slug>.md` artifact when present.
- Produces: finish prompt and completion summary that cite final-review report path, readiness, and blocking issues.

**Support lenses:** none

- [ ] **Step 1: Bump the skill metadata version**

In `skills/finish/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.3"
```

to:

```yaml
metadata:
  version: "0.3.4"
```

- [ ] **Step 2: Add final-review report inspection before options**

In `skills/finish/SKILL.md`, after Step 3 and before the audit-first learning extraction step, add a new step:

```markdown
### Step 4: Check Final Review Report

Before presenting completion options, look for the latest `.loopx/final-review/<timestamp>-<slug>.md` report.

If a report exists, read its `Overall Assessment` and capture:

- report path
- `Ready for finish?` value
- `Blocking issues` summary

If `Ready for finish?` is `No`, or if unresolved Critical or Important findings remain, stop and route to `fix-review` instead of presenting finish options.

If no report exists, do not generate one inside `finish`. `finish` must not generate the final-review report or perform requirements/design alignment review. Tell the user no final-review artifact was found and ask whether to run `final-review` first, unless the user explicitly says final review was handled elsewhere.
```

Then renumber the existing later steps so audit remains after this new check.

- [ ] **Step 3: Add final-review citation to completion summary contract**

In `skills/finish/SKILL.md`, update `Completion Summary Contract` so every completion summary includes this block before `Memory`:

```text
Final review:
- report path: .loopx/final-review/<timestamp>-<slug>.md
- ready for finish: <Yes | With fixes | not found / externally handled>
- blocking issues: <none | summary>
```

If no final-review report exists and the user explicitly continues because review was handled elsewhere, report:

```text
Final review:
- report path: none
- ready for finish: externally handled
- blocking issues: unknown
```

- [ ] **Step 4: Preserve finish's ownership boundary**

In the `Common Mistakes` or `Red Flags` section, add:

```markdown
**Generating the final-review report inside finish**
- **Problem:** `finish` becomes responsible for requirements/design alignment and duplicates `final-review`.
- **Fix:** `finish` only reads or cites `.loopx/final-review/<timestamp>-<slug>.md`; run `final-review` first when the report is missing.
```

And under `Never`, add:

```markdown
- Generate the final-review report inside `finish`
```

- [ ] **Step 5: Run the targeted governance test**

Run:

```bash
node --test --test-name-pattern "final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
```

Expected: PASS.

### Task 4: Run Full Verification And Package Surface Checks

**Files:**
- Verify: `skills/final-review/SKILL.md`
- Verify: `skills/finish/SKILL.md`
- Verify: `test/skill-governance.test.mjs`
- Verify: `package.json`
- Verify: `plugins/loopx/`

**Interfaces:**
- Consumes: all modified skill and governance files.
- Produces: verification evidence for final review and finish.

**Support lenses:** none

- [ ] **Step 1: Run governance tests for final-review and finish**

Run:

```bash
node --test --test-name-pattern "review and final-review actively trigger support lenses|final-review persists a human-reviewable report artifact before finish|finish presents branch placement|finish wording avoids colliding" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the full repository test suite**

Run:

```bash
npm test
```

Expected: PASS, including `scripts/verify-skills.mjs` and `node --test test/*.test.mjs`.

- [ ] **Step 3: Run package/plugin negative assertions**

Run:

```bash
test ! -d plugins/loopx/skills
! rg "sync-plugin-skills" package.json scripts src test
```

Expected: PASS. This confirms the change did not recreate the removed plugin skill payload sync surface.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff -- skills/final-review/SKILL.md skills/finish/SKILL.md test/skill-governance.test.mjs .loopx/intake/clarify-final-review-report-artifact-20260626T093129Z.md docs/loopx/plans/2026-06-26-final-review-report-artifact.md
```

Expected:

- `final-review` report artifact contract appears only in `skills/final-review/SKILL.md`.
- `finish` references the latest report and explicitly does not generate it.
- Governance tests assert the new contract.
- No runtime command, package surface, or plugin skill payload changes are present.

- [ ] **Step 5: Commit**

```bash
git add skills/final-review/SKILL.md skills/finish/SKILL.md test/skill-governance.test.mjs docs/loopx/plans/2026-06-26-final-review-report-artifact.md
git commit -m "docs: persist final-review reports before finish"
```

Do not add `.loopx/intake/clarify-final-review-report-artifact-20260626T093129Z.md` unless the user explicitly wants local intake artifacts committed.

## Self-Review

- **Spec coverage:** The plan covers all clarified requirements: final-review report persistence, human-readable change summary, design alignment, finish citation, no runtime command, and no plugin mirror recreation.
- **Placeholder scan:** No `TBD`, `TODO`, or "similar to" placeholders remain.
- **Type consistency:** Paths and section names are consistent: `.loopx/final-review/<timestamp>-<slug>.md`, `Change Summary`, `Requirements / Design Alignment`, `Ready for finish?`, and `Blocking issues`.
- **Design drift:** The plan does not add runtime generation, repo-tracked docs, or new workflow commands.
- **Anchor coverage:** All clarify success criteria map to Tasks 1-4.
- **Surface-change coverage:** The plan includes surface inventory, caller proof, negative assertions, and package/plugin checks.
- **Support lens coverage:** No support lenses were named in the source.
- **Subagent handoff readiness:** Each task includes exact files, commands, expected output, and contract text.
