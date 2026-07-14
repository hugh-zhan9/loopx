# Skill Suite V2 Current-Contract Reset

> **For agentic workers:** execute this package with `$subagent-exec docs/loopx/plans/2026-07-13-skill-suite-v2-reset/00-overview.md`; use `$exec` only when subagents are unavailable. Every dispatched worker is a leaf worker and must not create or wait for other agents.

**Source spec path:** `docs/loopx/design/2026-07-13-skill-suite-v2-reset/需求设计文档.md`

**Accepted proposal:** `docs/loopx/design/2026-07-13-skill-suite-v2-reset/设计提案.md`

**Source context:** User-approved destructive redesign based on the 2026-07-13 full bundled-skill audit in this conversation.

**Goal:** Replace the current loopx skill suite with one compact, internally consistent, fully governed contract without compatibility for running workflows or legacy `.loopx` state.

**Package slug:** `skill-suite-v2-reset`

**Multi-plan state:** `.loopx/multi-plan/skill-suite-v2-reset/state.json`

## Approved Decisions

- This is a destructive current-contract reset. Do not migrate, normalize, or preserve running `.loopx` workflows, intake packages, issue ledgers, review reports, finish audits, or multi-plan state.
- Historical files under `docs/loopx/design/`, `docs/loopx/plans/`, `docs/release-notes/`, and git history may describe old behavior. Current product paths must describe only the new contract.
- Every agent dispatched by a loopx workflow skill is a leaf worker. Only the top-level controller owns spawning, waiting, messaging, replacement, interruption, and lifecycle state.
- Root `SKILL.md` files are orchestrator contracts. Detailed schemas, rubrics, examples, and platform mappings belong in directly routed references.
- One invariant has one owner. Consumer skills reference the owning contract instead of copying it.
- Support skills remain lenses and must not create workflow states.
- New state and report schemas may start at version `1`; compatibility with previous schema numbers is explicitly out of scope.
- Change only skill `metadata.version` values for skills whose contract changes.

## Source Requirements

- `AC-001` — every loopx-dispatched worker is a leaf worker and only the top-level controller owns agent lifecycle operations.
- `AC-002` — clarify persists and the CLI honors `needs_spec`, `direct_to_plan`, or `blocked` without guessing from readiness alone.
- `AC-003` — root workflow skills are bounded orchestrators with one owner for every shared invariant.
- `AC-004` — diagnosis, issue intake, repair, TDD, verification, and worktree setup use consistent, non-destructive contracts.
- `AC-005` — design/domain lenses contain correct, conditional, repository-first technical guidance rather than universal cookbook rules.
- `AC-006` — all 27 bundled skills have deterministic semantic governance for boundary, output, safety, and integration contracts.
- `AC-007` — current product docs, resolver, package contents, runtime behavior, and skill contracts describe one v2 current surface.
- `AC-008` — old running workflow artifacts and schemas are unsupported; no migration or compatibility layer is added.

## Acceptance Scenarios

- `TC-001` — given any workflow skill dispatch, inspecting the worker-visible prompt shows the leaf-worker prohibition.
- `TC-002` — given ready clarify state with `needs_spec`, `loopx next` returns `$spec`; `direct_to_plan` returns `$plan-to-exec`; `blocked` returns no execution handoff.
- `TC-003` — given a pre-v2 running state, current runtime rejects it with a restart diagnostic and does not rewrite or delete user files.
- `TC-004` — given issue diagnosis, the exact canonical debug fields pass unchanged into the issue ledger and fix readiness gate.
- `TC-005` — given existing or dirty implementation code, TDD guidance preserves it and records characterization/regression evidence instead of instructing deletion.
- `TC-006` — given OAS 3.1 and CLI reference checks, no invalid nullable example or false portable exit-code claim remains.
- `TC-007` — given the bundled skill list, every skill has exactly one semantic governance matrix entry and every referenced file is packaged.
- `TC-008` — strict current-surface searches find no legacy adapter, nested-worker permission, or superseded contract wording; historical design/plan files are exempt.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: independent reviewer was dispatched as a leaf worker but did not return within bounded waits; controller stopped it and performed source-to-plan coverage, scope, dependency, and verification review against `AC-001`–`AC-008` and `TC-001`–`TC-008`.
- Recheck evidence: added explicit source requirements and acceptance scenarios; confirmed each AC/TC maps to at least one child plan and package verification.
- Residual risk: execution should begin with a fresh `plan-reviewer` pass if an independent reviewer is available.

