---
name: plan-reviewer
description: "Reviews a lean implementation plan against its approved source for missing outcomes, scope drift, dependency mistakes, weak acceptance, and unverifiable claims. Not for creating plans, reviewing implemented code, scheduler validation, or advancing workflow state."
when_to_use: "explicit plan review, lean plan audit, source-to-plan coverage, plan scope drift, plan verification quality"
metadata:
  version: "0.2.1"
argument-hint: "<lean plan path and approved source>"
---

# Plan Reviewer

Use this support lens for an explicit ad-hoc review of a lean plan. It must not create a workflow state, approval ledger, scheduler manifest, or mandatory review artifact.

## Inputs

Read the plan and its named approved source. A current lean plan contains:

- Outcomes
- Boundaries
- Likely Modules
- Known Dependencies
- Acceptance
- Verification

If the approved source is missing or materially ambiguous, stop and identify
the exact source needed. Do not infer product or architecture decisions during
plan review.

## Review

Check:

1. Every accepted outcome and applicable `AC-*`, `TC-*`, or `D-*` anchor appears in outcomes or acceptance.
2. Boundaries preserve explicit non-goals and protected behavior.
3. Likely modules orient execution without claiming immutable file ownership.
4. Known dependencies are supported by source or repository evidence and do not prescribe a fixed schedule.
5. Acceptance is observable and verification is fresh, task-relevant, and feasible.
6. The plan avoids implementation transcripts, code snippets, task microsteps, executor selection, concurrency metadata, reviewer stages, and finish gates.

Treat missing or contradictory accepted outcomes as blocking. Report narrower
clarity, scope, or verification improvements as non-blocking. The output is
review advice for the caller; `plan2exec` remains the owner of any plan update.

## Output

Report:

- reviewed plan and approved source;
- blocking findings with source evidence;
- non-blocking improvements;
- coverage of applicable anchors;
- assessment: ready, ready after named fixes, or blocked.

When dispatching an independent reviewer, make it a leaf worker. Include:
"Do not spawn, delegate to, or wait for other agents."

## STOP Conditions

Stop when the plan or approved source is unreadable, source authority is
unclear, a material decision belongs in `clarify` or `spec`, or the request is
actually for implementation or code review.
