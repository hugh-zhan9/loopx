---
name: final-review
description: "Explicit-only compatibility alias that forwards whole-feature review intent to the canonical review workflow. Not for automatic routing, finish gating, or legacy final-review report generation."
when_to_use: "explicit legacy final-review invocation that should preserve whole-feature review intent during compatibility migration"
disable-model-invocation: true
metadata:
  version: "0.4.0"
argument-hint: "<same input accepted by review>"
---

# Final Review Compatibility Alias

This is an explicit-only compatibility alias for the canonical `review` intent.
It does not participate in automatic routing.

## Forwarding Contract

Forward the same arguments and source input to `review`, preserving the user's
explicit whole-feature review intent. The canonical reviewer uses the complete
feature scope and the proportional independent-review contract.

This alias does not require a final-review report artifact, readiness ledger,
coverage matrix, or finish-gate record. Do not create or look up legacy
`.loopx/final-review/` artifacts merely because this old name was invoked.

Report the canonical `review` result directly.
