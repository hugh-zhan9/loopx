---
name: refactor-plan
description: "Find worthwhile refactoring opportunities or write a behavior-preserving refactor plan (重构检查、重构计划). Use for code health and maintainability work."
metadata:
  version: "0.6.0"
  when_to_use: "refactor-plan, refactoring audit, technical debt, duplication, coupling, complexity, refactoring RFC, behavior-preserving cleanup, 重构检查, 重构计划"
---

# Refactor Plan

Find maintainability problems or plan a behavior-preserving improvement. Match
the request: an audit ends with findings; a planning request produces a proposal.
An already authorized implementation can proceed under the working agreement,
without inventing another plan or asking for the same permission. Feature work,
incident repair, and migrations keep their own behavior and decision boundaries.

## When the problem is not yet known

For an audit or a request to find worthwhile refactors, read
[code-audit.md](references/code-audit.md). Inspect the named scope and report the
supported findings and priorities. Use the bundled scanner only when its signals
help select candidates; a small local review does not need a full-repository scan.
Do not create an RFC, technical-debt ledger, or code change for an audit-only
request. No finding is a valid result. Continue below when a refactor plan is needed.

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

For a planning request, use [REFACTOR_PLAN_TEMPLATE.md](REFACTOR_PLAN_TEMPLATE.md) and write
`docs/loopx/refactors/YYYY-MM-DD-<topic>.md`, unless the user specifies another path.
Publish to an issue tracker only on explicit request.

This refactor RFC can guide host-native implementation directly when the user has
authorized it. Preserve its Behavior Preservation Contract, baseline, dependencies,
write scope, verification, and recovery notes. A draft is not approved merely
because the template contains a handoff line. Review of an existing proposal ends with findings; it does not create a new RFC.

A second plan is optional: use `plan2exec` only for additional durable coordination
or an explicitly requested execution plan. An RFC without a `loopx-plan/v1` graph
does not go directly to the optional `$exec` delegate; ordinary host implementation
needs no conversion. Return newly exposed behavior or architecture decisions to
`clarify` or `spec` instead of treating them as mechanical refactor steps.
