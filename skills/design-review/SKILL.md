---
name: design-review
description: "Generates a mixed-audience presentation brief from an approved design, walks reviewers through the solution, records the issues they raise, and writes resolutions back into the design's revision history. Not for reviewing code, plans, or requirements, and not a replacement for spec."
when_to_use: "design-review, 设计评审, 评审材料, review brief, design sign-off, 方案评审, 口径确认, pre-implementation review"
metadata:
  version: "0.4.0"
---

# loopx Design Review

A review presents a settled solution; the problems come from the reviewers.
The presenter walks through the 方案 in declarative voice — including its
sensitive rulings and their costs — and reviewers challenge what they
disagree with. Silence on a presented ruling is acceptance. The deliverable
is the set of raised issues resolved and written back into the design
document — the brief is only the vehicle.

Do not organize the brief as a questionnaire. A brief full of blank
"请拍板" slots pushes design responsibility onto the audience and signals
the design was not ready to review.

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

- **The change inventory is mandatory.** Reviewers must see the blast
  radius before the walkthrough: how many tables (and whether existing
  schemas change), how many interfaces by surface, which services or
  modules are touched, and which core paths are guaranteed zero-diff.
  A brief that only narrates business behavior hides the review's scope.
- **Capabilities are presented as 诉求 → 设计 → 为什么.** Each capability
  cites the requirement it serves, shows the mechanism (state machine /
  flow / timeline diagram plus small field or rule tables), then gives the
  rationale — rule-heavy sections use a "规则 | 为什么" table. Rulings that
  deviate from the requirement's wording are bolded. Purely technical
  safeguards (concurrency, idempotency) appear as one-paragraph
  "技术辅助" quote blocks pointing into the detailed design.
- **Decisions consolidate into one table** (决策 | 结论 | 为什么 | 代价),
  ordered by business impact, cost column mandatory. Undecided items do
  not appear there — they mean the design is unfinished.
- **Confirmation points are few, last, and answered.** After the full
  walkthrough, a short list of yes/no items each with a suggested answer —
  every ruling that deviates from the requirement text must appear here.
  More than five or six means the walkthrough failed to digest the
  rulings. This is not a questionnaire: each item carries the presenter's
  recommendation.
- **Behavior language in the main body; depth goes to the appendix.** No
  file paths, line numbers, or code identifiers outside the technical
  appendix (实现要点、预研结论、`D-*` 对照). Translate field names into
  business terms. Per-stakeholder cooperation items and executable
  acceptance points each get their own section — they are what QA and
  neighboring teams take away.
- **Point, don't copy.** Detail lives in the design documents; the brief
  links to them. A brief that duplicates the design will drift from it.
  Keep the whole thing walkable in about 60 minutes; split the review
  rather than compress it.

## Running The Review

The presenter presents; reviewers raise issues. Record every raised issue
in the brief's issue table as it comes up (who raised it, what it
challenges). Before closing, every raised issue lands in exactly one of:

| Resolution | Meaning | Follow-up |
|---|---|---|
| 采纳修改 | design must change | named change, owner, affected sections |
| 解释后维持 | objection answered, design stands | record the answer, one line |
| 搁置 | cannot be settled in the room | owner and a date; stays open |

Presented rulings that drew no objection are accepted as-is — do not chase
the room for explicit sign-off on each one. "讲完了" with unrecorded
objections, however, is not a finished review; capture every challenge
before it evaporates.

Accepted changes land as **评审变更 rows in the brief's version table**
(what changed, why — one line each) in addition to the design document's
revision history. The brief thus carries its own audit trail of what the
review altered, the way a v2.1/v2.2 changelog does.

## Writing Resolutions Back

After the review, the design document is the single source of truth again:

1. append one row to the design's `一、修订历史` summarizing the review
   (date, issues raised, what changed);
2. apply 采纳修改 resolutions to the affected sections inline, each with a
   short note referencing the review;
3. update the design's open-questions table: resolved items get their
   resolution and status; 搁置 items keep `open` with owner and date;
4. items still open after the review block `plan2exec` — they are exactly
   the "material decisions remain unresolved" of its STOP conditions.

## STOP Conditions

- The design still carries material open questions the designer could not
  settle — it is not review-ready. A review presents a settled 方案;
  route the open questions back to `clarify` or `spec` first. A small
  遗留问题 list is acceptable; a design that needs the room to make its
  decisions is not.
- The design has no proposal and no `D-*` anchors to generate from —
  finish `spec` first; do not reverse-engineer a brief from prose.
- Reviewers are asked to approve a design whose implementation already
  shipped — say so in the brief's header; the review becomes a 口径确认,
  and 采纳修改 resolutions must state migration cost, not just design cost.

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

- A brief organized as a questionnaire — blank verdict slots asking the
  audience to decide. The presenter presents decisions; reviewers challenge
  them.
- A walkthrough with no diagrams, or one where a fixed callout template
  repeats a dozen times — both are unreadable in a room; the former hides
  the mechanism, the latter buries the signal in boilerplate.
- A brief with business narrative only — no change inventory (tables,
  interfaces, touched modules), no consolidated decision table, no
  per-stakeholder cooperation items — reviewers leave without knowing
  the blast radius or what they owe.
- A brief that hides the design's sensitive rulings inside neutral prose —
  reviewers cannot challenge what they cannot see.
- Code identifiers in the main body of a mixed-audience brief.
- A review that produced minutes but left raised issues unresolved and
  ownerless.
- Resolutions recorded only in the brief and never written back to the
  design.
