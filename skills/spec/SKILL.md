---
name: spec
description: "Writes software design specs from already-clarified requirements, including solution approach, architecture outline, detailed design, tradeoffs, verification design, and handoff context. Not for unresolved requirements, PRD generation, implementation task planning, or code changes."
when_to_use: "spec, design spec, technical design, design proposal, detailed design, architecture design, 设计方案, 概要设计, 详细设计, 技术方案"
metadata:
  version: "0.3.1"
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

Use the user's PRD, external requirements document, or approved `clarify` output as the source of truth.

Before writing, inspect relevant code and docs when the task touches an existing system. If a design question can be answered from the repo, answer it from evidence. If a material requirement, constraint, owner decision, or product behavior is still unclear, stop and route back to `clarify`.

## Core Loop

Write the design as a decision document, not a task list.

The design document should make requirements, non-goals, decision boundaries, and planning handoff easy to anchor. Keep those items explicit, stable, and scoped so downstream `plan-to-exec` can preserve coverage without re-interpreting the source.

Use [DESIGN_SPEC_TEMPLATE.md](DESIGN_SPEC_TEMPLATE.md) as the required output structure. Keep the section order. If a section does not apply, write `无` or `不涉及` with a short reason instead of deleting it.

Cover:

- problem framing and design goals
- explicit non-goals and decision boundaries
- system context and affected modules
- proposed solution
- alternatives considered and why rejected
- data model, state model, and contracts
- key flows and edge cases
- failure modes, rollback, migration, and compatibility
- security, privacy, performance, and operational concerns when relevant
- testing and verification strategy
- open risks that do not block planning

For brownfield work, distinguish repo evidence from inference.

## Output

Write Markdown by default. Derive `<需求名>` from the clarified requirement title or the user's own wording, not from an opaque slug:

- `docs/loopx/design/<需求名>需求设计文档.md`

If the user asks for a presentable document or visual review artifact, also write:

- `docs/loopx/design/<需求名>需求设计文档.html`

The Markdown spec must include these sections:

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

## Handoff

After the spec is complete, recommend:

```text
$plan-to-exec docs/loopx/design/<需求名>需求设计文档.md
```

Use `plan-to-exec` only after the design document is internally consistent and all material requirements questions are resolved.
