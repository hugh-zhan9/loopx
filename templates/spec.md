---
schema_version: 2
workflow_id: <workflow id>
stage: clarify
profile: <profile>
target_ambiguity_threshold: <target ambiguity threshold>
max_rounds: <max rounds>
current_round: 0
ambiguity_score: 1
non_goals_resolved: false
decision_boundaries_resolved: false
pressure_pass_complete: false
handoff_decision: blocked
approval_status: requested
unresolved_ambiguity_count: 1
---

# loopx Spec: <task name>

## Intent

- TODO: capture why this work matters.

## Desired Outcome

- TODO: describe the end state the user actually wants.

## Ambiguity List

- A-1 | open | Clarify the concrete task, acceptance criteria, and constraints.

## Clarified Answers

- TODO: record the accepted clarification answers.

## In Scope

- TODO: record the work that belongs in this loopx run.

## Non-Goals

- TODO: record what must stay out of scope.

## Decision Boundaries

- Human approval is required before `clarify -> plan`.

## Constraints

- TODO: record technical, business, or sequencing constraints.

## Success Criteria

- TODO: record what makes the run plan-ready.

## Assumptions Exposed

- TODO: list assumptions that were surfaced and how they were resolved.

## Brownfield Evidence vs Inference

- TODO: separate what was observed in code/docs from what is still inferred.

## Design Direction

- TODO: record the preferred shape or option if the task needed design guidance.

## Next Handoff Recommendation

- default: `plan`
