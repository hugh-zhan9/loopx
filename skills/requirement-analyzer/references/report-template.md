# Requirement Analysis Report Template

Adapt this structure to the requested gap checklist or analysis report. Omit
empty sections and irrelevant matrices. Use natural headings in the user's
language. A quick review needs only its scope, readiness, and concrete findings.

```markdown
# Requirement Analysis

## Conclusion

- Source and assessed scope: <document/version/sections; note excerpts or sampling>
- Readiness: <what can proceed and which decisions still block it>
- Main reason: <evidence-backed conclusion>

## Findings

| Priority | Gap and source evidence | Consequence | Question or next action |
| --- | --- | --- | --- |
| <P0/P1/P2> | <specific statement or missing behavior, with anchor> | <effect on decisions or delivery> | <bounded resolution> |

## Resolved From Evidence

<Only relevant questions already answered by source, references, or repo evidence.
Separate confirmed facts from inferences that still need confirmation.>

## Remaining Decisions

<Unresolved owner or design choices, plausible interpretations, consequences,
and known decision owner. Do not invent an owner or choose a business policy.>

## Suggested Next Step

<Justified recommendation; no automatic workflow transition or new artifact.>
```

## Conditional sections

Add these only when the task and chosen depth call for them:

- **Behavioral model:** state, transition, operation, and mutation matrices from
  [behavioral-model-guide.md](behavioral-model-guide.md), including evidence gaps.
  Describe product behavior without designing its implementation.
- **Implementation fit:** compare the extracted behavior with narrowly relevant
  code when a repo is supplied. Future requirements absent from current code are
  planned changes, not automatically defects.
- **Traceability:** goal/requirement/acceptance links using
  [traceability-guide.md](traceability-guide.md). Disclose sampling and orphan links.
- **Cross-document consistency:** identify conflicting claims, versions, and
  authority; do not silently decide which business rule wins.
- **Numerical assessment:** only when requested or a deep comparison question
  justifies it. Use [quality-attributes-rubric.md](quality-attributes-rubric.md)
  and [maturity-scorecard.md](maturity-scorecard.md). State scope, denominators,
  excluded dimensions, and uncertainty. No score may override an unresolved P0.

For a Chinese gap checklist, use “结论、必须确认、主要风险、可以后续完善” where
applicable; the same evidence and scope rules apply. No mandatory scorecard.

## Reviewer self-check

- Does every P0/P1 identify source evidence and a concrete downstream consequence?
- Are missing business semantics separated from open technical design choices?
- Were available references checked before calling something an owner decision?
- Are facts, inferences, unresolved choices, and sampled coverage distinguished?
- Are applicable behavior and traceability gaps covered at the requested depth?
- Are scores, if included, consistent with their stated scope and uncertainty?
- Does the qualitative readiness verdict follow the unresolved decisions, rather
  than the presence of tables or a numerical threshold?
- Does the report refrain from inventing business policy or advancing workflow state?
