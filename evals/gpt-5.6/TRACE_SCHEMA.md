# GPT-5.6 Agent Eval Trace Schema

Store traces as NDJSON with one event per line. Every event requires `event` and
`run_id`. `run_start` also requires `case_id` and `variant`.

## Events

| Event | Required fields | Purpose |
|---|---|---|
| `run_start` | `run_id`, `case_id`, `variant`, `at_ms` | Identify one case/variant run |
| `agent_spawn` | `actor_id`, `parent_actor_id`, `at_ms` | Count agents and detect nested dispatch |
| `agent_release` / `agent_end` | `actor_id`, `at_ms` | Compute active-agent peak |
| `tool_call` | `actor_id`, `tool`, `at_ms` | Count tool usage |
| `agent_wait` | `actor_id`, `target_actor_id`, `at_ms` | Count wait loops |
| `retry` | `actor_id`, `reason`, `at_ms` | Count retries |
| `agent_replacement` | `actor_id`, `target_actor_id`, `reason`, `at_ms` | Count replacement behavior |
| `review_finding` | `finding_id`, `finding_valid`, `at_ms` | Measure review accuracy and duplicates |
| `run_end` | `outcome`, `tests_passed`, `input_tokens`, `output_tokens`, `latency_ms`, `at_ms` | Record quality and resource outcome |

Structured reviewer runs may also record `integration_passed`,
`leaf_review_result_valid`, `controller_review_result_valid`,
`status_preserved`, `task_quality_preserved`, `task_anchor_preserved`,
`finding_recall`, `finding_precision`, `severity_fidelity`, `anchor_recall`,
`cannot_verify_recall`, `unsafe_context_promotion`, `blocking_finding_loss`, and
`controller_invented_blocking_findings` on `run_end`.

`parent_actor_id` must be `controller` for every `agent_spawn`. Any other value
is a hard nested-agent failure.

Resource reduction counts as an improvement only when the candidate run passes
tests, reports `outcome: "passed"`, and satisfies hard topology invariants.
When a leaf reviewer returns `loopx.review-result.v1`, controller integration is
also a hard quality gate. Missing structured controller output, unsafe promotion
of `NEEDS_CONTEXT`, blocking-finding loss, severity loss, or invented blocking
findings fails the run independently from leaf-review quality.
