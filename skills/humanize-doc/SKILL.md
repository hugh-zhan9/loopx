---
name: humanize-doc
description: "Applies loopx rewrite discipline to AI-generated or AI-assisted documents: plain language without invented jargon, domain terms preserved, affirmative decisions, no fabricated claims, a deletion ledger for removed content, plus positive construction — narrative spine, orientation sentences, worked examples, tables for facts not logic, complete sentences. Not for assessment-only readability verdicts (doc-readability), requirement gap analysis, code review, or implementation planning."
when_to_use: "humanize-doc, rewrite AI draft, de-AI a document, AI-like prose in docs, invented jargon, hedged decisions, fabricated claims, over-compressed tables, telegraphic docs, design doc rewrite, 去AI味, 说人话, 改稿, 文档重写, 设计文档改写, 电报体"
metadata:
  version: "0.2.4"
---

# Humanize Doc

Rewrite discipline for documents written by or with AI: accurate, plain-language, decision-first, free of fabrication. The result should read as if a competent owner wrote it — judgment, economy, and the willingness to state rules.

Applies to any document type: engineering designs, technical proposals, PRDs, reports, postmortem drafts, announcements, README and knowledge-base articles. The hard rules are universal; the engineering-design addendum adds type-specific rules. Worked before/after cases live in [references/examples.md](references/examples.md).

## loopx Boundary

- `humanize-doc` rewrites. For an assessment-only pass with document-type lenses and severity verdicts, use `doc-readability`; a common sequence is rewrite here, then final assessment there.
- Requirement completeness, testability, and feasibility gaps route to `requirement-analyzer`.
- Do not use this skill for code review, implementation planning, or workflow state transitions.

## Rewrite or Report

- The user asks to write, rewrite, or de-AI a document: rewrite directly.
- The user only asks to look at a document, or intent is unclear: report findings against the hard rules, then ask whether to apply them.
- Short documents (under two screens): apply the hard rules; skip the structural work.

## Working Method

1. Read the target document (or the named sections) end to end; mark every hard-rule violation.
2. Restructure decisions-first; redraw inaccurate diagrams; replace invented jargon with plain statements.
3. Keep a deletion ledger: every claim removed as fabricated, unsourced, or self-defensive is listed in the reply with its reason, so the author can restore it with a source. Never delete silently.
4. Run the self-check before returning — on your own added text as well as the original. Orientation sentences, summaries, and glosses written during the rewrite are where fresh coinage sneaks in, because they compress a table or a section into one line; they get no exemption from Rule 1 and Rule 12.
5. Reply with a short list of what changed plus the deletion ledger; do not restate the document.

## Hard Rules

### 1. Plain language; preserve domain terms

Readers are the people who must execute, review, or operate. Delete invented jargon and information-free filler; keep the domain vocabulary.

| Do not | Do |
|---|---|
| Mixed-language coinage used as ordinary words（如「吃 raw 行」「job 化」） | Plain verbs: read the raw rows, run as a scheduled job |
| Abstraction wrappers ("sliding window mechanism", 「日批作业」) | The actual rule: which range, start, end, boundary inclusion |
| Vague deixis ("that side", "the above system", 「那边/这边」) | Name the system: "the risk service", "this module" |
| Catch-all section names ("Miscellaneous", 「副作用」) | Name the content: "Execution and notification" |
| Filler openers ("It is worth noting", 「便于理解」) | Delete; state the rule |
| Negation stacks defining scope ("does not show X, does not include Y") | Affirmative statements of what is shown and included |
| Programmer slang standing in for consequences ("errors bubble up", 「错误冒泡」「白名单」「门禁」) | The observable outcome: "the job returns failure and the scheduler retries", "messages are rejected before sending" |

Domain and protocol proper nouns stay as-is (Symbol, ISIN, T-1, Kafka, SLA, SKU, enum value names). First occurrence may carry a one-line gloss; after that, use the term. When unsure whether a word is a domain term or a coinage: if it appears in a protocol, an interface, an upstream document, or the team's existing docs, it is a domain term — keep it.

A glossary entry does not license a coinage. If a plain phrase says it in a few words（「本批」→「本轮拉取的行」）, use the plain phrase everywhere and drop the term — defining a word the reader must memorize is a cost, not a fix. Reserve defined terms for concepts that recur throughout the document and have no short plain equivalent.

### 2. Affirmative decisions

| Do not | Do |
|---|---|
| "It is suggested to run daily" | "Runs once daily on a schedule" |
| "This could be moved to phase two" | "Phase two does the routing" |
| "In principle / generally / as far as possible" | Decide, or write "Pending confirmation (owner): ..." |
| Long non-goal walls | A scope table: what this document owns, who owns the rest |

Exceptions: genuinely open alternatives under review keep their options plus a ranked recommendation; a review template that mandates a Non-goals section keeps it, with each line written as "X is owned by Y".

### 3. Invent nothing

Numbers, capabilities, and failure claims need a source. Typical fabrications:

- Unmeasured volumes, latencies, or SLA figures.
- Downstream states this system cannot observe, written up as this system's risks.
- Capabilities present in product copy but absent from the actual system, written as "uses the existing capability" — verify first; if absent, the sentence goes.

Remove these via the deletion ledger; never smooth a gap into a stronger claim.

### 4. No self-defense narration

Reconciliation asides ("the chat thread said X, but this module does not..."), disclaimers ("in case of conflict, defer to..."), and long rebuttals of rejected options stay out of the body. One decision-table row ("rejected: reason") is enough; the rest goes to review notes.

### 5. Key decisions first

Within the first two screens, a reader should be able to answer, as applicable:

