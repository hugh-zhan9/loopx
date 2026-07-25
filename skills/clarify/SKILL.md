---
name: clarify
description: "Resolves concrete ambiguity in intent, scope, acceptance, permissions, secrets, or destructive choices before mutation, then records the required handoff. Not for clear bounded requests, ordinary defects or small features, approved specs, or implementation."
when_to_use: "clarify, unresolved intent, unclear scope, non-goals, acceptance criteria, permission decision, secret handling, destructive choice, 需求澄清, 范围不清"
metadata:
  version: "0.3.18"
---

# loopx Clarify

Do not accept vague answers. Do not optimize for speed. The goal is shared understanding: every material question that could change scope, design, verification, rollout, safety, or ownership must be answered before handoff.

## Core Loop

First load only relevant repo context, then alternate between evidence gathering and one-question-at-a-time user clarification until every material requirement boundary is resolved. Keep the intake package current after each confirmed answer.

## STOP Conditions

Stop before handoff when any material scope, non-goal, acceptance criterion, rollout, safety, ownership, or verification question remains unresolved. The only valid unresolved outcome is `blocked`; do not route to `spec` or `plan2exec` with hidden assumptions.

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

Write the clarify intake package **incrementally**. Start the package after the first meaningful answer is confirmed, and update the relevant files after every Q&A round. Do not wait until all questions are resolved.

Write to:

- `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`
- `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`

`clarification.md` records supporting process evidence: the Q&A process, exact user wording, assumptions challenged, rejected alternatives, brownfield evidence, and `## Resume State`. Downstream skills read it only for exact user wording, unresolved-history context, or resume information.

`requirements.md` records the confirmed canonical requirement contract: source facts, intent, scope, non-goals, decisions, constraints, acceptance criteria, acceptance scenarios, open questions, and handoff recommendation.

**Incremental writing rules:**

- Create the package as soon as the first material answer (intent, scope, non-goal, constraint, or decision boundary) is confirmed.
- After each Q&A round, append or update the relevant package files with the confirmed answer and the question that produced it.
- Mark unresolved sections as `[PENDING]` so a future session or handoff knows what is still open.
- Preserve the user's exact wording when it captures a decision; quote it directly.
- The last section of `clarification.md` must always be `## Resume State` so state can be resumed. Record `current_round`, `ambiguity_score`, `unresolved_count`, `non_goals_resolved`, `decision_boundaries_resolved`, `pressure_pass_complete`, and `next_question`. Keep these values consistent with the frontmatter when frontmatter is present.

Acceptance criteria in `requirements.md` must use stable `AC-*` anchors. Prefer `WHEN / THEN / AND` wording, and do not hand off `direct_to_plan` when material ACs are not testable.

Acceptance scenarios in `requirements.md` must use stable `TC-*` anchors under an `Acceptance Scenarios` section. Every `TC-*` must reference at least one `AC-*`. High-risk `AC-*` items need at least one boundary or failure case unless the package records a concrete manual/deferred rationale.

`requirements.md` is the canonical `AC-*` and `TC-*` source. If AC/TC anchors are missing, contradictory, or not testable, keep the package blocked and continue clarification.

Handoff rule: `requirements.md` is the canonical `AC-*`/`TC-*` source for `spec`, `plan2exec`, and any downstream execution or review. Downstream consumers must not invent replacement `AC-*` or `TC-*` identifiers; if the intake anchors are missing, contradictory, or not testable, route back to `clarify` instead of renaming or substituting them.

The completed intake package must preserve the information `spec` or `plan2exec` needs:

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

Choose the next skill from the completed intake package, not from a guess about implementation size. `needs_spec`, `direct_to_plan`, and `blocked` are the only valid outcomes.

Persist the chosen value as `handoff_decision` in the final `Resume State`.
Current clarify workflow state uses schema v2. Pre-v2 running state is not
migrated or normalized; restart it as a new current-contract workflow.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| User answer is vague | Ask one narrower follow-up with the recommended answer stated | Mark the item `[PENDING]` and keep the handoff `blocked` |
| Code evidence contradicts the request | Record both the user wording and repo evidence | Ask which source should govern before creating ACs |
| AC or TC cannot be tested | Rewrite the criterion as observable behavior | Keep clarification open until the user confirms the testable form |

## Red Flags

- Do not ask multiple material questions in one turn.
- Do not invent acceptance criteria to make the package handoff-ready.
- Do not route to implementation planning while ACs, TCs, or non-goals are pending.
- Do not bury rejected alternatives; record why they were rejected.

## Skill Handoff Format

After every material question is answered, choose one handoff:

- `needs_spec`: any product behavior, API, data model, state machine,
  permission, security, migration, compatibility, rollout, or cross-module
  architecture decision still needs to be fixed before implementation planning.
- `direct_to_plan`: goals, non-goals, constraints, affected scope, and
  verification are clear, and all remaining choices are local implementation
  details.
- `blocked`: any material requirement or decision boundary is still unclear.

Render the handoff with
[references/handoff-syntax.md](./references/handoff-syntax.md): name the
canonical skill and arguments first, in the current agent's native invocation
format:

- Codex: `$<skill> <args>`
- Claude Code: `/<skill> <args>`
- Cursor Agent Skills: `/<skill> <args>`
- Generic: `Use the <skill> skill with <args>`

Do not present Codex `$...` syntax as the only handoff unless the current
agent is Codex.

For `needs_spec`, the source argument is the intake package directory; `spec`
writes `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`, and the
follow-up handoff is `plan2exec` with that document. For `direct_to_plan`, hand
`plan2exec` the intake package directory; it writes one plan to
`docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`.

Do not write implementation plans or start code changes inside `clarify`.
