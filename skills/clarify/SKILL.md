---
name: clarify
description: "Grills ambiguous loopx work until material questions are answered, then routes to spec or plan-to-exec using a design gate. Not for clear implementation tasks, approved specs, or code changes."
when_to_use: "clarify, requirements, ambiguous request, unclear scope, non-goals, decision boundaries, acceptance criteria, 需求澄清, 范围不清"
metadata:
  version: "0.3.7"
---

# loopx Clarify

Do not accept vague answers. Do not optimize for speed. The goal is shared understanding: every material question that could change scope, design, verification, rollout, safety, or ownership must be answered before handoff.

## Core Loop

## Repo Specs And Memory Context

Before using this skill in a repository, inspect loopx long-lived context when it exists:

- If `docs/loopx/specs/` exists, inspect the directory names and filenames. If `docs/loopx/specs/index.md` exists, use it as a map, but do not require it. Read only specs relevant to the requested domain, affected files, workflow behavior, or named source document.
- If `.loopx/memory/MEMORY.md` exists, read it as curated project memory before deciding what is already known.
- If `.loopx/memory/index.jsonl` exists, use it only as a retrieval index for relevant active memory cards; do not treat it as an append-only log.
- Treat current user instructions and the named source document as highest priority, `docs/loopx/specs/` as binding long-lived repo rules, and `.loopx/memory/` as advisory context. Memory is advisory and must not override current task instructions, approved source docs, or repo specs.

Do not read every file under `docs/loopx/specs/` by default. Prefer relevant specs selected by filename, title, frontmatter such as `applies_to`, or the files/domains involved in the task.

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.



## Output

Write the clarification context bundle **incrementally** — start the file after the first meaningful answer is confirmed, and update it after every Q&A round. Do not wait until all questions are resolved.

Write to:

- `.loopx/intake/clarify-<slug>-YYYY-MM-DD.md`

**Incremental writing rules:**

- Create the file as soon as the first material answer (intent, scope, non-goal, constraint, or decision boundary) is confirmed.
- After each Q&A round, append or update the relevant section with the confirmed answer and the question that produced it.
- Mark unresolved sections as `[PENDING]` so a future session or handoff knows what is still open.
- Preserve the user's exact wording when it captures a decision; quote it directly.
- The last section must always be `## Resume State` and record `current_round`, `unresolved_count`, and `next_question` so state can be resumed.

The completed bundle must preserve the information `spec` or `plan-to-exec` needs:

- intent and desired outcome
- in-scope work
- non-goals
- decision boundaries
- constraints
- success criteria
- assumptions challenged
- key decisions and rejected alternatives
- brownfield evidence vs inference
- residual risks
- conversation summary and important user wording
- source requirements or external document references
- next handoff recommendation

## Handoff Decision

## Skill Handoff Format

When recommending the next skill, name the canonical skill and arguments first. Render the invocation using the current agent's native format:

- Codex: `$<skill> <args>`
- Claude Code: `/<skill> <args>`
- Cursor Agent Skills: `/<skill> <args>`
- Generic: `Use the <skill> skill with <args>`.

Do not present Codex `$...` syntax as the only handoff unless the current agent is Codex.

After every material question is answered, choose one handoff:

- `needs_spec`
- `direct_to_plan`
- `blocked`

Use `needs_spec` when any product behavior, API, data model, state machine, permission, security, migration, compatibility, rollout, or cross-module architecture decision still needs to be fixed before implementation planning.

Use `direct_to_plan` when goals, non-goals, constraints, affected scope, and verification are clear, and all remaining choices are local implementation details.

Use `blocked` when any material requirement or decision boundary is still unclear.

For `needs_spec`, immediately use the `spec` skill with the clarification context bundle, current conversation context, repo evidence, and source documents. `spec` writes a dated design package under `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`, including:

- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`

Then stop before implementation planning and report:

```text
skill: plan-to-exec
args: docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
Codex: $plan-to-exec docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
Claude Code: /plan-to-exec docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
Cursor Agent Skills: /plan-to-exec docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
Generic: Use the plan-to-exec skill with docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md.
```

For `direct_to_plan`, hand off to the `plan-to-exec` skill with the clarification context bundle as the source. `plan-to-exec` writes:

- `docs/loopx/plans/YYYY-MM-DD-<feature-name>.md`

Do not write implementation plans or start code changes inside `clarify`.
