---
name: architecture-designer
description: "Compare system designs or review module ownership, dependencies, and failure boundaries (架构设计). Record accepted cross-module decisions through spec."
when_to_use: "architecture-designer, architecture, system design, ADR, NFR, scalability, failure modes, technology tradeoff, 架构设计"
license: MIT
metadata:
  version: "0.3.11"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/architecture-designer
  maintained_by: loopx
---

# Architecture Designer

Use this support lens for system design or architecture review, directly or
inside `spec` and host-native review. It informs decisions without creating a
workflow state, executing changes, or requiring a separate ADR for every question.

## Establish the decision

Read the relevant requirements, current architecture, closest reusable capability,
callers, and deployment constraints. For brownfield work, apply
[the architecture conformance contract](../shared/architecture-conformance.md).

Distinguish missing business priorities from open technical choices. Investigate
available evidence, compare credible options, and label assumptions. If the choice
depends on an unresolved goal, permission, or owner constraint, state the deciding
question. Open architecture choices are the work of design: they do not prevent
proposing alternatives. Record durable accepted decisions through `spec`; do not
present a recommendation as approved merely because it was delivered.

## Checks that change the choice

| Concern | Evidence and judgment |
| --- | --- |
| Existing capability reuse | Closest extension point, matching semantics and lifecycle, or reason extension is insufficient |
| Ownership and isolation | Owning modules, dependency direction, shared state, trust boundaries, fault blast radius |
| Maintainability | Change/test surface, diagnostic path, maintenance owner, extension or removal cost |
| Functional and non-functional requirements | Required outcomes, explicit exclusions, ranked quality constraints and their evidence |
| Data | Access paths, consistency, storage ownership, retention, migration compatibility |
| Operations | Deployment, detection, failure recovery, security, privacy, and operating cost where material |

Do not assume unmeasured scale, add a service because of a pattern name, or treat
a diagram as validation. Compare maintenance and operational costs as well as
implementation cost. A missing owner or NFR can limit the recommendation; report
that limitation without inventing a team, SLO, fallback, or recovery guarantee.
Use `sql-style` when concrete SQL, schema, migration, or query decisions are involved.

## References

Load only detail needed for the decision:

- [architecture-patterns.md](references/architecture-patterns.md): architectural style and boundaries.
- [adr-template.md](references/adr-template.md): a requested or durable decision record.
- [system-design.md](references/system-design.md): a full system design or capacity analysis.
- [database-selection.md](references/database-selection.md): storage technology comparison.
- [nfr-checklist.md](references/nfr-checklist.md): relevant quality attributes and validation.

Reference examples illustrate choices; their technology, scale, and policy values
are not defaults for the current task. Fold conclusions into the owning `spec`
when one exists rather than creating competing authoritative documents.

## Deliver

For a focused question, give the recommended option, source evidence, tradeoff,
and any decision that still needs an owner. For a full architecture design,
include boundaries, reuse/isolation/maintenance judgments, applicable NFR
validation, and material failure modes with trigger, impact, detection, recovery,
and owner. Include rollout, rollback, and ADRs where the requested scope needs them.

Do not finalize a new long-lived data, security, deployment, or compatibility
contract without the required acceptance. Preserve accepted local architecture
when the task only calls for code-level cleanup.
