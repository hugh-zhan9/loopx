# Execution Review Gates

Review selection, reviewer independence, the two final review axes, and
finding closure follow the canonical contract in
[../../shared/review-contract.md](../../shared/review-contract.md). This file
adds only the exec-controller obligations layered on top of it.

## Controller Obligations

Inline work always receives fresh verification and a controller integration
check; independent review is added only for the shared contract's inline
triggers.

For every delegated implementation or fix attempt, the controller binds the
task contract, exact candidate, changed paths, and fresh verification evidence
before dispatching the reviewer. The controller must not reconstruct an
approval from prose or treat implementer claims as review evidence.

## Final Review Dispatch

Dispatch the two final reviewers concurrently when capacity allows. The
controller gives each final reviewer the accepted review context, complete
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
