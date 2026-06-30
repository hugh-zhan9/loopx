# Main Chain Workflow Completion Implementation Plan

Source design: `docs/loopx/design/2026-06-30-main-chain-workflow-completion/需求设计文档.md`

Goal: complete the clarify -> spec -> plan-to-exec -> exec/subagent-exec -> review -> final-review -> finish contract chain by updating skill contracts, prompt/report templates, governance tests, and the takeaways article. This plan does not add runtime workflow validators, local metrics, CLI/API behavior, or historical artifact migration.

Architecture: document-contract and governance-test change only. The installed skill surface remains governed by `skills/` and `scripts/verify-skills.mjs`; no new runtime module is introduced.

Support lenses: architecture-designer, because the change tightens boundaries between workflow stages and downstream consumers.

## Global Constraints

- Use one ordinary implementation plan. Do not create a multi-plan package and do not change multi-plan semantics.
- Keep `plan-to-exec` T anchors plan-local. Multi-plan global references stay derived from the child plan prefix plus the child-local T anchor.
- Treat existing old workflow artifacts as out of scope. Do not migrate, rewrite, or strongly support old plan, review, or final-review files.
- Update only the canonical bundled skill sources under `skills/`, their directly-owned prompt/report templates, governance tests, and `docs/articles/harness-engineering-loopx-takeaways.md`.
- Do not add a generic workflow artifact validator, local phase metrics, `codebase-spec` initialization behavior, an acceptance-testcase-generator skill, deploy/plugins, or new dependencies.
- Bump `metadata.version` only for changed skills:
  - `clarify`: `0.3.9` -> `0.3.10`
  - `spec`: `0.3.7` -> `0.3.8`
  - `plan-to-exec`: `0.3.8` -> `0.3.9`
  - `exec`: `0.3.4` -> `0.3.5`
  - `subagent-exec`: `0.3.7` -> `0.3.8`
  - `review`: `0.3.6` -> `0.3.7`
  - `final-review`: `0.3.8` -> `0.3.9`
  - `finish`: `0.3.5` -> `0.3.6`
- Preserve existing user edits in dirty files. Read a file before editing it, and make scoped changes around the current content.

## Surface Inventory

- CLI commands: no changes.
- Runtime modules under `src/`: no changes.
- Generated artifacts for new work:
  - clarify intake package continues to provide AC/TC source documents.
  - spec gains explicit contract block types including `Workflow Contract`.
  - plan-to-exec emits task anchors and expected execution/review evidence.
  - exec and subagent-exec record task-level verification evidence.
  - review consumes AC/D/T anchors plus task evidence.
  - final-review reports an independent Test Trust section.
  - finish reports spec delta candidates with ADDED/MODIFIED/REMOVED/RENAMED labels.
- Package/install surface: changed bundled skill metadata must pass `node scripts/verify-skills.mjs`.
- Compatibility: new contract applies to newly generated artifacts only; old artifacts are not migrated or rewritten.

## Anchor Coverage

- `AC-001` and `TC-001`: clarify remains the AC/TC source for downstream chain closure.
- `AC-002`, `D-001` to `D-006`, `TC-002`, and `TC-004`: each downstream skill has an explicit consumer/producer contract.
- `AC-003`, `D-010`, and `TC-003`: out-of-scope items remain absent from implementation.
- `AC-004`, `D-007`, and `TC-006`: governance tests and verification commands protect the new contract.
- `AC-005`, `D-008`, and `TC-005`: the takeaways article is updated only for implemented items.
- `AC-006` and `D-009`: old artifacts are excluded from migration and strong compatibility requirements.

## T-001 / Task 1: Add Upstream Contract And Evidence Bridge

Traceability:
- Source AC: `AC-001`, `AC-002`, `AC-004`, `AC-006`
- Design anchors: `D-001`, `D-002`, `D-003`, `D-007`, `D-009`
- Test cases: `TC-001`, `TC-002`, `TC-004`, `TC-006`
- Review focus: verify that clarify/spec/plan-to-exec/exec/subagent-exec form a continuous source-to-execution contract without adding runtime validators or old-artifact migration.

