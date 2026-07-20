# loopx Skills Guide

[中文文档](./skills.zh-CN.md)

The installed product is prompt-first. Clear bounded work is implemented and
freshly verified directly. Workflow skills add governance only when ambiguity,
risk, recovery, coordination, or explicit user intent justifies it.

## Canonical Workflow Intents

The six canonical workflow intents are optional and do not form a required
sequence.

| Skill | Use when | Output |
|---|---|---|
| `clarify` | Intent, scope, acceptance, permissions, secrets, or a destructive choice is unresolved. | A resolved intake package or a concrete blocker. |
| `spec` | Product behavior, compatibility, data, security, migration, or architecture decisions need durable agreement. | An accepted design contract. |
| `plan` | The user requests a plan, or approval, interruption recovery, or durable coordination requires one. | One lean plan with outcomes, boundaries, dependencies, acceptance, and verification. |
| `exec` | A clear request or lean plan needs adaptive execution. | Serial or isolated concurrent implementation with fresh verification. |
| `review` | The user requests review, or security, destructive behavior, public compatibility, cross-task interaction, or conflict reconciliation requires independence. | Evidence-backed findings and closure for blocking issues. |
| `finish` | The user explicitly requests commit or branch placement, merge, pull request, keep, cleanup, or discard. | The requested Git disposition. |

Ordinary work can use none of these. `finish` is not a completion ceremony and
does not perform verification, independent review, or knowledge extraction.

## Compatibility Aliases

For one release, these explicit-only compatibility aliases remain installed but
are excluded from automatic routing:

| Alias | Forwards to |
|---|---|
| `plan-to-exec` | `plan` |
| `subagent-exec` | `exec` |
| `parallel-subagent-exec` | `exec` |
| `final-review` | `review` |
| `fix-review` | `review` |

Aliases preserve the same input and explicit intent. They do not restore legacy
plan schemas, execution-mode selection, scheduler state, mandatory review
reports, feedback ledgers, or finish gates.

## Issue Workflows

`issue` and `fix` remain available without joining a fixed feature path:

```text
$issue <bug-report-or-failing-output>
$fix .loopx/issues/<ready-ledger>.md
```

Use `fix` only after the ledger is `ready_for_fix`. Feature requests route back
to prompt-first work or a justified canonical intent.

## Support Lenses

Support skills remain directly invocable and composable with canonical intents:

| Skill | Focus |
|---|---|
| `codebase-spec` | Evidence-backed documentation of current behavior. |
| `refactor-plan` | Behavior-preserving refactor planning. |
| `tdd` | Failing-test-first development. |
| `debug` | Root-cause diagnosis. |
| `verify` | Fresh evidence before completion claims. |
| `using-git-worktrees` | Explicit workspace isolation. |
| `doc-readability` | Document clarity and rewriting. |
| `requirement-analyzer` | Requirement gaps and readiness. |
| `plan-reviewer` | Ad-hoc review of a lean plan against its source. |
| `go-style`, `kratos` | Go and Go-Kratos discipline. |
| `api-designer`, `architecture-designer`, `sql-style`, `cli-developer` | Domain-specific design and review lenses. |
| `lancet` | Implementation and review simplification. |

Support lenses do not create workflow states or replace `clarify`, `spec`,
`plan`, `exec`, `review`, or `finish`.

## Examples

```text
$clarify add team-level usage limits
$spec billing-state-transitions
$plan docs/loopx/design/2026-07-20-billing/requirements.md
$exec docs/loopx/plans/2026-07-20-billing.md
$review HEAD~1
$finish commit this change
```

Every completion path requires fresh task-relevant verification. Only the
top-level controller owns agent lifecycle; implementers, reviewers, and fixers
are leaf workers. Prompt-first work creates no plan, review report, finish
record, or other workflow artifact unless a concrete trigger requires it.
