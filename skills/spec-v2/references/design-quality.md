# Design quality checks

Apply before delivering a proposal, overview or detailed design, and again to
affected decisions after a revision. Use existing QA or proposal quality notes;
do not create a separate report, approval gate or mandatory per-diagram checklist.

## Walk scenarios through the contract

Walk through a source-backed normal scenario and a material exceptional scenario
when applicable. Prefer existing `TC-*` references; when the source has no IDs,
cite its section or concrete example instead. Additional paths are needed only
when they exercise a different design decision. Simple work without an exceptional
path need not invent one. Do not allocate new TC IDs just for reviewing the document.

Trace concrete input through its entry checks, data selection, transformations,
responsible owners and final caller-visible result. Include persistent/external
effects and commit boundaries only where they exist. Follow a relevant failure
after earlier work has succeeded: what is retained, rolled back, discarded, or
still unknown? A collection flow must distinguish skipped items, empty success
and whole-request failure; earlier collected items do not imply a partial reply.

Compare each step against source requirements, diagrams, tables and field/error
contracts. Check guarantees and their assumptions:

- A read-only operation can observe changing data. Deterministic ordering applies
  to the same input data; absence of writes does not guarantee identical results
  across requests or snapshot consistency.
- An idempotency promise concerns repeated effects; it does not automatically
  promise a stable response or once-only execution.
- "Raw", "exact" and "unchanged" values need consistent transformation rules.
  Trimming, case folding or normalization must have a source-backed contract;
  examples must use the same representation as the returned fields.
- Internal errors and wire responses can differ. Trace conversion before claiming
  a client can observe a particular code, detail or message.

Correct factual errors from evidence. If a source promise conflicts with known
behavior or lacks a necessary material assumption, quote the conflict and mark
the affected guarantee pending/proposed using existing decision rules. Do not
quietly weaken an accepted requirement or invent a cache, snapshot, lock, retry
or compatibility change to make the scenario pass. Continue unrelated decisions.

Record the scenario references, concrete outcomes and any unresolved mismatch
briefly in QA. Distinguish document walkthroughs from executed system tests.

## Check ownership and repetition

For each decision, locate the one section that owns its complete rule and status.
An overview may summarize a technical decision and link its detail. The detailed
design may reference a business flow without retelling it. Supporting tables add
exact guards, fields, errors or evidence rather than maintaining a second copy
of the same algorithm. Remove redundant steps and placeholder rows while keeping
all source acceptance and non-obvious boundaries recoverable.

Give each implementation-relevant `D-*` a unique explicit anchor beside the
decision. The index links to that anchor, including overview-owned decisions;
source ACs and downstream expectations remain recoverable. Do not put every
decision definition in the index or create anchors for presentation alone.

For example, an overview-owned decision can use this pattern (replace the rule
and status with the actual decision; this is not an output requirement):

```markdown
<a id="D-001"></a>
**D-001 · Behavior Contract · Proposed**: <rule, source, boundary, expectations>
```

Its index entry uses a relative Markdown link such as
`[D-001](概要设计.md#D-001)`. Link references in generated documents to their actual
source/decision files, not to the skill's authoring templates. Retain existing
accepted IDs when moving a decision; check all inbound references after the move.

## Check presentation separately

- Resolve document links and explicit anchors, including the D index; bare
  filenames, section numbers and IDs alone do not provide navigation.
- Check view names, arrows, branches and outcomes against the walkthrough. No
  component, transition or recovery mechanism may exist only in a drawing.
- Follow the diagram reference's render guidance and inspect label/layout clarity.
  Record render and link-check evidence separately from semantic results. An
  unavailable renderer explains only the visual-verification limitation.

Report only checks actually performed. A balanced code fence or parsed diagram
does not demonstrate readability, and a correct diagram does not prove the
implementation. Material unresolved contradictions keep their existing effect
on handoff; successful presentation checks do not clear them.
