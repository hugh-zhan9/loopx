# Installed Product Baseline Evaluation

This opt-in maintainer diagnostic compares a bare prompt with the actually
installed loopx candidate. It is not part of `npm test`, an implementation
completion gate, or an automated release decision.

## Variants

- `bare` starts with an empty temporary host home.
- `installed` installs the current package into a separate temporary host home.
- `forced-serial` uses the installed surface with native collaboration disabled
  only as the independent-work latency comparator.

Every run receives a freshly initialized copy of the same fixture, exact task,
model, reasoning effort, tool permissions, and timeout. The candidate gets only
installed routing guidance and discoverable skills. The runner does not append
a resolver, experimental instructions, or a candidate-only prompt.

## Cases

`cases.json` covers direct work, independent adaptive concurrency, strongly
coupled serial selection, governed compatibility escalation, spec consistency,
and memory precision across quiet, qualifying-write, and deduplication cases.
Reports retain outcome, verification, changed paths,
workflow artifacts, worker intervals/overlap/peak/order, tokens, latency, spec
outcomes, memory outcomes, installation provenance, and cleanup evidence.

## Run

Live runs require Codex authentication that works with a fresh `CODEX_HOME`,
such as provider credentials supplied through the process environment.

```bash
npm run eval:darwin-simple -- \
  --live \
  --model <exact-model-id> \
  --effort high \
  --replicates 2 \
  --order crossover
```

Use `--case <id>` for a focused diagnostic. Output defaults to the ignored
`.loopx/evals/darwin-simple/` tree and includes `report.json`, `report.md`, and
raw provider traces. Do not commit runtime output.

Two replicates alternate baseline-first and candidate-first order. More samples
are needed before interpreting tail latency; live variability is evidence for
maintainer judgment, not a stable SLA.

## Interpretation

Spec and memory outcomes are derived from the fixture's before/after files, not
from adapter claims. Quality is evaluated before resources. Outcome, fresh verification, path safety,
spec consistency, and memory precision must all pass before any token or latency
result can be favorable. Missing metrics are unavailable evidence, not zero.

Direct work is close to baseline when median tokens and latency are each within
10 percent. Independent work must show real worker overlap, stay within the
worker limit, and beat the installed forced-serial median. Strongly coupled work
must remain serial. A cheaper or faster run with an incorrect outcome, unsafe
mutation, stale spec, or noisy memory is a failed candidate.
