# Proportional Review Selection

Verification and review are different checks. Every worker verifies its own
outcome, and every completed change receives an integration check. Independent
review is added only when observable evidence or explicit user intent requires
reviewer independence.

## Integration Check

The active controller checks all of the following before completion:

- the accepted outcome and protected boundaries still match the implemented
  result;
- actual changed paths remain inside the intended scope;
- worker verification is fresh, relevant, and attached to the result it
  claims to prove;
- combined behavior has fresh verification after integration or, for serial
  work, after the complete coherent change;
- no unexplained interaction, conflict resolution, or evidence gap remains.

An integration check is controller work, not an independent review. It does
not dispatch another agent and does not create a review artifact.

## Independent Review Signals

Use the narrowest scope that covers the signal and the combined result.

| Observable evidence | Independent review decision |
|---|---|
| Explicit user review request | Required |
| Security-sensitive or destructive behavior | Required |
| Public compatibility change | Required |
| Cross-task interaction discovered before or during integration | Required |
| Reconciled integration conflict | Required |
| Low-risk, disjoint changes with passing combined verification and none of the signals above | Not required |
| Multi-agent execution with no other signal | Not a trigger |

Multi-agent execution alone is not an independent-review trigger. Do not
dispatch one reviewer per task merely because workers ran concurrently. Do not
add a generic final reviewer after a clean integration check. When one signal
spans multiple results, dispatch one independent reviewer over the relevant
combined scope rather than duplicating reviews.

If evidence is uncertain about security, destructive impact, compatibility,
interaction, or conflict reconciliation, resolve the uncertainty before
completion. Do not silently classify uncertain observable risk as low risk.

## Finding Closure

Critical and Important findings return to the active execution context. For
each finding, verify its basis against the accepted intent and current code,
then either implement the smallest correct fix or record evidence-backed
pushback. Run fresh focused verification and the relevant combined
verification after changes, then obtain independent re-review. Completion is
blocked until every Critical and Important finding has closure evidence.

Minor findings may be reported as residual risk when they do not invalidate
correctness or the accepted contract.