Files:
- `skills/clarify/SKILL.md`
- `skills/spec/SKILL.md`
- `skills/plan-to-exec/SKILL.md`
- `skills/exec/SKILL.md`
- `skills/subagent-exec/SKILL.md`
- `skills/subagent-exec/implementer-prompt.md`
- `skills/subagent-exec/task-reviewer-prompt.md`
- `test/skill-governance.test.mjs`

Implementation steps:
1. Add a governance subtest in `test/skill-governance.test.mjs` named `governs upstream main-chain contract handoff across clarify planning and execution`.
2. In that subtest, read frontmatter for the five changed upstream skills and assert the exact metadata versions listed in the global constraints.
3. Assert the clarify skill states that `requirements.md` and `test-cases.md` are the canonical AC/TC source for downstream chain work, and that downstream steps must not invent replacement AC/TC identifiers.
4. Assert the spec skill names contract block types including `Behavior Contract`, `Data Contract`, `Interface Contract`, `Workflow Contract`, and `Operational Contract`.
5. Assert the spec skill requires D-* decisions inside contract blocks when a downstream skill must consume a decision.
6. Assert the plan-to-exec skill requires each task to carry `Source AC`, `Design anchors`, `Test cases`, `Review focus`, `Expected execution evidence`, and a `T-*` task anchor.
7. Assert the exec skill requires task completion evidence fields with these exact names: `task_anchor`, `source_ac`, `design_anchors`, `test_cases`, `commands_run`, `evidence_summary`, and `remaining_risk`.
8. Assert the subagent-exec skill and both subagent prompt files require the same task completion evidence fields, and require implementation reports to preserve `task_anchor`.
9. Run the focused test and confirm it fails before editing the skills:

   ```bash
   node --test --test-name-pattern "governs upstream main-chain contract handoff" test/skill-governance.test.mjs
   ```

   Expected red result: the new subtest fails on missing upstream contract text or version assertions.

10. Update `skills/clarify/SKILL.md`:
    - bump `metadata.version` to `0.3.10`.
    - add a bounded main-chain handoff rule: intake `requirements.md` and `test-cases.md` are the canonical AC/TC source, and downstream skills consume those anchors rather than creating replacement AC/TC IDs.
11. Update `skills/spec/SKILL.md`:
    - bump `metadata.version` to `0.3.8`.
    - add a contract block taxonomy with `Behavior Contract`, `Data Contract`, `Interface Contract`, `Workflow Contract`, and `Operational Contract`.
    - require `Workflow Contract` when the design changes workflow handoffs, artifact fields, stage gates, or downstream skill consumption.
    - require D-* anchors inside contract blocks when decisions must be consumed by `plan-to-exec`, `exec`, `subagent-exec`, `review`, `final-review`, or `finish`.
12. Update `skills/plan-to-exec/SKILL.md`:
    - bump `metadata.version` to `0.3.9`.
    - extend the task template to include `Expected execution evidence`.
    - define that `Expected execution evidence` is consumed by both `exec` and `subagent-exec`, and later by `review`.
    - preserve current T-anchor uniqueness and multi-plan child-prefix semantics.
13. Update `skills/exec/SKILL.md`:
    - bump `metadata.version` to `0.3.5`.
    - require a task completion evidence block before marking a T task done.
    - require checkpoint notes and review handoff notes to preserve task anchors and evidence fields.
14. Update `skills/subagent-exec/SKILL.md`:
    - bump `metadata.version` to `0.3.8`.
    - require task briefs sent to subagents to include `Expected execution evidence`.
    - require merged task reports to preserve `task_anchor` and the task completion evidence fields.
15. Update `skills/subagent-exec/implementer-prompt.md`:
    - add the task completion evidence fields to the required report block.
    - keep the existing `ANCHOR_CONTEXT` and `task_anchor` requirements.
16. Update `skills/subagent-exec/task-reviewer-prompt.md`:
    - require review of task evidence against `Source AC`, `Design anchors`, `Test cases`, and `Expected execution evidence`.