- How the core rule, range, or formula is computed: base, start, end, boundary inclusion, exceptions.
- Which condition triggers which action, in what order, and what happens on failure.
- Where data and messages come from and go to, and which source is authoritative.
- Where this document's ownership stops and who owns the rest.

Put them in one "Key decisions" section (table + formula + worked example) and have later sections reference it. What counts as key follows from what this document's readers must execute or accept, not from a fixed checklist.

### 6. Diagrams and tables match the prose

Check every diagram against the key-decision section before shipping: trigger points, ordering, failure exits, and special cases that bypass the main path. One diagram tells one story; split timing and classification into separate diagrams. When a diagram and the prose disagree, fix one until they agree.

### 7. Only claim what the owner owns

Do not write a collaborator's capability as this system's (if the call does not exist, the sentence does not either), and do not specify a downstream system's internals. State the division of responsibility affirmatively; there is no need to repeat "not our job".

## Positive Construction

Rules 1–7 delete noise. Deletion alone produces a dense reference card, not a readable document — maximal information density is not readability, because readers need a story to hang details on. The elements below are required, and must not be stripped as filler.

### 8. Narrative spine first

Open the document with short prose that tells the whole story once — what happens, who acts, in what order, with what outcomes — before any table. For time-driven workflows, add an early timeline or lifecycle overview diagram covering the full span (e.g. pull day → review day → effective day → downstream cutover). The reader gets the story from the first screen and uses the rest as reference.

### 9. Orientation sentences

Each major section opens with one sentence stating what the section settles or how to read it ("These rules decide how the flow splits downstream; fix them before reading on."). This is not the banned meta filler: "This section describes the architecture" describes the section and says nothing; an orientation sentence makes a claim the section then supports.

State the rule, not a metaphor for it. "Routing is the timeline's gate" reads well and tells the reader nothing they can execute; "stored events produce no action until routing promotes them at T-1 or the effective day" is the claim. A metaphor may follow the plain statement as color; it never replaces it — the test is whether the sentence still carries the rule with the metaphor deleted.

### 10. Worked examples next to formulas

Every formula, range rule, or time rule carries a concrete worked example adjacent to it — real dates, boundary cases included. Acceptance scenarios at the end of the document do not substitute: the reader needs the example at the moment of reading the rule.

### 11. Tables hold facts, not logic

Table cells hold enumerable facts. Branching never hides in cells: no "A or B" without the criterion, no arrow chains, no decision tree compressed into one cell. Write branching as ordered conditionals, a decision table with explicit condition columns, or a flowchart. An unconditioned "or" in a cell is either a hidden unresolved decision — surface it as "Pending confirmation (owner)" — or a readability defect: state the criterion.

### 12. Complete sentences outside tables

Telegraphic fragments are as unreadable as filler: dropped subjects, verbless phrases, and arrow chains force the reader to reconstruct grammar. Prose outside tables and code blocks is complete sentences. Economy comes from cutting content that adds nothing, not from cutting grammar.

### 13. Business language at the decision layer

Overview and key-decision sections speak the reader's business vocabulary ("true delisting, auto-confirmed" in the reader's own words); enum literals, field names, and code identifiers live in the contract and field sections. When a decision section must use an identifier, gloss it on first use per Rule 1.

## Engineering-Design Addendum

Design documents additionally keep the design-time perspective: they say what is to be built, not what the code currently looks like.

- No source paths, class names, handler file names, or test commands standing in for design; use responsibility names (sync, identify, route, notify). Exception: when the user asks for an implementation note or a migration plan, code anchors are allowed in their own clearly separated section.
- A detail-level design that relies on an overview document names that prerequisite up front and still carries a minimal recap — one short lifecycle narrative plus one timeline or overview diagram — so testers and integrators who open only the detail doc can follow it.
- No "as per the code" or "already implemented" as a substitute for stating the rule. If the current behavior is unverified, mark it pending confirmation or verify before writing.
- Recommended section order: header (module, owner, readers, input docs) → background and scope table → key decisions → system context diagram → module structure → domain model → main flows (one story per diagram) → external integrations → schedules and failure handling → acceptance scenarios. Cut recap sections that restate earlier decisions; each decision has one authoritative home.

## Rewrite Cadence

Ask of every paragraph:

1. Is this a decision, or a suggestion, defense, or guess?
2. Can the reader execute or accept without reading the code or attending the review meeting?
3. Do diagrams, tables, and prose share one wording — no invented jargon, no mistranslated domain terms?

Fix until all three pass.

## Self-Check

- No mixed-language coinage, abstraction wrappers, or vague deixis.
- Domain terms preserved; first occurrence glossed.
- No suggestion wording on settled decisions; open items name who confirms.
- No unsourced volumes, SLA figures, or downstream failure claims; every removal is in the deletion ledger.
- No reconciliation asides or disclaimers in the body.
- Key decisions in one early section with formula and worked example.
- Every diagram's triggers, ordering, and failure exits match the key decisions.
- Ownership boundaries accurate; no borrowed capabilities.
- The first screen tells the whole story in prose; time-driven workflows have an early timeline or lifecycle diagram.
- Each major section opens with an orientation sentence that makes a claim.
- Every formula or time rule has an adjacent worked example.
- No unconditioned "or", arrow chains, or compressed branching inside table cells.
- Prose outside tables and code blocks is complete sentences.
- Decision-layer sections use business vocabulary; identifiers live in contract sections.
- Text added during this rewrite (orientation sentences, summaries, glosses) passes every check above — the rewriter introduced no new coinage, fragments, or unsourced claims of their own.
- Design docs only: no code paths standing in for design outside a separated implementation section.
