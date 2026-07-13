---
name: doc-readability
description: "Use when evaluating, rewriting, or editing documents for human readability, unclear viewpoints, AI-like prose, bloated specs, PRDs, requirements docs, meeting notes, strategy docs, or internal knowledge-base articles. Not for code review, implementation planning, or file-format conversion."
when_to_use: "document readability, PRD assessment, requirements gaps, AI-like prose, unclear viewpoint, rewrite docs, editing docs, 文档可读性, 去AI味, 需求文档评估"
metadata:
  version: "0.3.5"
---

# Doc Readability

## Principle

Readable documents help a specific reader make a decision, execute work, or verify a claim with minimal reconstruction. Do not confuse readability with shortness or smooth prose. Preserve factual meaning, domain vocabulary, and useful specificity while removing noise.

AI-generated prose is a specific readability threat: it adds volume without adding information. Filler, hedging, symmetric treatment, and throat-clearing all increase word count while reducing signal density. A readable document sounds like a competent human wrote it — with judgment, economy, and the willingness to say what matters first.

## First Move

Read the actual document before judging it. If the document is a URL, cloud doc, wiki page, local file, PDF, or exported artifact, fetch or read the content with the appropriate available tool. If only an excerpt is provided, state that the assessment is based on the excerpt.

Start by inferring:

| Question | Why it matters |
|---|---|
| Who is the reader? | Reviewers, engineers, operators, executives, and future maintainers need different structures. |
| What job must the document do? | PRDs, engineering specs, SOPs, decision memos, and general notes have different standards. |
| What is the main claim? | If the claim is hard to state in one sentence, the document likely has a structure problem. |
| What action should follow? | Readability is poor when the reader cannot tell what to do next. |

If these are clear from the request and document, infer the document type and
proceed. Ask only when competing document lenses would materially change the
verdict or rewrite structure.

## Setup Flow

User choices override inference. Support explicit inputs such as:

```text
Document type: engineering spec
Reader: engineering reviewers
Mode: assessment only
Strictness: review-ready
```

Do not turn setup into a form. Use this order:

1. Infer an obvious document type from the request and document. Ask for
   confirmation only when the choice is genuinely ambiguous and material.
2. If the document appears to mix multiple types, ask which lens should be primary. Do not silently choose the primary type.
3. After document type is chosen, read enough of the document to judge its actual condition: title, headings, first screen, conclusion, and key sections. For long documents, sample the main path and high-risk sections.
4. Only after reading the document may the agent recommend an action mode. Do not recommend assessment-only, targeted suggestions, or rewrite before reading the document.
5. Recommendations must be dynamic, based on the user request, chosen document type, document content, headings, visible structure, and previous user choices.
6. Do not hard-code a default recommendation in the skill.
7. If the user says "quick assessment", "use your judgment", "don't ask", or equivalent, proceed with inference and state assumptions.

Ask setup questions sequentially:

```text
I want to confirm the document type. Based on the title and headings, I would treat this as "...", because ...

Which document type should I use?
1. Engineering spec / interface contract / rules document
2. Requirements document / PRD
3. Engineering design document
4. SOP / operating procedure
5. Decision memo
6. Research / analysis document
7. Meeting notes / discussion record
8. Postmortem / RCA
9. Project plan / roadmap
10. General note / knowledge-base article
```

After the user chooses the type, read the document. Then decide whether action mode needs confirmation:

```text
I have read the document's main path. Given the chosen type and the document's actual condition, I recommend "...", because ...

How should I handle it?
1. Assessment only
2. Assessment plus targeted improvement suggestions
3. Assessment, then rewrite only if there are blocking issues
4. Rewrite directly
```

Ask strictness only when it would change the result:

```text
Strictness will affect this assessment. I recommend "...", because ...

Which strictness should I use?
1. Usable for internal handoff
2. Review-ready
3. Publication-ready
```

If strictness is not worth asking, choose a sensible default and state it briefly.

When the confirmed document type is `Requirements document / PRD`, read `references/prd.md` before assessment or rewrite. Use it to check requirement completeness and testability, not just prose clarity.

## STOP Conditions

Stop before rewriting when:

- The document type is unclear and the wrong lens would change the verdict or rewrite structure.
- The user asked for assessment only.
- The available input is only a short excerpt and the requested rewrite depends on missing context.
- A PRD or requirements document lacks enough business facts to preserve intent.

If the user explicitly says "quick assessment", "use your judgment", or "don't ask", proceed with stated assumptions and keep the output scoped to the available evidence.

## Document Types

Use the document type to set the evaluation bar.

