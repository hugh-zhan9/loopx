# Review Ownership Contract

Each review layer has one unit of work and one persisted result.

| Layer | Unit | Primary responsibility | Persisted result |
|---|---|---|---|
| Task review | one `T-*` task | task contract, local quality, task evidence | task report and progress ledger |
| Checkpoint review | changed worktree or range | shared-interface, regression, and integration risk | review findings and checkpoint |
| Plan-level final-review | one child plan | child-plan integration readiness | multi-plan child state |
| Spec-level final-review | complete feature/package | source coverage, runtime evidence, test trust | canonical final-review report |

## Severity

- Critical: unsafe, destructive, security-sensitive, or fundamentally wrong;
  implementation must stop.
- Important: the reviewed unit cannot be trusted until fixed.
- Minor: non-blocking improvement that does not invalidate correctness or the
  governing contract.

Critical and Important findings block progression. Fixes require focused
verification and re-review. Reviewers are leaf workers under
`agent-topology.md`.

