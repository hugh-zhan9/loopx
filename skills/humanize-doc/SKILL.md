---
name: humanize-doc
description: "Assess or improve document readability and remove AI-like wording (文档润色、去 AI 味). Preserve facts and decisions. Use requirement-analyzer for business-rule gaps."
metadata:
  version: "0.3.1"
  when_to_use: "humanize-doc, document readability, readability assessment, unclear viewpoint, rewrite AI draft, de-AI a document, invented jargon, over-compressed tables, telegraphic docs, PRD assessment, 文档可读性, 需求文档评估, 去AI味, 说人话, 改稿, 文档重写, 设计文档改写, 电报体"
---

# Humanize Doc

Assess or improve how easily the intended reader can understand a document,
make a decision, or carry out its instructions. Shorter prose helps only when
it preserves meaning and reduces the reader's reconstruction work. This skill
changes wording and structure, not product decisions or workflow state.

## Apply the requested scope

Read the actual source end to end within the requested scope. State when only an
excerpt or sample is accessible; do not silently treat a partial rewrite as a
whole-document edit. Infer audience, purpose, main claim, and expected next action
from the request and source. Honor choices already made in the session; ask only
when competing interpretations materially change the result.

Match the requested action without asking for a mode already clear from context:

- **Assessment only:** report findings without rewriting.
- **Assessment with targeted suggestions:** show focused improvements.
- **Rewrite only if blocking:** edit only when a reading obstacle prevents the
  intended decision or action; otherwise report the assessment.
- **Rewrite directly:** edit the requested scope and briefly explain the changes.
  A request to rewrite or remove AI-like prose authorizes editing directly.

Check the repository and project memory for recorded documentation conventions
before rewriting. A project ruling on document shape — current-state only, no
change log, audience layering — outranks the shape of the source.

For every action, use the document-specific checks in
[readability.md](references/readability.md). Apply them before and after editing,
including direct rewrites and rewrites conditional on a blocking issue. Use its
findings format when assessment is requested; editing alone needs no separate verdict.
For an explicitly requested PRD completeness assessment, also load
[prd.md](references/prd.md). Use `requirement-analyzer` for systematic business
closure, state, traceability, and readiness analysis. A prose-only edit does not
require that audit; report visible missing decisions without inventing answers.

## Preserve meaning

Before a substantive edit, inventory facts, proposals, accepted decisions,
requirements, definitions, exclusions, exceptions, ownership, and source links.
Reconcile that inventory with the result. Use [examples.md](references/examples.md)
when removing AI-like prose or handling the semantic distinctions below.

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
  existing team vocabulary. Preserve new terms when the document defines them
  clearly and they serve a necessary distinction, even if they appear nowhere
  else. Add a short gloss when the audience needs it. Replace empty or opaque
  labels with plain wording when their meaning is supported by the source;
  flag an unclear meaning rather than guessing a replacement. Novelty alone
  is not a reason to remove a term.
- Define every abbreviation, symbol, and date code the document relies on, at
  first use or in one short table. Notation the reader must reconstruct is a
  defect even when every fact is correct.
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

For assessment, deliver the **Readability verdict**, extracted core point, and
anchored findings described in [readability.md](references/readability.md).
Explain whether rewriting would help; a review-only request ends with findings.

For editing, deliver the rewritten document or file changes and a brief explanation. Include
a **deletion ledger** for substantive removed claims or rules, with source
location and reason; group routine duplicate wording or filler removals instead
of listing every sentence. If nothing substantive was removed, no empty ledger
is needed. Explicitly surface any unresolved factual or semantic ambiguity.

Check the result against the source inventory: no new facts, stronger commitments,
lost boundaries, altered numbers, broken links, or conflicting diagram branches.
Apply the same checks to newly written headings, summaries, glosses, and examples.

Then read the result as the stated audience: every abbreviation defined, necessary
new terms still defined and used consistently, empty labels removed without
inventing meaning, and no heading or gloss you introduced harder to read than
what it replaced. Re-run both checks after any later
structural pass, which can strip the definition of a term whose uses remain.
