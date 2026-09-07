---
name: doc-readability
description: "Use when evaluating, rewriting, or editing documents for human readability, unclear viewpoints, AI-like prose, bloated specs, PRDs, requirements docs, meeting notes, strategy docs, or internal knowledge-base articles. Not for code review, implementation planning, or file-format conversion."
when_to_use: "document readability, PRD assessment, requirements gaps, AI-like prose, unclear viewpoint, rewrite docs, editing docs, 文档可读性, 去AI味, 需求文档评估"
metadata:
  version: "0.3.6"
---

# Doc Readability

Evaluate or improve how easily the intended reader can understand a document,
make its decision, or carry out its instructions. Shorter prose is useful only
when it preserves meaning and reduces the reader's reconstruction work.

## Establish the reading task

Read the actual source using the appropriate available tool. State when only an
excerpt or sample is accessible. Infer the audience, document purpose, main claim,
and expected next action from the request and source; honor choices already made
in the session. Ask only when competing interpretations materially change the
result. Mixed document types alone do not require a setup interview.

Match the requested action:

- **Assessment only:** report findings without rewriting.
- **Assessment with targeted suggestions:** show focused improvements.
- **Rewrite only if blocking:** rewrite when a reading obstacle prevents the
  intended decision or action; otherwise report the assessment.
- **Rewrite directly:** edit the requested scope and briefly explain the changes.

When the user only asks for a review, assess. When the user asks for editing,
proceed. Do not ask again for a mode, type, or strictness already clear from context.
For a whole-document rewrite, cover the whole document; if access is incomplete,
state the missing scope rather than silently rewriting only its first section.

## Assess by document purpose

| Document | Reader must be able to find |
| --- | --- |
| Requirements document / PRD | Problem, users, scope, required behavior, acceptance, open decisions |
| Design or contract | Decision, rationale, authority, boundaries, interfaces, failure behavior |
| Procedure / SOP | Trigger, owner, prerequisites, ordered actions, checks, exceptions |
| Decision memo / plan | Recommendation, alternatives, tradeoffs, responsibilities, next action |
| Research / postmortem | Question or impact, evidence, findings, confidence, limitations |
| Meeting notes / knowledge base | Context, decisions or main answer, actions, reference details |

Check whether the main point appears early, section order follows the reader's
questions, references resolve, and examples or diagrams agree with the text.
Distinguish unclear wording from a genuinely missing decision. Do not resolve a
business gap by writing a smoother sentence.

For a requested PRD completeness assessment, load [prd.md](references/prd.md).
Use `requirement-analyzer` for systematic business closure, state, traceability,
and readiness analysis. A prose-only edit does not require a full requirements
audit; preserve any visible unresolved questions.

## Rewrite with semantic preservation

Before a substantive edit, inventory claims, decisions, requirements, exclusions,
definitions, exceptions, ownership, and source links. Reconcile them after the
rewrite. Preserve modality: a suggestion remains a suggestion, a requirement
remains binding, and an unresolved choice remains unresolved.

- Lead with the answer or decision when the document's purpose permits it.
- Collapse repeated rules into one maintained definition with references.
- Keep domain terms, field names, identifiers, dates, units, quantities, enum
  values, and meaningful code or evidence anchors.
- Remove filler and vague wording without inventing actors, defaults, benefits,
  or facts. Retain useful reader orientation and necessary qualifications.
- Preserve explicit prohibitions, non-goals, and source precedence rules.
- Use tables for comparable facts or explicit decision conditions. Use prose or
  a flowchart when dense cells hide ordering or branching.
- Put lengthy reference detail where readers can find it without interrupting
  the main argument; repair links after moving it.
- Keep real uncertainty visible. Flag an unsourced claim for verification rather
  than silently strengthening or deleting it.

Use `humanize-doc` when the rewrite specifically calls for removing AI-like prose;
it supplies focused rewriting examples rather than a separate approval step.

## Output

For assessment, give a **Readability verdict** (readable, partly readable, or hard
to read), the core point you extracted, and concrete findings with source anchors:

- **Blocking:** the reader cannot make the intended decision or take the action.
- **Important:** the reader must reconstruct meaning or may misinterpret it.
- **Optional:** polish that reduces effort without changing understanding.

Use only categories that have findings. Explain whether rewriting would help;
avoid a fixed report form for a short passage. For editing, deliver the requested
artifact and summarize material changes, omissions, or unresolved meaning. Check
that added summaries and examples preserve the same source facts as the body.
