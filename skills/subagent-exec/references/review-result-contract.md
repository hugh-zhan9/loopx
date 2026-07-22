# Task Review Result Contract

`skills/exec/scripts/review-gate.mjs` is the authoritative parser, validator,
artifact writer, stale-input verifier, gate evaluator, and bounded replacement
decision seam.

## Result Schema

The reviewer emits exactly one `loopx-review-result` fenced JSON value with
schema `loopx.task-review-result.v1`. The required top-level fields are:

- `schema`
- `task_id`
- `spec_compliance`
- `code_quality`
- `cannot_verify`
- `findings`

Each finding contains exactly `id`, `axis`, `severity`, `anchor_ids`, and
`summary`. Unknown fields, unknown schemas, duplicate/non-sequential finding
IDs, invalid axis combinations, multiple result blocks, and malformed JSON are
invalid. Invalid output never implies approval.

## Canonical Artifact

`createTaskReviewArtifact` produces `loopx.task-review-artifact.v1`. Its
provenance binds:

- task ID;
- reviewer ID, model, and platform;
- review attempt;
- generation time and raw-message SHA-256;
- task brief SHA-256;
- implementer report SHA-256;
- diff-package SHA-256; and
- verification SHA-256.

`captureTaskReviewArtifact` writes the artifact atomically to:

```text
.loopx/exec/<run-id>/tasks/<task-id>/reviews/attempt-<n>/review-artifact.json
```

`verifyTaskReviewArtifact` recomputes every input hash and rejects stale or
mismatched task, reviewer, attempt, or evidence. Callers treat every thrown
`review_*` error as fail-closed review infrastructure failure.

## Gate Semantics

`evaluateTaskReviewGate` returns:

- `needs_context` when either axis cannot be established;
- `needs_fix` when any Critical or Important finding exists; or
- `reviewed` for a clean result or Minor-only findings.

When supplied a prior blocking review, it accepts a post-fix result only when
the review attempt increments by one, the verification hash is new, and a new
reviewer identity performed the re-review.

`decideReviewerReplacement` permits one replacement only for transport failure
or invalid artifacts, after the original reviewer is terminal and only while
all four candidate input hashes remain byte-identical. The replacement and
post-fix re-review are different mechanisms: replacement retries a failed gate
on the same candidate; re-review evaluates a changed candidate after a fix.

Any incompatible contract change requires a new schema identifier. Readers do
not guess compatibility.