| Type | Readability standard |
|---|---|
| Requirements / PRD | Reader can identify problem, users, goals, non-goals, scope, workflows, requirements, acceptance criteria, priorities, and open questions. Also read `references/prd.md` for PRD-specific completeness checks. |
| Engineering design | Reader can identify context, proposed design, key decisions, rejected alternatives, contracts, data flow, failure modes, rollout, and boundaries. |
| Engineering spec / interface contract / rules document | Reader can identify the first-screen conclusion, main decision path, canonical rules, field/status definitions, and where details live. Long tables, enum lists, field contracts, state tables, and long sections are acceptable when they are locatable and support implementation. Judge clarity of path and lookup, not shortness. |
| SOP / operating procedure | Reader can identify trigger, owner, prerequisites, step order, checks, exceptions, and escalation path. |
| Decision memo | Reader can identify recommendation, rationale, tradeoffs, risks, decision owner, and next action. |
| Research / analysis | Reader can identify question, method, evidence, conclusion, confidence, limitations, and implications. |
| Meeting notes / discussion record | Reader can identify decisions, unresolved questions, owners, due dates, and context needed later. |
| Postmortem / RCA | Reader can identify impact, timeline, root cause, contributing factors, fixes, owners, and prevention checks. |
| Project plan / roadmap | Reader can identify objective, milestones, dependencies, owners, risks, dates, and decision points. |
| General note / knowledge-base article | Reader can identify topic, takeaway, section map, and why each section exists. |

If a document mixes types, name the primary and secondary type. Judge the primary reading path first; suggest moving secondary material to an appendix or companion doc only when it interferes with the main job.

## Diagnostic Rubric

Evaluate across these dimensions:

| Dimension | Good | Poor |
|---|---|---|
| Viewpoint | The document makes defensible claims and repeats them consistently. | It lists related facts without choosing what matters. |
| Reader path | The reader can predict where conclusions, rules, examples, and details live. | Background, rules, fields, cases, and tasks are mixed together. |
| Information hierarchy | Important decisions appear first; details support them. | Long tables and sections force the reader to synthesize conclusions manually. |
| Actionability | Owners, timing, inputs, outputs, states, and exceptions are concrete. | Sentences say "support", "process", "handle", or "optimize" without operational meaning. |
| Density | Each paragraph changes what the reader knows or can do. | Repeated sentence frames and generic transitions create drag. |
| Boundary clarity | Scope, non-goals, risks, blockers, and "not automatic" rules are explicit. | Boundaries are scattered, softened, or buried after implementation detail. |
| Human voice | The prose shows judgment, tradeoffs, and emphasis. | The prose is neutral, padded, symmetric, and unwilling to choose. |

Lead with a practical verdict in the user's language: `Readable`, `Partly readable`, or `Hard to read`.

Separate findings by severity:

| Severity | Meaning |
|---|---|
| Blocking | The target reader cannot understand the conclusion, decision path, required action, or authoritative rule. This usually requires restructuring or rewriting. |
| Important | The document is usable, but readers will waste time or may implement inconsistently. Recommend focused changes. |
| Optional | The document can be improved, but the issue does not block review or execution. Do not present optional polish as readability failure. |

For an already rewritten or structured document, use this severity split instead of listing every possible flaw as a main obstacle.

## AI-Like Smells

Treat these as signals to tighten or restructure:

**Structure smells:**

- Broad openings like "This document is used to..." without a decision.
- Repeated section patterns that say the same thing for every case.
- Tables whose cells are long paragraphs.
- Grammatically parallel bullets that are not intellectually prioritized.
- Every section ending with "notes" that restate prior content.
- Long chains of "need to / can / generate / receive / process" without owner, timing, or output.
- Balanced summaries that avoid saying "do this", "do not do this", or "this is the rule".

**Filler and padding:**

- Filler words that add no meaning: just, really, basically, actually, simply, essentially, fundamentally, importantly, significantly, effectively, generally, overall, arguably. Remove unless they carry real emphasis.
- Hedging that hides behind fake uncertainty: likely, probably, it seems, it appears, it could be argued, it should be noted, it is worth mentioning, it is important to note. Keep hedging only when the uncertainty is real, named, and the reader needs to know it.
- Throat-clearing openers: "In this document, we will...", "As mentioned above...", "It goes without saying...", "Before we begin...", "Let's take a look at...". Start with the content.
- Meta-descriptions of what a section contains instead of the content itself: "The following section describes the architecture." — just describe the architecture.

**Inflated language:**

- Generic verbs that mean nothing without context: `support`, `process`, `optimize`, `capability`, `workflow`, `closed loop`, `improve`, `ensure`, `leverage`, `utilize`, `facilitate`, `streamline`, `empower`, `enable`, `drive`. Replace with the specific action, or delete.
- Inflated phrases where shorter words work: "implement a solution for" → fix, "in order to" → to, "due to the fact that" → because, "at this point in time" → now, "a large number of" → many, "in the event that" → if, "prior to" → before, "with regard to" → about, "for the purpose of" → to, "has the ability to" → can, "it is necessary to" → must.

**Symmetric AI pattern:**

- Every option or feature described with equal weight, same sentence structure, and no recommendation. Human writers rank, choose, and say which matters more.
- Sections that all follow the same template without adapting to what is actually different about each item.

Do not remove domain terms merely because they are technical. Remove vagueness, not expertise.

## Rewrite Strategy

Choose structure by document job:

