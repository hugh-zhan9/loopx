---
name: requirement-analyzer
description: "Use when reviewing existing requirements, PRDs, specs, or feature briefs for ambiguity, missing business closure, state/workflow behavior, data mutations, traceability, implementation fit, feasibility, or development readiness. Not for changing workflow state, inventing business decisions, writing implementation plans, or editing code."
when_to_use: "requirement-analyzer, PRD review, requirement gaps, feasibility review, ambiguity analysis, development readiness, 需求分析, 需求缺口, 需求评审, 状态机分析, 行为模型"
metadata:
  version: "0.3.4"
---

# Requirement Analyzer

## Purpose

`requirement-analyzer` reviews an existing written requirement and produces an evidence-backed gap and readiness report. It can extract behavioral models, check traceability, compare nearby implementation, and include diagnostic scoring when useful. It is a support skill like `doc-readability`: users can invoke it directly, and loopx workflow skills may use its output as source material later, but this skill does not advance workflow state.

Do not turn this skill into `clarify`, `spec`, or `plan-to-exec`. If analysis shows the requirement is not ready, report the gaps. If the user later wants to proceed, route that separate request through the normal loopx flow.

The readiness recommendation is authoritative. Maturity scores and quality scores explain confidence and risk; they do not route work by themselves.

## Inputs

Accept one or more primary inputs:

- a document path (or multiple paths for cross-document analysis)
- pasted document content
- a URL or external document the agent can read with available tools

Optional inputs:

- repository root for narrow context lookup and implementation fit analysis
- analysis depth: `quick`, `standard`, or `deep`
- output mode: `gap_checklist` or `analysis_report`
- output path

If no source document or content is available, stop and ask for it.

## Analysis Depth

| Depth | Quality Attributes | Behavioral Model | Traceability | Maturity Score | Cross-Consistency |
|-------|-------------------|-----------------|--------------|----------------|-------------------|
| `quick` | Flag worst offenders only (score=0) | Only obvious state/workflow gaps | Orphans and untestable only | Optional total only | Skip |
| `standard` | Targeted summary for high-risk statements | Extract when triggered | Targeted matrix for high-risk goals/requirements | Full scorecard with caveats | When multiple docs |
| `deep` | Per-statement scoring | Full matrices + implementation fit | Full matrix + gap analysis | Full scorecard + per-dimension breakdown | Always if references exist |

Default: `standard`

## Analysis Rules

- Do not invent missing business facts. Mark them as unknowns.
- Separate facts, inferences, and assumptions.
- Every P0 or P1 issue must cite evidence from the requirement or nearby repo context.
- Keep repository scanning narrow. Read only directly related docs, interfaces, schemas, or code paths.
- Prefer concrete follow-up questions over broad requests for more detail.
- Do not treat every API, schema, or implementation detail as a PRD defect when it clearly belongs in technical design.
- Exhaust the analysis before routing to `clarify`: cross-check referenced documents, compare nearby repo behavior when a repository root is provided, list contradictions, and state plausible interpretations with consequences.
- Use `clarify` as a decision forum for the remaining owner-level questions, not as a substitute for doing requirement analysis.

## Analysis Boundary

This skill analyzes requirements. It does NOT:

- **Behavioral model extraction** identifies WHAT states/transitions the requirement defines or implies. It does NOT design the state machine implementation.
- **Quality scoring** judges the requirement text. It does NOT rewrite requirements.
- **Traceability** identifies gaps. It does NOT invent business goals or acceptance criteria.
- **Cross-consistency** finds conflicts. It does NOT resolve them; unresolved business semantics go to `clarify`.
- **Maturity score** is a diagnostic summary. The readiness recommendation is authoritative and still governs routing.
- **Implementation fit** compares requirement to existing code. It does NOT propose code changes.

## Core Workflow

