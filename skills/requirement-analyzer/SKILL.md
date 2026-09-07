---
name: requirement-analyzer
description: "Use when reviewing existing requirements, PRDs, specs, or feature briefs for ambiguity, missing business closure, state/workflow behavior, data mutations, traceability, implementation fit, feasibility, or development readiness. Not for changing workflow state, inventing business decisions, writing implementation plans, or editing code."
when_to_use: "requirement-analyzer, PRD review, requirement gaps, feasibility review, ambiguity analysis, development readiness, 需求分析, 需求缺口, 需求评审, 状态机分析, 行为模型"
metadata:
  version: "0.3.7"
---

# Requirement Analyzer

Review existing requirements, PRDs, specs, or feature briefs for evidence-backed
gaps and development readiness. This support skill does NOT invent business
decisions, implement changes, or advance workflow state.

Read the supplied document or content before assessment. State any excerpt or
access limitation. Use a supplied repository root for narrow checks of related
interfaces, schemas, behavior, and source references. Ask for the source when
none is available; do not fabricate a report from a title.

## Choose depth

Honor the requested depth; default to `standard`. Depth controls coverage, not
mandatory scores or report length.

| Depth | Coverage |
| --- | --- |
| `quick` | Obvious blockers, unclear acceptance, and highest-risk behavior; disclose sampling |
| `standard` | Business closure and feasibility; targeted state and traceability checks for high-risk requirements; contradictions across supplied sources |
| `deep` | Full applicable behavioral and traceability matrices, referenced-source consistency, and implementation fit when a repository is supplied |

Default to a qualitative verdict. Add numerical quality or maturity scores only
when requested, or when a deep review has an explicit comparison question that
scores help answer. State that purpose, coverage, and uncertainty. A sampled
score is not a document-wide measurement. Scores never decide routing by themselves.

## Analysis

1. Extract actors, triggers, inputs, outputs, states, constraints, and acceptance
   rules before judging gaps. Separate source facts, inferences, and assumptions.
2. Check business closure, ambiguity, impact, feasibility, and testability. Use
   [the PRD checklist](references/prd-gap-checklist.md) for detailed prompts.
3. For stateful workflows, extract states, transitions, operations, and mutations
   using [the behavioral guide](references/behavioral-model-guide.md). Inspect
   failure outcomes and duplicate/concurrent triggers where applicable; do not
   prescribe a state-machine implementation or invent missing policies.
4. Trace relevant requirements to goals and acceptance criteria. For multiple
   sources, check contradictions and authority using
   [the traceability guide](references/traceability-guide.md).
5. Resolve what the source, references, or supplied repo evidence already answers.
   Label each remaining ambiguity as an inference needing confirmation or an
   unresolved decision, with plausible interpretations and consequences.
6. Prioritize concrete gaps, then recommend the next step using
   [the readiness rubric](references/readiness-rubric.md). Exhaust relevant evidence
   before referring an owner question to `clarify`.

Do not require irrelevant matrices for simple behavior. Missing technical design
choices are design inputs, not automatically defects in a product requirement.

## Priority and readiness

- **P0:** An unresolved business rule, scope, permission, ownership, acceptance,
  or failure outcome blocks safe design or implementation.
- **P1:** A material integration risk or likely rework remains, but work can
  start without inventing product behavior.
- **P2:** A clarity or maintenance improvement, or a detail technical design can
  settle without changing product semantics.

Every P0/P1 finding cites source evidence and explains the consequence. Do not
inflate severity because a table is absent or a score is low. Recommend `clarify`
for remaining owner decisions, `spec` for durable design choices, and `plan2exec`
when ready work needs a persistent plan. Clear local work can proceed through the
host without a planning artifact. These are recommendations, not mandatory stages.

## Output and optional detail

Deliver a gap checklist or analysis report matching the request. Give the source
scope, qualitative readiness verdict, prioritized findings, evidence-resolved
questions, and remaining decisions. Omit empty or inapplicable sections. Create
an output file only when requested or required by the owning task; use the given
path, or a sibling `需求缺口清单.md` / `需求分析报告.md` when appropriate.

- [report-template.md](references/report-template.md): adaptable report and self-check.
- [quality-attributes-rubric.md](references/quality-attributes-rubric.md): statement-quality criteria and optional scoring.
- [maturity-scorecard.md](references/maturity-scorecard.md): optional quantitative comparison.
- [example-reports.md](references/example-reports.md): worked reports; numerical examples illustrate scoring requests.
