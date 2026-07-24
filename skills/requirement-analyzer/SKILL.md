---
name: requirement-analyzer
description: "Use when reviewing existing requirements, PRDs, specs, or feature briefs for ambiguity, missing business closure, state/workflow behavior, data mutations, traceability, implementation fit, feasibility, or development readiness. Not for changing workflow state, inventing business decisions, writing implementation plans, or editing code."
when_to_use: "requirement-analyzer, PRD review, requirement gaps, feasibility review, ambiguity analysis, development readiness, 需求分析, 需求缺口, 需求评审, 状态机分析, 行为模型"
metadata:
  version: "0.3.6"
---

# Requirement Analyzer

## Purpose

`requirement-analyzer` reviews an existing written requirement and produces an evidence-backed gap and readiness report. It can extract behavioral models, check traceability, compare nearby implementation, and include diagnostic scoring when useful. It is a support skill like `doc-readability`: users can invoke it directly, and loopx workflow skills may use its output as source material later, but this skill does not advance workflow state.

Do not turn this skill into `clarify`, `spec`, or `plan2exec`. If analysis shows the requirement is not ready, report the gaps. If the user later wants to proceed, route that separate request through the normal loopx flow.

The readiness recommendation is authoritative. Maturity scores and quality scores explain confidence and risk; they do not route work by themselves.

## Inputs

Primary (one or more): a document path (or multiple paths for cross-document analysis), pasted document content, or a URL/external document the agent can read with available tools.

Optional: repository root for narrow context lookup and implementation fit analysis; analysis depth (`quick`, `standard`, or `deep`; default `standard`); output mode (`gap_checklist` or `analysis_report`); output path.

If no source document or content is available, stop and ask for it.

## Analysis Depth

| Depth | Quality Attributes | Behavioral Model | Traceability | Maturity Score | Cross-Consistency |
|-------|-------------------|-----------------|--------------|----------------|-------------------|
| `quick` | Flag worst offenders only (score=0) | Only obvious state/workflow gaps | Orphans and untestable only | Optional total only | Skip |
| `standard` | Targeted summary for high-risk statements | Extract when triggered | Targeted matrix for high-risk goals/requirements | Full scorecard with caveats | When multiple docs |
| `deep` | Per-statement scoring | Full matrices + implementation fit | Full matrix + gap analysis | Full scorecard + per-dimension breakdown | Always if references exist |

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

1. **Identify source artifact(s)** — Read the requirement(s). If only an excerpt is available, state that limitation. Note multiple documents.
2. **Classify the document** — Product requirement, engineering requirement, design brief, migration brief, bug requirement, or mixed.
3. **Extract facts** — Actors, triggers, inputs, outputs, user-visible states, constraints, and explicit acceptance rules before judging quality.
4. **Run quality attribute scoring** — Summarize worst offenders (`standard`) or score every statement (`deep`). Load `references/quality-attributes-rubric.md`.
5. **Run gap checks** — Business closure, ambiguity, impact, feasibility, development readiness. Load `references/prd-gap-checklist.md`.
6. **Extract behavioral model** (conditional) — For stateful entities, multi-step processes, or lifecycles: state, transition, operation, and data mutation matrices. Load `references/behavioral-model-guide.md`.
7. **Cross-document consistency check** (conditional) — Contradictions, redundancy, implicit dependencies, version drift. Load `references/traceability-guide.md`.
8. **Generate traceability matrix** — Map requirements to business goals and acceptance criteria (high-risk in `standard`, all in `deep`); identify orphans, untestable requirements, uncovered goals. Load `references/traceability-guide.md`.
9. **Resolve what can be resolved by evidence** — For each ambiguity, check whether the requirement, referenced documents, examples, or nearby repo implementation already imply an answer. Mark as `resolved by evidence`, `likely but needs confirmation`, or `unresolved decision`.
10. **Compare with existing implementation** (conditional) — With a repo root and an extracted behavioral model, compare each element against existing code and output coverage status.
11. **Prioritize issues** — Assign P0/P1/P2 with the rules below. Do not inflate every missing implementation detail into a requirement blocker.
12. **Optional maturity score** — Calculate the diagnostic scorecard only when the user requests it or deep analysis benefits from it. Load `references/maturity-scorecard.md`. The qualitative evidence-backed verdict remains authoritative.
13. **Recommend next step** — `clarify`, `spec`, `plan2exec`, or blocked pending owner decisions, using `references/readiness-rubric.md`. This is only a recommendation; do not create workflow artifacts unless separately asked.

## Reference Guide

| Topic | Reference | Load When |
| --- | --- | --- |
| PRD gap checklist | `references/prd-gap-checklist.md` | Reviewing business closure, ambiguity, impact, feasibility, or Chinese PRDs |
| Behavioral model guide | `references/behavioral-model-guide.md` | Requirement involves stateful entities, workflows, approval chains, async tasks, lifecycle (activation keywords listed inside; skip for simple CRUD, static pages, single-action features) |
| Quality attributes rubric | `references/quality-attributes-rubric.md` | Scoring statements across the 8 attributes (testability, atomicity, necessity, unambiguity, completeness, consistency, implementation-freedom, measurability) |
| Traceability guide | `references/traceability-guide.md` | Generating traceability matrix or checking cross-document consistency |
| Readiness rubric | `references/readiness-rubric.md` | Deciding whether work is ready for `clarify`, `spec`, or `plan2exec` |
| Maturity scorecard | `references/maturity-scorecard.md` | Producing the diagnostic scorecard, dimension scoring, and score bands |
| Report template | `references/report-template.md` | Writing a gap checklist or narrative analysis report, and running the reviewer self-check |
| Example reports | `references/example-reports.md` | Understanding expected output quality and format |

## Priority Levels

- `P0`: Blocks design or implementation. Key behavior, ownership, timing, failure handling, contract, permission, acceptance rule, state transition, or data mutation is missing or contradictory.
- `P1`: Does not block kickoff, but creates major design uncertainty, integration risk, or likely rework. Includes: incomplete behavioral model, missing traceability, cross-document contradictions.
- `P2`: Clarity, operability, UX, or maintenance issue that should be improved but does not block work. Includes: low quality attribute scores, minor terminology inconsistency, orphan requirements.

Use the lowest priority that still protects the work. If a missing detail can be decided during technical design without changing product behavior, classify it as a design input or P2 note, not a P0 requirement blocker.

## Review Dimensions

Detailed per-dimension guidance lives in the references above. In every report, cover: business closure (input -> process -> output -> feedback loop, who must decide each missing closure point), ambiguity (concrete questions with plausible interpretations), impact (evidence-based, no invented systems), feasibility (blockers, not implementation difficulty), behavioral model (flag dead-end states, undefined failure paths, non-deterministic transitions, operations without state context, mutations without idempotency consideration), requirement quality (flag any statement scoring 0; compute document-level percentage), traceability, and cross-document consistency.

## Development Readiness

State whether the requirement is ready for `clarify`, `spec`, `plan2exec`, or blocked pending owner decisions, applying `references/readiness-rubric.md`. This is a recommendation only; do not create workflow artifacts unless the user separately asks.

## Output

Default to a markdown report. Load `references/report-template.md` for the full structure and run its reviewer self-check before delivering.

If writing to disk, use a sibling file next to the source document when practical:

- `需求缺口清单.md` for gap reports
- `需求分析报告.md` for narrative analysis
