---
name: plan2exec
description: "Creates an optional lean implementation plan for explicit planning, approval boundaries, interruption recovery, or durable coordination, then hands it to exec. Use plan2exec when a persistent execution plan is needed; it is distinct from an agent's built-in Plan mode. Not for clear bounded work, unresolved product or architecture decisions, or code changes."
when_to_use: "plan2exec, explicit implementation planning request, approval boundary, interruption recovery, durable coordination, lean implementation plan, 实施计划, 执行计划"
metadata:
  version: "0.2.0"
argument-hint: "<approved source path or clear planning request>"
---

# loopx Plan2Exec

Create one concise persistent execution plan that preserves intent, decomposes
it into coherent outcomes, and gives `exec` a traceable handoff without
transcribing implementation steps. Local implementation judgment remains with
`exec` and the current repository.

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
to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`. The plan must contain:

- `Source And Goal` with the approved source and observable goal;
- `Boundaries And Global Constraints` with protected behavior and constraints;
- `Execution Slices` with stable `P-*` identifiers, dependencies, likely surfaces,
  interfaces, source anchors, acceptance, verification, and expected evidence;
- `Integration And Final Verification` requirements;
- `Handoff And Residual Risks` with status, blockers, resume context, and
  concrete remaining risk.

Every implementation-relevant source `AC-*`, `D-*`, and `TC-*` anchor must map
to at least one execution slice, integration verification item, or an explicit
`deferred-with-rationale` entry. When the source has no anchors, summarize each
accepted requirement in a slice's `Source anchors` field instead of inventing
IDs. Do not silently omit source requirements.

An execution slice is a coherent, independently verifiable outcome, not a
minute-scale task. Split when outcomes have a real dependency, interface, or
acceptance boundary. Fold setup, tests, documentation, and mechanical support
into the outcome they enable. Preserve existing `P-*` identifiers when revising
a plan and append new identifiers instead of renumbering prior slices.

Name likely surfaces for orientation without freezing the write scope. Record
only dependencies and interfaces supported by source or repository evidence.
Verification should name exact commands when they are already known; otherwise
name the required check and observable evidence without inventing tooling.

Do not add task microsteps, implementation snippets, fixed schedules, reviewer
stages, executor choices, concurrency metadata, or per-slice commit commands.

## Planning Loop

1. Confirm the concrete persistence trigger.
2. Read only the relevant source, repository guidance, specs, and current code.
3. State the approved goal, explicit non-goals, and global constraints.
4. Decompose the goal into the fewest coherent, independently verifiable
   execution slices.
5. Record evidenced dependencies, likely surfaces, and interfaces for each
   slice without prescribing local edits.
6. Map every source requirement and anchor to a slice, integration check, or
   explicit `deferred-with-rationale` entry.
7. Bind acceptance, verification, and expected evidence to every slice.
8. Define final integration verification, handoff status, and residual risks.
9. Check that the plan can survive a context handoff without recreating product
   decisions or the execution structure from scratch.

When the plan is complete, hand the same path to `exec`. The user does not
choose a serial, subagent, or parallel executor.

## STOP Conditions

Do not mark a plan `ready_for_exec` or hand it to `exec` when the source is
contradictory, material decisions remain unresolved, complete source coverage
cannot be shown, or acceptance cannot be observed. When durable recovery
requires an artifact, record `Status: blocked`, the concrete blocker, and the
resume note, then route to `clarify` or `spec`. Otherwise stop without writing a
plan. When no persistence trigger exists and the user did not explicitly invoke
planning, stop without creating an artifact.
