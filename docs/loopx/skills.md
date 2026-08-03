# loopx Skills Guide

[中文文档](./skills.zh-CN.md)

The installed product is docs-first. The primary deliverable is the working
agreement installed into host guidance; execution belongs to the model and its
host runtime. Clear bounded work is implemented and freshly verified directly
under that agreement. The document-producing skills below add governance only
when ambiguity, durable decisions, or coordination justify it.

## Canonical Workflow Intents

The three canonical workflow intents are optional, produce documents, and do
not form a required sequence.

| Skill | Use when | Output |
|---|---|---|
| `clarify` | Intent, scope, acceptance, permissions, secrets, or a destructive choice is unresolved. | A resolved intake package or a concrete blocker. |
| `spec` | Product behavior, compatibility, data, security, migration, or architecture decisions need durable agreement. | An accepted design document with `D-*` anchors. |
| `plan2exec` | The user requests an implementation plan, or approval, interruption recovery, or durable coordination requires one. | One plan document with coherent slices, dependencies, acceptance, and verification, executed by the agent itself. |

Ordinary work can use none of these. Execution, independent review of
high-risk diffs, verification, and Git discipline are working-agreement
clauses, not skills.

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
| `humanize-doc` | Rewrite discipline for AI-generated documents. |
| `maintain-project-docs` | Repository-wide current authority, archival, and retrieval hygiene. |
| `requirement-analyzer` | Requirement gaps and readiness. |
| `plan-reviewer` | Ad-hoc review of a plan document against its source. |
| `go-style`, `kratos` | Go and Go-Kratos discipline. |
| `api-designer`, `architecture-designer`, `sql-style`, `cli-developer` | Domain-specific design and review lenses. |
| `lancet` | Implementation and review simplification. |

Support lenses do not create workflow states or replace `clarify`, `spec`, or
`plan2exec`.

## Examples

```text
$clarify add team-level usage limits
$spec billing-state-transitions
$plan2exec docs/loopx/design/2026-07-20-billing/requirements.md
```

Every completion path requires fresh task-relevant verification under the
installed working agreement. Prompt-first work creates no plan, review report,
or other workflow artifact unless a concrete trigger requires it.
