---
name: design-review
description: "Prepares and maintains a standalone high-level design (概要设计) for mixed-audience review — what will be built, how, and what will change — records the issues reviewers raise, and writes resolutions back into the detailed design's revision history. Not for reviewing code, plans, or requirements, and not a replacement for spec."
when_to_use: "design-review, 设计评审, 评审材料, review brief, design sign-off, 方案评审, 口径确认, pre-implementation review"
metadata:
  version: "0.5.4"
---

# loopx Design Review

Prepare and maintain a standalone 概要设计 for mixed-audience review: what will be
built, how it works, and what changes. Present an evidenced design and its costs;
reviewers raise objections. Do not invent decisions to fill a presentation or
turn the document into a questionnaire that delegates all design work to the room.

## Select the review

Review when requested, or when a design changes public contracts, schemas, state
machines, cross-system behavior, hard-to-reverse decisions, or material rulings
product/QA have not reviewed. Skip ceremony for local choices and already accepted
behavior-preserving designs. This skill reviews design, not code, execution plans,
or requirements; those use host review, `plan-reviewer`, or `requirement-analyzer`.

The overview is the single home of architecture, core flows, and module boundaries.
Detailed design owns field-level contracts. Material unresolved decisions block
implementation handoff; minor review suggestions need not block unrelated work.

## Inputs

Read the existing `概要设计.md`, detailed `需求设计文档.md` and its QA/D-* index,
accepted `设计提案.md` when present, and source `requirements.md` / `AC-*` rulings.
Source business requirements constrain the design; reading the overview first
preserves its content and does not make it override those requirements.

Preserve overview-only decisions, anchors, raised issues, resolutions, and version
history. Do not regenerate the overview from detail alone. For an older design
without one, transfer architecture/flow/module content, verify coverage, then
replace detailed sections 3.2–3.5 with a link. Missing design decisions return to
`spec`; do not fabricate them during review preparation.

## Output: The Review Brief

Maintain `docs/loopx/design/YYYY-MM-DD-<slug>/概要设计.md` alongside its sources,
using [REVIEW_BRIEF_TEMPLATE.md](REVIEW_BRIEF_TEMPLATE.md).

- Use the engineering structure: background/scope, overall design, modules,
  change inventory, stakeholder impact, risks, and acceptance.
- Give each decision one full home: module rules in that module, cross-module
  choices in the overall design, review questions as short linked items.
- Describe actual brownfield pain or greenfield goals; do not invent legacy defects.
- Explain module needs, design, rules, and reasons. Use diagrams where they clarify
  state, timing, or flow; a trivial module need not have a decorative diagram.
- Make deviations from source wording visible with their rationale and pending
  decision. Settled requirements remain settled; technical recommendations remain
  proposals until the required acceptance is recorded.
- Prefer business language for mixed audiences. Keep necessary API names or evidence
  anchors with a brief explanation; move dense implementation listings to the appendix.
- State the real change inventory and cooperation needed. Claim “core path unchanged”
  only when scope and verification support it. Do not invent counts or guarantees.
- Match tense to implementation status. For shipped work, mark this as a confirmation
  review and account for migration cost; acceptance points distinguish tested from pending.

## Record review outcomes

Record who raised each issue, the challenged decision, evidence, and resolution:

| Resolution | Record |
| --- | --- |
| 采纳修改 | Accepted change, owner, affected sections |
| 解释后维持 | Explanation and recorded outcome |
| 搁置 | Unresolved choice, known owner/date, and whether it blocks handoff |

Preparing or sending the document is not evidence a review occurred. Record the
actual review result. A no-objection convention may apply only to an explicitly
completed review that adopted it; silence in chat, a pending response, or elapsed
time is not acceptance. Do not request individual sign-offs again for decisions
already explicitly approved.

## Write resolutions back

1. Apply accepted changes to their owning overview or detailed section, preserving
   stable `D-*` anchors and updating the detailed Design Contract Index and links.
2. Record review changes and reasons in the overview version table and detailed
   `一、修订历史`, without duplicating the full decision.
3. Close resolved questions with their evidence. Keep deferred items open, with
   owner/date where established and an explicit effect on readiness.
4. Block `plan2exec` handoff only for material unresolved decisions on its scope.
   An owner/date alone does not make a blocking question safe; an accepted scope
   deferral must remove that dependency from the work allowed to proceed.

## STOP Conditions

If the source is unreadable, required proposal acceptance is missing, or no
implementation-relevant `D-*` decisions exist, identify the missing input and
return to `spec` before representing the design as ready. Missing business intent
belongs to `clarify`; an open technical proposal can be discussed for decision but
must remain visibly proposed.

When a source changes after preparation, reconcile the affected owning sections
and preserve independent overview decisions and history. Do not silently choose
between conflicting contracts or edit technical content beyond accepted resolutions.
Report the artifact, actual review status, resolved issues, and remaining blockers.
