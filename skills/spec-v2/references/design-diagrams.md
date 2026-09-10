# Design diagrams

Use views to expose relationships that affect the design decision. Apply this
reference within the selected design's scope; it does not make a clear local
implementation choice require a spec. Select views while drafting, without
producing a selection checklist or rows explaining every omitted diagram type.

## Select by the question

| Design question | Preferred view | Content needed to answer it |
| --- | --- | --- |
| Who owns behavior/state, and which dependencies or boundaries change? | Architecture or module dependency diagram | Responsibilities, labeled dependency direction, state owner, changed boundary |
| Does correctness depend on interaction order, asynchronous delivery, or concurrent actors? | Sequence diagram | Participants, synchronous/asynchronous interactions, ordering constraints, side effects and relevant failure outcomes |
| Which branch runs, and who performs each step? | Flowchart or swimlane | Trigger, branch conditions, responsible actor, exits and relevant exceptional paths |
| Which lifecycle transitions are legal? | State diagram or transition table | States, events, guards, side effects, terminal states and treatment of invalid transitions |
| How do changed entities relate? | ER diagram or relationship table | Relationship keys, cardinality, optionality and ownership; distinguish logical links from enforced foreign keys |
| Where is data obtained, transformed, and derived? | Data flow diagram | Sources, transformations, stores, authoritative versus derived data, relevant consistency boundary |
| Where does software run, and what isolates failures? | Deployment diagram | Instances, network links, execution locations and affected failure boundaries |

These are choices for the designer, not a required set of deliverables. Do not
draw a class diagram, deployment diagram, or every C4 level merely because the
template has a related section. Prose or a compact table is sufficient when it
makes the relevant relationships unambiguous, subject to these triggers:

- Changed ownership, dependency direction, or isolation boundaries require an
  architecture view. A small labeled box-and-arrow view is sufficient.
- Cross-system correctness that depends on interaction order requires a sequence
  diagram. Include asynchronous or concurrent paths when they determine the
  result; do not imply a total order where execution is concurrent.
- A core flow whose material branches distinguish skipping an item, rejecting
  input, failing the whole operation, or returning successful results needs a
  flow view when prose would scatter those conditions across steps and tables.
  Show branch conditions, loop continuation/completion, empty success and failure
  exits where applicable. One local guard and return can remain prose or a table.
- When shared source data produces different outputs and that difference is part
  of the decision, provide a data-flow comparison or compact comparison table:
  shared stages, divergence point, transformations, output and relevant example.
  Label independent paths so a comparison cannot imply both execute in one request.
- Changed lifecycle rules require a state diagram or complete transition table
  for the affected lifecycle. Prefer a diagram when cycles or branching make a
  table hard to follow; reference unchanged transitions when showing a delta.
- Changed relationships among multiple entities require an ER diagram or an
  explicit relationship table. An isolated field change does not trigger one.

## Show the decision and its boundaries

Give each diagram a short caption stating the question and whether it shows
current behavior or a proposed/accepted design. For changes, label added,
modified, and removed elements in text or a legend; color alone is insufficient.
Use repository/domain names consistently. Explain arrow meanings when they could
be read as either a call, a dependency, or data movement.

Keep captions focused on the question. Use short responsibility labels in
overview diagrams; map them to exact modules in nearby text or linked detail.
Keep file paths and long signatures out of nodes. Put an excluded component in
a note rather than drawing a dependency arrow to something this path never calls.

For sequence diagrams, identify important commits, external side effects and
their ordering when relevant. Show the timeout/failure outcome, including an
unknown result when that is the contract. For concurrent writes, expose the
competing actors and the invariant/conflict outcome rather than drawing two
successes in a misleading serial order. Follow the existing concurrency contract
for design decisions; a diagram must not invent its own coordination mechanism.

For state views, make guards and transition effects recoverable from the view
or adjacent contract. State how unlisted/invalid transitions are handled; do not
require drawing every forbidden edge. A diagram may use a supporting table for
guards or effects without restating the whole lifecycle twice.

Show normal behavior and the exceptional paths that determine the decision.
One view should answer one main question. Split a crowded success/failure or
concurrency view and link the parts; state which case each part covers. Reference
less central cases in the adjacent boundary section. Do not add services, stores,
states, retries, compensation, or degraded modes just to complete a picture.
Represent unresolved choices as proposed or open, following existing spec gates.

## Keep one maintained home

Place diagrams beside the decisions they explain. The overview owns system
boundaries, core business flows, and module responsibilities; detailed design
owns transaction/concurrency details and field-level relationships. Without a
separate overview, keep overview views in the detailed template's existing
sections. Different abstraction levels may link to each other without duplicating
the same view. Captions link relevant existing `D-*` anchors or the owning section;
do not invent decision anchors for decoration or create a separate diagram index.

Update a view when its owning contract changes. Other documents reference that
home. When a proposal becomes an accepted contract, move its maintained view to
the owning overview/detail and leave a pointer; label any retained historical
snapshot clearly. Preserve existing review history and independent decisions.

The diagram is a view of the same contract, not a separate source of authority.
Resolve conflicts against accepted decisions and source evidence; do not silently
prefer either a drawing or prose. Unresolved material conflicts block handoff
under the existing rules.

## Presentation

Prefer Mermaid embedded in Markdown for maintainable diagrams. Use another
format when the target document or layout requires it; retain an editable source
or a stable source link. Render using an available renderer and inspect the
result. Parsing alone checks syntax, not layout. If rendering is unavailable,
record that limitation and the checks actually performed in existing QA; do not
claim rendered verification or add a tool-installation/approval gate. A known
unreadable diagram must be simplified or corrected before presentation.

For semantic walkthroughs, decision links and final QA, apply
[design-quality.md](design-quality.md). Check affected views again after revisions.
