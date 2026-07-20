# 09 — Evaluate the installed product baseline

**What to build:** Provide an opt-in evaluation that compares bare-prompt behavior with the actually installed redesigned loopx across direct work, adaptive concurrency, safe serial selection, governed escalation, spec consistency, and memory precision.

**Blocked by:** 08 — Contract the legacy workflow surface.

**Status:** ready-for-agent

- [ ] Every variant starts from a fresh fixture with the same model, effort, tools, task, timeout, and repository state.
- [ ] The candidate is installed into a temporary host home and receives no candidate-only resolver or prompt injection.
- [ ] Deterministic fake-agent cases prove isolation, actual worker overlap, bounded peak workers, integration order, artifact cleanup, and quality-first scoring.
- [ ] Reports include outcome, verification, changed paths, workflow artifacts, worker activity, tokens, latency, spec outcomes, and memory outcomes.
- [ ] Direct cases remain close to the bare-prompt token and latency baseline when live metrics are available.
- [ ] Independent-work cases demonstrate real overlap and improve over forced serial medians; strongly coupled cases select serial execution.
- [ ] No resource improvement is reported as favorable when quality, safety, spec consistency, or knowledge precision fails.
- [ ] Live evaluation remains an optional maintainer diagnostic and is excluded from the normal deterministic test command.
