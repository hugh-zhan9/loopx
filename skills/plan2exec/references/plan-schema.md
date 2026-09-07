# Plan Document Schema

A plan is one document serving two readers at once: a narrative body a human
reads top-to-bottom to understand and approve the work, and a thin machine
layer — YAML frontmatter plus one meta block per slice — the executing agent
consumes for ordering, isolation, and progress. loopx ships no execution
runtime; the agent follows the document. The current repository remains
authoritative for local implementation choices.

## Frontmatter: slice graph and progress

The frontmatter is the only record of dependencies and execution status. Do
not repeat either in the body.

```yaml
---
schema: loopx-plan/v1
source: <approved request, intake package, requirements, or design path>
status: ready            # ready | blocked
slices:
  - id: P-001
    status: pending      # pending | in_progress | done | blocked
    depends: []          # always explicit; an empty list asserts independence
  - id: P-002
    status: pending
    depends: [P-001]
---
```

The executing agent updates each slice `status` as work proceeds, so an
interrupted handoff resumes from the frontmatter instead of re-deriving
progress from prose.

`schema: loopx-plan/v1` identifies the current contract, including the required
per-slice `architecture` line. An unversioned plan is legacy input: revise it
through `plan2exec`, preserve existing `P-*` identifiers, and add the current
schema and architecture evidence before execution. Do not infer that a
malformed current plan is legacy merely because a required field is absent.

## Body template

# <Feature Name>

## Goal And Boundaries

Narrative the requester can approve in one read: the observable result the
plan must deliver, the design conclusions the source has already settled,
explicit non-goals, protected behavior, compatibility rules, dependency
limits, and approval boundaries. Use diagrams (for example mermaid) and
repository file links where they carry real information.

## P-001 <coherent outcome>

Each slice is a heading plus a few short paragraphs of prose: what this slice
delivers, how it connects to the rest of the plan, and the observable
conditions that mean it is done. Write acceptance into the prose as
statements a reviewer can check, not as a separate form field.

End every slice with one meta block:

> writes: `<repository-relative paths this slice may modify>`
> anchors: `<AC-*, D-*, TC-*, a summarized requirement, or deferred-with-rationale>`
> architecture: `<reuse/extension target or justified new capability; owner and dependency direction; state/fault boundary; maintenance check, or evidence-backed not_applicable>`
> verify: `<exact known commands, or the required check and its observable evidence>`
> review: `<contract or regression risk an independent reviewer must check — high-risk slices only>`

Add `P-*` slices only for coherent outcomes with distinct dependency,
interface, or acceptance boundaries. Preserve existing identifiers during
plan revision and append new ones instead of renumbering.

## Integration And Final Verification

- `<cross-slice behavior, regression checks, packaging, documentation, or final suite evidence>`
- `<whole-diff architecture check: chosen reuse point, dependency and state boundaries, no parallel source of truth, maintenance tests and diagnostics>`
- `<source anchors covered only at integration level, if any>`

## Handoff And Residual Risks

- Blockers: `<none or concrete unresolved blocker>`
- Residual risks: `<none known or concrete remaining risk>`
- Resume note: `<none before execution; during execution, failed/next action and
  references to the baseline, accepted content checkpoint, and candidate state>`

## Execution rules for the consuming agent

- Execute slices in frontmatter dependency order; verify each slice with its
  `verify` line before starting dependents, and update its frontmatter
  `status` as work proceeds.
- Two slices may run in parallel only when neither depends on the other and
  their `writes` paths are disjoint and their `architecture` lines identify no
  shared mutable state, generated output, migration, or hidden interface;
  integrate results sequentially.
- Recheck each slice's architecture evidence against the current tree before
  editing. Preserve cited reuse points, ownership and dependency direction,
  isolation boundaries, and maintenance checks; route new architecture
  decisions back to `spec`.
- Keep the frontmatter and body consistent: every frontmatter slice id has
  exactly one body section, every slice declares `depends` explicitly (an
  empty list asserts independence), and dependencies appear only in the
  frontmatter.
- Follow the installed working agreement for verification, review, stop, and
  Git discipline throughout.

Do not add step-by-step edit instructions, code snippets, time estimates,
fixed launch schedules, or per-slice commit commands.
