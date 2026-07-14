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

Diagnosis does not authorize lasting code changes, retries, fallbacks, timeouts,
or monitoring. Those behaviors require the user request, issue contract, or an
approved implementation plan.

