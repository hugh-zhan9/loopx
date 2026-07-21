# Installed Product Baseline Evaluation

This opt-in maintainer diagnostic compares a bare prompt with the actually
installed loopx candidate. It is not part of `npm test`, an implementation
completion gate, or an automated release decision.

It can also run a three-arm product benchmark using two immutable loopx Git
refs. Arm A installs no loopx, arm B installs the baseline ref, and arm C
installs the candidate ref. Each ref is resolved to a commit, packed from a
detached worktree, unpacked without running package lifecycle scripts, and
installed into a fresh host home by the installer inside that package.

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

Live runs copy `config.toml` and `auth.json` from `CODEY_HOME` or `~/.codey`
into each fresh `CODEX_HOME`. Source configuration and credentials are never
modified, and session history or caches are not copied.

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

To compare no loopx, a baseline release, and the current candidate, provide
both refs:

```bash
npm run eval:darwin-simple -- \
  --live \
  --baseline-ref v0.5.1 \
  --candidate-ref main \
  --model <exact-model-id> \
  --effort high \
  --replicates 10 \
  --order crossover
```

The refs are required as a pair. Every replicate includes all three arms and
crossover order reverses on alternating replicates. Cross-version output uses
`.loopx/evals/version-compare/<B>-vs-<C>/` and adds `matrix.json`. The report
contains complete A-to-B, A-to-C, and B-to-C comparisons, resolved commits,
package identity and hashes, evaluation manifest and fixture identity, shared
model and adapter configuration, every raw run, p50/p95 distributions, and
per-replicate deltas. Generated archives, homes, traces, and reports remain
temporary or ignored.

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

Cross-version reports keep success, quality, execution selection, concurrency,
input tokens, cached input tokens, output tokens, total tokens, and latency as
separate evidence. They do not produce a weighted product score. A resource
delta can be inspected for a failed pair, but it is never reported as a favorable
improvement unless every applicable quality gate passes.
