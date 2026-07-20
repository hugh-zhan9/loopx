---
name: review
description: "Performs independent code review for explicit review intent or concrete risk evidence, then closes blocking findings in the active context. Not for routine verification, low-risk disjoint work, or legacy review artifacts."
when_to_use: "explicit review request, security or destructive change review, public compatibility review, cross-task interaction, reconciled conflict, existing review feedback"
metadata:
  version: "0.4.0"
argument-hint: "<request, source artifact, feedback, or git scope>"
---

# Review

Use independent review proportionally. Review scope, severity, and closure
follow [`../shared/review-contract.md`](../shared/review-contract.md).

An explicit invocation is itself a review trigger. Execution may also invoke
this skill after observing security-sensitive or destructive behavior, a public
compatibility change, cross-task interaction, or a reconciled conflict.
Multi-agent execution alone is not a trigger.

## Input Resolution

Resolve the user's input into one of these review intents:

- **New independent review:** review the supplied task, feature, current change,
  or Git scope.
- **Whole-feature review:** preserve this intent when forwarded by
  `final-review`, but use this canonical process and create no legacy report.
- **Existing-feedback resolution:** preserve this intent when forwarded by
  `fix-review`; verify the findings' basis, make focused fixes in the active
  context, and independently recheck blocking findings.

Collect the accepted request, applicable spec or plan, exact changed scope,
current diff or state, and fresh verification. If scope or authority is
materially ambiguous, stop and ask for the missing source rather than reviewing
an invented range.

## Review Basis

Check spec compliance first, then code quality. Stage 1 spec compliance uses a
design proposal, detailed design, implementation plan, issue contract, or the
accepted user request. Do not dispatch a code-only review for plan-driven work.

When present, map `AC-*`, `D-*`, `T-*`, and `TC-*` anchors to the implementation
and task verification evidence. Execution evidence is a first-class Stage 1
input. Report missing or weak task evidence as a finding when commands, outputs,
or evidence summaries do not support claimed `AC-*`/`D-*`/`T-*` completion.
An uncovered design anchor needs a deferred rationale from an authoritative
source; reviewer preference cannot invent one.

## Support Lens Triggers

Read only the support skills triggered by the changed scope and include their
lens-specific checks in reviewer context:

| Change surface | Support lens |
|---|---|
| REST, GraphQL, OpenAPI, routes, resources, versioning, or client compatibility | `api-designer` |
| Architecture boundaries, ADRs, NFRs, failure modes, or operational tradeoffs | `architecture-designer` |
| SQL, schema, migrations, indexes, backfills, or database performance | `sql-style` |
| CLI commands, flags, output, exit codes, help, or prompts | `cli-developer` |
| Go files, tests, errors, context, interfaces, or goroutines | `go-style` |
| Go-Kratos APIs, layers, middleware, auth, or config | `kratos` |
| Over-engineering, missing repo reuse, stdlib/native alternatives, avoidable dependencies, or deletable abstractions | `lancet` |

## Independent Reviewer

Dispatch one leaf reviewer over the narrowest complete scope that contains the
trigger. Give it crafted review context, not session history:

- accepted intent and explicit non-goals;
- applicable requirement, design, plan, issue, or public contract;
- changed paths and the relevant diff or current implementation;
- worker, focused, and combined verification evidence;
- the concrete reason independent review was selected.

Use `code-reviewer.md` for a new review. Ask for spec compliance first, then
code quality, regression, security, compatibility, and integration findings.
Require file and line evidence, calibrated severity, and a clear assessment.
Do not dispatch one reviewer per task when one combined scope covers the risk.

Before returning, perform a Review Output Self-Check. Confirm every Critical or
Important finding names the plan/design/requirement basis or a concrete
code-only defect. Do not prescribe broad fallback logic, degraded modes, retry
paths, wrappers, compatibility shims, options, or abstractions unless the
current user instruction, clarified source requirements, approved design,
implementation plan, or issue contract explicitly requires that behavior.
Treat unanchored fallback, degradation, retry, silent recovery, or compatibility
shim logic as a finding when the implementation adds it without authority.
State whether unsupported, duplicate, or overbuilt findings were removed.

## Existing Feedback

When concrete findings are already supplied, check each finding against the
accepted intent, authoritative sources, current code, and tests before editing.
Separate the underlying defect from a reviewer's proposed remedy. Reject
duplicates, unsupported scope expansion, speculative fallback behavior, and
over-engineering with evidence.

Critical and Important findings remain blocking. Keep them in the active
execution context: fix the smallest valid scope or record evidence-backed
pushback, run fresh focused verification and relevant combined verification,
then obtain independent re-review. Do not hand findings to a mandatory fixer
stage or claim closure from passing tests alone when the finding concerns a
requirement, compatibility, security, or integration gap.

## Review Result

Report:

- reviewed scope and independent-review trigger;
- source requirements and verification evidence used;
- findings grouped as Critical, Important, and Minor with file/line evidence;
- decision, fix or pushback basis, verification, and re-review status for every
  Critical and Important finding;
- remaining Minor findings and residual risk;
- final assessment: ready, ready with stated Minor risk, or blocked.

Do not require or create a task-review report, feedback ledger, final-review
report, checkpoint, or finish artifact. Persist review output only when the user
explicitly requests an artifact or an external process requires one.

## STOP Conditions

Stop when review scope is unresolved, an authoritative source is missing for a
material requirement claim, verification is stale or cannot cover the claimed
surface, reviewer independence is unavailable for a required trigger, or any
Critical or Important finding lacks closure evidence.
