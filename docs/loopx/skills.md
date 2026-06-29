# loopx Skills Guide

[中文文档](./skills.zh-CN.md)

This guide explains the installed loopx v1 skills and how to use them together. It covers the bundled skills installed by `loopx install-skills`, not every auxiliary source directory in this repository.

## Mental Model

loopx skills fall into two groups:

- Core workflow skills move work through a feature lifecycle: clarify, design when needed, plan, execute, review, fix feedback, and finish.
- Issue-driven workflow skills handle bug-class issues separately: `issue` diagnoses and writes a local ledger, then `fix` executes ready ledgers.
- Support skills add discipline to a specific activity such as testing, debugging, workspace isolation, documentation review, API design, SQL, Go, or CLI behavior. They are lenses, not workflow states.

Use the core workflow for ordinary product or code changes. Add support skills when the task has a specialized risk.

Recommended flow:

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

Issue-driven flow:

```text
issue -> fix -> finish
```

## Core Workflow Skills

| Skill | Use when | Output |
|---|---|---|
| `clarify` | The request is ambiguous, scope is unclear, or decisions/non-goals are missing. | An intake package under `.loopx/intake/YYYY-MM-DD-<slug>/` with `clarification.md`, `requirements.md`, `test-cases.md`, and a route to `spec` or `plan-to-exec`. |
| `spec` | Product behavior, API, data, state, permission, migration, compatibility, boundary scenarios, or architecture decisions must be fixed before planning. | By default, `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/设计提案.md` and `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`. |
| `codebase-spec` | An existing repository, module, or interface needs an evidence-backed current-state specification. | A detailed codebase spec under `docs/loopx/codebase-specs/`. |
| `plan-to-exec` | Requirements or a spec are approved and need executable tasks. | A bite-sized implementation plan under `docs/loopx/plans/`. |
| `subagent-exec` | An approved plan has independent tasks and subagents are available. | Implemented tasks with staged review checkpoints. |
| `exec` | An approved plan should be executed inline or subagents are unavailable. | Sequential implementation with verification and review checkpoints. |
| `review` | A completed task, checkpoint, or major change needs independent code review. | Review findings tied to a git range and requirements. |
| `final-review` | The whole feature is implemented and needs integration, runtime, and test-gap review before finishing. | Final risk review before `finish`. |
| `fix-review` | Concrete review feedback exists and needs technical evaluation or implementation. | One-feedback-item-at-a-time fixes, pushback, or verification. |
| `finish` | Implementation and verification are complete and the user needs a merge, PR, keep, or discard decision. | A completion decision and local finish audit record. |
| `issue` | A bug-class issue needs intake, triage, diagnosis, and a fix brief. | A `.loopx/issues` ledger with diagnosis and handoff status. |
| `fix` | One or more `.loopx/issues` ledgers are marked `ready_for_fix`. | A scoped bug fix with verification, review, and finish handoff. |
| `refactor-plan` | The user wants a behavior-preserving refactor plan with small commits. | A scoped refactor plan; not immediate implementation. |

## Support Skills

