---
name: spec
description: "Writes software design specs from already-clarified requirements, including solution approach, architecture outline, detailed design, tradeoffs, verification design, and handoff context. Not for unresolved requirements, PRD generation, implementation task planning, or code changes."
when_to_use: "spec, design spec, technical design, design proposal, detailed design, architecture design, 设计方案, 概要设计, 详细设计, 技术方案"
metadata:
  version: "0.3.7"
---

# loopx Spec

Turn clarified requirements into design documents. Do not invent missing requirements. Do not write an implementation plan. Do not change code.

## Inputs

## Repo Specs And Memory Context

Before using this skill in a repository, inspect loopx long-lived context when it exists:

- If `docs/loopx/specs/` exists, inspect the directory names and filenames. If `docs/loopx/specs/index.md` exists, use it as a map, but do not require it. Read only specs relevant to the requested domain, affected files, workflow behavior, or named source document.
- If `.loopx/memory/MEMORY.md` exists, read it as curated project memory before deciding what is already known.
- If `.loopx/memory/index.jsonl` exists, use it only as a retrieval index for relevant active memory cards; do not treat it as an append-only log.
- Treat current user instructions and the named source document as highest priority, `docs/loopx/specs/` as binding long-lived repo rules, and `.loopx/memory/` as advisory context. Priority order: current user instruction, source document, repo specs, memory. Memory is advisory and must not override current task instructions, approved source docs, or repo specs.

Do not read every file under `docs/loopx/specs/` by default. Prefer relevant specs selected by filename, title, frontmatter such as `applies_to`, or the files/domains involved in the task.

Use the user's PRD, external requirements document, approved `clarify` output, or intake package directory as the source of truth.

The source may be an intake package directory:

- `.loopx/intake/YYYY-MM-DD-<slug>/`

When the source is an intake package directory, read:

1. `requirements.md` as the requirement contract.
2. `test-cases.md` as requirement-stage acceptance/integration scenarios.
3. `clarification.md` only as process evidence and exact user wording.

If `requirements.md` and `test-cases.md` disagree about `AC-*`, stop and route back to `clarify`.

Legacy `.loopx/intake/clarify-*.md` clarify bundles remain readable compatibility inputs. Do not migrate or rewrite them; use the package directory contract for new `clarify` output.

Before writing, inspect relevant code and docs when the task touches an existing system. If a design question can be answered from the repo, answer it from evidence. If a material requirement, constraint, owner decision, or product behavior is still unclear, stop and route back to `clarify`.

## Core Loop

Write the design as a decision document, not a task list.

The design document should make requirements, non-goals, decision boundaries, intake package source, and planning handoff easy to anchor. Keep those items explicit, stable, and scoped so downstream `plan-to-exec` can preserve coverage without re-interpreting the source.

Default to producing two documents:

1. `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/设计提案.md`
2. `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`

Derive `<kebab-slug>` from the clarified requirement title or the user's own wording. Use a stable terminal-friendly kebab-case slug instead of raw Chinese text in the directory name. Keep the file names fixed as `设计提案.md` and `需求设计文档.md`.

Do not migrate existing historical design files. The new dated directory layout applies to new `spec` outputs only.

Only produce one document when the user explicitly asks for proposal-only or detailed-design-only output, or when unresolved material questions make the detailed design unsafe to write. Do not ask the user to choose an output mode by default.

For the design proposal, read `references/design-proposal.md` and use it as the required structure. The proposal answers why this approach, which alternatives were rejected, and what compatibility or migration costs are accepted.

For the detailed design, use [DESIGN_SPEC_TEMPLATE.md](DESIGN_SPEC_TEMPLATE.md) as the required output structure. Keep the section order. If a section does not apply, write `无` or `不涉及` with a short reason instead of deleting it.

The detailed design must reference the design proposal and treat accepted proposal decisions as constraints. Do not re-litigate the direction in the detailed design; put unresolved direction questions back in the proposal and stop before planning if they block implementation.

## Design Contract Anchors

`spec` remains a human-reviewed design document generator. `D-*` design anchors add traceability; they do not replace narrative context, tradeoffs, rationale, boundary scenarios, or the required detailed design template.

For detailed designs with implementation-relevant decisions, assign stable `D-*` anchors such as `D-001`, `D-002`, and `D-003`. A decision is implementation-relevant when it affects behavior, API, data, state, CLI, permissions, compatibility, rollout, operations, downstream planning, or review.

Each design contract entry should name:

- `D-*` anchor
- Source AC, when an `AC-*` exists
- Contract type, such as behavior, data, state, CLI, compatibility, operations, or workflow contract
- Decision
- Boundary or non-goal
- Downstream expectation for `plan-to-exec` or `review`

