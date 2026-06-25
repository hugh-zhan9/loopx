# Platform Subagent References

Use this reference before executing `subagent-exec`. The skill is platform
neutral; only the dispatch and availability checks are platform-specific.

## Selection

| Runtime | Reference |
|---|---|
| Codex | `./codex-subagents.md` |
| Claude Code | `./claude-subagents.md` |
| Cursor | `./cursor-subagents.md` |
| Other agent runtimes | Use the platform's native subagent/delegation documentation, then apply the generic requirements below. |

## Generic Requirements

`subagent-exec` requires a runtime that can:

- dispatch an implementer or reviewer with only the task brief, report path,
  review package, and required context
- keep the delegated worker's context separate from the controller context
- return a completion result to the controller
- allow the controller to continue managing progress, review loops, and final
  review
- avoid concurrent direct edits to overlapping files in the same worktree

If the current platform cannot satisfy these requirements, do not claim
`subagent-exec` ran. Use `loopx:exec` instead.
