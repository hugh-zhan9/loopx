---
name: plan
description: "Creates an optional lean implementation plan for explicit planning, approval boundaries, interruption recovery, or durable coordination. Not for clear bounded work that can stay prompt-first, unresolved product or architecture decisions, or code changes."
when_to_use: "plan, explicit planning request, approval boundary, interruption recovery, durable coordination, lean implementation plan, 实施计划, 执行计划"
metadata:
  version: "0.1.0"
argument-hint: "<approved source path or clear planning request>"
---

# loopx Plan

Create one concise persistent plan that preserves intent without transcribing
the implementation. Local implementation judgment remains with `exec` and the
current repository.

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
to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`. Use exactly its six semantic
sections for an ordinary plan:

- Outcomes
- Boundaries
- Likely Modules
- Known Dependencies
- Acceptance
- Verification

Preserve source `AC-*`, `TC-*`, or `D-*` acceptance and design anchors inline
where they materially constrain an outcome or acceptance statement. Do not add
task microsteps, implementation snippets, fixed schedules, reviewer stages,
executor choices, or concurrency metadata.

## Planning Loop

1. Confirm the concrete persistence trigger.
2. Read only the relevant source, repository guidance, specs, and current code.
3. State desired outcomes and explicit non-goals or protected behavior.
4. Name likely modules as orientation, not immutable write ownership.
5. Record only dependencies already known from evidence.
6. Define observable acceptance and fresh verification.
7. Check that every section guides execution without prescribing local edits.

When the plan is complete, hand the same path to `exec`. The user does not
choose a serial, subagent, or parallel executor.

## STOP Conditions

Stop without writing or handing off a plan when the source is contradictory,
material decisions remain unresolved, acceptance cannot be observed, or the
requested persistence trigger is absent and the user did not explicitly invoke
planning.