17. Update existing exact-version assertions in `test/skill-governance.test.mjs` for `clarify`, `spec`, `plan-to-exec`, `exec`, and `subagent-exec` so they match the new metadata versions.
18. Run:

   ```bash
   node --test --test-name-pattern "governs upstream main-chain contract handoff" test/skill-governance.test.mjs
   node --test --test-name-pattern "governs design contract anchors" test/skill-governance.test.mjs
   node --test --test-name-pattern "governs plan task anchors" test/skill-governance.test.mjs
   ```

   Expected green result: all three focused governance tests pass.

19. Commit:

   ```bash
   git add skills/clarify/SKILL.md skills/spec/SKILL.md skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/subagent-exec/implementer-prompt.md skills/subagent-exec/task-reviewer-prompt.md test/skill-governance.test.mjs
   git commit -m "Complete upstream workflow contract handoff"
   ```

## T-002 / Task 2: Add Review Final-Review And Finish Consumer Contract

Traceability:
- Source AC: `AC-002`, `AC-004`, `AC-006`
- Design anchors: `D-004`, `D-005`, `D-006`, `D-007`, `D-009`
- Test cases: `TC-002`, `TC-004`, `TC-006`
- Review focus: verify that review, final-review, and finish consume execution evidence and report downstream decisions without becoming artifact validators.

Files:
- `skills/review/SKILL.md`
- `skills/final-review/SKILL.md`
- `skills/final-review/final-reviewer.md`
- `skills/final-review/references/report-template.en.md`
- `skills/final-review/references/report-template.zh-CN.md`
- `skills/finish/SKILL.md`
- `test/skill-governance.test.mjs`

Implementation steps:
1. Add a governance subtest in `test/skill-governance.test.mjs` named `governs downstream main-chain review final-review and finish contracts`.
2. In that subtest, read frontmatter for `review`, `final-review`, and `finish` and assert exact metadata versions from the global constraints.
3. Assert the review skill:
   - requires Stage 1 spec compliance before code-quality review.
   - consumes `AC-*`, `D-*`, `T-*`, and task verification evidence.
   - reports missing or weak task evidence as a review finding when it affects confidence.
4. Assert the final-review skill:
   - describes six phases.
   - includes an independent `Test Trust` phase or section.
   - classifies trust as `High`, `Medium`, or `Low`.
   - does not call itself a generic artifact validator.
5. Assert `skills/final-review/final-reviewer.md` requires a `Test Trust` assessment.
6. Assert both final-review report templates contain a Test Trust section:
   - English template: `## Test Trust`
   - Chinese template: `## 测试可信度`
7. Assert the finish skill:
   - extracts `Spec Delta Candidates`.
   - labels candidates as `ADDED`, `MODIFIED`, `REMOVED`, or `RENAMED`.
   - preserves accepted/rejected final-review gates and does not bypass review outcome.
8. Run the focused test and confirm it fails before editing the skills:

   ```bash
   node --test --test-name-pattern "governs downstream main-chain review final-review and finish contracts" test/skill-governance.test.mjs
   ```

   Expected red result: the new subtest fails on missing Test Trust, finish delta classification, task evidence consumption, or version assertions.

9. Update `skills/review/SKILL.md`:
   - bump `metadata.version` to `0.3.7`.
   - make execution evidence a first-class Stage 1 input beside AC/D/T anchors.
   - require findings when commands, outputs, or evidence summaries do not support claimed AC/D/T completion.
10. Update `skills/final-review/SKILL.md`:
    - bump `metadata.version` to `0.3.9`.
    - change the workflow from five phases to six phases.
    - insert `Test Trust` after runtime/regression verification and before reviewer dispatch.
    - define `High`, `Medium`, and `Low` trust levels using evidence freshness, command specificity, coverage relevance, and unexplained skips.
    - keep final-review as a human whole-feature review, not a structural artifact validator.
11. Update `skills/final-review/final-reviewer.md`:
    - require the reviewer to fill a `Test Trust` assessment.
    - require the assessment to reference concrete commands, outputs, skipped checks, and residual risk.
