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

Subagent dispatch requires Codex multi-agent support. If `spawn_agent`,
`wait_agent`, or `close_agent` are unavailable, do not pretend this skill ran
as subagent-driven development. Use `loopx:exec` instead.

Codex environments that require explicit feature flags should enable:

```toml
[features]
multi_agent = true
```

## Execution Rules

- Spawn fresh subagents with complete task text and only the context they need.
- Use implementer, spec reviewer, and code quality reviewer prompts from this directory.
- Do not make subagents read the whole plan file; paste the relevant task text.
- Keep implementation tasks sequential unless write scopes are clearly disjoint.
- Use `wait_agent` only when the next controller step needs that result.
- Close completed agents after their result is integrated.
- Keep the controller responsible for integration, review loops, and final status.
