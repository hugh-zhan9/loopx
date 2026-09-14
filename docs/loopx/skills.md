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
| `spec` | Product behavior, compatibility, data, security, migration, or architecture decisions need durable agreement, or an existing design needs review. | A design document with explicit decision status with `D-*` anchors and evidence-backed reuse, isolation, and maintainability decisions. |
| `plan2exec` | The user requests an implementation plan, or approval, interruption recovery, or durable coordination requires one, or an existing plan needs review. | One plan document whose slices preserve architecture constraints alongside dependencies, acceptance, and verification. |

Ordinary work can use none of these. `$exec` is selected only to execute one ready
`plan2exec` document; it delegates implementation while the top-level model reviews
and integrates. Independent review, verification, and Git discipline continue to
follow the working agreement.

Plan review is included in `plan2exec`. Ordinary plans need an author check;
independent review applies to an explicit request or a concrete risk involving
destructive changes, public compatibility, security, migration ordering, or shared
resources. Formatting does not block work. After the initial review, recheck fixes
and affected decisions. Completed implementations are checked against their source
and actual verification, without restarting a readiness review.

`clarify` and `spec` now use the former v2 implementations under their existing
names. There are 21 bundled skills; review no longer has separate entries. Refactoring audits formerly exposed as
`code-darwin` are part of `refactor-plan`. Verification follows the working
agreement and shared evidence guidance; there is no separate `verify` entry.

## Optional Plan Execution

| Skill | Use when | Behavior |
|---|---|---|
| `exec` | The user explicitly asks to execute one ready `plan2exec` document. | Leaf subagents implement slices; the controller rechecks architecture fit, then reviews and integrates sequentially. Independent slices may run in parallel only when their code and state boundaries are disjoint. Optional `model`, `reasoning_effort`, and `max_workers` values are forwarded to host-native subagents. |

## Diagnosis And Repair

Use `debug` for both diagnosis and requested repairs:

```text
$debug Investigate this failure; do not change code.
$debug Fix this regression and run the required checks.
$debug Continue the authorized repair in .loopx/issues/<ledger>.md
```

It replaces the `issue` and `fix` entries. Ordinary work needs no new ledger.
A supplied ledger retains its approved scope, evidence and recovery checks;
its status alone does not authorize code changes. For an interrupted repair,
check the current contents against the recorded checkpoint before continuing.

## Design documents and requirements

`clarify` updates the existing requirement source when possible; question history
is optional. For a new intake, `requirements.md` owns acceptance and scenarios.
`spec` keeps `概要设计.md` for the overall solution, flows and modules, and
`需求设计文档.md` for interfaces, fields and implementation constraints. Material
public, data, state-machine or cross-system designs and stakeholder reviews use
both; small local corrections need no full templates. An overview may briefly explain necessary rationale. Detail describes the current
implementation design, without mandatory alternatives or discussion history.
Accepted review changes update the design. There is no default separate
`设计提案.md`. Existing overview-only decisions and history remain maintained
authority and must be read before updates.

An approved design or refactor proposal can guide authorized implementation
directly. A plan records implementation work, dependencies and verification only;
it cannot redefine the requirement. Implementation and final checks read the
original source as well as downstream documents. Matching AC/D/TC IDs is not proof
of coverage, and a required scenario cannot be deferred without explicit approval.

## Support Lenses

Support skills remain directly invocable and composable with canonical intents:

| Skill | Focus |
|---|---|
| `codebase-spec` | Current behavior documented at the requested scope, preferably by updating existing documentation. |
| `refactor-plan` | Optional code audits and independent refactor proposals; audit-only requests end with findings, and approved proposals can guide authorized implementation directly. |
| `tdd` | Failing-test-first development. |
| `debug` | Failure diagnosis and requested repair. |
| `using-git-worktrees` | Explicit workspace isolation. |
| `humanize-doc` | Readability assessment, document editing, and removing AI-like prose while preserving meaning. |
| `maintain-project-docs` | Repository-wide current authority, archival, and retrieval hygiene. |
| `requirement-analyzer` | Requirement gaps and readiness. |
| `go-style`, `kratos` | Go engineering facade (style, modernization, performance, concurrency) and Go-Kratos discipline. |
| `api-designer`, `architecture-designer`, `sql-style`, `cli-developer` | Domain-specific design and review lenses. |
| `generate-api-docs` | Separate Markdown call descriptions for each business scenario, including repeated routes, scenario parameters, and complete field descriptions; OpenAPI YAML only on explicit request. Examples require actual calls with real scenario inputs; any untestable scenario blocks generation and delivery. Applies `lancet` and then `humanize-doc` before final validation. |
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