12. Update `skills/final-review/references/report-template.en.md`:
    - add `## Test Trust` with fields for `Level`, `Evidence`, `Skipped checks`, and `Residual risk`.
13. Update `skills/final-review/references/report-template.zh-CN.md`:
    - add `## 测试可信度` with fields for `等级`, `证据`, `跳过的检查`, and `剩余风险`.
14. Update `skills/finish/SKILL.md`:
    - bump `metadata.version` to `0.3.6`.
    - add a `Spec Delta Candidates` extraction rule.
    - require each candidate to be labeled `ADDED`, `MODIFIED`, `REMOVED`, or `RENAMED`.
    - keep accepted/rejected final-review handling unchanged.
15. Update existing exact-version and phase-count assertions in `test/skill-governance.test.mjs` so `review`, `final-review`, and `finish` match the new contracts.
16. Run:

   ```bash
   node --test --test-name-pattern "governs downstream main-chain review final-review and finish contracts" test/skill-governance.test.mjs
   node --test --test-name-pattern "final-review persists a human-reviewable report artifact before finish" test/skill-governance.test.mjs
   node --test --test-name-pattern "review and final-review actively trigger support lenses" test/skill-governance.test.mjs
   ```

   Expected green result: all three focused governance tests pass.

17. Commit:

   ```bash
   git add skills/review/SKILL.md skills/final-review/SKILL.md skills/final-review/final-reviewer.md skills/final-review/references/report-template.en.md skills/final-review/references/report-template.zh-CN.md skills/finish/SKILL.md test/skill-governance.test.mjs
   git commit -m "Complete downstream workflow review contracts"
   ```

## T-003 / Task 3: Align Article Status And Negative Scope Guards

Traceability:
- Source AC: `AC-003`, `AC-004`, `AC-005`, `AC-006`
- Design anchors: `D-007`, `D-008`, `D-009`, `D-010`
- Test cases: `TC-003`, `TC-004`, `TC-005`, `TC-006`
- Review focus: verify that completed article bullets are marked accurately while excluded ideas remain unmarked and absent from the shipped skill contract.

Files:
- `docs/articles/harness-engineering-loopx-takeaways.md`
- `test/skill-governance.test.mjs`

Implementation steps:
1. Add a governance subtest in `test/skill-governance.test.mjs` named `keeps main-chain exclusions out of current skill contracts`.
2. In that subtest, read these current contract files:
   - `skills/clarify/SKILL.md`
   - `skills/spec/SKILL.md`
   - `skills/plan-to-exec/SKILL.md`
   - `skills/exec/SKILL.md`
   - `skills/subagent-exec/SKILL.md`
   - `skills/review/SKILL.md`
   - `skills/final-review/SKILL.md`
   - `skills/finish/SKILL.md`
3. Assert those skill files do not contain any of these implementation commitments:
   - `.loopx/metrics/events.jsonl`
   - `local metrics`
   - `generic workflow artifact validator`
   - `通用 workflow artifact validator`
   - `migrate historical artifacts`
   - `historical artifact migration`
4. Assert `test/skill-governance.test.mjs` does not require old workflow artifact migration or a generic artifact validator.
5. Run the focused test:

   ```bash
   node --test --test-name-pattern "keeps main-chain exclusions out of current skill contracts" test/skill-governance.test.mjs
   ```

   Expected green result: the exclusion test passes after the current skills are read. If it fails, remove only the prohibited implementation commitment from the changed skill contract, not from historical design documents or roadmap article context.

6. Update `docs/articles/harness-engineering-loopx-takeaways.md` with strikethrough marks only for items completed by `T-001` and `T-002`:
   - mark spec contract block taxonomy and `Workflow Contract` as completed.
   - mark plan-to-exec expected execution evidence handoff as completed.
   - mark exec/subagent-exec task evidence propagation as completed.
   - mark review evidence consumption as completed.
   - mark final-review `Test Trust` as completed.
   - mark finish `Spec Delta Candidates` labels `ADDED/MODIFIED/REMOVED/RENAMED` as completed.
