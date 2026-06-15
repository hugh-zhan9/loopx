# Traceability and Cross-Consistency Guide

Use this reference for two related analyses:

1. **Traceability Matrix** — mapping requirements to business goals (upward) and acceptance criteria (downward)
2. **Cross-Document Consistency** — checking for contradictions, redundancy, and drift across multiple source documents

## Part 1: Traceability Matrix

### Purpose

A requirement without traceability is either:
- An orphan (no business justification) — may be unnecessary scope creep
- Untestable (no acceptance criteria) — cannot be verified as done
- Ungrounded (business goal with no requirement) — a gap in the specification

### What to extract

**Upward traceability (requirement → business goal):**

| Element | Description |
|---------|------------|
| Business goal | The stated problem, objective, or user need |
| Requirement | The specific behavior or capability |
| Link strength | direct (explicitly stated), inferred (logically follows), missing (no connection found) |

**Downward traceability (requirement → acceptance criteria):**

| Element | Description |
|---------|------------|
| Requirement | The specific behavior or capability |
| Acceptance criteria | Testable condition(s) that verify the requirement is met |
| Criteria quality | explicit (Given/When/Then or equivalent), partial (intent clear but not testable), missing (no criteria) |

**Lateral traceability (business goal → requirements coverage):**

| Element | Description |
|---------|------------|
| Business goal | The stated problem or objective |
| Supporting requirements | Requirements that collectively fulfill this goal |
| Coverage assessment | full (goal is addressed), partial (some aspects unaddressed), missing (no requirements for this goal) |

### How to identify business goals

Business goals are typically found in:
- Problem statement / background section
- "Why" or "目标" sections
- OKR references
- User stories (the "so that" clause)
- Stated success metrics

If the document has NO business goals section, that itself is a gap — mark all requirements as "upward traceability: missing (no goals section)".

### How to identify acceptance criteria

Acceptance criteria are typically found in:
- Explicit "acceptance criteria" or "验收标准" sections
- "Done when" or "完成条件" statements
- Test case references
- Given/When/Then blocks
- Success/failure scenarios with concrete outcomes

### Gap detection

