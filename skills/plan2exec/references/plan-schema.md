# Plan Document Schema

A plan is a document the executing agent reads and follows; loopx ships no
execution runtime. Keep it lean: coherent slices, explicit dependencies,
observable acceptance, and exact verification. The current repository remains
authoritative for local implementation choices.

# <Feature Name>

## Source And Goal

- Source: `<approved request, intake package, requirements, or design path>`
- Goal: `<observable result this plan must deliver>`

## Boundaries And Global Constraints

- `<non-goals, protected behavior, compatibility rules, dependency limits, and approval boundaries>`

## Execution Slices

### P-001: <coherent outcome>

- Outcome: `<observable result delivered by this slice>`
- Depends on: `<P-* identifiers or none>`
- Write scope: `<repository-relative paths this slice may modify>`
- Source anchors: `<AC-*, D-*, TC-*, summarized requirement, or deferred-with-rationale>`
- Acceptance: `<observable conditions for this slice>`
- Verification: `<exact known commands or required checks>`
- Review focus: `<contract or regression risk an independent reviewer must check for high-risk slices>`

Repeat `P-*` slices only for coherent outcomes with distinct dependency,
interface, or acceptance boundaries. Preserve existing identifiers during plan
revision and append new ones instead of renumbering.

## Integration And Final Verification

- `<cross-slice behavior, regression checks, packaging, documentation, or final suite evidence>`
- `<source anchors covered only at integration level, if any>`

## Handoff And Residual Risks

- Status: `ready` | `blocked`
- Blockers: `<none or concrete unresolved blocker>`
- Residual risks: `<none known or concrete remaining risk>`
- Resume note: `<none or the exact point/context needed for an interrupted handoff>`

## Execution rules for the consuming agent

- Execute slices in dependency order; verify each slice with its exact
  commands before starting dependents.
- Two slices may run in parallel only when neither depends on the other and
  their write scopes are disjoint; integrate results sequentially.
- Follow the installed working agreement for verification, review, stop, and
  Git discipline throughout.

Do not add step-by-step edit instructions, code snippets, time estimates,
fixed launch schedules, or per-slice commit commands.
