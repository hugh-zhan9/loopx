# GPT-5.6 Skill Eval Harness

This harness compares matched baseline and candidate traces for representative
loopx tasks. It is deliberately trace-first: platform adapters capture native
Codex, Claude, or API runs, while the repository owns deterministic scoring and
reports.

## Scoring Positioning

Correctness is tri-state: `passed`, `failed`, or `unknown`. A run whose trace
carries no machine-checkable correctness evidence (`tests_passed` and
`integration_passed` both unevaluated) scores `unknown`; unknown never counts
as quality-passed and never contributes an "improved" verdict.

Offline trace scoring (`run-agent-evals.mjs` over normalized rollouts) verifies
the normalization pipeline, topology invariants, and resource accounting. The
normalizer emits no correctness evidence, so offline runs score correctness
`unknown` by design. Offline reports are pipeline regression evidence, not
agent capability evidence. Correctness verdicts come from live runs
(`eval:codex-live`), which re-derive `tests_passed` from `expected_pattern`,
`expected_review_result` (including `summary_must_contain` content evidence),
and controller integration. Cases marked `machine_check: pending-live-harness`
in `cases.json` have no live task yet and stay `unknown` until one exists.

The committed `test/*-eval.test.mjs` suites drive the scorer with fake agents:
a green `npm test` validates the scoring pipeline and proves nothing about
agent capability.

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

Reviewer prompts end with a canonical `loopx.review-result.v1` block. Live runs
score leaf-review quality from the leaf message and controller integration from
the separately captured controller message. Status, task quality, task anchor,
blocking findings, severities, and cannot-verify context are hard fidelity
requirements; finding precision/recall and anchor recall remain visible metrics.

Run the paired native Codex suite with the model and authentication from the
current Codex configuration:

```bash
npm run eval:codex-live -- \
  --model gpt-5.6-sol \
  --reasoning-effort high \
  --out .loopx/evals/gpt-5.6/live
```

Use `--case <id>` for one paired case. The runner resolves the baseline prompt
from its pinned git ref and the candidate prompt from `HEAD`, invokes Codex in
read-only mode, normalizes native parent/child rollouts, validates the final
message, applies case budgets, and writes the standard comparison report.
Use `--variant <name>` only for focused forward-validation when a paired resource
comparison is not required; it does not produce a baseline/candidate comparison.

Run a second replicate with `--order candidate-first` to control for prompt
cache and warm-start ordering. Do not use a single fixed-order pair as the sole
basis for a prompt change.

Aggregate both orders with median metrics and an all-replicates quality gate:

```bash
npm run eval:aggregate -- \
  --input .loopx/evals/gpt-5.6/run-a/run-summaries.json \
  --input .loopx/evals/gpt-5.6/run-b/run-summaries.json \
  --out .loopx/evals/gpt-5.6/aggregate
```

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
