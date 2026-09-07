# loopx Skill Resolver

Governance index for loopx bundled skills. Keep this file in sync with every
bundled `skills/<name>/SKILL.md`. It is not installed host guidance or runtime
routing authority; installs route from the managed working-agreement block and
installed skill frontmatter.

loopx v0.8 is docs-first: the primary deliverable is the working agreement
(`templates/working-agreement.md`) installed into host guidance, plus the
document-producing skills below. Execution still belongs to the model and its host
runtime; `$exec` is an optional host-native subagent playbook, not a loopx runtime,
review pipeline, or per-turn hook. Clear, bounded work stays prompt-first under the working agreement:
inspect existing architecture and reuse points, implement, verify with fresh evidence, apply the quiet completion
check in `skills/shared/completion-check.md`, and report without creating
workflow artifacts.

## Canonical Workflow Intents

| Trigger | Skill |
|---|---|
| Unresolved intent, scope, acceptance, permission, secret handling, or destructive choice that must be settled before mutation | `skills/clarify/SKILL.md` |
| Unresolved compatibility, migration, public behavior, data, security, reuse, isolation, maintainability, or cross-module architecture decision | `skills/spec/SKILL.md` |
| A completed design needs mixed-audience review before planning: prepare or update the maintained 概要设计 (what/how/what-changes), run the review, apply resolutions to their owning sections and update the detailed design index | `skills/design-review/SKILL.md` |
| Explicit planning, an approval boundary, interruption recovery, or durable coordination needs one lean plan document | `skills/plan2exec/SKILL.md` |

## Optional Plan Execution

| Trigger | Skill |
|---|---|
| The user explicitly asks to execute one ready `plan2exec` plan through leaf subagents, with safe parallelism and controller-owned review and integration | `skills/exec/SKILL.md` |

## Retained Specialized Workflows

| Trigger | Skill |
|---|---|
| Existing codebase, module, or interface needs a detailed evidence-backed current-state specification | `skills/codebase-spec/SKILL.md` |
| Issue-driven bug-class intake, diagnosis, local ledger creation, or fix brief preparation | `skills/issue/SKILL.md` |
| Issue-driven bug fix execution from ready `.loopx/issues/*.md` ledgers or recorded in-progress repairs | `skills/fix/SKILL.md` |
| Refactor request needs interview, small verifiable steps, behavior-preserving scope, and RFC output for plan2exec | `skills/refactor-plan/SKILL.md` |

## Support Skills

| Trigger | Skill |
|---|---|
| Repository needs an evidence-backed code-rot, smell, coupling, or complexity audit with a prioritized refactor backlog | `skills/code-darwin/SKILL.md` |
| Feature or bugfix implementation should be covered by a failing test first | `skills/tdd/SKILL.md` |
| Bug, test failure, build failure, regression, unexpected behavior, root-cause investigation | `skills/debug/SKILL.md` |
| Completion, fixed, passing, review-ready, commit, or handoff claims need fresh evidence | `skills/verify/SKILL.md` |
| Implementation work needs an isolated workspace, existing isolation must be detected, or git worktree setup is requested | `skills/using-git-worktrees/SKILL.md` |
| Document readability, PRD assessment, requirements gaps, unclear viewpoint, AI-like prose, or document rewriting | `skills/doc-readability/SKILL.md` |
| Rewriting an AI-generated or AI-assisted document into plain, decision-first, fabrication-free prose | `skills/humanize-doc/SKILL.md` |
| Repository docs contain stale or conflicting decisions, dated duplicates, superseded process material, or unclear current authority | `skills/maintain-project-docs/SKILL.md` |
| Existing requirement, PRD, spec, or feature brief needs ambiguity, gap, impact, feasibility, or readiness analysis | `skills/requirement-analyzer/SKILL.md` |
| Lean plan source coverage, scope drift, dependency, acceptance, or verification audit | `skills/plan-reviewer/SKILL.md` |
| Go implementation or review, idiom modernization, performance analysis, or concurrency correctness | `skills/go-style/SKILL.md` |
| Go-Kratos proto, service, biz, data, middleware, auth, config, or troubleshooting | `skills/kratos/SKILL.md` |
| REST/GraphQL API design, resource modeling, OpenAPI, pagination, versioning, or API error model discipline | `skills/api-designer/SKILL.md` |
| Existing HTTP APIs need synchronized field-level Markdown documentation and an Apifox-importable OpenAPI YAML contract | `skills/generate-api-docs/SKILL.md` |
| Architecture conformance, reuse, ownership, isolation, maintainability, ADRs, NFRs, failure modes, or technology tradeoff discipline | `skills/architecture-designer/SKILL.md` |
| SQL queries, schema changes, indexes, migrations, database dialects, or query performance discipline | `skills/sql-style/SKILL.md` |
| CLI command design, flags, human/JSON output, interactive vs non-interactive behavior, help text, or CLI UX discipline | `skills/cli-developer/SKILL.md` |
| Over-engineering, unnecessary dependency, simplest working diff, YAGNI at implementation time, or Codex implementation-layer minimization discipline | `skills/lancet/SKILL.md` |
| A prompt or task brief needs a read-only lint of goal clarity, necessary context, boundaries, verifiable evidence, or signal quality before execution | `skills/prompt-lint/SKILL.md` |

