# Version Compare Evaluation Spec

This specification defines how to quantify loopx release improvements with
controlled A/B evaluation.

It answers one question:

> Holding task, fixture, model, effort, tools, timeout, and order constant, does
> loopx version B improve completion quality and resource cost over version A?

This is a maintainer diagnostic, not part of `npm test` and not an automatic
release gate. Missing metrics are unavailable evidence, never zeros.

## Purpose

Subjective claims such as "0.6.0 feels better than 0.5.1" are not enough for a
minor release narrative. Version compare evaluation produces comparable runs and
a release-facing table of:

- completion / correctness
- verification and safety
- token cost
- wall-clock latency
- concurrency behavior where relevant

## Non-Goals

- Replacing unit or skill contract tests
- Scoring prompt wording changes inside a single version
- Establishing SLA or production latency guarantees from one pair of runs
- Treating cheaper failed runs as improvements
- Publishing raw provider traces as release evidence

## Relationship To Existing Harnesses

| Harness | Compares | Role |
|---------|----------|------|
| `evals/darwin-simple` | `bare` vs current `installed` | product baseline: "is installed loopx better than no loopx?" |
| `evals/gpt-5.6` | baseline prompt vs candidate prompt | skill/prompt regression inside one package tree |
| **version-compare** | installed loopx `@A` vs installed loopx `@B` | release quantification |

Version-compare reuses the darwin-simple case kinds, fixtures, quality-first
gates, and report metrics. It changes only the install axis:

- A installs a pinned published package (for example `@ai-content-space/loopx@0.5.1`)
- B installs a candidate package (local `npm pack` of `HEAD`, or a published prerelease)

`bare` may be retained as an optional third reference arm. It is not the primary
release comparison.

## Fixed Experiment Matrix

Every paired comparison must pin the matrix below. Changing any row creates a
new experiment, not a continuation of the previous one.

| Dimension | Rule |
|-----------|------|
| Task set | Default: `evals/darwin-simple/cases.json` cases with install-relevant variants |
| Fixture | Fresh copy of the case fixture for every run |
| Model | Exact model id, identical for A and B |
| Reasoning effort | Exact effort string, identical for A and B |
| Tools / permissions | Identical agent tool set and sandbox policy |
| Timeout | Identical per-run timeout |
| Worker limit | Identical, default `4` |
| Verification command | Identical, default `npm test` |
| Host environment | Fresh temporary host home per run; no shared `CODEX_HOME` / Claude home reuse |
| Network / credentials | Same auth path that works with a fresh host home |
| Order | `crossover` by default |
| Replicates | Minimum `2`; preferred `3`–`5` before release claims |
| Package A | Exact semver or git ref of published baseline |
| Package B | Exact local pack fingerprint or published candidate version |

Record the matrix in `report.json` so a later reader can reproduce the claim.

## Variants

### Required arms

| Variant id | Install source | Purpose |
|------------|----------------|---------|
| `version-a` | pinned published package A | release baseline |
| `version-b` | candidate package B | release candidate |

### Optional arms

| Variant id | Install source | Purpose |
|------------|----------------|---------|
| `bare` | no loopx install | absolute reference: "worth installing at all?" |
| `version-b-forced-serial` | candidate B with concurrency disabled | independent-work latency comparator for B only |

Do not compare A-forced-serial to B-adaptive as a primary claim. Forced-serial is
a within-version latency sanity check for independent work.

## Case Coverage

Use the darwin-simple case set as the default matrix. Each case keeps its kind
and expected quality contract.

| Case id | Kind | What it measures for version compare |
|---------|------|--------------------------------------|
| `direct-small-fix` | direct | small change overhead vs A |
| `independent-modules` | independent | adaptive concurrency benefit and safety |
| `strongly-coupled-change` | strongly-coupled | remains serial; no false parallelization |
| `governed-compatibility-escalation` | governed-escalation | still blocks unspecified compatibility decisions |
| `spec-consistency` | spec-consistency | keeps behavior specs aligned with code |
| `memory-precision` | memory-precision | quiet on non-qualifying work |
| `memory-qualifying-write` | memory-qualifying | writes reusable pitfall once |
| `memory-deduplication` | memory-deduplication | does not duplicate known memory |