## Global Constraints

- Preserve the repository Iron Law: discovery descriptions are explicit; bodies remain operational, clear, bounded, and focused.
- Preserve canonical skill source under `skills/`; never edit installed copies outside the repository.
- Preserve package-root installation for Codex and Claude while allowing platform-specific references.
- Preserve user changes already present in the dirty worktree. The current uncommitted `subagent-exec` leaf-worker changes are part of the intended baseline.
- Use two-space ESM style for runtime/test changes.
- Use TDD for runtime behavior and governance-contract changes: add the failing assertion first, observe RED, then implement.
- Do not add dependencies.
- Do not add compatibility adapters, deprecated aliases, legacy readers, migration commands, or fallback schemas.
- Strict current product paths:
  - `src/`
  - `scripts/`
  - `test/`
  - `skills/`
  - `templates/`
  - `package.json`
  - `README.md`
  - `README.zh-CN.md`
  - `docs/loopx/cli.md`
  - `docs/loopx/cli.zh-CN.md`
  - `docs/loopx/skills.md`
  - `docs/loopx/skills.zh-CN.md`
  - `docs/loopx/specs/`

## Child Plans

| Order | Child plan | Responsibility | Depends on |
|---:|---|---|---|
| 1 | [01-shared-contracts-and-agent-control.md](./01-shared-contracts-and-agent-control.md) | Shared vocabularies, leaf-worker topology, review/evidence ownership | none |
| 2 | [02-runtime-routing-and-state-reset.md](./02-runtime-routing-and-state-reset.md) | Persist clarify design gate and remove old-state compatibility | plan 01 |
| 3 | [03-core-workflow-simplification.md](./03-core-workflow-simplification.md) | Reduce main workflow skills to bounded orchestrators | plans 01–02 |
| 4 | [04-issue-debug-tdd-and-execution-safety.md](./04-issue-debug-tdd-and-execution-safety.md) | Repair issue/debug schema, TDD safety, fix/worktree control | plan 01 |
| 5 | [05-domain-and-analysis-skill-hardening.md](./05-domain-and-analysis-skill-hardening.md) | Correct and tighten design/support lenses and references | plan 01 |
| 6 | [06-governance-docs-and-release-gate.md](./06-governance-docs-and-release-gate.md) | Semantic governance coverage, public docs, package verification | plans 02–05 |

Plans 02, 04, and 05 are conceptually independent after plan 01, but package mode executes child plans strictly sequentially. Direct child execution is targeted/manual-control mode only.

## Requirement Coverage

| Requirement | Primary child plans | Acceptance scenarios |
|---|---|---|
| `AC-001` | 01, 04 | `TC-001` |
| `AC-002` | 02 | `TC-002` |
| `AC-003` | 01, 03 | `TC-001`, `TC-008` |
| `AC-004` | 04 | `TC-004`, `TC-005` |
| `AC-005` | 05 | `TC-006` |
| `AC-006` | 06 | `TC-007` |
| `AC-007` | 02, 03, 06 | `TC-002`, `TC-007`, `TC-008` |
| `AC-008` | 02, 06 | `TC-003`, `TC-008` |

## Package Completion Gate

After each child plan:

1. Run its focused tests and required full verification.
2. Run plan-level `final-review`.
3. Create one child-plan implementation commit.
4. Record `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review: true` in schema-v2 package state.

After all child plans:

1. Run one spec-level `final-review` across the complete package range.
2. Require a clean canonical final-review report with `ready_for_finish: true`.
3. Run `$finish`.

## Package Verification

```bash
node scripts/verify-skills.mjs
npm test
npm pack --dry-run --json
```

Expected: all governed skills validate, all tests pass, and the package contains only the canonical v2 current surface.