| Gap Type | Signal | Priority |
|----------|--------|----------|
| Orphan requirement | Requirement cannot be linked to any stated goal | P2 (may be valid but undocumented justification) |
| Untestable requirement | No acceptance criteria, and behavior is too vague to derive one | P1 (blocks QA and verification) |
| Uncovered goal | Business goal has no supporting requirement | P0 (the spec doesn't address a stated objective) |
| Weak link | Requirement is loosely related to a goal but doesn't clearly support it | P2 (review necessity) |
| Missing metrics | Goal has success metrics but no requirement quantifies them | P1 (cannot measure success) |

### Output format

```markdown
## Traceability Matrix

### Business Goals → Requirements

| # | Business Goal | Supporting Requirements | Coverage |
|---|--------------|----------------------|----------|
| G1 | Reduce manual review time by 50% | R3, R7, R12 | full |
| G2 | Comply with data retention regulation | R15 | partial (deletion not addressed) |
| G3 | Support multi-tenant isolation | (none found) | missing |

### Requirements → Acceptance Criteria

| # | Requirement | Acceptance Criteria | Quality |
|---|------------|--------------------|---------|
| R1 | Admin can deactivate user | "Deactivated user cannot log in; admin sees confirmation" | explicit |
| R2 | System syncs data in real-time | (none) | missing |
| R3 | Auto-assign tasks to available agents | "Tasks assigned within 30s; load balanced across agents" | explicit |
| R7 | Handle edge cases gracefully | (none) | missing |

### Traceability Gaps

| Gap | Type | Priority | Impact |
|-----|------|----------|--------|
| G3 has no requirements | uncovered goal | P0 | Multi-tenant isolation is a stated goal but no requirement addresses it |
| R2 has no acceptance criteria | untestable | P1 | Cannot verify "real-time sync" without latency threshold |
| R7 has no acceptance criteria | untestable | P1 | "Edge cases" is not testable without enumeration |
| R10 links to no goal | orphan | P2 | May be valid but justification unclear |
```

## Part 2: Cross-Document Consistency

### When to activate

Activate cross-document consistency checking when:
- The user provides multiple source documents
- The primary document references other documents by name, link, or version
- The requirement says "参考xx系统", "same as X", "consistent with Y", or "per [document]"

### What to check

| Check | Description |
|-------|------------|
| Contradictions | Same entity/behavior defined differently in different documents |
| Redundancy | Same requirement stated in multiple places with slight variations |
| Implicit dependencies | Doc A assumes behavior defined only in doc B |
| Version drift | Doc A references v1 of doc B, but doc B is now at v3 |
| Terminology inconsistency | Same concept uses different names across documents |
| Boundary conflict | Two documents define overlapping scope without clear ownership |

### How to find contradictions

1. **Entity inventory** — List all entities (users, orders, tasks, etc.) mentioned across documents.
2. **Per-entity comparison** — For each entity appearing in multiple documents, compare:
   - States and lifecycle
   - Allowed operations
   - Permissions and roles
   - Data fields and validation rules
   - Timing and SLA
3. **Rule comparison** — For each business rule mentioned in multiple places:
   - Same trigger?
   - Same conditions?
   - Same outcome?
   - Same exception handling?

### How to find implicit dependencies

A document has an implicit dependency when it:
- References an entity it doesn't define (who owns the definition?)
- Assumes a state or status that another system produces
- Relies on data that another system provides without specifying the contract
- Mentions an event or notification without defining who publishes it

### How to detect version drift

- Look for explicit version references ("per API v2.1", "参考xx系统v1.0")
- Check if the referenced document/system has been updated since
- Flag when the reference is undated and the source is known to change

### Output format

```markdown
## Cross-Document Consistency

### Documents Analyzed

| # | Document | Version/Date | Role |
|---|----------|-------------|------|
| D1 | 用户积分PRD v0.3 | 2024-03-15 | Primary |
| D2 | 积分规则配置文档 | 2024-01-20 | Referenced |
| D3 | 支付系统接口文档 v2.1 | 2024-02-28 | Referenced |

### Contradictions

| Entity/Rule | Doc A Says | Doc B Says | Impact | Priority |
|-------------|-----------|-----------|--------|----------|
| Point expiry | D1: "points expire at end of month" | D2: "points expire 365 days after earning" | Different expiry logic → different implementation | P0 |
| Refund points | D1: "refund restores original points" | D3: "refund creates new point transaction" | Different data model for refunds | P1 |

### Implicit Dependencies

| Document | Assumes | Defined In | Risk |
|----------|---------|-----------|------|
| D1 | "user level" field exists | Not found in any doc | P1: undefined data source |
| D1 | Payment callback provides order_id | D3 (confirmed) | Low risk |

### Version Drift

| Reference | In Document | Referenced Version | Current Version | Risk |
|-----------|------------|-------------------|-----------------|------|
| 支付系统接口 | D1 (section 4.2) | v2.1 | v2.1 | No drift |
| 积分规则配置 | D1 (section 2.1) | undated | Last updated 2024-01-20 | Low (2 months old) |

### Terminology Inconsistency

| Concept | Term in D1 | Term in D2 | Term in D3 | Recommendation |
|---------|-----------|-----------|-----------|----------------|
| Loyalty points | 积分 | 奖励点 | reward_points | Standardize to 积分 |
```

## Contribution to Maturity Score

**Traceability** contributes to the Traceability dimension (20 points):

| Condition | Points |
|-----------|--------|
| All requirements trace to goals AND have acceptance criteria | 20 |
| > 80% of requirements have both upward and downward traceability | 15 |
| > 60% have upward OR downward (not both) | 10 |
| < 60% have any traceability | 5 |
| No goals section and no acceptance criteria | 0 |

**Cross-consistency** contributes to the Completeness dimension:

- Deduct 5 points for each P0 contradiction
- Deduct 2 points for each P1 implicit dependency without defined contract

## Analysis Boundary

This guide identifies traceability gaps and cross-document conflicts. It does NOT:

- Invent business goals that are not stated in the documents
- Write acceptance criteria for untestable requirements (that's `clarify`'s job)
- Resolve contradictions between documents (that requires owner decisions)
- Decide which document version is authoritative (that requires owner decisions)

Report gaps and conflicts as issues in the main analysis. Route unresolvable conflicts to `clarify`.
