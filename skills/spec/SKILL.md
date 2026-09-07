---
name: spec
description: "Fixes unresolved compatibility, migration, public behavior, data, security, or cross-module architecture decisions and proves brownfield architecture conformance in an approved design spec. Not for clear local implementation choices, unsettled requirements, planning, or code changes."
when_to_use: "spec, unresolved compatibility, migration design, public behavior, data design, security design, cross-module architecture, 设计方案, 技术方案"
metadata:
  version: "0.4.6"
---

# loopx Spec

Turn clarified requirements into evidenced design decisions. Do not write an implementation plan,
change code, or invent business requirements. Clear local
implementation choices do not require this skill.

## Inputs and authority

Read the approved request, PRD, requirements document, or intake package and the
relevant repository code, contracts, and tests. Current user rulings and named
sources govern intent; relevant maintained specs bind existing constraints.
Memory is advisory. Use indexes or filenames to select relevant context, not a
blanket read of all specs or memory.

For `.loopx/intake/YYYY-MM-DD-<slug>/`, `requirements.md` owns requirements and
`AC-*` / `TC-*` coverage. Read `clarification.md` for exact wording or supporting
history only when needed. Missing material intake criteria/scenarios or conflicting
business requirements return to `clarify`. Existing legacy
`.loopx/intake/clarify-*.md` inputs remain readable; do not migrate them incidentally.

For brownfield work, read [the architecture conformance contract](../shared/architecture-conformance.md).
Inspect reuse candidates, owning modules, dependencies, state/fault boundaries,
and maintenance costs before recommending the design.

## Develop the decision

Resolve missing business goals, required behavior, acceptance, permission limits,
compatibility promises, or operational ownership from evidence or `clarify`.
Within known constraints, undecided API shape, data layout, rollout mechanism,
or module boundaries belong here: compare credible options and propose a choice.
Label pending technical decisions as proposed instead of blocking useful design
work or presenting them as already accepted.

Use a proposal when the user requests one, credible alternatives need comparison,
or the decision has material public/data/security/operational consequences,
migration cost, or is hard to reverse. Read [design-proposal.md](references/design-proposal.md).
For low-risk work with an accepted direction, proceed directly to detailed design.
Do not ask the user to select a document mode.

Deliver a proposal for decision when material technical choices await acceptance.
Existing explicit approval is sufficient. Before detailed design or planning
handoff, satisfy required proposal review and acceptance; do not finalize a
contract with missing evidence for a parallel capability, owning module, dependency direction, or state boundary.

## Artifacts and their owners

Use a stable kebab-case slug derived from the requested feature and this directory
for new outputs: `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`. Keep existing historical
files in place unless document maintenance is part of the task.

- `设计提案.md`: rationale and alternatives when a proposal is triggered.
- `需求设计文档.md`: detailed contract using [DESIGN_SPEC_TEMPLATE.md](DESIGN_SPEC_TEMPLATE.md).
- `概要设计.md`: architecture, core flows, and module boundaries when the
  `design-review` selection gate applies; create/update it before detailed design
  using [the overview template](../design-review/REVIEW_BRIEF_TEMPLATE.md).

The overview is maintained authority, not a generated summary. Preserve its
independent decisions, anchors, review issues, and revision history. When moving
an older design's overview content out of detail, transfer and verify coverage
before replacing sections 3.2–3.5 with a pointer. Field-level contracts remain in
the detailed design. Without an overview, those sections remain inline.

The detailed design references accepted proposal decisions and its requirement
source; do not reopen a settled direction in another file. If requested, produce
matching presentable HTML for the Markdown artifacts in scope.

## Detailed contract

Follow the template's core sections and conditional-section triggers, preserving
numbering. Do not repeat its full schema here or fill irrelevant triggered
sections with `无` / `不涉及`. The core includes revision history, requirements,
design overview and architecture checks, per-module details, Planning Handoff,
and QA with verification and contract index.

State applicable normal and failure boundaries, invalid inputs, permissions,
duplicates, concurrency, partial failure, dependency timeout, legacy data,
migration overlap, rollback, and protected behavior. Keep non-obvious exclusions
explicit; omit plainly irrelevant categories instead of requiring a ritual row.
A fallback or degraded mode is a design decision only when a source requirement
names the scenario and expected behavior.

When a revision changes a conclusion, update its owning section and append the
reason to `一、修订历史`. Update cross-document links and indexes without copying
the full decision into a second authoritative home.

## Stable anchors

Place implementation-relevant `D-*` anchors beside their decisions in the owning
overview or detailed section. Keep accepted IDs stable. Use applicable **Behavior
Contract**, **Data Contract**, **Interface Contract**, **Workflow Contract**, or
**Operational Contract** blocks. A Workflow Contract is required when changing
artifact fields, handoffs, gates, or downstream skill consumption.

Each entry names the D anchor, source AC when present, contract type, decision,
boundary/non-goal, and downstream planning/review expectation. The detailed
`Design Contract Index` lists every anchor and links to overview-owned decisions
without duplicating them. Proposal-only or no-implementation designs may use
`Design anchors: not applicable` with a reason; never invent meaningless IDs.

Preserve requirement-stage `TC-*` coverage in Verification Strategy as automated
checks, manual checks, or explicit deferred-with-rationale items. Make source
`AC-*`, design `D-*`, and scenario `TC-*` relationships recoverable for planning.
A missing decision cannot be repaired by assigning an anchor to a guess.

## Support lenses

Load only lenses triggered by the actual decision:

| Concern | Lens |
| --- | --- |
| REST/GraphQL, API schemas, client evolution | `api-designer` |
| Modules, reuse, shared state, boundaries, NFRs, deployment | `architecture-designer` |
| SQL, persistence, migration, indexes, query behavior | `sql-style` |
| CLI contracts and shell behavior | `cli-developer` |
| Handwritten Go contracts and idioms | `go-style` |
| Confirmed Go-Kratos framework work | `kratos` |

Record applied lenses, or `Support lenses: none`. Fold conclusions into this
unified design and its anchors; lenses do not create separate authoritative
contract files or override the base design.

## Handoff and STOP Conditions

Report produced paths, decision status, and concrete unresolved choices. Proposal
completion alone does not authorize a detailed or executable design. Request the
remaining decision only when it has not already been given.

When `design-review` applies, prepare its overview and recommend review of
`需求设计文档.md` before planning. Apply resolutions to their owning documents.
Use `plan2exec` when the accepted, internally consistent design needs a persistent
execution plan; it may choose local implementation details inside the recorded
Planning Handoff boundaries.

Do not hand off as ready while material business/design questions, required
review, architecture evidence, anchor coverage, or source conflicts remain open.
Resolve discovered facts directly, business decisions through `clarify`, and
technical decisions here. A document may be delivered as proposed or blocked
without falsely claiming approval or completion.
