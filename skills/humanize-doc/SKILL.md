---
name: humanize-doc
description: "Rewrites AI-assisted documents into accurate, plain language while preserving domain terms, decision status, factual claims, boundaries, and evidence. Not for assessment-only readability verdicts, requirement gap analysis, code review, or implementation planning."
when_to_use: "humanize-doc, rewrite AI draft, de-AI a document, AI-like prose in docs, invented jargon, hedged decisions, fabricated claims, over-compressed tables, telegraphic docs, design doc rewrite, 去AI味, 说人话, 改稿, 文档重写, 设计文档改写, 电报体"
metadata:
  version: "0.2.5"
---

# Humanize Doc

Rewrite AI-assisted drafts into accurate, readable prose. Use `doc-readability`
for an assessment-only request and `requirement-analyzer` for business gaps.
This skill changes wording and structure, not product decisions or workflow state.

## Apply the requested scope

Read the source end to end within the requested scope. A request to rewrite or
remove AI-like prose authorizes editing directly. A review-only request gets
findings, not an unsolicited rewrite. Infer audience and purpose where clear;
ask only about an ambiguity that would materially change meaning.

Inventory the facts, proposals, accepted decisions, rules, exceptions, ownership,
and source references before editing. Reconcile that inventory with the result.
Use [examples.md](references/examples.md) when applying the distinctions below.

## Preserve meaning

**Invent nothing.** Preserve quantities, units, dates, identifiers, domain terms,
conditions, and decision status. Do not turn “suggest daily execution” into a
settled daily schedule, or “could defer” into an approved phase-two commitment.
Use direct wording for decisions only when the source establishes they are settled.

Distinguish three cases:

- **Unsupported existing-system claim:** verify against available evidence or
  retain it with an explicit evidence gap. Lack of a citation does not prove it
  false, and lack of a code search match does not prove the capability absent.
- **Proposed future behavior:** keep it as a proposal or requirement. Absence from
  current code is not a reason to remove planned behavior.
- **Confirmed false or fabricated claim:** remove or correct it from evidence,
  and record the substantive deletion and reason in the deletion ledger.

Preserve non-goals, prohibitions, authority precedence, and ownership boundaries.
Replace a negative with a positive only if the same boundary survives. Do not
invent another system, owner, fallback, or field list to make wording concrete.
If a pronoun cannot be resolved from context, flag it rather than guess.

## Improve the prose

- State the useful claim directly. Remove filler, repeated disclaimers, invented
  labels, and narration about the writing process.
- Keep domain and protocol terms such as Symbol, ISIN, Kafka, enum values, and
  existing team vocabulary. Add a short gloss when the audience needs it.
- Prefer concrete actions and complete sentences to abstraction wrappers and
  compressed arrow chains. Do not expand concise labels into unnecessary prose.
- Bring the main decision or story forward. Add orientation only when it helps
  readers navigate; no opening paragraph is required for every section.
- Keep one authoritative statement of each rule and link from other occurrences.
  Preserve useful rationale for rejected alternatives where it explains a tradeoff.
- Use tables for comparison or explicit decision conditions. Keep ordering,
  predicates, and failure paths visible. An unresolved “A or B” remains open until
  its criterion is known.
- Add a worked example when a formula, range, or timing rule is hard to apply.
  Label hypothetical inputs and derive outputs from the stated rule; do not
  invent a default, unit, rounding convention, or acceptance requirement.
- Reconcile diagrams with the same source as the prose. If authority is unclear,
  expose the contradiction rather than choosing the smoother version.

## Engineering documents

State intended behavior and responsibilities without making readers reconstruct
rules from implementation details. Keep code paths, test commands, and identifiers
when they provide traceability or are needed to execute or verify the document.
Move long implementation listings to a reference section when they interrupt the
reviewer's decision. They are evidence, not a substitute for stating the rule.

A dependent design should name its authoritative inputs and summarize enough
context to stand alone. Use diagrams and timelines when they clarify the flow;
short documents do not need a mandatory lifecycle diagram or key-decisions table.

## Deliver and check

Deliver the rewritten document or file changes and a brief explanation. Include
a **deletion ledger** for substantive removed claims or rules, with source
location and reason; group routine duplicate wording or filler removals instead
of listing every sentence. If nothing substantive was removed, no empty ledger
is needed. Explicitly surface any unresolved factual or semantic ambiguity.

Check the result against the source inventory: no new facts, stronger commitments,
lost boundaries, altered numbers, broken links, or conflicting diagram branches.
Apply the same checks to newly written headings, summaries, glosses, and examples.
