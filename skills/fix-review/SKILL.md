---
name: fix-review
description: "Explicit-only compatibility alias that forwards existing review feedback to the canonical review workflow for active-context closure. Not for automatic routing, unrelated implementation, or legacy feedback ledgers."
when_to_use: "explicit legacy fix-review invocation with existing review feedback that needs evaluation, focused fixes, verification, and re-review"
disable-model-invocation: true
metadata:
  version: "0.4.0"
argument-hint: "<same feedback or input accepted by review>"
---

# Fix Review Compatibility Alias

This is an explicit-only compatibility alias for the canonical `review` intent.
It does not participate in automatic routing.

## Forwarding Contract

Forward the same arguments and source input to `review`, preserving the user's
explicit existing review feedback intent. The active context checks each
finding's basis, makes focused fixes or evidence-backed pushback, runs fresh
verification, and obtains independent re-review for blocking findings.

This alias does not require a feedback ledger or report artifact. Do not create
or look up legacy `.loopx/fix-review/` state merely because this old name was
invoked.

Report the canonical `review` result directly.
