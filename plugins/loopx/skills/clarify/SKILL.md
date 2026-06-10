---
name: clarify
description: "Grills ambiguous loopx work until material questions are answered, then routes to spec or plan using a design gate. Not for clear implementation tasks, approved specs, or code changes."
when_to_use: "clarify, requirements, ambiguous request, unclear scope, non-goals, decision boundaries, acceptance criteria, 需求澄清, 范围不清"
metadata:
  version: "0.2.6"
---

# loopx Clarify

Do not accept vague answers. Do not optimize for speed. The goal is shared understanding: every material question that could change scope, design, verification, rollout, safety, or ownership must be answered before handoff.

## Core Loop

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.



## Output

Write the clarification context bundle to:

- `.loopx/intake/clarify-<slug>-<timestamp>.md`

The bundle must preserve the information `spec` or `plan` needs:

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

After every material question is answered, choose one handoff:

- `needs_spec`
- `direct_to_plan`
- `blocked`

Use `needs_spec` when any product behavior, API, data model, state machine, permission, security, migration, compatibility, rollout, or cross-module architecture decision still needs to be fixed before implementation planning.

Use `direct_to_plan` when goals, non-goals, constraints, affected scope, and verification are clear, and all remaining choices are local implementation details.

Use `blocked` when any material requirement or decision boundary is still unclear.

For `needs_spec`, immediately use the `spec` skill with the clarification context bundle, current conversation context, repo evidence, and source documents. `spec` writes:

- `docs/loopx/design/<需求名>需求设计文档.md`

Then stop before implementation planning and report:

```text
$plan docs/loopx/design/<需求名>需求设计文档.md
```

For `direct_to_plan`, hand off to the `plan` skill with the clarification context bundle as the source. `plan` writes:

- `docs/loopx/plans/YYYY-MM-DD-<feature-name>.md`

Do not write implementation plans or start code changes inside `clarify`.
