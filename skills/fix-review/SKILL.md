---
name: fix-review
description: "Handles received code review feedback with per-finding basis checks, closure tracking, verification evidence, technical pushback, and re-review gates. Not for requesting a new review or implementing unrelated changes."
when_to_use: "fix-review, received code review feedback, review comments, reviewer suggestions, requested changes, 处理评审意见"
metadata:
  version: "0.3.6"
---

# Fix Review

Persist the feedback ledger at `.loopx/fix-review/<scope-slug>/feedback.md`.
Resume from the first finding without closure evidence; do not reconstruct
finding state from conversation memory.

## Contract

Use this skill only after concrete review feedback exists. Treat review feedback as findings to evaluate, not orders to blindly implement.

Critical and Important findings are blocking until closed by evidence. Do not claim the review feedback is complete, handled, fixed, or done while any Critical or Important finding is open, unverified, awaiting clarification, or awaiting re-review.

Workflow basis:

- `exec` and `fix` require Critical/Important findings to be handled with `fix-review`, focused verification, and re-review.
- `final-review` requires Critical/Important findings to be handled before finish.
- D-006 in `docs/loopx/design/2026-06-30-execution-review-ranges/` and `docs/loopx/plans/2026-06-30-execution-review-ranges/02-final-review-contracts.md` makes missing requirement coverage Critical, partial requirement coverage Important, and both blocking for `fix-review`.

## Inputs

Read the review artifact or pasted feedback completely before editing. Also read the source artifacts needed to judge the feedback:

- Feature work: approved clarify output, PRD, spec, design document, implementation plan, and relevant task evidence.
- Plan-driven work: the plan task anchor (`T-*`), source acceptance criteria (`AC-*`), design anchors (`D-*`), test cases (`TC-*`), and expected execution evidence.
- Final-review feedback: the canonical final-review report, blocking findings, coverage matrix, and referenced source/design artifacts.
- Issue-driven bug fixes: the `.loopx/issues/*` ledger, reproduction evidence, diagnosis summary, fix brief, and accepted contract.
- Code-quality comments: the changed code, local patterns, tests, public API contracts, platform/version constraints, and dependency behavior.

Plan or design documents are mandatory when the finding claims missing behavior, partial requirement coverage, implementation drift, scope creep, or a violated architecture decision. They are not mandatory for a pure typo, formatting issue, dead import, or obviously local defect, but the ledger must still record the code/test basis used.

## Feedback Ledger

Create a ledger before editing. Assign stable IDs in the order received: `FR-001`, `FR-002`, etc. Keep it current as decisions, fixes, verification, and re-review results change.

| ID | Severity | Source | Finding | Basis | Decision | Evidence | Verification | Re-review | Status |
|----|----------|--------|---------|-------|----------|----------|--------------|-----------|--------|
| FR-001 | Critical/Important/Minor | review/final-review/fix/user | exact feedback | plan/design/issue/code/test source | accepted_fixed/pushed_back/... | files or reasoning | command/result | pending/pass/not_required | open |

Allowed decisions:

- `accepted_fixed`: the finding is valid and code/docs/tests changed with the smallest basis-backed remedy.
- `accepted_no_code_change`: the finding is valid, but closure only required evidence, configuration, documentation, or verification already present.
- `pushed_back`: the finding is not valid for this codebase or conflicts with a higher-priority source of truth.
- `needs_clarification`: the finding cannot be safely interpreted or the source of truth conflicts.
- `duplicate_of`: the finding repeats another `FR-*` without adding a distinct basis, severity, or verification need.
- `coalesced_with`: the finding shares the same root cause and required fix as another `FR-*`; handle the cluster with one focused change.
- `deferred_minor`: only for non-blocking Minor findings with explicit residual risk.

Allowed statuses:

- `open`: not yet evaluated or not yet acted on.
- `fixed_pending_verification`: a change exists, but focused verification has not run.
- `verified_pending_recheck`: verification passed, but required re-review is still pending.
- `closed`: closure gate passed for this finding.
- `blocked`: clarification, source conflict, failing verification, or user decision blocks closure.

## Basis Check

For each finding, identify the closest authoritative basis before changing code:

1. Reviewer's concrete claim and severity.
2. Source requirement, issue, plan task, design anchor, API contract, or existing behavior the finding is enforcing.
3. Code and tests that currently prove or disprove the claim.
4. User decision, only when sources conflict or intended behavior is absent.

If the finding has no identifiable basis, do not invent one. Mark it `needs_clarification` and ask for the missing requirement, plan/design anchor, issue contract, or acceptance rule.

If sources conflict, prefer explicit user decisions and approved requirements/design over reviewer preference. If that still leaves ambiguity, stop and ask.

For missing or partial requirement coverage, map the finding to the relevant `AC-*`, `D-*`, `T-*`, or `TC-*` anchor. If no anchor exists but the review claims a requirement gap, treat the gap as blocking until clarified.

## Feedback Lancet Check

