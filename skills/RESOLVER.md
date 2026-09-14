# loopx Skill Resolver

Governance index for loopx bundled skills. Keep this file in sync with every
bundled `skills/<name>/SKILL.md`. It is not installed host guidance or runtime
routing authority; installs route from the managed working-agreement block and
installed skill frontmatter.

loopx v0.8 is docs-first: the primary deliverable is the working agreement
(`templates/working-agreement.md`) installed into host guidance, plus the
document-producing skills below. Execution still belongs to the model and its host
runtime; `$exec` is an optional host-native subagent playbook, not a loopx runtime,
review pipeline for ordinary work, or per-turn hook. Plan review lives in `plan2exec` and is used for explicit review requests or concrete risks. Clear, bounded work stays prompt-first under the working agreement:
inspect existing architecture and reuse points, implement, verify with fresh evidence, apply the quiet completion
check in `skills/shared/completion-check.md`, and report without creating
workflow artifacts.

## Canonical Workflow Intents

| Trigger | Skill |
|---|---|
| Unresolved intent, scope, acceptance, permission, secret handling, or destructive choice that must be settled before mutation | `skills/clarify/SKILL.md` |
| Unresolved compatibility, migration, public behavior, data, security, reuse, isolation, maintainability, or cross-module architecture decision, or review of an existing design | `skills/spec/SKILL.md` |
| Explicit planning, an approval boundary, interruption recovery, or durable coordination needs one plan document, or an existing plan needs review | `skills/plan2exec/SKILL.md` |

## Optional Plan Execution

| Trigger | Skill |
|---|---|
| The user explicitly asks to execute one ready `plan2exec` plan through leaf subagents, with safe parallelism and controller-owned review and integration | `skills/exec/SKILL.md` |

## Retained Specialized Workflows

| Trigger | Skill |
|---|---|
| Existing codebase, module, or interface needs a detailed evidence-backed current-state specification | `skills/codebase-spec/SKILL.md` |
| Refactoring audit needs supported findings, or a refactor plan needs behavior-preserving steps, scope and verification | `skills/refactor-plan/SKILL.md` |

## Support Skills

| Trigger | Skill |
|---|---|
| Feature or bugfix implementation should be covered by a failing test first | `skills/tdd/SKILL.md` |
| Failure diagnosis or requested repair, including a supplied existing issue ledger | `skills/debug/SKILL.md` |
| Implementation work needs an isolated workspace, existing isolation must be detected, or git worktree setup is requested | `skills/using-git-worktrees/SKILL.md` |
| Document readability assessment, targeted editing, document rewriting, or removing AI-like prose | `skills/humanize-doc/SKILL.md` |
| Repository docs contain stale or conflicting decisions, dated duplicates, superseded process material, or unclear current authority | `skills/maintain-project-docs/SKILL.md` |
| Existing requirement, PRD, spec, or feature brief needs ambiguity, gap, impact, feasibility, or readiness analysis | `skills/requirement-analyzer/SKILL.md` |
| Go implementation or review, idiom modernization, performance analysis, or concurrency correctness | `skills/go-style/SKILL.md` |
| Go-Kratos proto, service, biz, data, middleware, auth, config, or troubleshooting | `skills/kratos/SKILL.md` |
| REST/GraphQL API design, resource modeling, OpenAPI, pagination, versioning, or API error model discipline | `skills/api-designer/SKILL.md` |
| Existing HTTP APIs need independent business-scenario call documentation with purposes, parameters, and field descriptions, or an explicitly requested OpenAPI/Apifox export | `skills/generate-api-docs/SKILL.md` |
| Architecture conformance, reuse, ownership, isolation, maintainability, ADRs, NFRs, failure modes, or technology tradeoff discipline | `skills/architecture-designer/SKILL.md` |
| SQL queries, schema changes, indexes, migrations, database dialects, or query performance discipline | `skills/sql-style/SKILL.md` |
| CLI command design, flags, human/JSON output, interactive vs non-interactive behavior, help text, or CLI UX discipline | `skills/cli-developer/SKILL.md` |
| Over-engineering, unnecessary dependency, simplest working diff, YAGNI at implementation time, or Codex implementation-layer minimization discipline | `skills/lancet/SKILL.md` |
| A prompt or task brief needs a read-only lint of goal clarity, necessary context, boundaries, verifiable evidence, or signal quality before execution | `skills/prompt-lint/SKILL.md` |

## Disambiguation

1. `clarify` stops before mutation when unresolved intent, scope, acceptance, permissions, secret handling, or destructive choices could change the safe result; new handoffs use `.loopx/intake/YYYY-MM-DD-<slug>/` intake package directories. Local implementation choices never trigger `spec`.
2. Documenting what an existing repository currently does is `codebase-spec`, not `spec` or `plan2exec`. `plan2exec` (named to avoid confusion with an agent's built-in Plan mode) writes one lean plan document to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` only for its explicit triggers; clear work without a persistence trigger stays prompt-first.
3. Ordinary execution, review, and Git disposition follow the installed working agreement. `$exec` is used only for an explicitly selected ready `plan2exec` document; it delegates implementation to host-native leaf subagents while the top-level model reviews and integrates. Git disposition still requires an explicit user request.
4. `debug` diagnoses failures and completes repairs when requested. It does not create a ledger by default. Supplied ledgers keep their scope and recovery checks; a ledger status is not repair permission.
5. `refactor-plan` stays independent. Its approved RFC can guide authorized implementation directly; a separate `plan2exec` plan is optional for coordination. Changed external behavior belongs in `clarify` or `spec`.
6. `refactor-plan` includes optional code audits and a scanner. An audit ends with findings; a planning request gets an RFC. Scan only when it helps select candidates. Ordinary code reading does not require a report, and verification follows the working agreement without a separate skill or stage.
7. `humanize-doc` assesses readability or rewrites documents according to the request. Review-only requests produce findings; editing preserves facts, domain terms, decision status, boundaries, and evidence. It includes focused guidance for removing AI-like prose. Systematic requirement readiness analysis belongs to `requirement-analyzer`.
8. `maintain-project-docs` manages repository-wide document authority and lifecycle. It does not replace `humanize-doc` for prose, `codebase-spec` for reverse specifications, `spec` for unresolved future decisions, or `plan2exec` for implementation planning.
9. `using-git-worktrees` prepares or reuses workspace isolation before implementation. The host owns worker scheduling and integration.
10. `spec` writes or reviews the design in place. Overview and detailed design keep their separate roles; the overview explains necessary rationale, while detail describes current implementation contracts without a discussion log. No separate proposal is required. Existing overview-only decisions and history remain authoritative and must be read by downstream work.
11. `tdd`, `debug`, `using-git-worktrees`, `humanize-doc`, `maintain-project-docs`, `requirement-analyzer`, `go-style`, `kratos`, `api-designer`, `generate-api-docs`, `architecture-designer`, `sql-style`, `cli-developer`, `lancet`, and `prompt-lint` are support lenses unless explicitly invoked: `maintain-project-docs` updates document authority without creating workflow state; `requirement-analyzer` reports requirement gaps without advancing workflow state; `generate-api-docs` records current HTTP contracts without designing new APIs or changing code; `prompt-lint` evaluates an instruction without executing it or inventing missing facts; the domain lenses add discipline to design, implementation, and review without creating workflow states; `lancet` is implementation/review-only.

## Deterministic Guard

Run this before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
