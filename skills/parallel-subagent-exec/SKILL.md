---
name: parallel-subagent-exec
description: "Compatibility alias that forwards an explicit parallel-subagent-exec invocation to the canonical exec intent with the same input. Not for automatic routing, strict parallel metadata, user-selected concurrency, or preserving the former scheduler workflow."
when_to_use: "explicit legacy parallel-subagent-exec invocation, one-release execution compatibility, forward old parallel execution command to exec"
disable-model-invocation: true
metadata:
  version: "0.4.0"
argument-hint: "<same input accepted by exec>"
---

# parallel-subagent-exec Compatibility Alias

This is an explicit-only compatibility alias for `exec`.

Forward the same input to the canonical `exec` intent and follow
`../exec/SKILL.md`. Ignore former strict DAG metadata and executor-selection
flags; do not require the user to choose concurrency before work starts.

`exec` derives the current execution graph, explains the concrete selection,
and falls back to serial current-context execution when independence or runtime
capability is uncertain.
