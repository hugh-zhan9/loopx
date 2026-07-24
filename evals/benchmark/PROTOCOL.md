# Four-Arm Benchmark Protocol

- Status: **DRAFT** — this protocol is frozen (git tag) in P-010 before any scored
  run; until then every field below is provisional and no run may be cited.
- Design anchor: D-07 in
  `docs/loopx/design/2026-07-24-lightweight-governance-and-eval/需求设计文档.md`.

## Pre-registered parameters

Fill every field before freezing. A scored run whose parameters differ from the
frozen values is invalid and must be discarded, not reinterpreted.

| Field | Value |
|---|---|
| Model (all arms, identical) | _TBD before freeze_ |
| Reasoning effort | _TBD before freeze_ |
| Adapter / runtime | codex CLI (`scripts/run-benchmark-evals.mjs`) |
| Arms | A `bare`, B `docs-only`, C `baseline` (immutable ref: _TBD_), D `candidate` (immutable ref: _TBD_) |
| docs-only AGENTS.md | `evals/benchmark/docs-only/AGENTS.md`, sha256 recorded in the report; finalized by the maintainer and frozen with this protocol |
| Replicates per cell | n >= 5 |
| Order | crossover |
| Task list | every directory under `evals/benchmark/tasks/` at the frozen tag |
| Bootstrap | seeded, 10000 iterations, seed 1, 95% percentile CI |
| Budget cap | _TBD before freeze_ (max total live-model spend; abort and mark the run void when exceeded) |

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

1. Maintainer finalizes `docs-only/AGENTS.md` and every `_TBD_` above.
2. Commit, then tag the commit (`benchmark-protocol-v1`).
3. All scored runs reference that tag; any parameter change requires a new
   protocol version and a new tag.
