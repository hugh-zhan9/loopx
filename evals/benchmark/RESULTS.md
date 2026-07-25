# Benchmark Results — protocol v3 (2026-07-25)

- Protocol: `benchmark-protocol-v3` (frozen); model `gpt-5.6-sol` @ high; arms
  bare / docs-only / baseline `v0.6.0` / candidate (`benchmark-protocol-v2`
  commit). 276 scored runs (146 reused from the v1 campaign's valid cells,
  filtered to escalation/feature; capability cells entirely from v2 lanes).
- Follow-ups were filed per task **before** this aggregate was read:
  `followups/2026-07-25-*.md` (eventbus-fanout loss, csv-serializer loss,
  logpipe sub-ceiling).
- Full tables: `.loopx/evals/benchmark/final-v3/report.md` (not committed;
  regenerate with `eval:benchmark:aggregate` over the campaign reports).

## Pre-registered pairs (pass-rate delta, 95% bootstrap CI)

| Pair | Delta | CI | Paired win rate |
|---|---:|---|---:|
| baseline vs bare | +15.8pp | [6.6, 25.0] | 17.1% |
| candidate vs bare | +13.2pp | [3.9, 23.7] | 17.1% |
| candidate vs baseline | -2.6pp | [-9.2, 3.9] | 2.6% |
| docs-only vs bare | +18.4pp | [10.5, 27.6] | 18.8% |
| candidate vs docs-only | -5.3pp | [-10.5, -1.3] | 0.0% |

## Findings

1. **Escalation discipline is the demonstrated value, and it is large.**
   Bare stops on unresolved material decisions 6/20 (30%); both loopx
   versions stop 19/20 (95%): +65pp [40, 85]. This is the guardrail claim,
   confirmed with real runs.
2. **A well-written AGENTS.md achieves the same escalation discipline,
   cheaper.** docs-only stops 12/12 with a 41k median token cost versus
   ~110k for the loopx arms (escalation category). candidate vs docs-only is
   -5.3pp [-10.5, -1.3] overall with a 0% paired win rate. On this task set
   and model, the framework does not demonstrate value beyond the document
   for stop-discipline.
3. **Capability categories are at ceiling for this model.** Seeded defects,
   refactors, and parallel tasks: bare, docs-only, and baseline pass
   essentially everything. There is no measurable capability uplift from
   loopx for gpt-5.6-sol on tasks of this size.
4. **The candidate regressed where it acts the most.** parallel-trap:
   candidate 10/12 vs 12/12 everywhere else (-16.7pp [-41.7, 0], eventbus
   1/3); refactor: 11/12 (-8.3pp [-25, 0], csv-serializer 2/3). CIs touch
   zero but the sign is consistent and the failures are real (hidden suites
   caught a lost update and a behavior change). Root-cause work is filed.
5. **Token economy runs against the candidate.** Overall medians: bare 130k,
   baseline 152k, candidate 163k, and on parallel tasks candidate 745k vs
   baseline 410k (+82%). The v0.7 text slimming did not reduce runtime cost;
   per-turn injection and heavier orchestration outweigh it.
6. **candidate vs baseline: -2.6pp [-9.2, 3.9]** — v0.7's quality is
   statistically indistinguishable from v0.6, with the point estimate
   slightly negative, at higher cost.

## Caveats (binding on any use of these numbers)

- One model (gpt-5.6-sol), 20 tasks of bounded size, n=3 capability cells;
  weaker models may show capability uplift the ceiling hides here.
- docs-only escalation cells are n=12 and were run in a separate lane.
- Diagnostics only, per protocol: not a release gate, not marketing.

## Consequences filed

- `followups/2026-07-25-eventbus-fanout-candidate-loss.md` — investigate the
  v0.7 parallel path.
- `followups/2026-07-25-csv-serializer-candidate-loss.md` — classify the
  characterization failure.
- `followups/2026-07-25-logpipe-redaction-candidate-subceiling.md` — drills
  candidate scenario.
- Injection overhead (per-turn triage block) and parallel-strict admission
  are the two engineering priorities suggested by 4 and 5.
