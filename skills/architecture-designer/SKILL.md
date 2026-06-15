---
name: architecture-designer
description: "Applies loopx architecture discipline for system boundaries, ADRs, NFRs, scalability, failure modes, operability, and technology tradeoffs. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "architecture-designer, architecture, system design, ADR, NFR, scalability, failure modes, technology tradeoff, 架构设计"
license: MIT
metadata:
  version: "0.3.0"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/architecture-designer
  maintained_by: loopx
---

# Architecture Designer

## loopx Boundary

`architecture-designer` is a support lens, not a workflow state. Use it directly for architecture review or system design discussion, and use it from `spec`, `review`, or `final-review` when changes affect system boundaries, operational behavior, or long-lived design decisions.

This skill does not replace `clarify`, `spec`, `plan-to-exec`, `review`, or `final-review`. If architecture decisions are not yet approved, produce options and route the work through `spec`.

When database technology, ownership, schema, migration, or query performance is part of the architecture decision, also use `sql-style`.

## When to Use

Use this lens when work involves:

- Defining system boundaries, service boundaries, ownership, or integration contracts.
- Choosing between architectural patterns such as modular monolith, microservices, event-driven, layered, or hexagonal architecture.
- Evaluating scalability, availability, latency, consistency, durability, security, operability, or cost requirements.
- Documenting Architecture Decision Records (ADRs) for decisions that will outlive the current implementation task.
- Reviewing failure modes, operational complexity, deployment topology, infrastructure patterns, or technology tradeoffs.
- Selecting database or storage technology as part of a broader architecture decision.

Do not use it for code-level refactoring, API shape alone, issue triage, task planning, or workflow state transitions unless those activities expose architecture decisions.

## Architecture Discipline

Before recommending a design, establish:

1. Functional goals and excluded goals.
2. Non-functional requirements and their priority order.
3. Current constraints: team skills, migration limits, budget, compliance, deployment environment, and operational ownership.
4. Data ownership, consistency needs, read/write access patterns, retention, and migration constraints.
5. Failure modes, recovery expectations, observability needs, and operational runbooks.

Treat architecture as tradeoff management. For each major decision, state the decision, alternatives considered, why the chosen option fits the constraints, and what it makes harder.

## Reference Guide

Load detailed guidance only when the context needs it:

| Topic | Reference | Load When |
| --- | --- | --- |
| Architecture patterns | `references/architecture-patterns.md` | Choosing architectural style or service boundaries |
| ADR template | `references/adr-template.md` | Recording a long-lived decision |
| System design | `references/system-design.md` | Producing a full architecture design |
| Database selection | `references/database-selection.md` | Comparing storage technologies |
| NFR checklist | `references/nfr-checklist.md` | Eliciting or reviewing quality attributes |

## Core Checks

### Must Cover

- System boundaries and ownership.
- Functional and non-functional requirements.
- Architecture options and explicit tradeoffs.
- Data model, storage, consistency, and migration implications when relevant.
- Failure modes, degradation behavior, backup/restore, and recovery path.
- Security, privacy, compliance, and access control concerns.
- Observability, deployment, operability, and maintenance cost.
- Risks, mitigations, and open questions.

### Avoid

- Choosing technology before requirements and constraints are clear.
- Over-engineering for hypothetical scale.
- Ignoring operational cost or team ownership.
- Treating diagrams as proof of a good design.
- Hiding tradeoffs behind generic "scalable" or "cloud-native" claims.
- Finalizing unapproved architecture decisions outside the `spec` flow.

## Output Shape

For architecture discussion or review, produce the smallest useful artifact:

1. Requirements and constraints summary.
2. Options considered.
3. Recommended architecture with a concise rationale.
4. Major tradeoffs and rejected alternatives.
5. Failure modes, operability concerns, and NFR coverage.
6. ADR drafts for decisions that should be preserved.
7. Open questions or decisions that must route through `spec`.

Use Mermaid diagrams when they clarify component boundaries, data flow, ownership, or deployment topology.

### ADR Skeleton

```markdown
# ADR-000: Decision Title

## Status
Proposed

## Context
What problem, constraints, requirements, and forces make this decision necessary?

## Decision
What option is selected?

## Alternatives Considered
- Option A: benefits, costs, and why rejected.
- Option B: benefits, costs, and why rejected.

## Consequences
- Positive outcomes.
- Negative outcomes.
- Follow-up work, migration needs, or monitoring obligations.
```
