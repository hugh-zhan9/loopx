# loopx Skill Resolver

Governance index for loopx bundled skills. Keep this file in sync with every bundled `skills/<name>/SKILL.md`. It is not installed host guidance or runtime routing authority; normal and plugin installs route from the prompt-first managed guidance block and installed skill frontmatter.

Clear, bounded work stays prompt-first: inspect, implement, verify with fresh evidence, and report without selecting a workflow skill or creating workflow artifacts. A local defect or small feature is not, by itself, a workflow trigger. Governed escalation requires a concrete ambiguity, risk, recovery, coordination, or explicit user intent reason.

Current contract: pre-v2 running workflow state is unsupported and must restart.
Only the top-level controller owns agent lifecycle; every dispatched worker is
a leaf worker and must not spawn, delegate to, or wait for other agents.

## Core Workflow Skills

| Trigger | Skill |
|---|---|
| Unresolved intent, scope, acceptance, permission, secret handling, or destructive choice that must be settled before mutation | `skills/clarify/SKILL.md` |
| Unresolved compatibility, migration, public behavior, data, security, or cross-module architecture decision | `skills/spec/SKILL.md` |
| Existing codebase, module, or interface needs a detailed evidence-backed current-state specification | `skills/codebase-spec/SKILL.md` |
| Explicit planning, an approval boundary, interruption recovery, or durable coordination needs one lean persistent plan | `skills/plan/SKILL.md` |
| A clear request or persistent plan should be implemented with adaptive serial-or-concurrent selection | `skills/exec/SKILL.md` |
| Explicit review intent or concrete security, destructive, public compatibility, cross-task interaction, or conflict-reconciliation evidence requires independent review | `skills/review/SKILL.md` |
| Completed implementation with passing tests needs merge, PR, keep, or discard decision | `skills/finish/SKILL.md` |
| Issue-driven bug-class intake, diagnosis, local ledger creation, or fix brief preparation | `skills/issue/SKILL.md` |
| Issue-driven bug fix execution from `.loopx/issues/*.md` ledgers with `ready_for_fix` status | `skills/fix/SKILL.md` |
| Refactor request needs interview, tiny commits, behavior-preserving scope, and RFC/issue output | `skills/refactor-plan/SKILL.md` |

## Explicit Compatibility Aliases

| Explicit invocation only | Canonical intent |
|---|---|
| `skills/plan-to-exec/SKILL.md` | `plan` |
| `skills/subagent-exec/SKILL.md` | `exec` |
| `skills/parallel-subagent-exec/SKILL.md` | `exec` |
| `skills/final-review/SKILL.md` | `review` |
| `skills/fix-review/SKILL.md` | `review` |

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

1. Keep clear, bounded requests prompt-first, including local defects and small features. Do not select a skill merely because implementation or verification is required.
2. Stop before mutation and use `clarify` when unresolved intent, scope, acceptance, permissions, secret handling, or destructive choices could change the safe result. New `clarify` handoffs use `.loopx/intake/YYYY-MM-DD-<slug>/` intake package directories.
3. Use `spec` when an unresolved compatibility, migration, public behavior, data, security, or cross-module architecture decision must be fixed before implementation. Local implementation choices do not trigger `spec`.
4. If the user wants to document what an existing repository currently does, use `codebase-spec`. Use `plan` only for explicit planning, approval boundaries, interruption recovery, or durable coordination.
5. `plan` writes one lean plan to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`; clear work without a persistence trigger stays prompt-first.
6. `exec` accepts a clear request or a persistent plan and derives the current execution graph. Strongly coupled or uncertain work stays serial in the current context.
7. `plan-to-exec`, `subagent-exec`, and `parallel-subagent-exec` forward only when explicitly invoked; they do not participate in automatic routing or ask the user to choose an execution mode.
8. Every completed execution receives a controller-owned integration check. Use `review` only for explicit review intent or concrete security, destructive, public compatibility, cross-task interaction, or conflict-reconciliation evidence; multi-agent execution alone is not a trigger.
9. `final-review` and `fix-review` are explicit-only compatibility aliases for `review`. They preserve whole-feature-review or existing-feedback intent without requiring legacy report or ledger artifacts.
10. Critical and Important review findings are fixed or answered with evidence, freshly verified, and independently re-reviewed in the active execution context.
11. Use `finish` only for explicit Git disposition after implementation and fresh verification are complete.
12. Use `issue` for issue-driven bug-class intake and diagnosis. Route feature requests back to the feature-driven flow.
13. Use `fix` only after an issue-driven ledger under `.loopx/issues/` is `ready_for_fix`.
14. Use `refactor-plan` for behavior-preserving refactor planning. If the refactor changes external behavior or contracts, route to `clarify` or `spec`.
15. Use `doc-readability` for document assessment or rewriting, especially PRDs, requirements docs, specs, meeting notes, and AI-like prose. If the document is a source artifact for implementation, assess or rewrite it first, then route clarified implementation work back through `clarify`, `spec`, or `plan`.
16. Use `using-git-worktrees` before implementation when the current checkout should be protected, but do not use it for `fix` parallel subagent worktrees or `finish` branch placement.
17. Treat `tdd`, `debug`, `verify`, `using-git-worktrees`, `doc-readability`, `requirement-analyzer`, `plan-reviewer`, `go-style`, `kratos`, `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, and `lancet` as support lenses unless the user explicitly invokes them directly.
18. `requirement-analyzer` may produce a requirements gap report, but it must not advance loopx workflow state. Use its output as source material for a later `clarify`, `spec`, or `plan` step only when the user asks.
19. `plan-reviewer` may audit a draft or existing implementation plan, but it must not advance loopx workflow state. Use its output as source material for `plan`; direct user invocation is for ad-hoc plan audits only.
20. `api-designer`, `architecture-designer`, `sql-style`, and `cli-developer` add domain discipline to `spec`, `exec`, and `review`; they do not replace workflow skills or create workflow states. `lancet` is implementation/review-only: it activates in `exec`, `review`, and `fix`, while planning stages may only note downstream activation.

## Deterministic Guard

Run this before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
