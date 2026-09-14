# Verification Evidence Contract

Check actual output against the claim and the current integrated state. A started
command, a source read, or a worker's success report does not prove a passing check.
For an ordinary task, the response can carry the evidence. Use a durable record
only when the task or handoff needs one; this reference adds no workflow step.

## Match the claim to the evidence

| Claim | Evidence needed |
| --- | --- |
| Focused tests pass | Completed output for those tests; no full-suite implication |
| Full suite passes | Completed full-suite output with skipped tests disclosed |
| Build or lint passes | That check's output; one does not substitute for the other |
| Bug is fixed | Original reproduction or equivalent targeted check now passes |
| Regression test detects the defect | Failure before the fix and success after it, when safely reproducible |
| Delegated changes are integrated | Actual integrated diff and checks on that state |
| Task is complete | Accepted behavior and boundaries covered, plus applicable verification |

Check exit status, tested scope, skips, code, configuration, inputs and relevant
environment. Rerun affected checks when these change or the prior evidence cannot
be established. Once checks pass, repeat or broaden them only for changed state,
an uncovered requirement, a failure or a repository requirement. A new message
alone does not make otherwise current evidence stale.

Never revert or delete user changes to manufacture regression evidence. Use an
isolated reproduction when needed. Report missing dependencies and unverified
scope; do not weaken validation to obtain a pass.

## Optional record

When a durable record is needed, identify the tested tree or change state as well
as the actual commands. For example:

```yaml
command: npm test
cwd: /absolute/repository/path
timestamp: 2026-07-13T00:00:00.000Z
exit_code: 0
scope: focused | full
tested_state: <commit plus relevant uncommitted changes, or content checkpoint>
result: pass | fail | blocked
output_summary: 84 tests passed, 0 failed
skipped_checks: []
environment_constraints: []
```

## Rules

- Record the command actually run and its working directory.
- Use fresh output from the code under review.
- `focused` evidence proves only the named surface; it does not imply the full
  suite passed.
- A blocked environment is recorded as `result: blocked`, with the missing
  dependency in `environment_constraints`.
- Skipped checks require a reason and remain visible during review and completion.
