---
name: design-review
description: "Generates a mixed-audience review brief from an approved design, runs the review to verdicts, and writes resolutions back into the design's revision history. Not for reviewing code, plans, or requirements, and not a replacement for spec."
when_to_use: "design-review, 设计评审, 评审材料, review brief, design sign-off, 方案评审, 口径确认, pre-implementation review"
metadata:
  version: "0.1.0"
---

# loopx Design Review

Turn a completed design into decisions. The deliverable of a review is the
set of verdicts written back into the design document — the brief is only
the vehicle. A review that ends without verdicts has not happened.

## Position In The Workflow

```
clarify → spec → [design-review] → plan2exec → 执行 → code-review
```

`design-review` sits between `spec` and `plan2exec`. It is the only stage
where product and QA see the design before implementation starts. Open
review items are unresolved material decisions: per `plan2exec`'s existing
STOP conditions they block planning until resolved or explicitly deferred
with an owner and a date.

## Selection Gate

Run a review when at least one applies:

- the design changes public contracts, data schemas, or state machines;
- the design crosses system boundaries or affects another team's behavior;
- a decision is hard to reverse after implementation (storage layout,
  compliance-relevant behavior, external commitments);
- the design contains rulings that product or QA have not seen — deadline
  semantics, timezone choices, degraded-mode behavior, "known not-doing";
- the user explicitly asks for a design review.

Skip the review for local implementation choices, refactors with no
behavior change, and designs whose every decision was already ruled by the
requester in `clarify`. Do not turn the gate into a ceremony.

## Inputs

Read, in priority order:

1. the detailed design (`需求设计文档.md`) — its `十一、QA` open questions,
   `D-*` contract index, and per-module boundary tables;
2. the design proposal (`设计提案.md`) when present — abstract, non-goals,
   rejected alternatives, accepted costs;
3. the intake `requirements.md` — `AC-*` anchors and recorded rulings.

The brief is **generated from these sources, never hand-written**. When the
design is revised, regenerate the brief; do not patch it by hand.

## Output: The Review Brief

Write to the design directory, next to its sources:

- `docs/loopx/design/YYYY-MM-DD-<slug>/评审材料.md`

Use [REVIEW_BRIEF_TEMPLATE.md](REVIEW_BRIEF_TEMPLATE.md) as the required
structure. Rules that make it work for a mixed audience:

- **Decision points are the spine.** Organize by "what needs a verdict",
  not by the design's chapter order. Everything else is context.
- **Behavior language only.** No file paths, line numbers, table columns,
  or code identifiers in the main body. Translate `annual_confirm_due_at`
  into "下次年度确认日". A technical appendix may reference `D-*` anchors.
- **Every decision point carries its price.** State the current design,
  the accepted cost, and the cost of changing it now versus after launch.
  Reviewers cannot weigh a decision whose price is hidden.
- **Time-budgeted.** Mark each section with minutes; the whole brief must
  be walkable in about 60 minutes. If it cannot, the decision list is too
  long — split the review, do not compress the decisions.
- **Point, don't copy.** Detail lives in the design documents; the brief
  links to them. A brief that duplicates the design will drift from it.

## Running The Review To Verdicts

Every decision point ends in exactly one of:

| Verdict | Meaning | Follow-up |
|---|---|---|
| 通过 | design stands as written | none |
| 修改 | design must change | named change, owner, affected sections |
| 搁置 | deferred with rationale | owner and a date; stays open |

Record verdicts in the brief's resolution table during the review. "讲完了"
is not a verdict; chase each item until it lands in one of the three.

## Writing Resolutions Back

After the review, the design document is the single source of truth again:

1. append one row to the design's `一、修订历史` summarizing the review
   (date, verdicts, what changed);
2. apply 修改 verdicts to the affected sections inline, each with a short
   note referencing the review;
3. update the design's open-questions table: reviewed items get their
   verdict and status; 搁置 items keep `open` with owner and date;
4. items still open after the review block `plan2exec` — they are exactly
   the "material decisions remain unresolved" of its STOP conditions.

## STOP Conditions

- The design's own open questions include decisions that belong to
  `clarify` (product intent) — route back instead of reviewing a guess.
- The design has no proposal and no `D-*` anchors to generate from —
  finish `spec` first; do not reverse-engineer a brief from prose.
- Reviewers are asked to approve a design whose implementation already
  shipped — say so in the brief's header; the review becomes a 口径确认,
  and 修改 verdicts must state migration cost, not just design cost.

## Boundary

- Do not review code (`code-review`), plans (`plan-reviewer`), or
  requirements (`requirement-analyzer`).
- Do not settle new product decisions inside the review — unresolved
  product intent routes to `clarify`.
- Do not edit the design's technical content beyond applying verdicts.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| A decision point has no price attached | Derive cost from the design's boundary tables and compatibility section | Mark it `insufficient-context` in the brief; it cannot be verdicted |
| Review ends with unresolved items and no owners | List them in the resolution table as 搁置-without-owner | Keep the design's status blocked; `plan2exec` must not proceed |
| The design changed after the brief was generated | Regenerate the brief from the revised design | Never hand-patch a stale brief |

## Red Flags

- A brief organized by the design's chapter structure instead of by
  decisions — that is a summary, not a review instrument.
- Code identifiers in the main body of a mixed-audience brief.
- A review that produced minutes but no verdicts.
- Verdicts recorded only in the brief and never written back to the design.
