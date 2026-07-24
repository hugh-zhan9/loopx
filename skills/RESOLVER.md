# loopx Skill Resolver

Governance index for loopx bundled skills. Keep this file in sync with every bundled `skills/<name>/SKILL.md`. It is not installed host guidance or runtime routing authority; normal and plugin installs route from the prompt-first managed guidance block and installed skill frontmatter.

Clear, bounded work stays prompt-first: inspect, implement, verify with fresh evidence, apply the quiet completion check in `skills/shared/completion-check.md`, and report without selecting a workflow skill or creating workflow artifacts. A local defect or small feature is not, by itself, a workflow trigger. Governed escalation requires a concrete ambiguity, risk, recovery, coordination, or explicit user intent reason.

Current contract: pre-v2 running workflow state is unsupported and must restart.
Only the top-level controller owns agent lifecycle; every dispatched worker is
a leaf worker and must not spawn, delegate to, or wait for other agents.

## Canonical Workflow Intents

| Trigger | Skill |
|---|---|
| Unresolved intent, scope, acceptance, permission, secret handling, or destructive choice that must be settled before mutation | `skills/clarify/SKILL.md` |
| Unresolved compatibility, migration, public behavior, data, security, or cross-module architecture decision | `skills/spec/SKILL.md` |
| Explicit planning, an approval boundary, interruption recovery, or durable coordination needs one lean persistent plan | `skills/plan2exec/SKILL.md` |
| A clear request or persistent plan should be implemented with automatic inline, delegated-serial, or parallel-strict profile selection | `skills/exec/SKILL.md` |
| Explicit review intent or concrete security, destructive, public compatibility, cross-task interaction, or conflict-reconciliation evidence requires independent review | `skills/review/SKILL.md` |
| User explicitly invokes `$finish`, or requests Git disposition for work completed by the active loopx `exec` or `fix` run | `skills/finish/SKILL.md` |

## Execution Profiles

`exec` is the automatic canonical entry. These profiles may also be invoked
explicitly; they reuse the exec-owned controller, state, Git, and review
contracts rather than forming separate workflow intents.

| Trigger | Profile skill |
|---|---|
| Explicitly require fresh implementers in stable graph order with mandatory independent task review | `skills/subagent-exec/SKILL.md` |
| Explicitly request strict parallel admission for a validated graph with at least two independent ready slices | `skills/parallel-subagent-exec/SKILL.md` |

## Retained Specialized Workflows

| Trigger | Skill |
|---|---|
| Existing codebase, module, or interface needs a detailed evidence-backed current-state specification | `skills/codebase-spec/SKILL.md` |
| Issue-driven bug-class intake, diagnosis, local ledger creation, or fix brief preparation | `skills/issue/SKILL.md` |
| Issue-driven bug fix execution from `.loopx/issues/*.md` ledgers with `ready_for_fix` status | `skills/fix/SKILL.md` |
| Refactor request needs interview, tiny commits, behavior-preserving scope, and RFC/issue output | `skills/refactor-plan/SKILL.md` |

## Explicit Review Intent Entries

| Explicit invocation only | Intent |
|---|---|
| `skills/final-review/SKILL.md` | Whole-feature review through `review` after all planned tasks complete |
| `skills/fix-review/SKILL.md` | Actively resolve existing findings through `review`, optionally with one independent fixer wave |

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

## Triage

The workflow hooks inject these tiers every turn. This list and
`TRIAGE_TIERS` in `src/workflow-state.mjs` must stay line-identical; the
deterministic guard fails on drift. Every criterion is an observable
condition, never a complexity feeling.

- light: one clear bounded outcome -> stay prompt-first (implement, fresh verification, quiet completion check; no workflow artifacts).
- medium: clear multi-outcome request -> $exec with a temporary graph; no persistent plan without an explicit trigger.
- heavy: unresolved intent/scope/acceptance -> $clarify; unresolved public behavior, compatibility, data, security, or cross-module decision -> $spec; explicit plan request, approval boundary, recovery, or durable coordination -> $plan2exec.
- when triage is uncertain, that uncertainty is itself a clarify trigger; conflicting signals pick the heavier tier.

Local defects and small features are light-tier by default: implementation
or verification being required never selects a workflow skill by itself.

## Disambiguation

1. `clarify` stops before mutation when unresolved intent, scope, acceptance, permissions, secret handling, or destructive choices could change the safe result; new handoffs use `.loopx/intake/YYYY-MM-DD-<slug>/` intake package directories. Local implementation choices never trigger `spec`.
2. Documenting what an existing repository currently does is `codebase-spec`, not `spec` or `plan2exec`. `plan2exec` (named to avoid confusion with an agent's built-in Plan mode) writes one lean plan to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md` only for its heavy-tier triggers; clear work without a persistence trigger stays prompt-first.
3. `exec` accepts a clear request or persistent plan and owns automatic profile selection: prompt-first work may stay inline, planned work defaults to delegated serial, and parallel strict requires a proved ready frontier of at least two. `subagent-exec` and `parallel-subagent-exec` are explicit entry points into the same exec controller; runtime may safely narrow parallel to delegated serial, but planned work never silently narrows to inline.
4. Every completed execution receives a controller-owned integration check and the quiet completion check from `skills/shared/completion-check.md`. Review selection, severity, and closure follow `skills/shared/review-contract.md`: delegated profiles require independent task review for every implementation or fix candidate plus final Spec and Standards review; inline execution uses `review` only for explicit review intent or concrete security, destructive, public compatibility, interaction, or reconciliation evidence; Critical and Important findings are fixed or answered with evidence, freshly verified, and independently re-reviewed in the active execution context.
5. `final-review` and `fix-review` are permanent explicit-only review intent entries into `review`: `final-review` reviews the integrated whole feature after all planned tasks complete; `fix-review` actively resolves existing findings and may dispatch one independent fixer wave. Neither creates legacy report or ledger artifacts.
6. `finish` requires an explicit `$finish` invocation or Git disposition for work completed by the active loopx `exec` or `fix` run. Standalone Git requests remain ordinary Git work, and finish carries no review-report, extraction-candidate, audit-artifact, or additional persisted-state precondition.
7. `issue` owns issue-driven bug-class intake and diagnosis; feature requests route back to the feature-driven flow. `fix` executes only `.loopx/issues/` ledgers marked `ready_for_fix`.
8. `refactor-plan` plans behavior-preserving refactors only; a refactor that changes external behavior or contracts routes to `clarify` or `spec`.
9. `doc-readability` assesses or rewrites documents (PRDs, requirements, specs, meeting notes, AI-like prose) first; clarified implementation work then routes back through `clarify`, `spec`, or `plan2exec`.
10. `using-git-worktrees` prepares workspace isolation before implementation, but never owns `fix` parallel subagent worktrees or `finish` branch placement.
11. `tdd`, `debug`, `verify`, `using-git-worktrees`, `doc-readability`, `requirement-analyzer`, `plan-reviewer`, `go-style`, `kratos`, `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, and `lancet` are support lenses unless explicitly invoked: `requirement-analyzer` reports requirement gaps without advancing workflow state; `plan-reviewer` audits source coverage, the authoritative execution graph, dependency and isolation claims, structural profile, evidence, and review focus without editing the plan, dispatching execution, or advancing state; the domain lenses add discipline to `spec`, `exec`, and `review` without replacing workflow skills or creating workflow states; `lancet` is implementation/review-only, activating in `exec`, `review`, and `fix`, while planning stages may only note downstream activation.

## Deterministic Guard

Run this before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
