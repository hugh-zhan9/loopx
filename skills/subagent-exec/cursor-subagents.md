# Cursor Subagent Compatibility

Use this reference before executing this skill in Cursor.

## Runtime Support

Cursor Cloud Agents are asynchronous remote agents. They are useful for
well-scoped work that can run in an isolated cloud environment, but they are not
automatically equivalent to an in-session subagent API that can be waited on,
closed, and reviewed task-by-task by the controller.

## Required Capability Check

Before using Cursor for `subagent-exec`, confirm the current Cursor runtime can
satisfy the generic requirements in `platform-subagents.md`:

1. The controller can dispatch a worker with the task brief, report path,
   review package path, and bounded context.
2. The worker can produce a result the controller can inspect before continuing.
3. The controller can run the task reviewer step after each implementation
   result.
4. The worker's branch or worktree is isolated from other active workers.
5. The controller can integrate or reject the worker's output without losing
   the progress ledger and review package workflow.

If Cursor only provides an asynchronous Cloud Agent branch or PR workflow for
the current session, prefer one of these paths:

- use `loopx:exec` for local task-by-task execution, or
- treat Cursor Cloud Agent output as an external implementation artifact, then
  run `loopx:review` or `loopx:final-review` against the resulting branch or
  diff.

Do not claim `subagent-exec` ran unless the controller can enforce the same
per-task handoff, review, and progress rules as the native subagent flow.
