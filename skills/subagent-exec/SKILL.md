---
name: subagent-exec
description: "Compatibility alias that forwards an explicit subagent-exec invocation to the canonical exec intent with the same input. Not for automatic routing, selecting a worker strategy, or preserving the former subagent-first workflow."
when_to_use: "explicit legacy subagent-exec invocation, one-release execution compatibility, forward old subagent execution command to exec"
disable-model-invocation: true
metadata:
  version: "0.4.0"
argument-hint: "<same input accepted by exec>"
---

# subagent-exec Compatibility Alias

This is an explicit-only compatibility alias for `exec`.

Forward the same input to the canonical `exec` intent and follow
`../exec/SKILL.md`. Do not preserve subagent-first dispatch, mandatory task
review, checkpoint state, or a user-selected execution strategy.

`exec` decides from the current request, repository, dependencies, and runtime
capability whether work stays serial or admits bounded concurrency.
