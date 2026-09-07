---
name: verify
description: "Audits fresh verification evidence when explicitly invoked or activated by an owning workflow before a completion, fixed, passing, review-ready, or commit-readiness claim. Not for automatic workflow selection, replacing the quiet completion check, speculative confidence, or stale results."
when_to_use: "explicit verify invocation, owning workflow requests verification audit, fresh evidence for completion or commit readiness, 验证审计"
metadata:
  version: "0.3.6"
---

# Verify

Audit fresh verification evidence when explicitly invoked or activated by an
owning workflow. This skill does not select a workflow or replace the quiet
completion check.

## Evidence before claims

1. Identify the claim and the checks that can support it. Use the repository's
   required checks and checks relevant to the changed behavior.
2. Inspect the actual command output, exit status, tested scope, and any skips.
   A command starting successfully is not a completed check.
3. Confirm the evidence applies to the current code, configuration, inputs, and
   relevant environment. Rerun affected checks after these change, or when the
   prior output or tested state cannot be established. A new message alone does
   not invalidate otherwise current evidence.
4. State the result at the scope the evidence supports, including failures,
   omissions, and environment constraints. Without applicable passing evidence,
   you cannot claim it passes.

## Match evidence to the claim

| Claim | Evidence needed |
| --- | --- |
| Focused tests pass | Completed output for the named tests; no full-suite implication |
| Full suite passes | Completed full-suite output, with skipped tests disclosed |
| Build or lint passes | That check's output; neither substitutes for the other |
| Reported bug is fixed | Original reproduction or equivalent targeted evidence now passes |
| Regression test detects the defect | Expected failure before the fix and success after it, when safely reproducible |
| Delegated changes are integrated | Inspect the integrated diff and evidence for that state; an agent's success report alone is insufficient |
| Task is complete | Required behavior and boundaries accounted for, plus relevant verification; passing tests alone do not establish coverage |

Do not revert or delete user changes to manufacture regression evidence. Use an
isolated reproduction when needed and label any evidence limitation.

## Record and report

Use [the shared evidence contract](../shared/evidence-contract.md) when a workflow
or handoff requires a durable record. For a standalone audit, the response can
carry the evidence; no extra artifact is required solely by this skill. Identify
the tested tree or change state alongside the command evidence so its relevance
can be checked after further edits or integration.

If a check is blocked, report the missing dependency and the unverified scope.
Do not silently drop required checks or modify validation to obtain a pass.
Once applicable checks pass, repeat or broaden them only for a changed state,
an uncovered requirement, a failure, or a repository requirement.
