# loopx Skill Resolver

Central routing map for loopx bundled skills. Keep this file in sync with every bundled `skills/<name>/SKILL.md`. Normal and plugin installs both consume this canonical package-root `skills/` source.

Read the selected skill file before acting. If multiple skills match, read every likely candidate and use the disambiguation rules below.

Current contract: pre-v2 running workflow state is unsupported and must restart.
Only the top-level controller owns agent lifecycle; every dispatched worker is
a leaf worker and must not spawn, delegate to, or wait for other agents.

## Core Workflow Skills

| Trigger | Skill |
|---|---|
| Ambiguous request, unclear scope, non-goals, decision boundaries, requirements interview | `skills/clarify/SKILL.md` |
| Design方案, technical design, API/data/state/security decisions, or architecture tradeoffs | `skills/spec/SKILL.md` |
| Existing codebase, module, or interface needs a detailed evidence-backed current-state specification | `skills/codebase-spec/SKILL.md` |
| Approved intake package, requirements, or design need a bite-sized implementation plan | `skills/plan-to-exec/SKILL.md` |
| Approved plan has independent tasks and should run with subagents plus task-scoped review | `skills/subagent-exec/SKILL.md` |
| Approved plan should run inline or without subagent-first execution | `skills/exec/SKILL.md` |
| Completed task evidence, checkpoint work, major feature, or pre-merge work needs independent code review | `skills/review/SKILL.md` |
| Completed full feature needs final integration, runtime-risk, and test-gap review before finish | `skills/final-review/SKILL.md` |
| Existing code review feedback needs technical evaluation and implementation | `skills/fix-review/SKILL.md` |
| Completed implementation with passing tests needs merge, PR, keep, or discard decision | `skills/finish/SKILL.md` |
| Issue-driven bug-class intake, diagnosis, local ledger creation, or fix brief preparation | `skills/issue/SKILL.md` |
| Issue-driven bug fix execution from `.loopx/issues/*.md` ledgers with `ready_for_fix` status | `skills/fix/SKILL.md` |
| Refactor request needs interview, tiny commits, behavior-preserving scope, and RFC/issue output | `skills/refactor-plan/SKILL.md` |

## Support Skills

| Trigger | Skill |
|---|---|
| Feature or bugfix implementation should be covered by a failing test first | `skills/tdd/SKILL.md` |
| Bug, test failure, build failure, regression, unexpected behavior, root-cause investigation | `skills/debug/SKILL.md` |
| Completion, fixed, passing, review-ready, commit, or handoff claims need fresh evidence | `skills/verify/SKILL.md` |
| Implementation work needs an isolated workspace, existing isolation must be detected, or git worktree setup is requested | `skills/using-git-worktrees/SKILL.md` |
| Document readability, PRD assessment, requirements gaps, unclear viewpoint, AI-like prose, or document rewriting | `skills/doc-readability/SKILL.md` |
| Existing requirement, PRD, spec, or feature brief needs ambiguity, gap, impact, feasibility, or readiness analysis | `skills/requirement-analyzer/SKILL.md` |
| Plan artifact source-to-plan coverage audit, plan review, draft implementation plan quality, or checking whether AC/D/TC anchors map to tasks and verification | `skills/plan-reviewer/SKILL.md` |
| Editing `.go` files or reviewing Go style | `skills/go-style/SKILL.md` |
| Go-Kratos proto, service, biz, data, middleware, auth, config, or troubleshooting | `skills/kratos/SKILL.md` |
| REST/GraphQL API design, resource modeling, OpenAPI, pagination, versioning, or API error model discipline | `skills/api-designer/SKILL.md` |
| System architecture, ADRs, NFRs, scalability, failure modes, or technology tradeoff discipline | `skills/architecture-designer/SKILL.md` |
| SQL queries, schema changes, indexes, migrations, database dialects, or query performance discipline | `skills/sql-style/SKILL.md` |
| CLI command design, flags, human/JSON output, interactive vs non-interactive behavior, help text, or CLI UX discipline | `skills/cli-developer/SKILL.md` |
| Over-engineering, unnecessary dependency, simplest working diff, YAGNI at implementation time, or Codex implementation-layer minimization discipline | `skills/lancet/SKILL.md` |

## Disambiguation

1. If intent, scope, non-goals, or decision boundaries are unresolved, use `clarify`. New `clarify` handoffs use `.loopx/intake/YYYY-MM-DD-<slug>/` intake package directories.
2. If the user wants to document what an existing repository currently does, use `codebase-spec`. If they want to design a future change, use `spec`.
3. If remaining questions are product behavior, API, state, data, permission, migration, compatibility, or architecture decisions, use `spec`.
4. If remaining questions are local implementation choices, use `plan-to-exec`; approved intake packages may be passed as `.loopx/intake/YYYY-MM-DD-<slug>/`.
5. `plan-to-exec` writes a single plan to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`, or multiple plans from one source under `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`.
6. For single plans, use `subagent-exec` when subagents are available and tasks are independent; use `exec` for inline execution or when subagents are unavailable.
7. For multi-plan packages, call `subagent-exec` or `exec` with `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` or the package directory to run package mode. Package mode executes child plans strictly sequentially, then runs one spec-level `final-review` and `finish` only when clean.
8. Direct numbered child plan execution is targeted/resume/manual-control mode and must not be presented as the primary package handoff.
9. Use `final-review` after the whole feature is implemented and before `finish`; for multi-plan packages, child plans receive plan-level final-review state with `plan_review.status`, and the package receives one spec-level final-review report before finish.
10. Use `review` to request code review of completed task or checkpoint work.
11. Use `fix-review` only after feedback exists.
12. Use `finish` only after implementation, final review, and verification are complete.
13. Use `issue` for issue-driven bug-class intake and diagnosis. Route feature requests back to the feature-driven flow.
14. Use `fix` only after an issue-driven ledger under `.loopx/issues/` is `ready_for_fix`.
15. Use `refactor-plan` for behavior-preserving refactor planning. If the refactor changes external behavior or contracts, route to `clarify` or `spec`.
16. Use `doc-readability` for document assessment or rewriting, especially PRDs, requirements docs, specs, meeting notes, and AI-like prose. If the document is a source artifact for implementation, assess or rewrite it first, then route clarified implementation work back through `clarify`, `spec`, or `plan-to-exec`.
17. Use `using-git-worktrees` before implementation when the current checkout should be protected, but do not use it for `fix` parallel subagent worktrees or `finish` branch placement.
18. Treat `tdd`, `debug`, `verify`, `using-git-worktrees`, `doc-readability`, `requirement-analyzer`, `plan-reviewer`, `go-style`, `kratos`, `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, and `lancet` as support lenses unless the user explicitly invokes them directly.
19. `requirement-analyzer` may produce a requirements gap report, but it must not advance loopx workflow state. Use its output as source material for a later `clarify`, `spec`, or `plan-to-exec` step only when the user asks.
20. `plan-reviewer` may audit a draft or existing implementation plan, but it must not advance loopx workflow state. `plan-to-exec` uses it internally before final plan handoff; direct user invocation is for ad-hoc plan audits only.
21. `api-designer`, `architecture-designer`, `sql-style`, and `cli-developer` add domain discipline to `spec`, `exec`, `review`, and `final-review`; they do not replace workflow skills or create workflow states. `lancet` is implementation/review-only: it activates in `exec`, `subagent-exec`, `review`, `final-review`, and `fix`, while planning stages may only note downstream activation.

## Deterministic Guard

Run this before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
