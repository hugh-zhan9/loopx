---
name: clarify
description: "Resolve unclear goals, scope, acceptance, or permissions (需求澄清). Ask independent decisions together and record confirmed requirements."
metadata:
  version: "0.5.0"
  when_to_use: "clarify, unresolved intent, unclear scope, acceptance criteria, permission decision, 需求澄清, 分轮提问"
---

# loopx Clarify

Resolve only ambiguity that can materially change the requested outcome. Do not
turn clarification into an execution workflow or require ceremony for a clear,
bounded request.

## Method

1. Read the current request and only the repository evidence relevant to it.
2. Answer questions from repository evidence when possible. Facts about the
   codebase, tools, or environment are yours to find; only decisions go to the
   user.
3. Ask independent decisions together in one round. A question whose answer
   depends on another question still open belongs to a later round. If a fact
   lookup is pending, ask the questions that do not depend on it now.
4. Number questions when useful. Give a recommendation and its tradeoff when
   there is a real choice; use the host's question tool when available.
5. After each answer, ask only the remaining questions it makes possible.
   Finish when material decisions are settled; record unanswered items as
   `[PENDING]` without treating them as accepted.
6. Record confirmed facts and decisions without prescribing how the model must
   decompose, schedule, delegate, review, or execute the work.

Format each round as:

```text
Q1. <title>
<question body, including the choices when there are several>
Recommended: <answer and its tradeoff>

Q2. <title>
...
```

## Context

When present, treat current user instructions and named source documents as the
highest authority, relevant `docs/loopx/specs/` as binding repository context,
and `.loopx/memory/` as advisory. Read only files relevant to the ambiguity.

## Output

Update an existing approved requirements document when available; do not copy it
into a new intake just because this skill was selected. Keep answers in that
source when practical. When a local intake package is useful, use these paths:

- `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`
- `.loopx/intake/YYYY-MM-DD-<slug>/requirements.md`

`clarification.md` is optional question history. It records source inputs, material questions and answers,
confirmed decisions, boundaries, evidence, and open questions.

`requirements.md` records the canonical goal, scope, non-goals, decisions,
constraints, acceptance criteria, acceptance scenarios, open questions, and
evidence targets. Use stable `AC-*` anchors for observable behavior and `TC-*`
anchors for scenarios. Every `TC-*` must reference at least one `AC-*`.

Do not weaken an accepted criterion or defer it without explicit authorization.
Mark unresolved content `[PENDING]`. Preserve exact user wording when it carries
a decision. Keep observed evidence separate from inference.

## Boundary

- Do not choose or invoke a next skill.
- Do not write an implementation plan.
- Do not create readiness gates, round limits, workflow stages, review verdicts,
  or execution policy.
- Do not ask the user for a fact the repository or tools can supply.
- Do not pad a round with questions that cannot change the outcome.
- Do not invent answers or acceptance criteria to make the document appear
  complete.
- End with the documents produced and the concrete open questions, if any.

## Failure Handling

| Trigger | First action | If still unresolved |
|---|---|---|
| User answer is vague | Ask a narrower follow-up in the next round with a recommended answer | Record the question as `[PENDING]` |
| An answer invalidates an earlier decision | Record both, then re-ask the dependent questions in the next round | Record the affected items as `[PENDING]` |
| Repository evidence contradicts the request | Record both sources | Ask which source governs |
| An acceptance criterion is not observable | Rewrite it as behavior and an evidence target | Leave it `[PENDING]` for user confirmation |
