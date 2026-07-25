# loopx Skill Resolver

Governance index for loopx bundled skills. Keep this file in sync with every
bundled `skills/<name>/SKILL.md`. It is not installed host guidance or runtime
routing authority; installs route from the managed working-agreement block and
installed skill frontmatter.

loopx v0.8 is docs-first: the primary deliverable is the working agreement
(`templates/working-agreement.md`) installed into host guidance, plus the
document-producing skills below. Execution belongs to the model and its host
runtime; loopx ships no execution orchestrator, review pipeline, or per-turn
hook. Clear, bounded work stays prompt-first under the working agreement:
inspect, implement, verify with fresh evidence, apply the quiet completion
check in `skills/shared/completion-check.md`, and report without creating
workflow artifacts.

## Canonical Workflow Intents

| Trigger | Skill |
|---|---|
| Unresolved intent, scope, acceptance, permission, secret handling, or destructive choice that must be settled before mutation | `skills/clarify/SKILL.md` |
| Unresolved compatibility, migration, public behavior, data, security, or cross-module architecture decision | `skills/spec/SKILL.md` |
| Explicit planning, an approval boundary, interruption recovery, or durable coordination needs one lean plan document | `skills/plan2exec/SKILL.md` |

## Retained Specialized Workflows

| Trigger | Skill |
|---|---|
| Existing codebase, module, or interface needs a detailed evidence-backed current-state specification | `skills/codebase-spec/SKILL.md` |
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
| Lean plan source coverage, scope drift, dependency, acceptance, or verification audit | `skills/plan-reviewer/SKILL.md` |
| Editing `.go` files or reviewing Go style | `skills/go-style/SKILL.md` |
| Go-Kratos proto, service, biz, data, middleware, auth, config, or troubleshooting | `skills/kratos/SKILL.md` |
| REST/GraphQL API design, resource modeling, OpenAPI, pagination, versioning, or API error model discipline | `skills/api-designer/SKILL.md` |
| System architecture, ADRs, NFRs, scalability, failure modes, or technology tradeoff discipline | `skills/architecture-designer/SKILL.md` |
| SQL queries, schema changes, indexes, migrations, database dialects, or query performance discipline | `skills/sql-style/SKILL.md` |
| CLI command design, flags, human/JSON output, interactive vs non-interactive behavior, help text, or CLI UX discipline | `skills/cli-developer/SKILL.md` |
| Over-engineering, unnecessary dependency, simplest working diff, YAGNI at implementation time, or Codex implementation-layer minimization discipline | `skills/lancet/SKILL.md` |

## Disambiguation

1. `clarify` stops before mutation when unresolved intent, scope, acceptance, permissions, secret handling, or destructive choices could change the safe result; new handoffs use `.loopx/intake/YYYY-MM-DD-<slug>/` intake package directories. Local implementation choices never trigger `spec`.
2. Documenting what an existing repository currently does is `codebase-spec`, not `spec` or `plan2exec`. `plan2exec` (named to avoid confusion with an agent's built-in Plan mode) writes one lean plan document to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` only for its explicit triggers; clear work without a persistence trigger stays prompt-first.
3. Execution, review, and Git disposition follow the installed working agreement, not a loopx skill: the model implements, verifies with fresh evidence, dispatches an independent host-native reviewer for high-risk diffs, and never performs Git disposition without an explicit user request.
4. `issue` owns issue-driven bug-class intake and diagnosis; feature requests route back to the feature-driven flow. `fix` executes only `.loopx/issues/` ledgers marked `ready_for_fix`.
5. `refactor-plan` plans behavior-preserving refactors only; a refactor that changes external behavior or contracts routes to `clarify` or `spec`.
6. `doc-readability` assesses or rewrites documents (PRDs, requirements, specs, meeting notes, AI-like prose) first; clarified implementation work then routes back through `clarify`, `spec`, or `plan2exec`.
7. `using-git-worktrees` prepares workspace isolation before implementation, but never owns `fix` parallel subagent worktrees.
8. `tdd`, `debug`, `verify`, `using-git-worktrees`, `doc-readability`, `requirement-analyzer`, `plan-reviewer`, `go-style`, `kratos`, `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, and `lancet` are support lenses unless explicitly invoked: `requirement-analyzer` reports requirement gaps without advancing workflow state; `plan-reviewer` audits plan documents read-only without editing or dispatching; the domain lenses add discipline to design, implementation, and review without creating workflow states; `lancet` is implementation/review-only.

## Deterministic Guard

Run this before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