Future version-compare-only cases may be added, but the default release matrix
must stay small enough to run live with paid models.

## Quality Gates (Hard Pass / Fail)

Evaluate quality before resources. A run is quality-failed if any of the
following fail:

1. **Outcome** does not match the case success contract
2. **Verification** does not pass (`npm test` or case-specified command)
3. **Path safety** mutates files outside expected paths / fixture policy
4. **Spec consistency** fails the case's expected spec outcome
5. **Memory precision** fails the case's expected memory outcome
6. **Execution selection** violates case constraints
   - independent work under B may parallelize, but must stay within worker limit
   - strongly-coupled work must remain serial (`max_peak_workers = 1`)
   - governed escalation must block rather than silently implement

Only quality-passed runs may contribute favorable token or latency claims.

Interpretation rule:

- cheaper / faster quality-failed run ⇒ regression or inconclusive, never win
- missing token or latency fields ⇒ metric unavailable, not zero
- quality-passed A and quality-passed B ⇒ resource comparison is valid

## Metrics

### Primary quality metrics

| Metric | Definition |
|--------|------------|
| `pass_rate` | quality-passed runs / total runs for that variant and case |
| `first_pass_rate` | fraction of replicates that pass on first attempt with no operator intervention |
| `blocking_failure_classes` | outcome / verification / safety / spec / memory / selection |

### Primary resource metrics

Report medians across quality-passed runs only. Also retain raw values for all
runs in `report.json`.

| Metric | Definition |
|--------|------------|
| `tokens.input` | provider input tokens |
| `tokens.output` | provider output tokens |
| `tokens.total` | input + output when both available |
| `latency_ms` | wall clock from agent start to terminal result |
| `tokens_delta_pct` | `(B_median - A_median) / A_median` |
| `latency_delta_pct` | `(B_median - A_median) / A_median` |

With fewer than 5 quality-passed samples per arm, do not emphasize p90 as a
stable claim. Median is the default summary statistic.

### Concurrency metrics (independent cases)

| Metric | Definition |
|--------|------------|
| `worker_peak` | max concurrent workers observed |
| `worker_overlap` | whether workers overlapped in time |
| `worker_order` | integration / completion order if asserted |
| `within_worker_limit` | peak ≤ configured worker limit |

Independent-work claim for B requires:

1. quality pass
2. real overlap when adaptive concurrency is expected
3. peak ≤ worker limit
4. optional: B median latency better than B forced-serial median

### Cost metrics (optional)

If provider pricing is configured for the pinned model:

| Metric | Definition |
|--------|------------|
| `estimated_cost_usd` | `input * input_price + output * output_price` |
| `cost_delta_pct` | median B vs median A |

Cost is secondary to correctness and should use the same pricing table for A and
B in one experiment.

## Run Protocol

### Setup

1. Pin package A (published version) and package B (local pack or candidate).
2. Pin model id and effort.
3. Confirm auth works with a fresh host home for the chosen agent runtime.
4. Choose cases: all default cases, or a focused subset with `--case`.
5. Choose replicates and order (`crossover` recommended).

### Per run

1. Create a temporary host home and a fresh fixture clone.
2. Install only the variant's package source into that host home.
3. Do not inject resolver text, experimental instructions, or candidate-only
   prompts beyond what the installed package itself provides.
4. Execute the exact task with the shared configuration.
5. Capture outcome, verification, changed paths, workflow artifacts, worker
   activity, tokens, latency, spec/memory outcomes, install provenance, and
   cleanup evidence.
6. Delete temporary workspace and host home; record cleanup success/failure.

### Ordering

For `crossover` with N replicates:

- odd replicates: A then B (and optional forced-serial last if present)
- even replicates: B then A

This reduces prompt-cache / warm-start bias. Do not publish a single fixed-order
pair as the sole release claim.

### Aggregation

For each case and variant:

