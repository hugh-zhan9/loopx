---
name: plan2exec
description: "Creates an optional lean plan document for explicit planning, approval boundaries, interruption recovery, or durable coordination. The executing agent follows the plan itself; loopx ships no execution runtime. Not for clear bounded work, unresolved product or architecture decisions, or code changes."
when_to_use: "plan2exec, explicit implementation planning request, approval boundary, interruption recovery, durable coordination, lean implementation plan, 实施计划, 执行计划"
metadata:
  version: "0.6.0"
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
spec. Inspect relevant repository context before naming likely modules or known
dependencies.

Stop and route to `clarify` or `spec` when a material product, API, data,
permission, migration, compatibility, security, or cross-module architecture
decision remains unresolved. Do not settle those decisions inside the plan.

## Output Contract

Read [references/plan-schema.md](./references/plan-schema.md) and write one plan
to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`. The plan is one document
with two layers:

- YAML frontmatter holding the slice graph: the plan `source` and overall
  `status`, plus stable `P-*` identifiers with `depends` and a per-slice
  `status` the executing agent updates as work proceeds;
- a narrative body: `Goal And Boundaries` prose the requester can approve in
  one read, one section per execution slice — prose outcome and acceptance,
  closed by a `writes` / `anchors` / `verify` / `review` meta block —
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
a plan and append new identifiers instead of renumbering prior slices.

Record only dependencies, write scopes, and interfaces supported by source or
repository evidence. The `verify` line should name exact commands when known
and otherwise name the required check and observable evidence without
inventing tooling.

Do not add task microsteps, implementation snippets, a fixed launch order,
per-slice commit commands, or executor choices. The schema's execution rules
and the installed working agreement govern how the plan is carried out.

## Planning Loop

1. Confirm the concrete persistence trigger.
2. Read only the relevant source, repository guidance, specs, and current code.
3. State the approved goal, explicit non-goals, and global constraints.
4. Decompose the goal into the fewest coherent, independently verifiable
   execution slices with evidenced dependencies and write scopes.
5. Map every source requirement and anchor to a slice, integration check, or
   explicit `deferred-with-rationale` entry.
6. Bind acceptance prose and a `verify` line to every slice, and a `review`
   line to high-risk slices.
7. Define final integration verification, the frontmatter plan status,
   handoff blockers, and residual risks.
8. Check that the plan can survive a context handoff without recreating product
   decisions or the execution structure from scratch.

When the plan is complete, report the path. Optionally run `plan-reviewer` on
it before execution begins.

## STOP Conditions

Do not mark a plan `ready` when the source is contradictory, material
decisions remain unresolved, complete source coverage cannot be shown, slice
dependencies are cyclic or unknown, or acceptance cannot be observed. When
durable recovery requires an artifact, set frontmatter `status: blocked` and
record the concrete blocker and the resume note, then route to `clarify` or
`spec`. Otherwise stop
without writing a plan. When no persistence trigger exists and the user did not
explicitly invoke planning, stop without creating an artifact.
