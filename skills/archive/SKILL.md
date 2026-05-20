---
name: archive
description: "Archives an approved loopx change delta into long-lived specs and writes an ADR candidate after done approval. Not for active builds or unapproved reviews."
when_to_use: "archive, done workflow, spec delta, long-lived specs, ADR candidate, review approved, 归档, 同步规格"
metadata:
  version: "0.1.4"
argument-hint: "<workflow slug>"
---

# loopx Archive

## Purpose

Use `archive` after a loopx workflow has reached `done`. It syncs the accepted change delta into long-lived `.loopx/specs/` files, archives the change staging directory, and writes an advisory ADR candidate.

The accepted delta is requirement-based, not a changelog block. Archive applies:

- `## ADDED Requirements`
- `## MODIFIED Requirements`
- `## REMOVED Requirements`
- `## RENAMED Requirements`

into the current long-lived `## Requirements` state for each target domain.

## Inputs

- `<workflow slug>` for a completed loopx workflow

## Behavior

Run:

```bash
loopx archive <slug>
```

Then report in Chinese:

- whether the change was archived
- which long-lived spec files were updated
- the archived change path
- the ADR candidate path, if written
- any blocker if the workflow is not done, the spec delta is incomplete, or the execution record still declares partial scope

## Boundaries

- Do not run archive before `review -> done` has been approved.
- Do not archive malformed requirement deltas. ADDED and MODIFIED entries must use `### Requirement:`, SHALL/MUST language, and at least one `#### Scenario:`.
- Do not archive when `execution-record.md` declares non-empty `remaining_scope`, `completion_claim` other than `full`, or a mismatch between `planned_scope` and `implemented_scope`; route back to build/plan instead.
- Do not edit implementation code.
- Do not promote ADR candidates into `docs/adr/` automatically; report the candidate path for human follow-up.
- Do not treat `loopx status` as a user-facing skill. Use status only as a runtime diagnostic when needed.
