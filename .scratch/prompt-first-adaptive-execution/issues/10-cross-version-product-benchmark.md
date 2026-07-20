# 10 - Compare loopx versions with paired product benchmarks

**What to build:** Extend the opt-in installed-product evaluation so maintainers can compare two immutable loopx Git refs under the same task, fixture, model, effort, tools, permissions, timeout, and host constraints. Produce paired quality, token, and latency evidence without turning noisy live measurements into an automatic release gate.

**Blocked by:** 09 - Evaluate the installed product baseline.

**Status:** complete

- [x] The runner accepts explicit baseline and candidate Git refs, resolves each to an immutable commit, creates separate package archives, and records commit, package, manifest, fixture, model, effort, and adapter provenance in the report.
- [x] Each sample installs exactly one version into a fresh temporary host home and fresh fixture copy; versions share no installed guidance, skill payload, session cache, or repository mutation while receiving the exact same task and execution constraints.
- [x] A crossover schedule alternates version order across configurable replicates and retains every paired sample so medians, p50/p95 distributions, and paired deltas are traceable to raw evidence.
- [x] Completion is measured from external verification, expected repository state, path safety, spec consistency, memory precision, and cleanup evidence rather than agent self-report or prose grading.
- [x] Reports compare success rate and quality-gate pass rate before input, cached-input, output, total-token, and wall-clock deltas; missing or incomparable measurements remain unavailable instead of becoming zero or favorable.
- [x] Resource improvement is reported only for quality-preserving samples, and the report keeps quality, tokens, latency, execution selection, and concurrency evidence separate instead of collapsing them into one opaque weighted score.
- [x] Deterministic tests cover ref resolution, isolated packaging and installation, configuration parity, crossover ordering, replicate aggregation, failed quality gates, missing metrics, and stable machine-readable and Markdown report output.
- [x] Live version comparison remains an explicit paid maintainer diagnostic outside `npm test`; generated traces and reports stay ignored, and no result automatically changes routing defaults, graduates policy, or blocks a release.
