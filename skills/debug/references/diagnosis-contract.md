# Diagnosis Contract

`debug` produces and `issue`/`fix` consume exactly these fields:

```yaml
classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info
reproduction_status: reproduced | intermittent | not_reproduced | not_attempted
root_cause_status: confirmed | likely | unknown
root_cause: <specific cause and mechanism, or unknown>
hypotheses_rejected: []
fix_mode: root_cause_fix | defensive_fix | blocked | no_fix_needed
regression_test_required: true | false
risk_triggers: []
```

Field rules:

- `root_cause_status: confirmed` requires reproduction or strong evidence that identifies the source, not just the symptom.
- `reproduction_status: not_reproduced` must include attempted steps and evidence gaps.
- `fix_mode: defensive_fix` requires `risk_triggers` to include `defensive_fix` and a clear explanation of why a root-cause fix is unavailable.
- `regression_test_required: false` requires an exception reason.
- `classification: needs_info` should list the exact missing logs, steps, environment, version, or expected behavior.

Diagnosis does not authorize lasting code changes, retries, fallbacks, timeouts,
or monitoring. Those behaviors require the user request, issue contract, or an
approved implementation plan.

