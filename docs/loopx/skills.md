# loopx Skills Guide

[中文文档](./skills.zh-CN.md)

The installed product is docs-first. The primary deliverable is the working
agreement installed into host guidance; execution belongs to the model and its
host runtime. Clear bounded work is implemented and freshly verified directly
under that agreement. The optional `exec` skill is a host-native subagent
playbook for an already-ready plan, not a loopx runtime.

## Canonical Workflow Intents

The three canonical workflow intents are optional, produce documents, and do
not form a required sequence.

| Skill | Use when | Output |
|---|---|---|
| `clarify` | Intent, scope, acceptance, permissions, secrets, or a destructive choice is unresolved. | A resolved intake package or a concrete blocker. |
| `spec` | Product behavior, compatibility, data, security, migration, or architecture decisions need durable agreement. | An accepted design document with `D-*` anchors and evidence-backed reuse, isolation, and maintainability decisions. |
| `plan2exec` | The user requests an implementation plan, or approval, interruption recovery, or durable coordination requires one. | One plan document whose slices preserve architecture constraints alongside dependencies, acceptance, and verification. |

Ordinary work can use none of these. `$exec` is selected only to execute one ready
`plan2exec` document; it delegates implementation while the top-level model reviews
and integrates. Independent review, verification, and Git discipline continue to
follow the working agreement.

A selected `plan2exec` plan requires independent host-native `plan-reviewer`
approval before readiness. Keep review evidence in the plan and renew it after
substantive plan/source changes. Without delegation the plan stays blocked;
ordinary prompt-first work remains unaffected. Concurrency design, planning,
review, and SQL share the database concurrency contract.

## Optional Plan Execution

| Skill | Use when | Behavior |
|---|---|---|
| `exec` | The user explicitly asks to execute one ready `plan2exec` document. | Leaf subagents implement slices; the controller rechecks architecture fit, then reviews and integrates sequentially. Independent slices may run in parallel only when their code and state boundaries are disjoint. Optional `model`, `reasoning_effort`, and `max_workers` values are forwarded to host-native subagents. |

## Issue Workflows

`issue` and `fix` remain available without joining a fixed feature path:

```text
$issue <bug-report-or-failing-output>
$fix .loopx/issues/<ready-ledger>.md
```

Start `fix` after the ledger is `ready_for_fix`; resume a recorded `in_progress` repair only after its checkpoint matches the current delta. Feature requests route back
to prompt-first work or a justified canonical intent.

`spec` creates and maintains the overview and detailed design as linked authorities.
`design-review` updates the overview in place, preserving its decisions and review history.
Plans and reviewers follow the detailed design index to overview-owned decisions.

## Support Lenses

Support skills remain directly invocable and composable with canonical intents:

| Skill | Focus |
|---|---|
| `codebase-spec` | Evidence-backed documentation of current behavior. |
| `refactor-plan` | Behavior-preserving RFCs, converted through `plan2exec` before execution. |
| `code-darwin` | Evidence-backed codebase rot and smell audit with a prioritized refactor backlog. |
| `tdd` | Failing-test-first development. |
| `debug` | Root-cause diagnosis. |
| `verify` | Fresh evidence before completion claims. |
| `using-git-worktrees` | Explicit workspace isolation. |
| `humanize-doc` | Readability assessment, document editing, and removing AI-like prose while preserving meaning. |
| `maintain-project-docs` | Repository-wide current authority, archival, and retrieval hygiene. |
| `requirement-analyzer` | Requirement gaps and readiness. |
| `plan-reviewer` | Ad-hoc review of a plan document against its source. |
| `go-style`, `kratos` | Go engineering facade (style, modernization, performance, concurrency) and Go-Kratos discipline. |
| `api-designer`, `architecture-designer`, `sql-style`, `cli-developer` | Domain-specific design and review lenses. |
| `generate-api-docs` | Synchronized field-level Markdown and Apifox-importable OpenAPI YAML for existing HTTP APIs. |
| `lancet` | Implementation and review simplification. |
| `prompt-lint` | Read-only lint of prompt goals, context, boundaries, evidence, and signal quality. |

Support lenses do not create workflow states or replace `clarify`, `spec`, or
`plan2exec`.

## Examples

```text
$clarify add team-level usage limits
$spec billing-state-transitions
$plan2exec docs/loopx/design/2026-07-20-billing/requirements.md
$exec docs/loopx/plans/2026-07-20-billing.md model=gpt-5.6-sol reasoning_effort=high max_workers=4
$prompt-lint "Fix the final partial batch being skipped and add regression coverage."
```

Every completion path requires fresh task-relevant verification under the
installed working agreement. Prompt-first work creates no plan, review report,
or other workflow artifact unless a concrete trigger requires it.