| Job | Preferred shape |
|---|---|
| Requirements / PRD | Problem -> users -> goals/non-goals -> scope -> workflows -> requirements -> acceptance criteria -> open questions |
| Engineering design | Context -> decision -> architecture -> alternatives -> contracts -> data flow -> failure modes -> rollout |
| Engineering spec / contract / rules | Conclusion -> hard rules -> decision path -> canonical definitions -> field/status contracts -> examples -> appendix |
| SOP | Trigger -> owner -> prerequisites -> steps -> checks -> exceptions -> escalation |
| Decision memo | Verdict -> decisions -> tradeoffs -> risks -> next action -> appendix |
| Research / analysis | Question -> method -> evidence -> findings -> confidence -> limitations -> implications |
| Meeting notes | Context -> decisions -> action items -> open questions -> reference notes |
| Postmortem / RCA | Impact -> timeline -> root cause -> contributing factors -> fixes -> prevention |
| General note / KB | Orientation -> key takeaway -> section map -> details |

For long documents, do not polish in place first. Extract the spine:

1. One-sentence main claim.
2. Three to seven decisions or rules.
3. Who owns each action.
4. Which details belong in appendix/reference.
5. Which repeated sections can share one template.

Then rewrite only within the user-approved action mode.

Before a substantive rewrite, inventory the source claims, decisions,
requirements, definitions, exceptions, and ownership statements that must be
preserved. After rewriting, reconcile that inventory against the result and
identify any intentional omission or changed meaning explicitly.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| Source meaning is ambiguous | Preserve the original claim and flag the ambiguity | Do not rewrite ambiguity into a stronger invented claim |
| Document mixes multiple types | Name the primary and secondary lenses before judging | Ask for the primary lens only when it changes the result |
| Requested rewrite would remove requirements | Keep the requirement and improve placement or wording | Mark the sentence as retained for semantic preservation |

## Anti-Patterns

- Do not rewrite before reading the actual document or excerpt.
- Do not turn every assessment into a full rewrite.
- Do not remove domain terms just to make prose sound simpler.
- Do not make formal documents chatty to make them sound human.
- Do not preserve AI-like filler because it sounds polite.

## Output Rules

Match the user's requested mode. Use natural headings in the user's language. Do not expose rigid labels like `Main claim I extracted`, `Main reading obstacles`, or `Rewritten version` unless the user asks for a machine-readable template.

For assessment, cover:

- Chosen or inferred setup.
- Readability verdict.
- Core viewpoint extracted from the document.
- Blocking issues, important improvements, and optional polish.
- Whether rewrite is recommended.

Rewrite control:

- If mode is `assessment only`, do not output a rewritten version. State whether rewrite is recommended.
- If mode is `assessment plus targeted suggestions`, provide focused changes, not a full rewrite.
- If mode is `rewrite only if blocking`, provide a rewritten version only when blocking issues exist.
- If mode is `rewrite directly`, rewrite directly with a short diagnosis first.
- For long documents, rewrite the most important section first unless the user explicitly asks for the full document.

## Editing Rules

**Structure:**

- Lead with conclusions and rules before explanation.
- Prefer prose over a table when table cells become paragraphs.
- Split source-of-truth rules from implementation details.
- Make negative rules explicit: "do not auto-post cash", "do not rewrite historical trades", "do not send Plan before confirmation".
- Replace repeated prose with one shared rule plus event-specific exceptions.

**Precision:**

- Keep strong domain nouns, exact dates, fields, statuses, and enumerations.
- Preserve real uncertainty, but name what is unknown and who resolves it.
- Choose the shorter word when meaning is preserved: use not utilize, build not implement, help not facilitate, about not with regard to, because not due to the fact that, can not has the ability to.

**Anti-AI-prose:**

- Default: every sentence should change what the reader knows or can do. If removing a sentence loses nothing, remove it. Exception: deliberate emphasis on safety or compliance points, reader-orientation sentences in long documents, and pacing breaks after dense sections may stay even when they do not add new information.
- Do not open sections with meta-descriptions of what the section contains. "This section describes X" — just describe X.
- Remove performative transitions: "Now let's turn to...", "Having discussed X, we can now...", "With that in mind...". The heading already signals the topic change.
- Do not pad with synonyms: "clear and concise", "robust and reliable", "efficient and effective". Pick the one that matters.
- When listing options or alternatives, rank them. Say which one is recommended and why. Do not give every option equal treatment unless they are genuinely equal.
- Do not make formal documents chatty. Human writing means judgment and economy, not casual tone. The goal is a document that sounds like a competent person wrote it — not a friendly AI, not a bureaucrat.

## Final Check

Before claiming the document is improved, verify:

- The main claim is visible in the first screen or first section.
- A new reader can state the next action after reading the conclusion.
- Repeated content has been collapsed or justified.
- Boundaries and non-goals are not buried.
- Any removed text was redundant, not a lost requirement.
- Read the first paragraph of each section aloud. If it sounds like AI wrote it — filler, hedging, throat-clearing, symmetric padding — tighten it. A human would not write "It is important to note that we need to ensure that the system is robust and reliable." A human would write "The system must not lose data."
