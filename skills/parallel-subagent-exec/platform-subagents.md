# Platform Subagent Contract

Select the current runtime adapter before initialization.

| Runtime | Adapter |
|---|---|
| Codex | `codex-subagents.md` |
| Claude Code | `claude-subagents.md` |
| Cursor | `cursor-subagents.md` |

Required capabilities are: create a named worker with explicit model and cwd,
and observe or wait for its terminal result. Optional capabilities are inspect,
message, interrupt, and release. Missing required capability exits `5` with
zero dispatch and no executor handoff.

All roles share one global worker budget. Runtime capacity below the configured
budget applies backpressure. Every prompt includes:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

Capture agent id, model, role, node, attempt, start/end time, terminal status,
and report path in controller state. Workers operate only in their assigned
owned worktree and return a short status after writing the report.
