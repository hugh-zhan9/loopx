---
name: debug
description: "Diagnose bugs, failing tests, build failures and regressions (排查问题、修复 bug). A diagnosis-only request stops at findings; a repair request continues through verification."
when_to_use: "debug, root cause, bug repair, failing test, build failure, regression, existing issue ledger, 根因排查, 修复bug, 继续修复"
metadata:
  version: "0.4.0"
---

# Debug

Find why existing behavior fails. When the user asks for a repair, continue
through the supported change and verification. A diagnosis-only request ends
with findings. A supplied report or ledger is evidence, not repair permission.
Honor authorization already given for the same task and scope.

Do not create an issue ledger by default. Use the conversation or requested
output to record findings. For a supplied `.loopx/issues/*.md` ledger, read
[existing-ledgers.md](references/existing-ledgers.md) before changing code or
updating its execution records. Preserve its scope and recovery evidence.

## Investigate

1. Establish expected and observed behavior from the report, contract, tests or
   a comparable working path. Identify the failing version, environment and
   recent changes. A request for new behavior is a feature request; handle clear
   work directly and use `clarify` only for a material missing decision.
2. Reproduce with the smallest useful case. If reproduction is intermittent or
   unavailable, record attempted steps and collect code or log evidence. Do not
   present an inference as an observed failure.
3. Trace the failing operation or value to its source. Compare a working path;
   inspect inputs and outputs where the failure crosses components.
4. State a causal hypothesis and test it with a check that distinguishes it from
   alternatives. Change one variable at a time. Record what the result proves
   and what remains unknown; do not invent a rejected hypothesis.
5. Explain the cause, confidence, evidence gaps and proposed repair scope. When
   a check fails, use the new evidence to reconsider the cause and test setup.
   An arbitrary number of failures does not prove the architecture is wrong.

Use [four-phases.md](references/four-phases.md) when tracing boundaries or adding
instrumentation. Prefer read-only evidence. Before temporary edits, record the
worktree baseline and keep your diagnostic changes distinguishable from user
work. Never overwrite unrelated changes or print secrets. Remove only your own
instrumentation, or explicitly retain it as part of the authorized repair.

## Repair when requested

- Confirm that the evidence supports the change and that expected behavior is
  settled. Continue an already authorized repair without another handoff. Stop
  affected edits for unresolved behavior, scope or permissions; use `spec` when
  the repair needs a new public contract or architecture decision.
- Capture the original failure in a regression test or another repeatable check.
  Explain a test exception and its alternative evidence. Use `tdd` when requested
  or required by the owning workflow.
- Make the smallest supported repair. Apply `lancet`: prefer deletion, existing
  code or standard-library capabilities before adding code or dependencies.
  Do not add retries, fallbacks, timeouts, monitoring or extra validation unless
  the task names that behavior. An uncertain cause is not permission to add it.
- Default to serial work. Parallel workers that edit code need isolated
  workspaces, non-overlapping ownership and leaf assignments. Otherwise they
  produce patches or reports only. Integrate one result at a time and check the
  combined behavior; never have multiple workers edit the main checkout.
- Run affected checks and repository-required checks against the final change.
  Review the actual diff for scope, boundary changes and unnecessary additions.
  Request an independent review for an explicit review request, security,
  destructive behavior, public compatibility, cross-task interaction or a
  reconciled conflict. Resolve Critical or Important findings, verify the result
  and obtain an independent re-review before completion.

## Report

For diagnosis, give the cause or current hypothesis, supporting evidence,
remaining gaps and recommended next step. Use
[diagnosis-contract.md](references/diagnosis-contract.md) when a structured
summary or existing ledger needs fields such as `root_cause_status` and
`hypotheses_rejected`; an empty rejection list is valid.

For repair, report what changed, why it fixes the failure, the checks actually
run and any remaining limitation. Apply the
[completion check](../shared/completion-check.md) before claiming completion.
A failed check is work to investigate, not permission to claim success. Do not
commit, push or close an external issue unless the user explicitly requests it.

## Focused techniques

- [root-cause-tracing.md](root-cause-tracing.md): trace a deep failure to its input.
- [defense-in-depth.md](defense-in-depth.md): place checks for an already required invariant.
- [condition-based-waiting.md](condition-based-waiting.md): diagnose asynchronous tests while preserving required deadlines and bounded waits.
