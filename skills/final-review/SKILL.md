---
name: final-review
description: "Permanent explicit entry that runs a whole-feature review through the canonical review workflow after all planned tasks complete. Not for automatic routing, finish gating, mid-feature task review, or legacy final-review report generation."
when_to_use: "explicit final-review invocation, whole-feature review after all tasks complete, integrated-result review, 整体终审"
disable-model-invocation: true
metadata:
  version: "0.5.0"
argument-hint: "<same input accepted by review>"
---

# Final Review Intent Entry

A permanent explicit review intent entry: invoke it after all planned tasks of
a feature are complete to review the integrated result as one scope. It does
not participate in automatic routing, and exec-owned runs do not need it: their
final gate already dispatches Spec and Standards reviewers.

## Forwarding Contract

Forward the same arguments and source input to `review`, preserving the
explicit whole-feature review intent. The canonical reviewer uses the complete
feature scope and the proportional independent-review contract.

This entry does not require a final-review report artifact, readiness ledger,
coverage matrix, or finish-gate record. Do not create or look up legacy
`.loopx/final-review/` artifacts.

Report the canonical `review` result directly.
