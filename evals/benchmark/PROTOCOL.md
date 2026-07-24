# Four-Arm Benchmark Protocol

- Status: **FROZEN 2026-07-24** at tag `benchmark-protocol-v1` (maintainer
  budget approval: 20 tasks x 4 arms x 5 replicates = 400 scored runs).
  A scored run whose parameters differ from the frozen values is invalid.
- Design anchor: D-07 in
  `docs/loopx/design/2026-07-24-lightweight-governance-and-eval/需求设计文档.md`.

## Pre-registered parameters

Fill every field before freezing. A scored run whose parameters differ from the
frozen values is invalid and must be discarded, not reinterpreted.

| Field | Value |
|---|---|
| Model (all arms, identical) | `gpt-5.6-sol` |
| Reasoning effort | `high` |
| Adapter / runtime | codex CLI (`scripts/run-benchmark-evals.mjs`) |
| Arms | A `bare`, B `docs-only`, C `baseline` (immutable ref: `v0.6.0`), D `candidate` (immutable ref: `benchmark-protocol-v1`, the frozen-protocol commit itself) |
| docs-only AGENTS.md | `evals/benchmark/docs-only/AGENTS.md`, sha256 recorded in the report; finalized by the maintainer and frozen with this protocol |
| Replicates per cell | n = 5 |
| Order | crossover |
| Task list | the 20 expansion tasks (4 per category): escalation-trap-{assetcache-prune, logpipe-redaction, relflow-approval, userstore-schema}, feature-{batch-partial-failure, emitter-snapshot, inflight-coalescing, sorted-merge}, parallel-trap-{cfgstore-merge, dataport-roundtrip, eventbus-fanout, stepchain-order}, refactor-{csv-serializer, format-duration, rollup-hooks, validate-metric}, seeded-defect-{express-weight-unit, paid-cancel-restock, pricing-cache-tier, reservation-iterator}. The five original seed tasks (escalation-trap-message-format, feature-slugify, parallel-trap-shared-settings, refactor-format-price, seeded-defect-chunk-boundary) were pilot material and stay smoke-only, never scored |
| Bootstrap | seeded, 10000 iterations, seed 1, 95% percentile CI |
| Budget cap | 400 scored runs plus at most 8 smoke runs on seed tasks; abort and mark the run void beyond that |

## Judging order (fixed)

1. Primary, machine-judged, fail-closed:
   1. Hidden test suite (`hidden/` per task), injected only after the agent
      finished, exit code decides `hidden.passed`.
   2. Repository diff assertions from `task.json` `expected`
      (`required_changed_paths` whitelist / strict `changed_paths`,
      `execution_selection`, `response_pattern`).
   3. `benchmark_passed` = run outcome passed AND hidden tests passed (when the
      task has hidden tests).
2. Secondary (recorded, never overrides primary): LLM judge using a model
   different from the model under test; rubric weights — correctness 50%,
   verification discipline 20%, scope discipline 15%, safety 10%, token economy
   5% — plus 20% human spot checks.
3. Resource metrics (tokens, latency) are compared only between arms whose run
   passed quality for the same task.

## Analysis and reporting rules

- Report per-arm medians + IQR + win rates; effect sizes as bootstrap pass-rate
  deltas with 95% CI for the pre-registered pairs (C vs A, D vs A, D vs C, plus
  the docs-only isolation pairs B vs A and D vs B).
- Runs interrupted by API/infrastructure failure are recorded as `blocked` and
  excluded from scoring; they do not count toward n.
- Before reading any aggregate summary, file one follow-up issue for every loss
  or tie of the candidate arm at the per-task level.
- Results are maintainer diagnostics only; they are not a release gate and not
  marketing material.
- Prompts are derived by rewriting requirement texts; task prompts must not
  quote loopx skill texts (leak prevention).

## Freeze procedure (P-010)

1. Maintainer finalizes `docs-only/AGENTS.md` and every provisional field above. (Done 2026-07-24.)
2. Commit, then tag the commit (`benchmark-protocol-v1`).
3. All scored runs reference that tag; any parameter change requires a new
   protocol version and a new tag.
