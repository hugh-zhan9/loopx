# Independent Review Contract

Independent review is one proportional check over the narrowest complete scope
that contains its trigger. It is separate from worker verification and the
controller's universal integration check.

Review is required only for an explicit user request, security-sensitive or
destructive behavior, public compatibility change, cross-task interaction, or
a reconciled conflict. Multi-agent execution alone is not a trigger. Low-risk
disjoint results with passing combined verification do not require per-task
reviewers or a generic final reviewer.

The reviewer receives the accepted intent, applicable requirements, exact
changed scope, relevant diff or current state, fresh worker and combined
verification, and the concrete trigger. The reviewer must be independent of
the implementation being evaluated and remains a leaf worker under
`agent-topology.md`.

Review findings are returned to the active execution context. Do not create a
mandatory review report, feedback ledger, checkpoint, or final-review artifact.
Persist a review artifact only when the user explicitly requests one or an
external process requires it.

## Severity

- Critical: unsafe, destructive, security-sensitive, or fundamentally wrong;
  implementation must stop.
- Important: the reviewed unit cannot be trusted until fixed.
- Minor: non-blocking improvement that does not invalidate correctness or the
  governing contract.

Critical and Important findings block completion. The active controller checks
their basis, makes the focused fix or evidence-backed pushback, runs fresh
focused verification and relevant combined verification, and obtains
independent re-review before closure. Minor findings may remain only as stated
residual risk that does not invalidate correctness or the accepted contract.
