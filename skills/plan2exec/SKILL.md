---
name: plan2exec
description: "Creates an optional lean plan document that preserves approved architecture constraints for explicit planning, approval boundaries, interruption recovery, or durable coordination. The agent executes it; loopx ships no execution runtime. Not for clear bounded work, unresolved decisions, or code changes."
when_to_use: "plan2exec, explicit implementation planning request, approval boundary, interruption recovery, durable coordination, lean implementation plan, 实施计划, 执行计划"
metadata:
  version: "0.6.3"
argument-hint: "<approved source path or clear planning request>"
---

# loopx Plan2Exec

Create one concise persistent plan document that preserves intent and
decomposes it into coherent, independently verifiable outcomes. The plan is a
document contract: whoever executes it — usually the same model in a later
session — follows the schema's execution rules and the installed working
agreement. loopx does not run or schedule the plan.

## Selection Gate

Persistent planning is justified only when at least one concrete trigger is
present:

- the user explicitly asks for a plan;
- work must cross an approval boundary before mutation;
- interruption recovery needs a durable handoff;
- coordination across stages or owners must outlive the current context.

A clear, bounded request without one of these triggers stays prompt-first. Do
not create a plan merely because work spans several files, has multiple
outcomes, or benefits from verification.

## Inputs And Boundaries

Start from the user's approved request, requirements, intake package, or design
spec. Follow source links to an authoritative `概要设计.md` and its `D-*` decisions when present. Inspect relevant repository context before naming likely modules or known
dependencies.

Read [the architecture conformance contract](../shared/architecture-conformance.md).
Preserve source `D-*` decisions for reuse, ownership, dependency direction,
isolation, and maintainability; when no design exists, derive only established
local constraints from repository evidence and leave new architecture decisions
to `spec`.

Stop and route to `clarify` or `spec` when a material product, API, data,
permission, migration, compatibility, security, or cross-module architecture
decision remains unresolved. Do not settle those decisions inside the plan.

## Output Contract

Read [references/plan-schema.md](./references/plan-schema.md) and write one plan
to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`. The plan is one document
with two layers:

- YAML frontmatter holding the slice graph: the plan `source` and overall
  `schema: loopx-plan/v1`, `status`, plus stable `P-*` identifiers with
  `depends` and a per-slice `status` the executing agent updates as work
  proceeds;
- a narrative body: `Goal And Boundaries` prose the requester can approve in
  one read, one section per execution slice — prose outcome and acceptance,
  closed by a `writes` / `anchors` / `architecture` / `verify` / `review` meta block —
  followed by `Integration And Final Verification` and
  `Handoff And Residual Risks`.

Every implementation-relevant source `AC-*`, `D-*`, and `TC-*` anchor must map
to at least one execution slice, integration verification item, or an explicit
`deferred-with-rationale` entry. When the source has no anchors, summarize each
accepted requirement in the slice's `anchors` line instead of inventing IDs.
Do not silently omit source requirements.

An execution slice is a coherent, independently verifiable outcome, not a
minute-scale task. Split when outcomes have a real dependency, interface, or
acceptance boundary. Fold setup, tests, documentation, and mechanical support
into the outcome they enable. Preserve existing `P-*` identifiers when revising
a plan and append new identifiers instead of renumbering prior slices. When
upgrading an unversioned legacy plan, add `schema: loopx-plan/v1` and the
required architecture evidence before marking it ready again.

Record only dependencies, write scopes, and interfaces supported by source or
repository evidence. The `verify` line should name exact commands when known
and otherwise name the required check and observable evidence without
inventing tooling.

Each slice's `architecture` line names reused or extended capabilities, owning
module and allowed dependency direction, shared-state or fault boundary, and
maintenance verification. Use `not_applicable` only with concrete repository
evidence. Shared mutable state or an interface handoff creates a dependency or
an explicit integration check even when `writes` are disjoint.

Do not add task microsteps, implementation snippets, a fixed launch order,
per-slice commit commands, or executor choices. The schema's execution rules
and the installed working agreement govern how the plan is carried out.

## Handoff

Check source coverage, acceptance, graph validity, and architecture evidence
against the contract above. Report the plan path and concrete blockers, if any.
Use `plan-reviewer` when requested or required by the owning workflow; it can
also provide an optional read-only check before execution.

## STOP Conditions

Do not mark a plan `ready` when the source is contradictory, material
decisions remain unresolved, complete source coverage cannot be shown, slice
dependencies are cyclic or unknown, acceptance cannot be observed, or reuse
candidates, module ownership, dependency direction, shared-state isolation,
or maintenance obligations lack source or repository evidence. Return missing
architecture decisions to `spec` instead of encoding a guess. When
durable recovery requires an artifact, set frontmatter `status: blocked` and
record the concrete blocker and the resume note, then route to `clarify` or
`spec`. Otherwise stop
without writing a plan. When no persistence trigger exists and the user did not
explicitly invoke planning, stop without creating an artifact.