7. Leave uncompleted article items unstruck:
   - local workflow metrics.
   - generic artifact validator.
   - codebase-spec initialization.
   - acceptance-testcase-generator.
   - deploy/UI/ops plugin expansion.
8. Run:

   ```bash
   node --test --test-name-pattern "keeps main-chain exclusions out of current skill contracts" test/skill-governance.test.mjs
   node --test test/skill-governance.test.mjs
   ```

   Expected green result: `test/skill-governance.test.mjs` passes.

9. Commit:

   ```bash
   git add docs/articles/harness-engineering-loopx-takeaways.md test/skill-governance.test.mjs
   git commit -m "Mark completed main-chain workflow improvements"
   ```

## T-004 / Task 4: Run Full Verification And Final Self-Review

Traceability:
- Source AC: `AC-004`, `AC-006`
- Design anchors: `D-007`, `D-009`, `D-010`
- Test cases: `TC-003`, `TC-004`, `TC-006`
- Review focus: verify all changed skill metadata, package discovery assumptions, and full test suite behavior after the complete chain update.

Files:
- No planned source edits. Only fix files touched by `T-001`, `T-002`, or `T-003` if verification exposes a defect.

Implementation steps:
1. Run skill package validation:

   ```bash
   node scripts/verify-skills.mjs
   ```

   Expected output: validation completes without missing bundled skills, metadata errors, package file omissions, or plugin install-surface failures.

2. Run the full test suite:

   ```bash
   npm test
   ```

   Expected output: all `node --test test/*.test.mjs` suites pass.

3. Run whitespace and patch sanity:

   ```bash
   git diff --check
   ```

   Expected output: no whitespace errors.

4. Run final negative scope checks:

   ```bash
   rg "\.loopx/metrics/events\.jsonl|local metrics|generic workflow artifact validator|通用 workflow artifact validator|migrate historical artifacts|historical artifact migration" skills test/skill-governance.test.mjs
   ```

   Expected output: no matches. If `rg` exits with status 1 because there are no matches, treat that as the expected result.

5. Inspect changed files:

   ```bash
   git diff --stat
   git diff -- skills/clarify/SKILL.md skills/spec/SKILL.md skills/plan-to-exec/SKILL.md skills/exec/SKILL.md skills/subagent-exec/SKILL.md skills/subagent-exec/implementer-prompt.md skills/subagent-exec/task-reviewer-prompt.md skills/review/SKILL.md skills/final-review/SKILL.md skills/final-review/final-reviewer.md skills/final-review/references/report-template.en.md skills/final-review/references/report-template.zh-CN.md skills/finish/SKILL.md test/skill-governance.test.mjs docs/articles/harness-engineering-loopx-takeaways.md
   ```

   Expected result: diff is limited to the planned skill contracts, prompt/report templates, governance tests, and article status marks.

6. If verification requires a correction, make the correction in the owning file, rerun the failing command plus `node scripts/verify-skills.mjs`, then stage only the concrete files corrected in this step and commit:

   ```bash
   git commit -m "Fix main-chain workflow verification"
   ```

   If no files changed during this task, do not create an empty commit.

## Final Verification Package

Before declaring the implementation complete, collect these results for the final response and later review:

```bash
node --test test/skill-governance.test.mjs
node scripts/verify-skills.mjs
npm test
git diff --check
```

Expected final state:
- Clarify AC/TC source documents feed spec without replacement IDs.
- Spec decisions that affect workflow handoffs appear in typed contract blocks with D-* anchors.
- Plan-to-exec emits T-* tasks with expected execution evidence and review focus.
- Exec and subagent-exec preserve task anchors and verification evidence.
- Review consumes AC/D/T anchors and execution evidence before code-quality review.
- Final-review reports Requirements Coverage, Runtime/Regression results, and Test Trust.
- Finish reports spec delta candidates with ADDED/MODIFIED/REMOVED/RENAMED labels while preserving accepted/rejected gates.
- Excluded local metrics, generic validators, historical artifact migration, and plugin expansion remain absent from current shipped skill contracts.