1. Count quality pass/fail
2. Compute median tokens and latency over quality-passed runs
3. Compute deltas for B vs A only when both arms have ≥1 quality-passed run
4. Mark resource comparison `unavailable` when either arm lacks quality-passed
   samples or metric fields

## Verdict Rules

Per case:

| Result | Condition |
|--------|-----------|
| `B_wins_quality` | B pass rate > A pass rate, or B passes where A fails on the hard gates |
| `A_wins_quality` | inverse of above |
| `quality_tie` | equal pass rate on hard gates |
| `B_wins_resource` | quality_tie or B quality not worse, and B median tokens or latency improves without the other regressing beyond tolerance |
| `mixed` | quality improved but resources regressed, or one resource improved and the other regressed |
| `inconclusive` | too few samples, missing metrics, or infra/auth failures |

Default resource tolerance for "close enough":

- direct work: each of median tokens and median latency within ±10% of A
- independent work: latency improvement is meaningful only with real worker overlap
- strongly-coupled / governed: quality and selection correctness dominate; resource deltas are informational

Suite-level release summary:

1. List cases where B quality is worse than A → release risk
2. List cases where B quality improves → primary narrative
3. List resource deltas only for quality-non-regressed cases
4. Explicitly state sample size and model pin

## Report Artifacts

Write under an ignored path, for example:

```text
.loopx/evals/version-compare/<A>-vs-<B>/<timestamp>/
  matrix.json
  report.json
  report.md
  raw/
```

### `matrix.json`

Pinned experiment identity: package A/B sources and versions, model, effort,
replicates, order, case ids, commit SHA of the candidate tree, runner version.

### `report.json`

Machine-readable runs plus comparison objects. Must preserve:

- every run's quality fields and resource fields
- install provenance for A and B
- unavailable vs zero distinction for tokens/latency

### `report.md`

Human summary for maintainers and release notes drafting:

1. Experiment matrix
2. Suite verdict summary
3. Per-case table
4. Failures and inconclusive runs
5. Interpretation notes

Required per-case table columns:

| Case | A pass | B pass | tokens A→B | latency A→B | concurrency | verdict |
|------|--------|--------|------------|-------------|-------------|---------|

Example row shape:

```md
| independent-modules | 2/2 | 2/2 | 4100 → 4600 (+12%) | 180s → 110s (−39%) | overlap peak 2 | mixed: slower tokens, faster wall clock with safe overlap |
```

## Release Note Integration

For a release such as `0.6.0`:

1. Run version-compare of previous published version vs candidate.
2. Draft `docs/release-notes/0.6.0.md` changes from code history.
3. Attach a short "Measured against X.Y.Z" section with:
   - model + effort + sample size
   - quality non-regression statement
   - 2–5 headline metrics (not the full raw dump)
4. Link to the local report path or attach the markdown table. Do not commit raw
   provider traces.

If live evaluation could not run, release notes must say so. Do not invent
numbers.

## Minimum Claims Policy

Allowed:

- "On model M with effort E, over N crossover replicates, 0.6.0 matched 0.5.1
  quality on all default cases and reduced independent-work median latency by
  35% with worker overlap."

Not allowed:

- "Much faster" without matrix pins and sample size
- Token/latency wins from quality-failed runs
- Claims from one fixed-order pair only
- Treating bare→installed gains as version-to-version gains

## Implementation Notes (Out Of Scope For This Spec's Runtime)

This document is the protocol. Implementation may:

- extend `src/installed-product-eval.mjs` with install sources for version A/B
- add `scripts/run-version-compare-evals.mjs`
- add `evals/version-compare/` manifest that reuses darwin-simple fixtures/cases
- keep live auth and paid model usage opt-in

Until that lands, maintainers may execute the protocol manually by installing A
and B into isolated host homes and filling the same report tables.

## Acceptance Criteria For The Spec Itself

This specification is complete when a maintainer can:

1. name package A and package B
2. pin model/effort/order/replicates
3. run or manually reproduce the matrix
4. decide per-case quality before resources
5. produce a release-facing table without inventing missing metrics
6. distinguish bare/installed product baseline from version-to-version claims
