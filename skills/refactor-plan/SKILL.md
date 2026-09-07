---
name: refactor-plan
description: "Creates a behavior-preserving refactor plan with repo evidence, small verifiable steps, scope boundaries, and testing decisions. Not for feature changes or immediate implementation."
when_to_use: "refactor-plan, refactor request, refactoring RFC, small verifiable steps, behavior-preserving cleanup, architecture cleanup, 重构计划"
metadata:
  version: "0.4.1"
---

# Refactor Plan

Plan a behavior-preserving structural improvement. Do not implement it or treat
feature work, incident repair, or migrations as refactoring. The request must
identify a concrete maintainability problem; inspect evidence before inventing one.

## Establish the baseline and boundary

Read the request, worktree status, target modules, callers, relevant contracts,
and tests. Preserve unrelated dirty files. Use existing answers about the problem,
why it matters, proposed direction, and protected behavior; ask only for a material
missing constraint instead of repeating an interview or confirmation ritual.

Identify externally observable behavior that must remain unchanged, allowed write
surfaces, and verification. Plan characterization tests where existing coverage
cannot establish preservation. Stop the affected handoff when there is no practical
behavior baseline or when the work requires unapproved public API, schema, data,
permission, compatibility, or product behavior changes; use `clarify` or `spec`
for those decisions. Do not force a broad rewrite across unrelated owners.

## Plan the smallest useful change

Compare credible options and choose the narrowest approach that addresses the
observed pain. Map each step to concrete files/surfaces, behavior-preservation
evidence, verification commands/results, and rollback notes. Group mechanical
edits around verifiable outcomes; Git commit boundaries remain with the host and
require user authorization.

Read [fowler-refactorings.md](references/fowler-refactorings.md) when specific
smells or techniques need explanation. A technique name is not justification for
scope expansion; tie it to a demonstrated problem and preservation check.

## Artifact and handoff

Use [REFACTOR_PLAN_TEMPLATE.md](REFACTOR_PLAN_TEMPLATE.md) and write
`docs/loopx/refactors/YYYY-MM-DD-<topic>.md`, unless the user specifies another path.
Publish to an issue tracker only on explicit request.

This is a refactor RFC and source for `plan2exec`, not a `loopx-plan/v1` execution
plan. Preserve its Behavior Preservation Contract, baseline, step dependencies,
write scope, verification, and recovery notes during conversion. Mark it ready for
`plan2exec` only when those contracts are complete. A draft is not approved merely
because the template contains a handoff line.

Do not pass an RFC directly to `exec` or `plan-reviewer`, including old Tiny Commits
RFCs. Review the converted execution plan with `plan-reviewer`; only the ready
schema-valid plan may enter `exec`. Return newly exposed behavior or architecture
decisions to their owner instead of encoding them as mechanical refactor steps.