| Skill | Use when | Notes |
|---|---|---|
| `tdd` | A feature or bugfix should start with a failing test. | Use before production code when behavior can be tested. |
| `debug` | A bug, failing test, build failure, regression, or unexpected behavior needs root-cause investigation. | Diagnose before changing code. |
| `verify` | The agent is about to claim work is complete, fixed, passing, review-ready, or ready to commit. | Requires fresh command output. |
| `using-git-worktrees` | Implementation work needs an isolated workspace or the user asks for git worktree setup. | Detect existing isolation first; use native worktree tools before git fallback. |
| `doc-readability` | A document, PRD, spec, meeting note, or knowledge-base article is unclear, bloated, or AI-like. | Assess or rewrite the document before treating it as source material. |
| `requirement-analyzer` | Existing requirements need ambiguity, gap, feasibility, traceability, or readiness analysis. | Produces a gap report; does not advance workflow state. |
| `go-style` | Editing or reviewing Go code. | Covers idiomatic Go style, errors, context, naming, tests, and interface boundaries. |
| `kratos` | Working on Go-Kratos services, proto/buf APIs, service/biz/data layers, middleware, auth, or config. | Use with `go-style` when both framework and Go concerns matter. |
| `api-designer` | Designing REST, GraphQL, OpenAPI, resources, pagination, versioning, compatibility, or error models. | Adds API discipline during `spec`, implementation, or review. |
| `architecture-designer` | Decisions involve boundaries, ADRs, NFRs, scalability, failure modes, operability, or technology tradeoffs. | Use during design and final review for system-level risk. |
| `sql-style` | Changing SQL, schemas, indexes, migrations, dialect-specific behavior, or performance-sensitive data access. | Pair with `spec` for schema or migration decisions. |
| `cli-developer` | Designing CLI commands, flags, human/JSON output, errors, interactivity, help text, shell behavior, or cross-platform UX. | Use for CLI product surface changes. |
| `lancet` | Implementation or review work risks over-engineering, avoidable dependencies, extra files, or abstractions that should be deleted. | Codex-only automatic activation in implementation/review stages; manual skill use remains explicit elsewhere. |

## Choosing The Next Skill

Use this routing rule:

1. If the work is unclear, start with `clarify`.
2. If decisions must be fixed before planning, use `spec`; by default it writes both the design proposal and the detailed design under `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`.
3. If the user wants to document the current codebase instead of designing a future change, use `codebase-spec`.
4. If the design is settled and work needs tasks, use `plan-to-exec` with an intake package directory or detailed design doc.
5. If there is an approved plan, use `subagent-exec` for independent work or `exec` for inline execution.
6. If implementation is complete but not reviewed, use `review` or `final-review`.
7. If feedback exists, use `fix-review`.
8. If tests and final review are complete, use `finish`.
9. If the request is a bug-class issue, use `issue`; use `fix` only after the ledger is `ready_for_fix`.

Support skills can be layered onto this path. For example:

- A database feature may go through `clarify -> spec` with `sql-style`, then `plan-to-exec`.
- A public API change may use `api-designer` during `spec` and `review`.
- A risky architecture change should have `spec` produce both `设计提案.md` and `需求设计文档.md` inside `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`.
- A failing test should route to `debug`; a new behavior can route to `tdd` before implementation.
- Implementation that should not touch the current checkout can use `using-git-worktrees` before `exec` or manual edits.
- Codex implementation and review work automatically receives `lancet` guidance when enabled; other agents should invoke `lancet` explicitly when needed.
- A PRD or source document can be checked with `doc-readability` or `requirement-analyzer` before `clarify`.

## Common Examples

Ambiguous feature request:

```text
$clarify add team-level usage limits
```

Design-heavy change:

```text
$spec billing-state-transitions
```

Approved implementation plan:

```text
$plan-to-exec billing-state-transitions
$subagent-exec billing-state-transitions
```

Isolated implementation workspace:

```text
$using-git-worktrees billing-state-transitions
```

Inline execution:

```text
$exec billing-state-transitions
```

Bug investigation:

```text
$debug failing renewal invoice test
```

Issue-driven bug-class workflow:

```text
$issue failing renewal invoice test
$fix .loopx/issues/issue-renewal-invoice-2026-06-23.md
```

Existing codebase documentation:

```text
$codebase-spec src/cli.mjs
```

Document review:

```text
$doc-readability docs/product/usage-limits-prd.md
```

Completion:

```text
$final-review billing-state-transitions
$finish
```

Lancet controls:

```text
$lancet on
$lancet off
$lancet status
```

## Guardrails

- Do not skip `clarify` when scope, non-goals, or decision boundaries are unresolved.
- Do not use `plan-to-exec` to invent missing product or architecture decisions.
- Do not treat support skills as workflow states.
- Do not use `fix` on vague reports; run `issue` first and require `ready_for_fix`.
- Do not claim work is complete without `verify`-style fresh evidence.
- Do not run `finish` before implementation, review, and verification are actually complete.
