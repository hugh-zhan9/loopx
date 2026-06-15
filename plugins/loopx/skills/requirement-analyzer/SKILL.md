---
name: requirement-analyzer
description: "Reviews existing requirements, PRDs, specs, and feature briefs for ambiguity, missing business closure, impact, feasibility, and development readiness. Not for changing workflow state, inventing business decisions, writing implementation plans, or editing code."
when_to_use: "requirement-analyzer, PRD review, requirement gaps, feasibility review, ambiguity analysis, development readiness, 需求分析, 需求缺口"
metadata:
  version: "0.2.10"
---

# Requirement Analyzer

## Purpose

`requirement-analyzer` reviews an existing written requirement and produces a gap report or readiness assessment. It is a support skill like `doc-readability`: users can invoke it directly, and loopx workflow skills may use its output as source material later, but this skill does not advance workflow state.

Do not turn this skill into `clarify`, `spec`, or `plan-to-exec`. If analysis shows the requirement is not ready, report the gaps. If the user later wants to proceed, route that separate request through the normal loopx flow.

## Inputs

Accept one primary input:

- a document path
- pasted document content
- a URL or external document the agent can read with available tools

Optional inputs:

- repository root for narrow context lookup
- analysis depth: `quick`, `standard`, or `deep`
- output mode: `gap_checklist` or `analysis_report`
- output path

If no source document or content is available, stop and ask for it.

## Analysis Rules

- Do not invent missing business facts. Mark them as unknowns.
- Separate facts, inferences, and assumptions.
- Every P0 or P1 issue must cite evidence from the requirement or nearby repo context.
- Keep repository scanning narrow. Read only directly related docs, interfaces, schemas, or code paths.
- Prefer concrete follow-up questions over broad requests for more detail.
- Do not treat every API, schema, or implementation detail as a PRD defect when it clearly belongs in technical design.

## Core Workflow

1. **Identify the source artifact** — Read the requirement, PRD, spec, ticket, or feature brief. If only an excerpt is available, state that limitation.
2. **Classify the document** — State whether it is a product requirement, engineering requirement, design brief, migration brief, bug requirement, or mixed document.
3. **Extract facts** — List actors, triggers, inputs, outputs, user-visible states, constraints, and explicit acceptance rules before judging quality.
4. **Run gap checks** — Review business closure, ambiguity, impact, feasibility, and development readiness. Load references only when the corresponding check is needed.
5. **Prioritize issues** — Assign P0/P1/P2 using the priority rules below. Do not inflate every missing implementation detail into a requirement blocker.
6. **Recommend next step** — Recommend `clarify`, `spec`, `plan-to-exec`, or blocked pending owner decisions. This is only a recommendation; do not create workflow artifacts unless separately asked.

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
| --- | --- | --- |
| PRD gap checklist | `references/prd-gap-checklist.md` | Reviewing business closure, ambiguity, impact, or Chinese PRDs |
| Readiness rubric | `references/readiness-rubric.md` | Deciding whether work is ready for `clarify`, `spec`, or `plan-to-exec` |
| Report template | `references/report-template.md` | Writing a gap checklist or narrative analysis report |
| Example reports | `references/example-reports.md` | Understanding expected output quality and format |

## Priority Levels

- `P0`: Blocks design or implementation. Key behavior, ownership, timing, failure handling, contract, permission, or acceptance rule is missing or contradictory.
- `P1`: Does not block kickoff, but creates major design uncertainty, integration risk, or likely rework.
- `P2`: Clarity, operability, UX, or maintenance issue that should be improved but does not block work.

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

### Development Readiness

State whether the requirement is ready for:

- `clarify`
- `spec`
- `plan-to-exec`
- blocked pending owner decisions

This is a recommendation only. Do not create workflow artifacts unless the user separately asks.

Use these readiness rules:

- Ready for `clarify` when the source is incomplete or contradictory and owner decisions are needed before design.
- Ready for `spec` when product behavior is mostly clear but API, data, permission, migration, compatibility, or architecture decisions must be fixed before planning.
- Ready for `plan-to-exec` when scope, non-goals, acceptance rules, affected surfaces, and constraints are clear enough to break into implementation tasks.
- Blocked pending owner decisions when a P0 question has no safe default and no local repo evidence can answer it.

## Output

Default to a markdown report with this structure:

```markdown
# Requirement Analysis

## Summary

## Readiness Recommendation

## P0 Blockers

## P1 Major Risks

## P2 Improvements

## Facts

## Inferences

## Assumptions

## Follow-Up Questions

## Suggested Next Step
```

If writing to disk, use a sibling file next to the source document when practical:

- `需求缺口清单.md` for gap reports
- `需求分析报告.md` for narrative analysis

## Review Checklist

- Did every P0/P1 cite requirement text or nearby repo evidence?
- Are facts, inferences, and assumptions separated?
- Are follow-up questions concrete enough for an owner to answer?
- Are technical design questions separated from true requirement gaps?
- Does the readiness recommendation match the highest-priority unresolved issue?
- Did the report avoid creating workflow artifacts or advancing loopx state?
