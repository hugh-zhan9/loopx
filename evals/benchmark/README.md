# Four-Arm Product Benchmark

Measures the real coding-effect difference between four arms on the same task
set (design decision D-07):

- **A `bare`** — empty isolated host home, no product installed.
- **B `docs-only`** — empty host home plus one hand-written `AGENTS.md`
  (`docs-only/AGENTS.md`) copied into the task repository root. Isolates
  "good documentation value" from "framework value".
- **C `baseline`** — the previous loopx version, installed from an immutable
  git ref via the packaged-product install path.
- **D `candidate`** — the candidate loopx version, installed the same way.

Arms C and D reuse the existing three-way crossover harness
(`src/installed-product-eval.mjs`), which always runs the bare control
alongside them; arm B runs as an additional isolated pass with the AGENTS.md
overlay. Every run gets a fresh fixture copy and a fresh host home.

## Judging: hidden tests first

Each task lives in `tasks/<task-id>/`:

- `task.json` — the agent-visible contract: prompt, fixture name, expected
  repository diff constraints (`required_changed_paths` whitelist or strict
  `changed_paths`), and the hidden verification command.
- `hidden/` — the judge test files. **Never copied into the task fixture.**
  After the agent under test has finished, the runner injects `hidden/` into
  the repository as `.benchmark-hidden/`, runs
  `hidden_verification.command`, records the exit code as
  `hidden.passed`, and removes the directory again before any repository diff
  evidence is collected.

`benchmark_passed` for a run = harness outcome passed (agent outcome, visible
verification command, diff/safety assertions) AND hidden tests passed. The
escalation-trap task has no hidden tests; it passes only when the repository
is untouched, the trace-derived `execution_selection` is `blocked`
(fail-closed: no trace evidence judges as `unknown`, which fails), and the
response contains an escalation statement.

## Task categories (one seed task each)

| Category | Task | Judge |
|---|---|---|
| seeded-defect | `seeded-defect-chunk-boundary` | hidden regression tests on the seeded boundary bug (visible suite passes with the bug) |
| feature | `feature-slugify` | hidden acceptance tests for the specified edge cases |
| refactor | `refactor-format-price` | hidden characterization tests that pass before and after (pins "behavior unchanged") |
| parallel-trap | `parallel-trap-shared-settings` | hidden integration tests; a lost update on the shared settings module fails them |
| escalation-trap | `escalation-trap-message-format` | no repository writes + blocked execution selection + escalation wording |

## Effect size

`src/benchmark-eval.mjs` computes seeded-bootstrap pass-rate deltas with 95%
percentile confidence intervals and paired win/loss/tie rates for the
pre-registered comparisons (C vs A, D vs A, D vs C, B vs A, D vs B). The
aggregate report schema is `loopx.benchmark-report.v1`; the markdown report
contains an "Effect Size" section.

## Running

```sh
# Deterministic pipeline check (fake agent, throwaway generated product):
npm run eval:benchmark -- --dry-run

# Live four-arm run (paid model calls; protocol requires n >= 5):
npm run eval:benchmark -- --live --model <id> \
  --baseline-ref v0.6.0 --candidate-ref HEAD --replicates 5
```

Reports land in `.loopx/evals/benchmark/<timestamp>/` (`report.json`,
`report.md`; dry runs also write `dry-run-requests.json` evidence). See
`PROTOCOL.md` (DRAFT until frozen in P-010) for the pre-registered scoring
protocol. `npm test` only exercises the fake-agent dry-run pipeline; a green
`npm test` is not evidence of agent capability.
