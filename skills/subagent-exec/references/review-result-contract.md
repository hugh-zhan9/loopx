# Review Result Contract

The canonical task-review result is a versioned JSON snapshot inside one
`loopx-review-result` fenced block. It is the gate source of truth; surrounding
Markdown is explanatory and cannot override it.

## Version 1

`loopx.review-result.v1` accepts exactly these top-level fields:

- `schema`
- `status`
- `task_quality`
- `task_anchor`
- `cannot_verify`
- `findings`

Each finding accepts exactly `id`, `severity`, `anchor_ids`, and `summary`.
Unknown fields and unknown schema versions are invalid rather than guessed or
silently normalized.

The valid state combinations are:

| Status | Task quality | Required evidence |
|---|---|---|
| `SPEC_COMPLIANT` | `Approved` | no findings and no cannot-verify items |
| `ISSUES_FOUND` | `Needs fixes` | at least one finding |
| `NEEDS_CONTEXT` | `Needs fixes` | at least one cannot-verify item |

Finding IDs are sequential within one snapshot: `F-001`, `F-002`, and so on.
They are transfer identities for the leaf/controller exchange, not durable IDs
across re-review snapshots. A re-review creates a new sequential snapshot;
`fix-review` evidence owns cross-pass closure.

## Native Capture And Persistence

On Codex, read the leaf final directly from the native rollout. Bind it to the
root thread, reviewer thread, model, review attempt, and exact task inputs:

```bash
scripts/review-result \
  --task T-001 \
  --reviewer-thread <reviewer-thread-id> \
  --model gpt-5.6-sol \
  --attempt 1 \
  --brief <brief-path> \
  --review-package <review-package-path> \
  --implementer-report <report-path> \
  --codex-rollout <root-rollout.jsonl> \
  --root-thread <root-thread-id>
```

The script verifies that the root thread owns the named reviewer invocation and
extracts the matching leaf final message. The controller does not copy it.
Other platform adapters use `--input <native-leaf-message> --platform <name>`
with the same identity and evidence arguments.

The default output is:

```text
.loopx/subagent-exec/reviews/T-001/review-artifact.json
```

The artifact envelope uses `loopx.review-artifact.v1`; its `review_result` field
contains the unchanged `loopx.review-result.v1`. Provenance records task anchor,
platform, root and reviewer thread IDs, model, generated time, attempt number,
raw-message hash, native-rollout hash when present, and hashes for the task
brief, review package, and implementer report.

Before consuming the gate, run `scripts/review-artifact-verify` with the same
task anchor, reviewer thread, model, attempt, and current evidence paths. It
rejects stale or mismatched artifacts after any bound input changes.

The script writes atomically. Missing invocations, missing leaf messages,
missing blocks, multiple blocks, invalid JSON,
unknown versions, extra fields, invalid state combinations, duplicate values,
non-sequential finding IDs, or task-anchor mismatch fail validation. Treat any
such failure as `NEEDS_CONTEXT`; never infer approval from Markdown.

## Evolution

Changing required fields, allowed fields, state combinations, or finding
semantics requires a new schema identifier. Readers support only explicitly
implemented versions. Do not add compatibility guessing or fallback parsing.
