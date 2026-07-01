# Memory And Spec Candidates

## Candidate Review Requirement

Review every candidate produced by `finish-audit` before marking the run done.

Each candidate must end in one of these states:

- accepted
- rejected
- none

Do not leave generated candidates unreviewed.

## Memory Candidates

Memory candidates can be local or shared.

- Use local memory for machine-local or short-lived context.
- Use shared memory for concise, evidence-backed notes that should travel with the repo.

Accepted memory candidates need evidence from the audit state. Rejected memory candidates need a rejection reason. If there are no candidates, record a specific `no_candidates_reason`.

Keep memory output bounded and high signal. Do not write secrets or raw conversation logs.

## Spec Delta Candidates

Review `Spec Delta Candidates` from implementation evidence, final-review evidence, and audit state.

Use these labels:

- `ADDED`
- `MODIFIED`
- `REMOVED`
- `RENAMED`

Each spec delta candidate needs evidence plus a disposition:

- accepted into a repo-tracked spec candidate
- rejected with a reason
- deferred with the missing evidence

Do not infer durable rules from intuition alone.

## No Automatic Repo-Tracked Spec Writes

Do not automatically write repo-tracked specs unless the spec candidate was explicitly accepted.

If accepted, write the repo-tracked candidate to the appropriate `docs/loopx/specs/<domain>.md` target or `docs/loopx/specs/inbox.md` when the domain is unclear. If not accepted, report the candidate and its disposition without changing repo-tracked specs.
