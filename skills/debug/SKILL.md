---
name: debug
description: "Applies root-cause diagnosis when explicitly invoked or activated by an issue or implementation workflow for a bug, failing test, build failure, regression, or unexpected behavior. Not for automatic routing of ordinary prompt-first defects, new feature planning, routine code review, or unauthorized fixes."
when_to_use: "explicit debug invocation, issue workflow diagnosis, owning implementation workflow requests root-cause investigation, regression or failure diagnosis, 根因排查"
metadata:
  version: "0.3.7"
---

# Debug

Investigate a reported failure when explicitly invoked or activated by `issue`
or an owning implementation workflow. A diagnosis-only request stops at the
findings; it does not authorize a lasting fix.

## Investigation

1. Establish expected versus observed behavior from the report, contract, or
   existing tests. Read the full relevant error and identify the failing version,
   environment, and recent changes.
2. Reproduce the failure with the smallest useful case. If it is intermittent or
   unavailable locally, record attempted steps and collect equivalent code or
   log evidence without presenting inference as reproduction.
3. Trace the failing value or operation to its source. Compare a relevant working
   path; for multi-component failures, inspect inputs and outputs at boundaries.
4. State a specific causal hypothesis and test it with the smallest discriminating
   check. Change one variable at a time; record what each result rules out.
5. Record the cause, confidence, remaining gaps, and proposed repair scope. Failed
   attempts are new evidence: reconsider the hypothesis, test setup, and coupling.
   An arbitrary number of failures does not prove the architecture is wrong.

Use [four-phases.md](references/four-phases.md) for boundary tracing and diagnostic
instrumentation. Prefer read-only evidence. Temporary edits must be attributable,
respect the owning workflow's worktree rules, and never overwrite user changes.
Do not print secrets or leave diagnostic patches unrecorded.

## Diagnosis contract

Use [diagnosis-contract.md](references/diagnosis-contract.md) for direct diagnosis
and `issue`/`fix` handoffs. It owns the structured fields and their meanings,
including `root_cause_status`, `hypotheses_rejected`, evidence, and test exceptions.
Use `unknown` or an empty list when evidence is missing; never invent a rejected
hypothesis to satisfy a downstream readiness gate.

## Repair handoff

When a fix is already authorized, continue through the owning implementation
workflow with a regression check and the smallest supported repair. Use `tdd`
when that workflow requires test-first evidence; use `verify` when it requests an
evidence audit. A direct fix request does not require creating an issue ledger.
When `issue` owns the work, its readiness and `fix` handoff contract still apply.

A retry, fallback, timeout, extra validation layer, or monitoring change needs a
named scenario and expected behavior in the authorized task. An uncertain cause
does not authorize defensive behavior. Report an unsupported option as a finding
and identify any owner decision that blocks a safe repair.

## Focused techniques

- [root-cause-tracing.md](root-cause-tracing.md): trace a deep failure back to the triggering input.
- [defense-in-depth.md](defense-in-depth.md): place checks for an already required invariant; do not add every layer by default.
- [condition-based-waiting.md](condition-based-waiting.md): investigate asynchronous tests; preserve required deadlines and bounded waits.
