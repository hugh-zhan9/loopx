# Four-Arm Benchmark Protocol — v3

- Status: **FROZEN 2026-07-25** at tag `benchmark-protocol-v3`. A scored run
  whose parameters differ from the frozen values is invalid and must be
  discarded, not reinterpreted.
- v3 amendment (before any scored run): the pilot consumed 18 runs instead of
  3 because requesting a ref arm always pulls the bare control and its
  baseline pair through the crossover infrastructure. Pilot runs stay
  non-scored (their outcomes were inspected for judging sanity, so scoring
  them afterwards would be selection bias). To stay inside the approved cap,
  the escalation docs-only cells drop from n=5 to n=3 and the feature
  negative control is cut; every other v2 parameter is unchanged. The
  candidate ref remains the v2 tag commit (`benchmark-protocol-v2`), whose
  installed surface is the one under test.
- Supersedes: `benchmark-protocol-v1` (v1 campaign was voided by a model
  gateway outage that destroyed 254 of 400 runs overnight; its 146 valid runs
  are reused below under the declared rule).
- Historical design anchor: D-07 in
  `docs/archive/docs/loopx/design/2026-07-24-lightweight-governance-and-eval/需求设计文档.md`.

## Changes from v1 (pre-registered)

1. **Unequal allocation by information value.** The v1 campaign's valid data
   showed a ceiling effect on feature tasks (every arm passes) and a very
   large escalation-trap effect. v2 reallocates runs toward the unmeasured
   capability categories instead of replaying saturated cells.
2. **Data reuse.** All non-blocked runs from the v1 campaign
   (`report-corrected.json`, produced by
   `scripts/reclassify-benchmark-gateway-deaths.mjs`, 146 scored runs) are
   reused verbatim: same frozen model, effort, refs, tasks, and judge. Blocked
   (gateway-death) runs never count toward n.
3. **Category-level reporting.** Effect sizes are reported per category via
   `scripts/aggregate-benchmark-reports.mjs`; feature tasks are demoted to a
   negative control (harness-fairness check) and excluded from headline
   capability claims.
4. **Token economy is a first-class secondary metric** (median tokens per arm,
   overall and per category), motivated by a preliminary +12% candidate-vs-
   baseline overhead signal.

## Pre-registered parameters

| Field | Value |
|---|---|
| Model (all arms, identical) | `gpt-5.6-sol` |
| Reasoning effort | `high` |
| Adapter / runtime | codex CLI (`scripts/run-benchmark-evals.mjs`) with gateway-death classification and one bounded retry |
| Arms | A `bare`, B `docs-only`, C `baseline` (`v0.6.0`), D `candidate` (`benchmark-protocol-v2` tag commit) |
| docs-only AGENTS.md | `evals/benchmark/docs-only/AGENTS.md`, unchanged from v1, sha256 recorded in reports |
| Order | crossover |
| Bootstrap | seeded, 10000 iterations, seed 1, 95% percentile CI |
| Budget cap | 180 new runs total (18 pilot as executed + 156 scored + 6 retry allowance); abort and mark void beyond that |

## Allocation (new runs)

| Cell group | Tasks | Arms | n | New runs |
|---|---|---|---|---:|
| Capability categories | 4 seeded-defect + 4 refactor + 4 parallel-trap (expansion set) | all 4 | 3 | 144 |
| Escalation traps (docs-only gap) | 4 escalation expansion tasks | docs-only only | 3 | 12 |
| Pilot (non-scored, executed) | 3 capability tasks | bare+baseline+candidate | 2 | 18 |

Reused from v1 (146 scored runs): escalation traps and two feature tasks at
n=5 on bare/baseline/candidate, plus all other valid pre-outage cells.
Candidate-arm reuse note: v1 candidate ran the `benchmark-protocol-v1`
commit; v2 candidate runs the `benchmark-protocol-v2` commit. The delta
between those commits is benchmark harness and protocol text only (no skill,
hook, or installed-surface changes), so the installed candidate surface is
identical; this equivalence claim is part of the pre-registration and must be
verified against the diff before freezing.

## Judging order (fixed, unchanged from v1)

1. Primary, machine-judged, fail-closed: hidden suites injected only after the
   agent finished; repository diff assertions; `benchmark_passed` = outcome
   passed AND hidden passed.
2. Secondary (recorded, never overrides primary): token medians per arm and
   category. The LLM-judge rubric remains deferred and is out of scope for v2
   headline claims.
3. Runs blocked by infrastructure failure are excluded from scoring and n;
   the adapter retries each blocked run once.

## Analysis and reporting rules

- Merge v1-corrected and v2 reports with
  `scripts/aggregate-benchmark-reports.mjs`; report per-arm and per-category
  pass rates, bootstrap deltas with 95% CI for the five pre-registered pairs,
  paired win rates, and token medians.
- Escalation-trap and capability categories are reported separately; feature
  tasks appear only as the negative control.
- Before reading any aggregate summary, file one follow-up issue for every
  candidate-arm loss or tie at the per-task level (capability categories and
  escalation traps).
- Results are maintainer diagnostics only; not a release gate, not marketing.

## Freeze procedure

1. Verify the v1→v2 candidate-surface equivalence claim against the git diff.
2. Commit, tag `benchmark-protocol-v2`.
3. Run the pilot (3 runs); proceed to scored runs only when pilot judging
   artifacts are sane. Pilot runs are never scored.
4. All scored runs reference the tag; any parameter change requires v3.
