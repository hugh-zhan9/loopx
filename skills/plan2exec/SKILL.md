---
name: plan2exec
description: "Write or review an implementation plan for approval, recovery, or coordination (实施计划、计划评审). Use only when a persistent plan is useful or requested."
when_to_use: "plan2exec, explicit implementation planning request, approval boundary, interruption recovery, durable coordination, lean implementation plan, 实施计划, 执行计划"
metadata:
  version: "0.8.0"
argument-hint: "<approved source path or clear planning request>"
---

# loopx Plan2Exec

Create one concise persistent plan document. The plan is a document contract;
loopx does not run or schedule the plan. For a task brief, apply
[task scope](../shared/task-scope.md): serve that assignment and retain parent source links.

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

For a review-only request, read [the review guidance](references/plan-review.md),
inspect the existing plan, and report findings without editing or executing it.

Before creating or reviewing a plan, check whether its work is already complete.
If so, compare the implementation and fresh evidence with the original source,
correct progress when authorized, and close or archive the existing plan. Do not
send completed work through pre-implementation review or create a replacement plan.

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

When concurrent persisted state is involved, read and apply
[the database concurrency contract](../shared/database-concurrency.md).

## Output Contract

Read [references/plan-schema.md](./references/plan-schema.md) and write one plan
to `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`. YAML frontmatter owns
`schema: loopx-plan/v1`, source, status, stable `P-*` slices and dependencies.
The body contains Goal And Boundaries, each execution slice's acceptance and
scope/evidence, Integration And Final Verification, and Handoff And Residual Risks.
Do not repeat business requirements; link to their approved source.

Every implementation-relevant source `AC-*`, `D-*`, and `TC-*` anchor in the active scope must map
to at least one execution slice, integration verification item, or an explicit
`deferred-with-rationale` entry with explicit source-owner authorization. A
rationale alone cannot remove a required outcome or verification scenario. When the source has no anchors, summarize each
accepted requirement in the slice's `anchors` line instead of inventing IDs.
Check the expected behavior, not just anchor presence. Do not silently omit or
weaken source requirements. The implementation and final checks must read the
original approved requirements as well as this plan.

An execution slice is a coherent, independently verifiable outcome, not a
minute-scale task. Split when a boundary enables independent acceptance, safe
parallel ownership, or a necessary migration or approval stop. An internal call
dependency alone does not justify another slice. Keep tightly coupled protocol,
storage, and adapter changes together when they establish one behavior and need
joint acceptance; crossing files or repositories does not itself require a split.
Fold setup, tests, docs, and support into that outcome. Preserve `P-*` identifiers when revising
a plan and append new identifiers instead of renumbering prior slices. For an active legacy plan, add missing schema fields from settled source and
repository evidence in place. Do not reopen accepted decisions to change format.
An unknown schema needs an explicit interpretation before delegated execution.

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

## Review and handoff

Check source coverage, dependencies, scope, acceptance, and verification yourself.
Check scope in both directions and carry the schema's automatic self-check into the handoff.
An ordinary plan may be `ready` after this check; it needs no independent review.
Use [the review guidance](references/plan-review.md) when the user requests review
or the plan contains a concrete risk in destructive changes, public compatibility,
security, migration ordering, or coordination across shared resources. Record the
risk and affected slices. Read-only review requests produce findings only.

Plan review coverage separately from implementation slices. Group related slices
at the point their risk must be resolved; follow [review coverage](references/plan-review.md#review-coverage)
for earlier gates, design/code distinctions, and reviewer handoff.

Required independent review uses a host-native read-only leaf subagent. If it is
unavailable, block only affected work and report the missing review.

Review the relevant plan once, then recheck fixes and affected decisions. Progress
and local implementation choices do not invalidate earlier review. Resolve changed
source decisions first and review their affected risks; do not restart by default.

Fix unambiguous formatting, missing labels, and bookkeeping directly when editing
is authorized. Missing source decisions, unsafe dependencies, or unknown ownership
need evidence or a decision; filling a field with a guess does not resolve them.
An extra file inside an approved owner and behavior boundary can be added to
`writes` after checking overlap. It does not by itself require another approval.

## Block only affected work

A blocker must identify a concrete source conflict, unapproved decision, unsafe
ordering or shared-state access, unverifiable required behavior, or missing fact
that prevents safe implementation. State the consequence and affected slices.
Mark those slices `blocked`; use overall `blocked` only when no remaining work can
safely proceed. Keep independent unaffected work available. Source decisions belong
in `clarify` or `spec`; the plan cannot make them on behalf of the user.

Report the path, current status, actual review result when applicable, and remaining
blockers. Do not create another document merely to report plan review. The schema
records overall completion as `complete` and finished slices as `done`; completion
requires actual integrated verification, not a plan review verdict.
