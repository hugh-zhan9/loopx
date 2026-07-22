# Execution Review Gates

Verification, controller integration checks, and independent review are
different obligations.

## Inline Profile

Inline work always receives fresh verification and a controller integration
check. Independent review is added for explicit review intent, security or
destructive behavior, public compatibility change, cross-scope interaction, or
conflict reconciliation.

## Delegated Profiles

`delegated-serial-v1` and `parallel-strict-v1` require independent review because
the implementation candidate crosses an agent handoff. For every implementation
or fix attempt:

1. bind the task contract, candidate, changed paths, and fresh verification;
2. dispatch a separate read-only leaf reviewer;
3. require both task spec compliance and task quality approval;
4. send Critical or Important findings to a separate fixer;
5. freshly verify and independently re-review the amended candidate;
6. integrate only after the current candidate is clean.

The reviewer does not modify code. The controller must not reconstruct an
approval from prose or treat implementer claims as review evidence.

## Final Review

After all planned slices are integrated and combined verification passes,
dispatch two independent read-only leaf reviewers, concurrently when capacity
allows:

- **Spec:** complete source, plan, acceptance, and scope compliance.
- **Standards:** cross-slice code quality, repository rules, tests, maintainability,
  security, and integration risks.

Report the axes side by side. Do not merge, average, or rerank their findings.
Either axis blocks completion while a Critical or Important finding remains.
Fixes require fresh verification and re-review of the affected axis.

The controller gives each final reviewer the accepted review context, complete
task contracts, changed paths, baseline and boundary commits, fresh combined
verification, and a candidate binding. A `loopx.final-review-result.v1` verdict
must echo that candidate binding and identify the reviewer with `id`, `model`,
and `platform`. Spec and Standards reviewers, task workers, and any final fixer
must have distinct identities.

The accepted review context must contain the actual source material and the
authoritative plan. The controller may derive acceptance and scope summaries
from task contracts, but anchor names, task ids, or schema metadata are not a
substitute for the source and plan. Missing provenance blocks before delegated
mutation and remains required on resume.

## Integration Check

The controller separately confirms accepted scope, actual changed paths,
evidence freshness, graph ordering, combined behavior, and unexplained
interactions. This check does not replace an independent task or final review.
