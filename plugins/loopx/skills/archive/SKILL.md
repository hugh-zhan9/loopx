---
name: archive
description: Sync an approved loopx change delta into long-lived specs after review is done.
argument-hint: "<workflow slug>"
---

# loopx Archive

## Purpose

Use `archive` after a loopx workflow has reached `done`. It syncs the accepted change delta into long-lived `.loopx/specs/` files and archives the change staging directory.

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
- any blocker if the workflow is not done or the spec delta is incomplete

## Boundaries

- Do not run archive before `review -> done` has been approved.
- Do not edit implementation code.
- Do not treat `loopx status` as a user-facing skill. Use status only as a runtime diagnostic when needed.
