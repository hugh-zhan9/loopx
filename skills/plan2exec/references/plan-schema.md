# Plan2Exec Schema

Use the sections and slice fields below. Keep the plan semantic and concise,
but detailed enough that another execution context can preserve scope,
dependencies, traceability, and verification. The current repository remains
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
- Likely surfaces: `<probable modules, files, APIs, docs, or tests; orientation only>`
- Interfaces: `<inputs consumed and outputs or contracts produced>`
- Source anchors: `<AC-*, D-*, TC-*, summarized requirement, or deferred-with-rationale>`
- Acceptance: `<observable conditions for this slice>`
- Verification: `<exact known commands or required checks>`
- Expected evidence: `<passing output, artifact, state, or negative assertion>`

Repeat `P-*` slices only for coherent outcomes with distinct dependency,
interface, or acceptance boundaries. Preserve existing identifiers during plan
revision and append new ones instead of renumbering.

## Integration And Final Verification

- `<cross-slice behavior, regression checks, packaging, documentation, or final suite evidence>`
- `<source anchors covered only at integration level, if any>`

## Handoff And Residual Risks

- Status: `ready_for_exec` | `blocked`
- Blockers: `<none or concrete unresolved blocker>`
- Residual risks: `<none known or concrete remaining risk>`
- Resume note: `<none or the exact point/context needed for an interrupted handoff>`

Do not add step-by-step edit instructions, code snippets, time estimates,
reviewer stages, executor selection, scheduler settings, or per-slice commit
commands.
