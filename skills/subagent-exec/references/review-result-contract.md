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

## Persistence

Save the complete reviewer final response unchanged, then validate and persist
the canonical result:

```bash
workspace=$(scripts/subagent-workspace)
scripts/review-result \
  --task T-001 \
  --input "$workspace/reviews/T-001/reviewer-message.md"
```

The default output is:

```text
.loopx/subagent-exec/reviews/T-001/review-result.json
```

The script writes atomically. Missing blocks, multiple blocks, invalid JSON,
unknown versions, extra fields, invalid state combinations, duplicate values,
non-sequential finding IDs, or task-anchor mismatch fail validation. Treat any
such failure as `NEEDS_CONTEXT`; never infer approval from Markdown.

## Evolution

Changing required fields, allowed fields, state combinations, or finding
semantics requires a new schema identifier. Readers support only explicitly
implemented versions. Do not add compatibility guessing or fallback parsing.
