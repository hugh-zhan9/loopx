# loopx Skill Resolver

Central routing map for loopx bundled skills. Keep this file in sync with every bundled `skills/<name>/SKILL.md` and `plugins/loopx/skills/<name>/SKILL.md`.

Read the selected skill file before acting. If multiple skills match, read every likely candidate and use the disambiguation rules below.

## Core Workflow Skills

| Trigger | Skill |
|---|---|
| Ambiguous request, unclear scope, non-goals, decision boundaries, requirements interview | `skills/clarify/SKILL.md` |
| Design方案, technical design, API/data/state/security decisions, or architecture tradeoffs | `skills/spec/SKILL.md` |
| Approved requirements or design need a bite-sized implementation plan | `skills/plan-to-exec/SKILL.md` |
| Approved plan has independent tasks and should run with subagents plus staged review | `skills/subagent-exec/SKILL.md` |
| Approved plan should run inline or without subagent-first execution | `skills/exec/SKILL.md` |
| Completed task, major feature, or pre-merge work needs independent code review | `skills/review/SKILL.md` |
| Completed full feature needs final integration, runtime-risk, and test-gap review before finish | `skills/final-review/SKILL.md` |
| Existing code review feedback needs technical evaluation and implementation | `skills/fix-review/SKILL.md` |
| Completed implementation with passing tests needs merge, PR, keep, or discard decision | `skills/finish/SKILL.md` |
| Refactor request needs interview, tiny commits, behavior-preserving scope, and RFC/issue output | `skills/refactor-plan/SKILL.md` |

## Support Skills

| Trigger | Skill |
|---|---|
| Feature or bugfix implementation should be covered by a failing test first | `skills/tdd/SKILL.md` |
| Bug, test failure, build failure, regression, unexpected behavior, root-cause investigation | `skills/debug/SKILL.md` |
| Completion, fixed, passing, review-ready, commit, or handoff claims need fresh evidence | `skills/verify/SKILL.md` |
| Document readability, PRD assessment, requirements gaps, unclear viewpoint, AI-like prose, or document rewriting | `skills/doc-readability/SKILL.md` |
| Existing requirement, PRD, spec, or feature brief needs ambiguity, gap, impact, feasibility, or readiness analysis | `skills/requirement-analyzer/SKILL.md` |
| Editing `.go` files or reviewing Go style | `skills/go-style/SKILL.md` |
| Go-Kratos proto, service, biz, data, middleware, auth, config, or troubleshooting | `skills/kratos/SKILL.md` |
| REST/GraphQL API design, resource modeling, OpenAPI, pagination, versioning, or API error model discipline | `skills/api-designer/SKILL.md` |
| System architecture, ADRs, NFRs, scalability, failure modes, or technology tradeoff discipline | `skills/architecture-designer/SKILL.md` |
| SQL queries, schema changes, indexes, migrations, database dialects, or query performance discipline | `skills/sql-style/SKILL.md` |
| CLI command design, flags, human/JSON output, interactive vs non-interactive behavior, help text, or CLI UX discipline | `skills/cli-developer/SKILL.md` |

## Disambiguation

1. If intent, scope, non-goals, or decision boundaries are unresolved, use `clarify`.
2. If remaining questions are product behavior, API, state, data, permission, migration, compatibility, or architecture decisions, use `spec`.
3. If remaining questions are local implementation choices, use `plan-to-exec`.
4. `plan-to-exec` writes `docs/loopx/plans/*.md` and then offers `subagent-exec` or `exec`.
5. Use `subagent-exec` when subagents are available and the plan has independent tasks.
6. Use `exec` when the user chooses inline execution or subagents are unavailable.
7. Use `review` to request code review of completed task or checkpoint work.
8. Use `final-review` after the whole feature is implemented and before `finish`.
9. Use `fix-review` only after feedback exists.
10. Use `finish` only after implementation, final review, and verification are complete.
11. Use `refactor-plan` for behavior-preserving refactor planning. If the refactor changes external behavior or contracts, route to `clarify` or `spec`.
12. Use `doc-readability` for document assessment or rewriting, especially PRDs, requirements docs, specs, meeting notes, and AI-like prose. If the document is a source artifact for implementation, assess or rewrite it first, then route clarified implementation work back through `clarify`, `spec`, or `plan-to-exec`.
13. Treat `tdd`, `debug`, `verify`, `doc-readability`, `requirement-analyzer`, `go-style`, `kratos`, `api-designer`, `architecture-designer`, `sql-style`, and `cli-developer` as support lenses unless the user explicitly invokes them directly.
14. `requirement-analyzer` may produce a requirements gap report, but it must not advance loopx workflow state. Use its output as source material for a later `clarify`, `spec`, or `plan-to-exec` step only when the user asks.
15. `api-designer`, `architecture-designer`, `sql-style`, and `cli-developer` add domain discipline to `spec`, `exec`, `review`, and `final-review`; they do not replace workflow skills or create workflow states.

## Deterministic Guard

Run this before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
