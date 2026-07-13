# GPT-5.6 Skill Eval Harness

This harness compares matched baseline and candidate traces for representative
loopx tasks. It is deliberately trace-first: platform adapters capture native
Codex, Claude, or API runs, while the repository owns deterministic scoring and
reports.

## Run

```bash
node scripts/run-agent-evals.mjs \
  --trace path/to/events.jsonl \
  --out .loopx/evals/gpt-5.6
```

Outputs:

- `run-summaries.json`
- `comparison.json`
- `report.md`

For native Codex runs, normalize a root thread and its child rollouts first:

```bash
npm run eval:codex-normalize -- \
  --thread <root-thread-id> \
  --case leaf-worker-control \
  --variant v2 \
  --model gpt-5.6-sol \
  --reasoning-effort high \
  --out .loopx/evals/gpt-5.6/v2.jsonl
```

The normalizer reads Codex rollout files from `~/.codex/sessions`, preserves
native parent/child thread identity, and aggregates parent plus child usage.

## Evaluation Discipline

1. Run the same case, repository fixture, model, and reasoning effort for both
   variants.
2. Change one prompt group at a time.
3. Capture native agent/tool events without rewriting their parent identities.
4. Reject candidate runs with nested agents even when token or latency is lower.
5. Inspect failed or surprising traces before changing another prompt.

The first suite is defined in `cases.json`. Add a case only when it represents a
real failure mode or product-critical workflow. Synthetic traces are suitable
for testing the scorer, not for claiming GPT-5.6 performance improvements.

`default_limits` and per-case `limits` are executable policy, not narrative
guidance. Candidate runs fail quality when they exceed agent, nesting, peak,
retry, replacement, or review-error budgets.

## Live Runs

No API credential is required for scoring. A live adapter should be opt-in and
write this trace schema. Do not store API keys, raw secrets, or unrestricted
repository contents in traces. Record model ID, reasoning effort, prompt
variant, and platform version in the `run_start` event when available.

See `ADAPTER_CONTRACT.md` before implementing or connecting a live runner.
