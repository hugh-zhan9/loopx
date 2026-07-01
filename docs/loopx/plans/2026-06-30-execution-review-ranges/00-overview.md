# Execution Review Ranges Implementation Plan Package

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement each child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-30-execution-review-ranges/需求设计文档.md`

**Package slug:** `2026-06-30-execution-review-ranges`

**Local state path:** `.loopx/multi-plan/2026-06-30-execution-review-ranges/state.json`

**Goal:** Implement start-anchored requirement execution ranges so final-review and finish share the same start identity while finish records final committed evidence.

**Architecture:** The approved design keeps `finish-start` baseline semantics intact and adds dedicated `.loopx/execution-ranges/<slug>.json` state for requirement start identity. Runtime/CLI changes create and consume that state; skill contracts and templates define how agents run final-review, child review, fix-review, and finish against it.

**Tech Stack:** Node.js ESM, local JSON runtime state, markdown skill contracts/templates, Node built-in `node:test`.

**Support lenses:** `architecture-designer`, `cli-developer`

## Split Rationale

- `01-runtime-state-and-finish.md` owns executable CLI/runtime behavior: `execution-start`, execution range JSON, finish audit evidence, tracked dirty gate, and multi-plan v2 validation.
- `02-final-review-contracts.md` owns final-review skill, reviewer prompt, canonical report identity, localized templates, and coverage-gap reporting rules.
- `03-skill-workflow-contracts.md` owns orchestration skills (`exec`, `subagent-exec`, `finish`, `plan-to-exec`, resolver docs) so agents call the new runtime and record the new multi-plan state shape.
- `04-governance-and-verification.md` owns release gates, package/plugin surface validation, cross-skill governance assertions, and end-to-end regression checks.

This package is multi-plan because the change crosses public CLI/runtime state, generated workflow artifacts, skill instructions, templates, and governance tests. Each child plan is independently reviewable but the feature is not finishable until all child plans and the spec-level final-review pass.

## Child Plans

| Child plan | Path | Purpose | Can run in parallel |
|---|---|---|---|
| Runtime state and finish | `docs/loopx/plans/2026-06-30-execution-review-ranges/01-runtime-state-and-finish.md` | Adds `execution-start`, execution state helpers, finish evidence fields, tracked dirty gate, and multi-plan v2 runtime validation. | No; should run first because later plans reference runtime contracts. |
| Final-review contracts | `docs/loopx/plans/2026-06-30-execution-review-ranges/02-final-review-contracts.md` | Updates final-review instructions, reviewer prompt, and report templates for start-anchored scope, canonical reports, coverage blockers, and localization. | Yes, after `01-runtime-state-and-finish.md` starts or completes. |
| Skill workflow contracts | `docs/loopx/plans/2026-06-30-execution-review-ranges/03-skill-workflow-contracts.md` | Updates orchestration skills to call `execution-start`, preserve checkpoint review behavior, use child `plan_review`, and finish only after spec-level final-review. | Yes, after `01-runtime-state-and-finish.md` defines CLI names and state fields. |
| Governance and verification | `docs/loopx/plans/2026-06-30-execution-review-ranges/04-governance-and-verification.md` | Adds/updates tests that prove AC/TC coverage, package governance, negative assertions, and install surface consistency. | No; run last after child plans 1-3. |

## Execution Order

1. Execute `01-runtime-state-and-finish.md`.
2. Execute `02-final-review-contracts.md` and `03-skill-workflow-contracts.md`. These can be implemented by separate agents once plan 1 exposes stable runtime names.
3. Execute `04-governance-and-verification.md`.
4. Run plan-level `final-review` for each child plan. Child plan reviews must not create `.loopx/final-review/*.md` reports; they update `.loopx/multi-plan/2026-06-30-execution-review-ranges/state.json` with `plan_review.status`.
5. Run one spec-level `final-review` for `docs/loopx/design/2026-06-30-execution-review-ranges/需求设计文档.md`.
6. Run `finish` only after the spec-level report has `Ready for finish? Yes`.

## Global Constraints

- Preserve existing `finish-start` / `finish-audit` baseline behavior and committed diff learning extraction.
- Do not add `execution-end`.
- Do not change `subagent-exec` subagent launching behavior.
- Do not require code review after every `exec` task; keep checkpoint reviews and a final checkpoint before final-review.
- Do not create child plan final-review report artifacts.
- Do not record child plan start commit, current `HEAD`, or end commit metadata.
- Treat untracked files as clean; tracked staged/unstaged changes remain dirty for finish completion.
- `final-review` may include tracked uncommitted changes only when `git diff` and `git diff --cached` are review inputs.
- Chinese final-review reports keep only these English machine tokens: `Ready for finish?`, `Yes`, `No`, `With fixes`.
- Missing requirement coverage is a Critical blocking finding. Partial requirement coverage is an Important blocking finding. Either blocks `Ready for finish? Yes`.
- When changing bundled skill docs, edit `skills/` as canonical source and bump only the changed skill `metadata.version`.
- Validate with `node scripts/verify-skills.mjs` and targeted `node --test` suites before finish.

## Surface Inventory

- Public commands/API/routes/events/config: add `loopx execution-start <slug> --source <path> [--design <path>] [--json]`; keep `finish-start`, `finish-audit`, and `finish-record` public behavior compatible.
- Exported functions/types/modules: add exported execution range helpers from `src/finish-runtime.mjs` or a same-domain runtime module; keep current finish exports.
- Runtime/generated artifacts and templates: add `.loopx/execution-ranges/<slug>.json`; update `.loopx/final-review/<canonical>.md`; update `.loopx/multi-plan/<feature-slug>/state.json` schema to v2.
- Installer/package/deployment surface: bundled skills under `skills/`; package `files` already includes `src/`, `skills/`, `templates/`, `docs/loopx/`.
- Hooks/background jobs/automation: no hook behavior change required; workflow hook docs must not advertise removed or nonexistent commands.
- Current product docs: `docs/loopx/specs/installation.md`, skill files, resolver content, README workflow text if current guidance mentions old report/gate semantics.
- Tests/governance checks: `test/workflow.test.mjs`, `test/skill-governance.test.mjs`, `scripts/verify-skills.mjs`.
- Compatibility/migration paths: read v1 multi-plan state for compatibility and write v2 on updated flows; fallback to finish baseline when execution state is absent.

## Caller Proof Commands

Run these before removing or renaming old fields:

```bash
rg "plan_final_review|plan_review|spec_final_review|execution-start|finish-start|finish-audit|Ready for finish\\?|Blocking issues" src scripts test skills templates docs README.md README.zh-CN.md package.json
rg "loopx finish-start|loopx finish-audit|loopx finish-record|loopx next|loopx status" src scripts test skills docs README.md README.zh-CN.md
rg "\\.loopx/final-review|\\.loopx/multi-plan|\\.loopx/execution-ranges|finish baselines" src scripts test skills templates docs README.md README.zh-CN.md
```

Decision rule:

- Retained caller exists in current source/runtime code -> keep it and name the caller in the relevant child plan.
- Only historical docs, release notes, old plans, or frozen external content reference it -> do not count that as a retained caller.
- No retained caller -> delete it from current governance/package/docs or add a negative assertion proving it is gone.

## Negative Assertions

Run these after all child plans:

```bash
! rg "plan_final_review" src skills templates test README.md README.zh-CN.md docs/loopx/specs
! rg "execution-end|execution_end_commit|reviewed end commit" src skills templates test README.md README.zh-CN.md docs/loopx/specs
! rg "child plan final-review report|child plan final review report" skills test src templates README.md README.zh-CN.md docs/loopx/specs
node scripts/verify-skills.mjs
npm test
```

Expected: the `! rg` commands exit successfully with no matches; verification and tests pass.

## Final Gate

Every child plan needs plan-level `final-review`; the package needs one spec-level `final-review`; only then may `finish` run.

Child plan state must use:

```json
{
  "plan_review": {
    "status": "passed",
    "reviewed_at": "2026-06-30T00:00:00.000Z",
    "summary": "No blocking issues"
  },
  "ready_for_spec_review": true
}
```

The spec-level final-review state remains the package gate:

```json
{
  "spec_final_review": {
    "path": ".loopx/final-review/2026-06-30-execution-review-ranges.md",
    "ready_for_finish": "Yes"
  }
}
```

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: Applied `plan-reviewer` source-to-plan rubric against `需求设计文档.md`, `requirements.md`, `test-cases.md`, and this multi-plan package. AC-1 through AC-12, TC-1 through TC-15, and D-001 through D-011 are mapped across the child plans and verification gates.
- Recheck evidence: Initial split risk was that runtime, skill docs, and governance assertions could drift. The plan now separates runtime implementation, final-review contracts, orchestration contracts, and final governance, with explicit cross-plan interfaces and negative assertions.
- Residual risk: same-context review was not independently performed by a separate subagent.
