---
name: humanize-doc
description: "Assess or rewrite documents for clarity and remove AI-like wording while preserving facts, terms, and decision status (文档润色、去 AI 味)."
disable-model-invocation: true
metadata:
  version: "0.4.0"
  when_to_use: "humanize-doc, readability, rewrite AI draft, de-AI prose, 文档润色, 去AI味, 说人话"
---

# Humanize Doc

Make a document faster for its intended reader to understand and act on,
without changing facts, decisions, or boundaries.

## Match the request

Read the target end to end first (state if only an excerpt is available) and
match the requested mode without extra ceremony:

- **Assess only:** report readability verdict, extracted core point, and
  anchored findings using [readability.md](references/readability.md).
- **Rewrite directly** (or **rewrite only if blocking**): edit the target scope
  and briefly summarize substantive changes. Load [examples.md](references/examples.md)
  when removing AI-like phrasing, and [prd.md](references/prd.md) only for an
  explicit PRD completeness check.

## Preserve meaning (invent nothing)

- Preserve exact numbers, units, dates, identifiers, domain terms, non-goals,
  prohibitions, and decision status (never upgrade "proposed / could defer"
  into a settled commitment).
- Distinguish unsupported existing-system claims (verify or mark gap), planned
  future behavior (keep as proposal), and confirmed false claims (correct/remove
  and note why).
- Keep established domain/protocol terms; define unfamiliar abbreviations and
  symbols once at first use or in a short table.

## Improve prose

1. Lead with the main claim or decision; cut filler, repeated disclaimers,
   meta-narration about writing, and invented jargon labels.
2. Replace abstraction wrappers and compressed arrow chains with concrete
   actions and plain sentences.
3. Keep each rule in one authoritative place and link secondary mentions.
4. Keep code paths, commands, and identifiers when needed for traceability or
   execution; move long listings to a reference section if they block reading.
5. Reconcile diagrams and tables with the prose; surface contradictions instead
   of smoothing them over.

Before delivering, re-read as the target audience to verify no lost boundaries,
altered numbers, broken links, or orphaned undefined abbreviations.
