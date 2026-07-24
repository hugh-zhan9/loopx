# Maturity Scorecard

Companion to `skills/requirement-analyzer/SKILL.md`. Produce this quantitative
maturity assessment only when the user requests it or deep analysis benefits
from it. The qualitative evidence-backed verdict remains authoritative.

## Dimensions

| Dimension | Max | How Scored |
|-----------|-----|-----------|
| Completeness | 20 | Business closure, gap checklist coverage, cross-document consistency |
| Clarity | 20 | Quality attribute average (testability, unambiguity, atomicity, etc.) |
| Testability | 20 | Acceptance criteria coverage, measurability of NFRs |
| Behavioral Coverage | 20 | State model completeness, transition coverage, operation coverage, mutation coverage |
| Traceability | 20 | Upward + downward traceability coverage |
| **Total** | **100** | Sum of all dimensions |

Use coarse, evidence-based scoring. If evidence is thin, mark the dimension as
low confidence instead of inventing precision. Avoid double-counting the same
gap across completeness, testability, and behavior.

## Dimension Scoring

- **Completeness**: 20 = full business loop and no P0/P1 closure gaps; 15 = minor missing branches; 10 = several P1 closure gaps; 5 = P0 closure gap; 0 = source lacks the core loop.
- **Clarity**: use the quality attribute rubric; 20/15/10/5/0 map to >=80%, 60-79%, 40-59%, 20-39%, <20%.
- **Testability**: 20 = all key requirements have explicit acceptance criteria; 15 = >80% covered; 10 = >60% partially covered; 5 = major flows untestable; 0 = no usable acceptance basis.
- **Behavioral Coverage**: 20 = states/transitions/operations/mutations complete; 15 = minor edge gaps; 10 = partial model with P1 gaps; 5 = stateful behavior named but graph is mostly absent; 0 = stateful behavior is required but not analyzable.
- **Traceability**: use the traceability guide; 20 = all requirements trace to goals and criteria; 15 = >80%; 10 = >60%; 5 = <60%; 0 = no goals and no criteria.

For requirements without stateful behavior, the Behavioral Coverage dimension
scores based on workflow completeness (trigger → process → output → feedback)
rather than state machine analysis.

## Score Bands

- **85-100**: High confidence if no P0/P1 readiness blockers exist
- **70-84**: Medium confidence; often ready for `spec` when product behavior is clear
- **50-69**: Low confidence; usually needs focused `clarify` or document repair
- **<50**: Very low confidence; major requirement rework or owner decisions likely needed

## Scores Do Not Route Work

The maturity score is an informative summary. Score ranges do not route work by
themselves: a specific unresolved business P0 can force `clarify` or blocked
even with a high score, and a low score without a specific blocking decision
usually means `clarify`, not blocked. See `readiness-rubric.md` for the full
override rules.
