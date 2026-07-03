---
name: plan-reviewer
description: "Reviews draft implementation plans for source-to-plan coverage, scope drift, verification gaps, and task handoff readiness. Not for writing plans, reviewing implementation code, changing workflow state, or redesigning approved requirements."
when_to_use: "plan review, source-to-plan review, plan artifact audit, coverage audit, implementation plan quality, draft plan review, 计划审核, 计划覆盖检查"
metadata:
  version: "0.1.1"
---

# Plan Reviewer

`plan-reviewer` is a support lens, not a workflow state. It reviews a draft implementation plan against its approved source artifact before execution starts.

Use it inside `plan-to-exec` after a draft plan exists and before the final plan is saved or execution handoff is offered. It may also be invoked directly for an ad-hoc plan audit.

## Do not use this skill for:

- Writing or rewriting the implementation plan from scratch.
- Do not review implementation code or git diffs.
- Running `exec`, `subagent-exec`, `review`, `final-review`, or `finish`.
- Creating a new workflow state, CLI command, or required user handoff.
- Do not redesign approved product, architecture, data, API, permission, or workflow decisions.
- Migrating historical plans.

If the source is missing required decisions, contradictory, or not testable, report that the work must return to `clarify` or `spec`. Do not invent decisions inside the review.

It must not create a workflow state.

## Inputs

Read:

1. Source artifact:
   - intake package directory with canonical `requirements.md` and supporting `clarification.md`, or
   - design spec with Source AC, Design anchors, Test cases, `AC-*`, `D-*`, `TC-*`, and verification strategy.
2. Draft implementation plan.
3. Relevant repo specs or memory summaries already selected by the caller.

Do not inspect implementation code or git diffs. If the caller asks for post-implementation code review, route that work to `review` or `final-review`.

## Review Rubric

Build a source-to-plan coverage matrix:

- Every Source AC maps to a task, verification step, review focus, expected execution evidence, or deferred-with-rationale row.
- Every Design anchors row maps to a task, verification step, review focus, expected execution evidence, or deferred-with-rationale row.
- Every Test cases row maps to an automated command, integration/e2e/API/CLI/manual check, or deferred-with-rationale row.
- Non-goals, compatibility rules, surface boundaries, and unchanged behaviors from the source remain preserved in the plan.
- The plan does not add product, API, data, permission, workflow, runtime, or compatibility behavior not justified by the source.
- Each task has enough interfaces, context, support lenses, and expected evidence for an `exec` or `subagent-exec` implementer and reviewer to work independently.

## Severity

Use these severities:

- Critical: a required Source AC, Design anchor, or Test case is absent from the plan; the plan contradicts the source; or the plan invents behavior that would change product, API, data, permission, workflow, runtime, or compatibility semantics.
- Important: coverage is partial, verification is too weak to prove the source requirement, task handoff context is insufficient for isolated execution, or support-lens/surface-change evidence is missing.
- Minor: clarity or organization issue that does not risk missed implementation, extra behavior, weak verification, or failed handoff.

Critical and Important findings block final plan save and execution handoff until revised and rechecked.

## Output

Return findings in this shape:

```markdown
## Plan Review Result

- Review mode: subagent | same-context
- Reviewer independence: independent | degraded
- Verdict: approved | needs_revision | return_to_clarify | return_to_spec
- Unresolved findings: none | <count>
- Residual risk: none | <concrete risk>

## Coverage Matrix

| Source anchor | Plan coverage | Status | Notes |
|---|---|---|---|
| AC-001 | T-001 verification | covered | |

## Findings

### Critical

1. <finding or none>

### Important

1. <finding or none>

### Minor

1. <finding or none>

## Recheck Notes

For each fixed Critical or Important finding, state what changed and whether the affected source anchor is now covered.
```

For each finding, include:

- source anchor or source section
- draft plan location
- what is missing, extra, contradictory, or unverifiable
- why it matters
- what change or evidence would resolve it

## Boundary Rules

- Same-context review is allowed only as a degraded fallback when subagent review is unavailable.
- A same-context review must still use this exact rubric and must record the independence risk.
- Minor findings may remain if the final plan records residual risk and they do not affect execution correctness.
- Scratch review artifacts may live under `.loopx/plan-to-exec/<slug>-plan-review.md`; they are local workflow state and not repo-tracked docs by default.
