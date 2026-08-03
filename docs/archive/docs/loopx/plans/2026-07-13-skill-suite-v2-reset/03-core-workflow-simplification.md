# Core Workflow Simplification Implementation Plan

**Source:** `00-overview.md`

**Goal:** Reduce core workflow roots to bounded orchestrators while preserving one complete AC/TC → D → T → evidence → review → finish chain.

**Architecture:** Move detailed schemas, examples, and rubrics from root skills into owned references. Delete duplicate prose rather than copying it into new files.

**Support lenses:** lancet, doc-readability

## Global Constraints

- Root workflow skills ultimately target 120–220 lines unless a documented operational reason requires more. This child establishes owned references and removes obvious blocking-path bulk; child plan 06 applies the final line guard after semantic governance replaces phrase-coupled assertions.
- One invariant has one owner.
- Do not weaken stop conditions, source anchors, runtime evidence, or finish gates.
- Do not preserve old wording for compatibility.

### T-001 / Task 1: Simplify Planning And Execution Roots

**Files:**
- Modify: `skills/clarify/SKILL.md`
- Modify: `skills/spec/SKILL.md`
- Modify: `skills/plan-to-exec/SKILL.md`
- Create: `skills/plan-to-exec/references/plan-schema.md`
- Create: `skills/plan-to-exec/references/surface-change-planning.md`
- Create: `skills/plan-to-exec/references/internal-plan-review.md`
- Modify: `skills/exec/SKILL.md`
- Modify: `skills/subagent-exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:** preserve AC/TC ownership in clarify, D ownership in spec, T ownership in planning, and shared evidence consumption in execution.

**Expected execution evidence:** governance tests assert required contracts through root plus routed references; child plan 06 owns the final line-count guard after its semantic matrix lands.

**Review focus:** remove the duplicate `Internal Plan Review` section and upstream disparaging/manifesto prose.

- [ ] Add failing contract and bounded-root tests.
- [ ] Extract only normative detail that must remain; delete repeated examples and rationalizations.
- [ ] Give `exec` one canonical progress ledger path and recovery protocol.
- [ ] Keep `subagent-exec` as orchestration-only and route platform/lifecycle details to references.
- [ ] Run focused governance tests and skill verification.

### T-002 / Task 2: Unify Review Layers And Simplify Completion Roots

**Files:**
- Modify: `skills/review/SKILL.md`
- Modify: `skills/review/code-reviewer.md`
- Modify: `skills/final-review/SKILL.md`
- Modify: `skills/final-review/final-reviewer.md`
- Modify: `skills/final-review/references/report-template.en.md`
- Modify: `skills/final-review/references/report-template.zh-CN.md`
- Modify: `skills/fix-review/SKILL.md`
- Create: `skills/fix-review/references/feedback-ledger.md`
- Modify: `skills/finish/SKILL.md`
- Modify: `skills/finish/references/branch-worktree-and-recording.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:** consume shared review and evidence contracts; preserve task/checkpoint/plan/spec scopes; give fix-review a canonical resumable ledger path.

**Expected execution evidence:** governance tests prove ownership matrix, canonical final report, feedback ledger resume, and finish partial-failure recovery.

**Review focus:** optional health scores and long examples must not remain on the blocking path.

- [ ] Add failing ownership, ledger-path, and finish-recovery assertions.
- [ ] Replace repeated severity/evidence definitions with shared references.
- [ ] Define `prepare → perform → record → reconcile` behavior for finish actions.
- [ ] Specify recovery when git action and `finish-record` do not both succeed.
- [ ] Run focused tests, `node scripts/verify-skills.mjs`, and `npm test`.
