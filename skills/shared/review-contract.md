# Independent Review Contract

Verification, controller integration checks, and independent review are
different obligations. The owning execution profile determines the required
review scope.

## Review Selection

- Inline work requires independent review only for explicit review intent,
  security-sensitive or destructive behavior, public compatibility changes,
  cross-scope interaction, or conflict reconciliation.
- `delegated-serial-v1` and `parallel-strict-v1` require independent task review
  for every implementation and fix candidate, plus final Spec and Standards
  review after integration. The delegated handoff itself activates this quality
  policy.

## Reviewer Independence

Every reviewer is a read-only leaf worker under `agent-topology.md`. It receives
the accepted task or final scope, applicable requirements, exact candidate or
diff, changed paths, fresh verification evidence, and review focus. It must not
modify code, spawn another worker, or approve from an implementer summary alone.

Task review checks both spec compliance and task quality. Final review uses two
independent axes:

- Spec: source, plan, acceptance, scope, and integration compliance.
- Standards: repository rules, cross-slice quality, tests, maintainability,
  security, and integration risks.

Keep final findings side by side. Do not merge, average, or let one axis hide the
other.

## Finding Closure

- Critical: unsafe, destructive, security-sensitive, or fundamentally wrong.
- Important: the reviewed unit cannot be trusted until fixed.
- Minor: non-blocking improvement that does not invalidate correctness or the
  governing contract.

Critical and Important findings block task integration or final completion. The
controller validates the finding and assigns accepted changes to a separate
fixer. The new candidate requires fresh focused and combined verification and
independent re-review. Evidence-backed pushback must also be rechecked by an
independent reviewer. Minor findings may remain only as stated residual risk.

Review evidence may remain in owner-only execution state. Create a user-facing
review artifact only when the user requests one or an external process requires
it.
