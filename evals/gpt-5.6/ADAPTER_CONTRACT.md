# Live Adapter Contract

A live adapter runs one case/variant pair on a real agent surface and emits the
events defined in `TRACE_SCHEMA.md`. The scorer does not depend on a provider.

## Required Inputs

- case entry from `cases.json`
- variant prompt resolved from `variants.<name>.git_ref` and `prompt_path`
- exact model ID and reasoning effort
- isolated repository fixture or disposable worktree
- explicit tool and side-effect permissions

## Required Guarantees

- Preserve native actor and parent identities. Never rewrite a nested worker as
  a controller child.
- Run baseline and candidate with the same case, fixture, model, reasoning
  effort, tool set, and timeout.
- Do not expose API keys, secrets, raw environment dumps, or unrelated source
  content in traces.
- Emit `run_end` even for timeout, blocked, failed, or cancelled runs.
- Treat missing usage or latency as unavailable data, not zero-cost evidence.

## Suggested Adapter Outputs

```text
.loopx/evals/gpt-5.6/raw/<timestamp>/<case>/<variant>/events.jsonl
.loopx/evals/gpt-5.6/raw/<timestamp>/<case>/<variant>/stdout.txt
.loopx/evals/gpt-5.6/raw/<timestamp>/<case>/<variant>/metadata.json
```

The adapter may be implemented for Codex native traces, Claude agent traces, or
the OpenAI Responses API. Keep provider parsing outside `src/agent-eval.mjs`;
normalize to the trace schema before scoring.
