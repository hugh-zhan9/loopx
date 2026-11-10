# Task documents

Use these as compact content guides, not a form that creates work. Prefer an
existing issue/task system's records and IDs. If a file package is needed, use
`docs/loopx/tasks/<requirement-slug>/index.md` and `<task-id>.md`; keep identifiers
stable when revising a split. The index and briefs are documents interpreted by
people and agents, not executable workflow state.

## Requirement index

Record the original source and its version, overall outcome, protected/shared
constraints, and the person or coordinating agent responsible for integration.
List tasks with their deliverables, brief links, dependency types and necessary
start/finish conditions. If an external tracker owns progress, link it instead
of maintaining another status copy.

Map each required source outcome to task acceptance, requirement-level integration
acceptance, or an explicitly authorized deferral. Use source anchors when present;
otherwise use recognizable source sections. Unassigned or pending outcomes stay
visible. Shared contract decisions link to their authority, owner and affected
tasks. Record unknown owners as unknown rather than inventing assignments.

## Task brief

- **Goal and source scope:** observable result, original requirement sections,
  exclusions and applicable shared constraints.
- **Inputs and delivery:** required input meaning, output artifacts/contracts,
  existing capabilities to reuse and owning modules when known.
- **Decision boundary:** what the executor may choose locally, what is settled,
  and which questions require coordination before dependent work.
- **Dependencies:** contract/artifact/integration evidence; what must exist before
  starting and before finishing; code or shared-state ownership relevant to overlap.
- **Context:** necessary original-source sections, shared contracts, repository
  entry points and dependency result locations. Explain why each belongs here.
- **Acceptance:** local behavior and failure cases with observable checks; identify
  what remains for requirement-level integration. No implementation microsteps.
- **Result:** after execution, delivered version/content identity, evidence scope,
  limitations, unresolved items and downstream starting point. Before execution,
  leave this empty or state not started; never pre-fill a success claim.

A small task needs only a short brief. Attach a plan only when useful; it may
reference the brief as its source while retaining the original source links.
For incomplete work, link the existing recovery checkpoint rather than replacing
it with this result section.

## Example: serial delivery without carrying the transcript

An import requirement can have three tasks: parse input into a documented record
format; reconcile those records with existing accounts; connect the real source
and downstream consumer. Parsing delivers the schema, sample cases and its verified
implementation identity. Reconciliation needs the agreed record meaning to start
local work; real source/consumer delivery is required for integration acceptance.
Integration delivers proof of the actual end-to-end behavior, not only fixtures.
The task names do not determine the schedule: overlapping code or unresolved
shared semantics may require serial work. Pure communication adapters must not
reimplement the reconciliation rules.

If the user already supplies this breakdown, validate its actual boundaries rather
than creating another one. If only reconciliation remains after parsing is done,
reference the parser's result; do not re-run its discovery or repeat its plan.
