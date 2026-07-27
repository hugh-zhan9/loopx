---
name: clarify
description: "Resolves concrete ambiguity in intent, scope, acceptance, permissions, secrets, or destructive choices before mutation, then records goals, decisions, boundaries, and evidence. Not for clear bounded requests, ordinary defects or small features, approved specs, or implementation."
when_to_use: "clarify, unresolved intent, unclear scope, non-goals, acceptance criteria, permission decision, secret handling, destructive choice, 需求澄清, 范围不清"
metadata:
  version: "0.4.0"
---

# loopx Clarify

Resolve only ambiguity that can materially change the requested outcome. Do not
turn clarification into an execution workflow or require ceremony for a clear,
bounded request.

## Method

1. Read the current request and only the repository evidence relevant to it.
2. Answer questions from repository evidence when possible.
3. Ask the user one material question at a time when a decision cannot be
   inferred safely. Include a recommended answer and its tradeoff.
4. Record confirmed facts and decisions without prescribing how the model must
   decompose, schedule, delegate, review, or execute the work.

## Context

When present, treat current user instructions and named source documents as the
highest authority, relevant `docs/loopx/specs/` as binding repository context,
and `.loopx/memory/` as advisory. Read only files relevant to the ambiguity.

## Output

Maintain these documents when a local intake package is useful:

- `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`
- `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`

`clarification.md` records source inputs, material questions and answers,
confirmed decisions, boundaries, evidence, and open questions.

`requirements.md` records the canonical goal, scope, non-goals, decisions,
constraints, acceptance criteria, acceptance scenarios, open questions, and
evidence targets. Use stable `AC-*` anchors for observable behavior and `TC-*`
anchors for scenarios. Every `TC-*` must reference at least one `AC-*`.

Mark unresolved content `[PENDING]`. Preserve exact user wording when it carries
a decision. Keep observed evidence separate from inference.

## Boundary

- Do not choose or invoke a next skill.
- Do not write an implementation plan.
- Do not create readiness gates, round limits, workflow stages, review verdicts,
  or execution policy.
- Do not invent answers or acceptance criteria to make the document appear
  complete.
- End with the documents produced and the concrete open questions, if any.

## Failure Handling

| Trigger | First action | If still unresolved |
|---|---|---|
| User answer is vague | Ask one narrower question with a recommended answer | Record the question as `[PENDING]` |
| Repository evidence contradicts the request | Record both sources | Ask which source governs |
| An acceptance criterion is not observable | Rewrite it as behavior and an evidence target | Leave it `[PENDING]` for user confirmation |