## Disambiguation

1. `clarify` stops before mutation when unresolved intent, scope, acceptance, permissions, secret handling, or destructive choices could change the safe result; new handoffs use `.loopx/intake/YYYY-MM-DD-<slug>/` intake package directories. Local implementation choices never trigger `spec`.
2. Documenting what an existing repository currently does is `codebase-spec`, not `spec` or `plan2exec`. `plan2exec` (named to avoid confusion with an agent's built-in Plan mode) writes one lean plan document to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` only for its explicit triggers; clear work without a persistence trigger stays prompt-first.
3. Ordinary execution, review, and Git disposition follow the installed working agreement. `$exec` is used only for an explicitly selected ready `plan2exec` document; it delegates implementation to host-native leaf subagents while the top-level model reviews and integrates. Git disposition still requires an explicit user request.
4. `issue` owns issue-driven bug-class intake and diagnosis; feature requests route back to the feature-driven flow. `fix` starts from `ready_for_fix` ledgers and resumes recorded `in_progress` repairs only after verifying the exact checkpoint delta.
5. `refactor-plan` produces a behavior-preserving RFC that must go through `plan2exec` before `plan-reviewer` or `exec`; a refactor that changes external behavior or contracts routes to `clarify` or `spec`.
6. `code-darwin` audits code health and proposes a prioritized backlog; it does not replace `codebase-spec` for reverse specifications, `refactor-plan` for approved cleanup planning, or `architecture-designer` for deeper interface design. Default mode is read-only.
7. `doc-readability` assesses or rewrites documents (PRDs, requirements, specs, meeting notes, AI-like prose) first; clarified implementation work then routes back through `clarify`, `spec`, or `plan2exec`.
8. `humanize-doc` is the rewrite discipline for AI-generated or AI-assisted drafts: plain language with domain terms and decision status preserved, no invented facts, substantive deletions recorded, and diagrams matched to source decisions. Assessment-only requests stay with `doc-readability`; a common sequence is a `humanize-doc` rewrite followed by a `doc-readability` final assessment.
9. `maintain-project-docs` manages repository-wide document authority and lifecycle. It does not replace `doc-readability` for prose, `codebase-spec` for reverse specifications, `spec` for unresolved future decisions, or `plan2exec` for implementation planning.
10. `using-git-worktrees` prepares workspace isolation before implementation, but never owns `fix` parallel subagent worktrees.
11. The high-level design layer lives in exactly one place: `spec` creates and maintains 概要设计.md for designs passing the review gate. `design-review` reads and updates that authority in place, preserving its unique decisions and history. The detailed design links to it and indexes its anchors; migrate existing 3.2-3.5 content before replacing those sections with a pointer.
11. `tdd`, `debug`, `verify`, `using-git-worktrees`, `doc-readability`, `humanize-doc`, `maintain-project-docs`, `requirement-analyzer`, `plan-reviewer`, `code-darwin`, `go-style`, `kratos`, `api-designer`, `generate-api-docs`, `architecture-designer`, `sql-style`, `cli-developer`, `lancet`, and `prompt-lint` are support lenses unless explicitly invoked: `maintain-project-docs` updates document authority without creating workflow state; `requirement-analyzer` reports requirement gaps without advancing workflow state; `plan-reviewer` audits plan documents read-only without editing or dispatching; `code-darwin` audits rot and smells without creating workflow state; `generate-api-docs` records current HTTP contracts without designing new APIs or changing code; `prompt-lint` evaluates an instruction without executing it or inventing missing facts; the domain lenses add discipline to design, implementation, and review without creating workflow states; `lancet` is implementation/review-only.

## Deterministic Guard

Run this before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