1. **Identify source artifact(s)** — Read the requirement(s), PRD, spec, ticket, or feature brief. If only an excerpt is available, state that limitation. Note if multiple documents are provided.
2. **Classify the document** — State whether it is a product requirement, engineering requirement, design brief, migration brief, bug requirement, or mixed document.
3. **Extract facts** — List actors, triggers, inputs, outputs, user-visible states, constraints, and explicit acceptance rules before judging quality.
4. **Run quality attribute scoring** — In `standard`, summarize worst offenders and high-risk patterns. In `deep`, score individual requirement statements for testability, atomicity, necessity, unambiguity, completeness, consistency, implementation-freedom, and measurability. Load `references/quality-attributes-rubric.md`.
5. **Run gap checks** — Review business closure, ambiguity, impact, feasibility, and development readiness. Load `references/prd-gap-checklist.md` when needed.
6. **Extract behavioral model** (conditional) — When the requirement involves stateful entities, multi-step processes, or lifecycle management, extract state model, transition matrix, operation matrix, and data mutation matrix. Load `references/behavioral-model-guide.md`.
7. **Cross-document consistency check** (conditional) — When multiple documents are provided or the primary document references other specs, check for contradictions, redundancy, implicit dependencies, and version drift. Load `references/traceability-guide.md`.
8. **Generate traceability matrix** — In `standard`, map high-risk requirements to business goals and acceptance criteria. In `deep`, map all requirements. Identify orphans, untestable requirements, and uncovered goals. Load `references/traceability-guide.md`.
9. **Resolve what can be resolved by evidence** — For each ambiguity, check whether the primary requirement, referenced documents, examples, or nearby repo implementation already imply an answer. Mark the result as `resolved by evidence`, `likely but needs confirmation`, or `unresolved decision`.
10. **Compare with existing implementation** (conditional) — When a repository root is provided and behavioral model was extracted, compare each state, transition, operation, and mutation against existing code. Output coverage status.
11. **Prioritize issues** — Assign P0/P1/P2 using the priority rules below. Do not inflate every missing implementation detail into a requirement blocker.
12. **Optional maturity score** — Calculate the diagnostic scorecard only when
    the user requests it or deep analysis benefits from it. The qualitative
    evidence-backed verdict remains authoritative; avoid double-counting the
    same gap across completeness, testability, and behavior.
13. **Recommend next step** — Recommend `clarify`, `spec`, `plan-to-exec`, or blocked pending owner decisions. This is only a recommendation; do not create workflow artifacts unless separately asked.

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
| --- | --- | --- |
| PRD gap checklist | `references/prd-gap-checklist.md` | Reviewing business closure, ambiguity, impact, or Chinese PRDs |
| Behavioral model guide | `references/behavioral-model-guide.md` | Requirement involves stateful entities, workflows, approval chains, async tasks, lifecycle |
| Quality attributes rubric | `references/quality-attributes-rubric.md` | Scoring individual requirement statements for quality |
| Traceability guide | `references/traceability-guide.md` | Generating traceability matrix or checking cross-document consistency |
| Readiness rubric | `references/readiness-rubric.md` | Deciding whether work is ready for `clarify`, `spec`, or `plan-to-exec` |
| Report template | `references/report-template.md` | Writing a gap checklist or narrative analysis report |
| Example reports | `references/example-reports.md` | Understanding expected output quality and format |

## Behavioral Model Activation

Activate behavioral model extraction when the requirement contains:

- Chinese keywords: 状态、流程、审批、生命周期、任务、执行、工单、流转、阶段、步骤、链路、回退、重试
- English keywords: state, workflow, approval, lifecycle, pipeline, job, task, step, phase, transition, retry, rollback, saga

Skip behavioral model extraction for simple CRUD, static pages, or single-action features.

## Priority Levels

- `P0`: Blocks design or implementation. Key behavior, ownership, timing, failure handling, contract, permission, acceptance rule, state transition, or data mutation is missing or contradictory.
- `P1`: Does not block kickoff, but creates major design uncertainty, integration risk, or likely rework. Includes: incomplete behavioral model, missing traceability, cross-document contradictions.
- `P2`: Clarity, operability, UX, or maintenance issue that should be improved but does not block work. Includes: low quality attribute scores, minor terminology inconsistency, orphan requirements.

Use the lowest priority that still protects the work. If a missing detail can be decided during technical design without changing product behavior, classify it as a design input or P2 note, not a P0 requirement blocker.

## Review Dimensions

### Business Closure

Check whether the requirement has a complete loop:

```text
input -> process -> output -> feedback
```

Look for missing actors, triggers, success events, failure handling, ownership, and user-visible completion states.

For each missing closure point, state who must decide it and what downstream work is blocked.

### Ambiguity

Find terms, quantities, timing, permissions, integrations, and acceptance criteria that can be interpreted more than one way.

Convert each ambiguity into a concrete question with two or three plausible interpretations when possible.

### Impact

Identify affected users, systems, APIs, data, permissions, migrations, operations, analytics, and rollback concerns.

Call out impact as unknown only when the requirement gives no evidence. Do not invent affected systems from generic architecture assumptions.

### Feasibility

Call out technical, product, operational, legal, data-quality, schedule, or dependency risks that would change design or planning.

Separate feasibility blockers from implementation difficulty. Hard work is not a requirement gap unless the requirement assumes an impossible or unapproved constraint.

### Behavioral Model

When activated, extract and validate:

- **State Model** — All explicit/implicit states, hierarchy, terminal states, error states, stale states
- **Transition Matrix** — from → action/trigger → to → actor → guard → failure path
- **Operation Matrix** — state → allowed operations → forbidden operations → role → entry point
- **Data Mutation Matrix** — operation → creates/updates/deletes → side effects → audit → idempotency
- **Implementation Fit** — per-element comparison against existing codebase (when repo root provided)

