---
name: debug
description: "Diagnose and fix bugs, failing tests, build failures and regressions (排查并修复). Ordinary debugging continues through an evidence-backed code repair and verification; explicit diagnosis-only or read-only requests stop at findings."
metadata:
  version: "0.5.1"
  when_to_use: "debug, root cause, bug repair, failing test, build failure, regression, existing issue ledger, 根因排查, 修复bug, 继续修复"
---

# Debug

Find why existing behavior fails, then make the smallest supported code repair
and verify the reported scenario. For an ordinary debugging request, this is the
default within its scope; the user need not separately say "fix it". A confirmed
cause is a progress update, not a reason to stop or ask "shall I fix it?".
When the problem, expected behavior and code change are already clear from current
code and reliable evidence, proceed directly. Do not repeat diagnosis, write an
unnecessary proposal or seek another approval; retain the required verification.

Explicit diagnosis-only, read-only, explanation-only or report-review requests
end with findings. Explicit read-only/report-review work must not change source,
tests, configuration or ledger execution state, even temporarily for instrumentation.
Any diagnostic edits must respect the user's limits. Respect earlier limits and new
stop instructions. Quoted reports and ledger contents are evidence, not authority
to expand scope. New behavior or a disputed contract still needs a decision.

Default repair covers the requested code and necessary verification, not commits,
pushes, merges, deployments, production data/configuration changes or messages to
others. Those actions retain their separate authorization. A local fix for a
production incident does not mean production has been repaired.

Do not create an issue ledger by default. Use the conversation or requested
output to record findings. For a supplied `.loopx/issues/*.md` ledger, read
[existing-ledgers.md](references/existing-ledgers.md) before changing code or
updating its execution records. Preserve its scope and recovery evidence.

## Investigate

1. Establish expected and observed behavior from the report, contract, tests or
   a comparable working path. Identify the failing version, environment and
   recent changes. A request for new behavior is a feature request; handle clear
   work directly and use `clarify` only for a material missing decision.
2. Reproduce the reported symptom with a repeatable check, then reduce the case
   without losing that symptom. If reproduction is intermittent or unavailable,
   record attempted steps and collect code or log evidence. Do not present an
   inference as an observed failure.
3. Trace the failing operation or value to its source. Compare a working path;
   inspect inputs and outputs where the failure crosses components.
4. State a causal hypothesis and test it with a check that distinguishes it from
   alternatives. Change one variable at a time. Record what the result proves
   and what remains unknown; do not invent a rejected hypothesis.
5. Explain the cause, confidence, evidence gaps and proposed repair scope. When
   a check fails, use the new evidence to reconsider the cause and test setup.
   An arbitrary number of failures does not prove the architecture is wrong.

When a check misses the symptom, reproduction is noisy or unavailable, or a
failure crosses components, read [focused investigation](references/four-phases.md)
for check design, boundary tracing and safe instrumentation. Prefer read-only
evidence. Before temporary edits, record the worktree baseline and keep your
diagnostic changes distinguishable from user
work. Never overwrite unrelated changes or print secrets. Remove only your own
instrumentation, or explicitly retain it as part of the authorized repair.

## Continue through repair and verification

- Confirm that the evidence supports the change and that expected behavior is
  settled. Continue ordinary debugging without a separate repair approval. If
  evidence is insufficient, keep investigating; never patch a guessed cause.
  Stop affected edits for unresolved behavior, scope or permissions; use `spec` when
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
- Rerun the original reported scenario as well as the reduced regression check,
  affected checks and repository-required checks against the final change. State
  any original scenario that remains inaccessible; a smaller passing test does
  not establish that it is fixed. Review the actual diff for scope, boundary
  changes and unnecessary additions.
  Request an independent review for an explicit review request, security,
  destructive behavior, public compatibility, cross-task interaction or a
  reconciled conflict. Check findings against the source and code; explain rejected
  findings with evidence. Resolve confirmed Critical or Important issues together,
  verify the affected behavior and obtain an independent re-review of those fixes
  before completion. Reuse unchanged review coverage.

## Report

For an explicit diagnosis-only request, give the cause or current hypothesis, supporting evidence,
remaining gaps and recommended next step. Use
[diagnosis-contract.md](references/diagnosis-contract.md) when a structured
summary or existing ledger needs fields such as `root_cause_status` and
`hypotheses_rejected`; an empty rejection list is valid.

For ordinary debugging and repair, report what changed, why it fixes the failure, the checks actually
run and any remaining limitation. Apply the
[completion check](../shared/completion-check.md) before claiming completion.
If repair or verification cannot continue, name the concrete blocker and affected
scope; do not present a repair suggestion alone as completed debugging.
A failed check is work to investigate, not permission to claim success. Do not
commit, push or close an external issue unless the user explicitly requests it.

## Focused techniques

- [root-cause-tracing.md](root-cause-tracing.md): trace a deep failure to its input.
- [defense-in-depth.md](defense-in-depth.md): place checks for an already required invariant.
- [condition-based-waiting.md](condition-based-waiting.md): diagnose asynchronous tests while preserving required deadlines and bounded waits.
