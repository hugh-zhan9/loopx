---
name: plan-to-exec
description: "Compatibility alias that forwards an explicit plan-to-exec invocation to the canonical plan intent with the same arguments. Not for automatic routing, direct implementation, or preserving the former detailed-plan workflow."
when_to_use: "explicit legacy plan-to-exec invocation, one-release planning compatibility, forward old planning command to plan"
disable-model-invocation: true
metadata:
  version: "0.4.0"
argument-hint: "<same arguments accepted by plan>"
---

# plan-to-exec Compatibility Alias

This is an explicit-only compatibility alias for `plan`.

Forward the same arguments to the canonical `plan` intent and follow
`../plan/SKILL.md`. Do not execute the former detailed planning workflow, add
task microsteps, select an executor, or create parallel metadata.

The canonical result is one optional lean plan. Preserve the user's input
without reinterpretation and report the canonical handoff as `plan`.
