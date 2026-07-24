---
name: fix-review
description: "Permanent explicit entry that actively resolves existing review findings through the canonical review workflow: verify each finding, fix or push back with evidence, freshly verify, and independently re-review. Not for automatic routing, unrelated implementation, or legacy feedback ledgers."
when_to_use: "explicit fix-review invocation, resolve review findings, existing review feedback, fix findings from review or final-review, 修复评审问题"
disable-model-invocation: true
metadata:
  version: "0.5.0"
argument-hint: "<findings or feedback accepted by review>"
---

# Fix Review Intent Entry

A permanent explicit review intent entry for actively resolving existing
findings — from `review`, `final-review`, or external feedback. It does not
participate in automatic routing.

## Forwarding Contract

Forward the findings and source input to `review` in existing-feedback
resolution mode: verify each finding's basis against authoritative sources and
current code, make focused fixes or evidence-backed pushback, run fresh
verification, and obtain independent re-review for blocking findings.

## Fixer Semantics

An explicit `fix-review` invocation may dispatch one independent leaf fixer
carrying the complete accepted finding list — a single fix wave, never one
fixer per finding — mirroring the exec-internal closure loop. Small
direct-context fixes may stay inline. Reviewer and fixer identities stay
separate either way, and the amended result still requires fresh verification
and independent re-review.

This entry does not require a feedback ledger or report artifact. Do not
create or look up legacy `.loopx/fix-review/` state.

Report the canonical `review` result directly.
