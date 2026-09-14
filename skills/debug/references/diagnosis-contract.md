# Diagnosis Contract

Use these fields when a structured diagnosis or an existing ledger needs them.
For ordinary findings, plain prose with the same evidence is sufficient.

```yaml
diagnosis:
  classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info
  reproduction_status: reproduced | intermittent | not_reproduced | not_attempted
  evidence:
    - type: command | log | steps | code | user_report
      value: <observed result and source>
  root_cause_status: confirmed | likely | unknown
  root_cause: <specific cause and mechanism, or unknown>
  hypotheses_rejected:
    - <hypothesis and evidence rejecting it>
  fix_mode: root_cause_fix | defensive_fix | blocked | no_fix_needed
  regression_test_required: true | false
  regression_test_exception_reason: <required when false>
  risk_triggers: []
```

- `confirmed` requires reproduction or strong evidence identifying the causal
  mechanism. A symptom alone is insufficient; use `likely` for an evidenced but
  unconfirmed cause and `unknown` when the cause is not established.
- `not_reproduced` includes attempted steps and remaining evidence gaps.
- `hypotheses_rejected` may be empty, including when the first hypothesis is
  confirmed. Do not fabricate an entry to make a diagnosis or repair look ready.
- `defensive_fix` requires that risk trigger and a reason a root-cause repair is
  unavailable. It describes an option, not permission to implement it.
- `regression_test_required: false` requires a concrete exception reason and the
  alternative verification approach.
- `needs_info` identifies the exact missing expected behavior, steps, logs,
  environment, or version needed to continue.
- Include applicable risk triggers: `no_repro`, `defensive_fix`, `public_surface`,
  `scope_unclear`. Keep the list empty when none apply.

Diagnosis does not authorize lasting code changes, retries, fallbacks, timeouts,
or monitoring. The user request or owning workflow defines repair authority.