Apply `lancet` to the review feedback itself before accepting the reviewer's proposed remedy. The goal is to fix real findings without letting review accumulate redundant service logic, broad fallback paths, speculative compatibility shims, or extra abstractions.

For each finding:

1. Separate the underlying problem from the reviewer's proposed implementation.
2. Check the problem against the design document, implementation plan, issue contract, code, and tests.
3. Check whether another `FR-*` already covers the same basis or root cause. Mark true repeats as `duplicate_of`; mark tightly coupled findings as `coalesced_with` and fix them once.
4. Choose the smallest correct remedy in `lancet` order: delete or skip unnecessary change, reuse repo code, use stdlib/native behavior, reuse installed dependency, then add new code.
5. Reject broad fallback logic unless the design or implementation plan names the failure mode, compatibility need, or recovery behavior.
6. Preserve validation, error handling, security, accessibility, and regression coverage. `lancet` cannot justify skipping required safeguards.

If the underlying finding is valid but the proposed remedy is overbuilt, accept the finding and push back on the remedy. Record the smaller remedy and its basis in the ledger.

## Process

1. Read all feedback and source artifacts before editing.
2. Build the feedback ledger with `FR-*` IDs, severity, source, finding text, and basis.
3. Clarify any ambiguous Critical/Important finding before implementation.
4. Evaluate each finding against codebase reality and the recorded basis.
5. Apply the Feedback Lancet Check: deduplicate repeated feedback, coalesce one-root-cause findings, and choose the smallest correct remedy.
6. Push back when the finding is technically wrong, the proposed remedy overbuilds the basis, violates YAGNI, conflicts with a higher-priority source, breaks compatibility, or depends on missing context.
7. Implement one finding or one tightly coupled cluster at a time.
8. Run focused verification for each accepted finding.
9. Run broader regression checks when shared behavior, public APIs, integration paths, workflow contracts, or templates changed.
10. Update the ledger with files changed, command output summary, residual risk, and status.
11. Re-run or request the originating review mode when required.

Originating review mode:

- Checkpoint or task `review` finding: re-run `review` for the task or changed range.
- `final-review` finding: re-run `final-review` when Critical/Important findings changed, integration behavior changed, or requirement coverage was missing/partial.
- `fix` local or whole-diff review finding: re-run the matching local or whole-diff review.
- Inline GitHub review comment: reply in the existing thread when reporting evidence or fix status.

## Closure Gate

A Critical or Important finding is closed only when one of these is true:

- It is `accepted_fixed`, focused verification passed, and required re-review passed or the originating reviewer/user explicitly accepted the evidence.
- It is `accepted_no_code_change`, the ledger records the basis and verification evidence proving no code change was needed, and required re-review/user acceptance is complete.
- It is `pushed_back`, the ledger records concrete plan/design/issue/code/test evidence, and the reviewer/user accepted the pushback or the user explicitly decided to proceed.

Do not close Critical/Important findings as `deferred_minor`. Do not mark `needs_clarification` as complete. Do not treat passing tests alone as closure when the finding was about missing requirements, design drift, or review evidence.

Minor findings may remain only when every Critical/Important finding is closed and each remaining Minor finding is recorded as `deferred_minor` with residual risk.

## Pushback Rules

Push back with evidence when:

- The suggestion breaks existing functionality or compatibility.
- The reviewer lacks required source context.
- The suggestion violates YAGNI for unused behavior.
- The suggested fallback, wrapper, abstraction, option, retry path, or compatibility shim is not required by the design, implementation plan, observed callers, or concrete failure mode.
- The suggestion conflicts with approved plan/design/requirements or user decisions.
- The current code already satisfies the stated basis.

Use concise technical reasoning. Reference the source artifact, code path, command, or test that proves the point. If the pushback was wrong, update the ledger and fix the finding.

## Output Contract

When reporting progress or completion, include:

- Ledger summary by `FR-*` ID.
- Decision and status for every Critical/Important finding.
- Basis used for each Critical/Important decision, including plan/design/issue anchors when relevant.
- Feedback Lancet outcome for each Critical/Important finding: smallest remedy accepted, proposed remedy pushed back, duplicate, or coalesced cluster.
- Files changed and commands run.
- Re-review status.
- Remaining Minor deferrals or residual risk.

Use "complete", "done", "handled", or "fixed" only after the closure gate passes. If blocked, state the exact `FR-*` ID and the missing clarification, failing verification, source conflict, or user decision needed.

## Scope Control

Do not implement unrelated cleanup or refactors while fixing review feedback. If new defects are discovered, record them as follow-up unless they must be fixed to close a Critical/Important finding already in the ledger.

## Forbidden Responses

Never respond with performative agreement before verification:

- "You're absolutely right!"
- "Great point!"
- "Excellent feedback!"
- "Let me implement that now" before basis and code checks.

Instead, restate the technical requirement, record the basis, ask a specific clarification question, push back with evidence, or make the scoped fix.

## Bottom Line

Every review finding needs a tracked decision, a source-of-truth basis, verification evidence, and a closure status. Critical and Important findings require re-review or accepted evidence before completion can be claimed.
