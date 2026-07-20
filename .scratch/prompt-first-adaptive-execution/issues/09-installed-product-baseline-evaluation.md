# 09 — Evaluate the installed product baseline

**What to build:** Provide an opt-in evaluation that compares bare-prompt behavior with the actually installed redesigned loopx across direct work, adaptive concurrency, safe serial selection, governed escalation, spec consistency, and memory precision.

**Blocked by:** 08 — Contract the legacy workflow surface.

**Status:** complete

- [x] Every variant starts from a fresh fixture with the same model, effort, tools, task, timeout, and repository state.
- [x] The candidate is installed into a temporary host home and receives no candidate-only resolver or prompt injection.
- [x] Deterministic fake-agent cases prove isolation, actual worker overlap, bounded peak workers, integration order, artifact cleanup, and quality-first scoring.
- [x] Reports include outcome, verification, changed paths, workflow artifacts, worker activity, tokens, latency, spec outcomes, and memory outcomes.
- [x] Direct cases remain close to the bare-prompt token and latency baseline when live metrics are available.
- [x] Independent-work cases demonstrate real overlap and improve over forced serial medians; strongly coupled cases select serial execution.
- [x] No resource improvement is reported as favorable when quality, safety, spec consistency, or knowledge precision fails.
- [x] Live evaluation remains an optional maintainer diagnostic and is excluded from the normal deterministic test command.