Place each `D-*` anchor inline beside the relevant decision in the main design body, then include a final complete index table in the detailed design. The inline anchor keeps the design readable in context; the index table gives downstream skills one lookup surface.

Proposal-only, research-only, explanatory, or no-implementation-output designs may write `Design anchors: not applicable` with a short reason. Do not invent fake anchors for documents without implementation-relevant decisions.

## Support Lens Activation

Before writing the proposal or detailed design, identify support lenses that apply. Read only the triggered support skill files and use them as design checklists; do not let them replace `spec`.

| Trigger in requirement or repo evidence | Use support lens |
|---|---|
| REST, GraphQL, OpenAPI, resources, pagination, API errors, versioning, or client compatibility | `api-designer` |
| System boundaries, ADRs, NFRs, scalability, failure modes, operability, deployment topology, or technology tradeoffs | `architecture-designer` |
| SQL, schema, migration, indexes, query plans, persistence semantics, backfills, or database performance | `sql-style` |
| CLI commands, flags, stdout/stderr, `--json`, exit codes, help text, prompts, shell behavior, or cross-platform terminal UX | `cli-developer` |
| Go files, Go tests, errors, context, interfaces, goroutines, or idiomatic Go behavior | `go-style` |
| Go-Kratos proto/buf APIs, service/biz/data layers, middleware, auth, config, or Kratos troubleshooting | `kratos` |

Record triggered support lenses in the design proposal and detailed design. If no support lens applies, state `Support lenses: none` so downstream planning does not guess.

Support lenses inform the unified design document. They must not create separate authoritative contract files that `plan-to-exec`, `review`, or implementers need to reconcile. Fold lens-specific conclusions into the proposal, detailed design sections, boundary scenarios, verification strategy, or `D-*` entries.

Cover:

- problem framing and design goals
- explicit non-goals and decision boundaries
- system context and affected modules
- proposed solution
- boundary scenarios where the solution starts, stops, degrades, rejects input, or preserves existing behavior
- alternatives considered and why rejected
- data model, state model, and contracts
- key flows and edge cases
- failure modes, rollback, migration, and compatibility
- security, privacy, performance, and operational concerns when relevant
- testing and verification strategy
- triggered support lenses and the design checks they add
- open risks that do not block planning

For brownfield work, distinguish repo evidence from inference.

When the source is an intake package directory, the detailed design must reference the intake package path and its `requirements.md` and `test-cases.md` files. The verification strategy must preserve `TC-*` coverage by mapping requirement-stage acceptance/integration scenarios to design-level test strategy, manual checks, or deferred-with-rationale items. If the detailed design also contains `D-*` anchors, the verification strategy should make the `AC-* -> D-* -> TC-*` relationship visible where that helps downstream planning.

## Output

Write Markdown by default:

- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/设计提案.md`
- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`

If the user asks for a presentable document or visual review artifact, also write:

- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/设计提案.html`
- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.html`

The detailed Markdown spec must include these sections:

- `# <项目/功能>设计文档`
- `一、修订历史`
- `二、需求信息`
- `三、概要设计`
- `四、详细设计`
- `五、存储类设计`
- `六、其他组件设计`
- `七、接口设计`
- `八、系统发布`
- `九、系统监控与维护`
- `十、排期与规划`
- `十一、QA`

The `十、排期与规划` section must include a `Planning Handoff` subsection stating what `plan-to-exec` may decide without re-opening design and what must return to `clarify` or `spec`.

The design proposal and detailed design must both cover boundary scenarios. Include normal boundaries, invalid inputs, permission failures, duplicate or repeated actions, concurrency races, partial failures, dependency timeouts, legacy data, migration overlap, rollback, and unchanged behavior where relevant. If a category does not apply, say why instead of omitting it.

For detailed designs with `D-*` anchors, include a `Design Contract Index / D-*` subsection under `十一、QA` or an equivalent final QA subsection. The index table must list every `D-*` anchor used in the document:

| D anchor | Source AC | Contract type | Decision summary | Boundary / non-goal | Downstream expectation |
|---|---|---|---|---|---|
| `D-001` | `AC-001` or `not_applicable` | `workflow contract` | `<short decision>` | `<where the decision stops applying>` | `<what plan/review must preserve>` |

If design anchors are not applicable, include `Design anchors: not applicable` with a short reason instead of the table.

## Handoff

If only the design proposal is complete, ask for review of the proposal before writing a detailed design or planning work.

After the detailed spec is complete, recommend:

```text
$plan-to-exec docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
```

Use `plan-to-exec` only after the design document is internally consistent and all material requirements questions are resolved.