Flag as gaps: dead-end states, undefined failure paths, non-deterministic transitions, operations without state context, mutations without idempotency consideration.

### Requirement Quality

Score individual requirement statements across 8 attributes (testability, atomicity, necessity, unambiguity, completeness, consistency, implementation-freedom, measurability).

Flag any statement scoring 0 on any attribute. Compute document-level quality percentage.

### Traceability

Validate upward traceability (requirement → business goal), downward traceability (requirement → acceptance criteria), and lateral coverage (business goals → supporting requirements).

Flag orphan requirements, untestable requirements, and uncovered business goals.

### Cross-Document Consistency

When applicable, check for contradictions, redundancy, implicit dependencies, version drift, and terminology inconsistency across referenced documents.

### Development Readiness

State whether the requirement is ready for:

- `clarify`
- `spec`
- `plan-to-exec`
- blocked pending owner decisions

This is a recommendation only. Do not create workflow artifacts unless the user separately asks.

Use these readiness rules:

- Ready for `clarify` when the analysis has already surfaced the concrete contradictions, candidate interpretations, repo evidence, and owner decisions needed before design.
- Ready for `spec` when product behavior is mostly clear but API, data, permission, migration, compatibility, or architecture decisions must be fixed before planning.
- Ready for `plan-to-exec` when scope, non-goals, acceptance rules, affected surfaces, and constraints are clear enough to break into implementation tasks.
- Blocked pending owner decisions when a P0 question has no safe default and no local repo evidence can answer it.

## Maturity Scorecard

Produce a quantitative maturity assessment:

| Dimension | Max | How Scored |
|-----------|-----|-----------|
| Completeness | 20 | Business closure, gap checklist coverage, cross-document consistency |
| Clarity | 20 | Quality attribute average (testability, unambiguity, atomicity, etc.) |
| Testability | 20 | Acceptance criteria coverage, measurability of NFRs |
| Behavioral Coverage | 20 | State model completeness, transition coverage, operation coverage, mutation coverage |
| Traceability | 20 | Upward + downward traceability coverage |
| **Total** | **100** | Sum of all dimensions |

Use coarse, evidence-based scoring. If evidence is thin, mark the dimension as low confidence instead of inventing precision.

Dimension scoring:

- **Completeness**: 20 = full business loop and no P0/P1 closure gaps; 15 = minor missing branches; 10 = several P1 closure gaps; 5 = P0 closure gap; 0 = source lacks the core loop.
- **Clarity**: use the quality attribute rubric; 20/15/10/5/0 map to >=80%, 60-79%, 40-59%, 20-39%, <20%.
- **Testability**: 20 = all key requirements have explicit acceptance criteria; 15 = >80% covered; 10 = >60% partially covered; 5 = major flows untestable; 0 = no usable acceptance basis.
- **Behavioral Coverage**: 20 = states/transitions/operations/mutations complete; 15 = minor edge gaps; 10 = partial model with P1 gaps; 5 = stateful behavior named but graph is mostly absent; 0 = stateful behavior is required but not analyzable.
- **Traceability**: use the traceability guide; 20 = all requirements trace to goals and criteria; 15 = >80%; 10 = >60%; 5 = <60%; 0 = no goals and no criteria.

Score bands:

- **85-100**: High confidence if no P0/P1 readiness blockers exist
- **70-84**: Medium confidence; often ready for `spec` when product behavior is clear
- **50-69**: Low confidence; usually needs focused `clarify` or document repair
- **<50**: Very low confidence; major requirement rework or owner decisions likely needed

The maturity score is an informative summary. Score ranges do not route work by themselves: a specific unresolved business P0 can force `clarify` or blocked even with a high score, and a low score without a specific blocking decision usually means `clarify`, not blocked.

For requirements without stateful behavior, the Behavioral Coverage dimension scores based on workflow completeness (trigger → process → output → feedback) rather than state machine analysis.

## Output

Default to a markdown report. Load `references/report-template.md` for the full structure.

If writing to disk, use a sibling file next to the source document when practical:

- `需求缺口清单.md` for gap reports
- `需求分析报告.md` for narrative analysis

## Review Checklist

- Did every P0/P1 cite requirement text or nearby repo evidence?
- Are facts, inferences, and assumptions separated?
- Are follow-up questions concrete enough for an owner to answer?
- Are technical design questions separated from true requirement gaps?
- Does the readiness recommendation match the highest-priority unresolved issue?
- Did the behavioral model identify all states, transitions, operations, and mutations?
- Did the quality scoring cover all identifiable requirement statements?
- Does the traceability matrix cover all requirements and business goals?
- Is the maturity score consistent with the qualitative assessment?
- Did the report avoid creating workflow artifacts or advancing loopx state?
