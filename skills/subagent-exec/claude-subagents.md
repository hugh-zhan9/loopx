# Claude Code Subagent Mapping

Use this reference before executing this skill in Claude Code.

## Runtime Support

Claude Code supports built-in and custom subagents. Subagents run in separate
contexts and can be invoked explicitly by natural language, `@agent-...`
mention, or the platform's Agent tool when available.

Claude Code renamed the older Task tool to Agent. Existing `Task(...)`
references may still work as aliases, but new loopx guidance should use Agent
language.

## Required Capability Check

Before falling back to `loopx:exec`:

1. Confirm subagents are available in the current Claude Code session, for
   example through `/agents`, visible `@agent-...` mentions, or an available
   Agent tool.
2. Confirm the session has at least one worker-capable subagent for
   implementation and one reviewer-capable subagent for read-only review. The
   built-in general-purpose agent is acceptable for implementation when no
   more specific worker exists.
3. Confirm the selected subagent has required tools for the role:
   - implementer: read, edit/write, shell/test tools as needed
   - reviewer: read-only tools plus shell/test tools only when focused
     verification is necessary
4. If background subagents are used, keep the controller responsible for
   integrating results, resolving permission prompts, and closing the review
   loop before starting dependent work.
5. If subagents are disabled or unavailable in this session, use `loopx:exec`
   instead.

## Execution Rules

- Use foreground subagents for dependent task execution when the controller
  needs the result before continuing.
- Use background subagents only for independent work whose file scopes do not
  overlap, or for read-only exploration/review.
- Pass the task brief path and report path instead of pasting the whole plan.
- For review, use `task-reviewer-prompt.md` and keep the reviewer read-only.
- If a delegated subagent edits files directly, make sure only one agent owns
  that write scope.
- Do not rely on automatic delegation when exact worker or reviewer selection
  matters; explicitly name or mention the intended subagent.
