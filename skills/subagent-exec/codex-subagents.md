# Codex Subagent Tool Mapping

Use this reference before executing this skill in Codex.

## Tool Mapping

| Skill action | Codex equivalent |
|---|---|
| Dispatch one implementer or reviewer subagent | `spawn_agent` |
| Dispatch independent subagents in parallel | multiple `spawn_agent` calls |
| Wait for a subagent result | `wait_agent` |
| Free a completed subagent slot | `close_agent` |
| Track task state | `update_plan` |
| Read, edit, or run commands | native Codex file and shell tools |

## Required Runtime Support

Subagent dispatch requires Codex multi-agent support.

Before declaring support unavailable, account for deferred-loaded tools. Some
Codex runtimes expose multi-agent tools only after tool discovery, so an initial
tool list that omits `spawn_agent`, `wait_agent`, or `close_agent` is not enough
evidence to fall back.

Capability check order:

1. If `spawn_agent`, `wait_agent`, and `close_agent` are directly available, use
   them.
2. If a tool-discovery mechanism such as `tool_search` is available, search for
   `spawn_agent wait_agent close_agent multi-agent subagent`.
3. If discovery exposes an equivalent namespace such as
   `multi_agent_v1.spawn_agent`, `multi_agent_v1.wait_agent`, and
   `multi_agent_v1.close_agent`, use those tools and continue subagent-exec.
4. Only after direct lookup and available discovery both fail, treat subagent
   support as unavailable. Do not pretend this skill ran as subagent-exec; use
   `loopx:exec` instead.

Codex environments that require explicit feature flags should enable:

```toml
[features]
multi_agent = true
```

## Execution Rules

- Spawn fresh implementer subagents with a task brief path, report file path,
  and only the context they need.
- Use `task-reviewer-prompt.md` for per-task review; it returns both spec and
  quality verdicts.
- Do not paste full task text or full diffs into controller messages when
  helper scripts can write them to files.
- Keep implementation tasks sequential unless write scopes are clearly disjoint.
- Use `wait_agent` only when the next controller step needs that result.
- Close completed agents after their result is integrated.
- Keep the controller responsible for pre-flight plan review, progress ledger
  updates, review loops, final-review, and finish.
