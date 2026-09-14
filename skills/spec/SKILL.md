---
name: spec
description: "Design or review changes to behavior, APIs, data, security, or module boundaries (技术方案、设计评审). Record decisions and check them against requirements."
metadata:
  version: "0.5.0"
  when_to_use: "spec, design spec with diagrams, sequence and state design, 设计方案, 技术方案"
---

# loopx Spec

Turn clarified requirements into evidenced design decisions. Do not write an implementation plan,
change code, or invent business requirements. Clear local
implementation choices do not require this skill.

If the user only asks to record an accepted local choice, write a compact record
of the rule, source, protected behavior and useful examples. Do not expand it
into the design templates, architecture tables or planning/index sections merely
because the request names this skill. The templates below serve material design.

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

When concurrent persisted state is involved, read and apply
[the database concurrency contract](../shared/database-concurrency.md).

## Develop the decision

Resolve missing business goals, required behavior, acceptance, permission limits,
compatibility promises, or operational ownership from evidence or `clarify`.
Within known constraints, undecided API shape, data layout, rollout mechanism,
or module boundaries belong here: compare credible options and propose a choice.
Label pending technical decisions as proposed instead of blocking useful design
work or presenting them as already accepted.

Consider credible options for public behavior, data, security, operations,
migration cost, or module ownership. Explain a choice briefly in the overview
when readers need its reasons or costs. A written comparison is optional; do not turn
the detailed design into a decision log. Do not create a separate `设计提案.md` by default.

Ask for acceptance only for a material decision the user has not already made.
Continue design work that does not depend on it. Do not finalize a contract with
missing evidence for a parallel capability, owning module, dependency direction,
or state boundary.

## Artifacts and their owners

Update existing design documents in place. For new outputs use
`docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`. Keep these roles:

- `概要设计.md` explains the overall solution, core flows, module relationships,
  and necessary rationale using [the overview template](REVIEW_BRIEF_TEMPLATE.md).
- `需求设计文档.md` defines interfaces, fields and implementation constraints using
  [DESIGN_SPEC_TEMPLATE.md](DESIGN_SPEC_TEMPLATE.md).

Create or update the overview before detail when changing public contracts, data
models, state machines, cross-system behavior, or hard-to-reverse decisions, or
when a stakeholder review is requested. A compact accepted local choice still
needs only a short record; do not apply both full templates to a small correction.

The overview is maintained authority for its architecture, core flows, module
boundaries and `D-*` decisions. Read it before updates; preserve its independent
decisions, anchors, review issues and revision history. Detail owns field-level
contracts and links to the overview. Transfer and verify content before replacing
old sections with links. The detailed design describes the current implementation design and constraints.
It does not need an alternatives table or discussion history. Apply accepted review
changes to the current design; preserve existing review records without requiring
a new log for every decision. Merging the review skill does not merge these documents.

Read accepted historical proposals when relevant without requiring a new one.
Each decision has one full home. Produce matching HTML only when requested.

## Design review

For an explicit review request, inspect the existing design and report findings;
do not rewrite it unless editing is authorized. Read
[the design review guidance](references/design-review.md) when review is requested
or an unreviewed decision risks data loss, security, public compatibility, or a
hard-to-reverse change. Use existing acceptance; do not reopen settled decisions
just because another document was produced. Review only the affected scope after
revisions. A wording or layout suggestion does not block implementation.

## Design expression

Before drafting, read [design-diagrams.md](references/design-diagrams.md) to
select views for the relationships changed by this design. Use its trigger and
content rules in proposals, overviews, and detailed contracts; simple decisions
may need only prose or a table. Architecture alone does not explain runtime
branches or different projections of the same data. Do not output a
diagram-selection checklist.

Choose one main representation for each mechanism. Supporting prose, steps and
tables add missing contract detail; omit sections that would only restate it.
Keep business inputs, outcomes, exceptions and tradeoffs in the overview; place
signatures, file paths, exact field/error mappings and generation details in the
detailed design. Preserve any technical name needed to understand a decision.
Keep source domain distinctions when simplifying labels; explain an unfamiliar
term rather than replacing it with a broader event or concept.

Before handoff, apply [design-quality.md](references/design-quality.md): walk
source scenarios through the contract, resolve contradictory guarantees, and
check decision links and presentation. Record actual results and limitations in
existing QA. These checks add no workflow stage or approval step.

## Detailed contract

Use the templates as adaptable writing scaffolds. Preserve their required
information, not a fixed chapter count, order, numbering or per-module schema.
Organize a new document around its actual decisions and mechanisms; combine
related sections and omit irrelevant ones without placeholder rows. A wrapper,
injection field or generation script does not need its own module chapter.
Keep source/scope, decisions and architecture evidence, protected boundaries,
revision/status, verification and downstream limits recoverable. Keep decision links, verification, and implementation boundaries easy to find.
The template calls these `Design Contract Index`, `Verification Strategy` and
`Planning Handoff`; equivalent headings or compact blocks are sufficient.
Preserve existing anchors and cited section numbers when updating documents;
move content only with reconciled inbound references and revision evidence.

State applicable normal and failure boundaries, invalid inputs, permissions,
duplicates, concurrency, partial failure, dependency timeout, legacy data,
migration overlap, rollback, and protected behavior. Keep non-obvious exclusions
explicit; omit plainly irrelevant categories instead of requiring a ritual row.
A fallback or degraded mode is a design decision only when a source requirement
names the scenario and expected behavior.

When a revision changes a conclusion, update its owning section. Record the
reason briefly when needed to explain a changed contract, and preserve existing
revision history; routine drafting needs no separate decision record. Update cross-document links and indexes without copying
the full decision into a second authoritative home.

## Stable anchors

Place implementation-relevant `D-*` anchors beside their decisions in the owning
overview or detailed section. Keep accepted IDs stable. Use applicable **Behavior
Contract**, **Data Contract**, **Interface Contract**, **Workflow Contract**, or
**Operational Contract** blocks. A Workflow Contract is required when changing
artifact fields, handoffs, gates, or downstream skill consumption.

Each entry names the D anchor, source AC when present, contract type, decision,
boundary/non-goal, decision status, and downstream planning/review expectation.
Give each anchor one explicit target at its owning decision. The detailed
`Design Contract Index` lists every anchor and links to overview-owned decisions
without duplicating them. Use working Markdown links, not bare document names or
an index entry pointing to several possible owners. Proposal-only or no-implementation designs may use
`Design anchors: not applicable` with a reason; never invent meaningless IDs.

Preserve requirement-stage `TC-*` coverage in Verification Strategy as automated
checks or manual checks. Defer a required scenario only with explicit source-owner
authorization; a rationale alone cannot remove acceptance. Make source
`AC-*`, design `D-*`, and scenario `TC-*` relationships recoverable for planning.
Check the expected behavior as well as the IDs. A missing decision cannot be
repaired by assigning an anchor to a guess. Implementation and final verification
must read the original requirement as well as the design, even when a plan exists.

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

## Handoff and unresolved decisions

Report the design path, actual decision/review status, and concrete unresolved
choices. Do not claim acceptance from delivery, silence, or a prepared review.
Unresolved business requirements belong in `clarify`; technical decisions remain
here. Block only work that depends on a material unresolved choice or conflict.
Formatting does not create a new approval step.

An accepted design can guide implementation directly when the user has authorized
it. Use `plan2exec` only when a separate persistent plan is needed. Neither a
successful design walkthrough nor matching AC/D/TC IDs proves that code works;
verify the implementation against the original requirements and actual behavior.
