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
tool list is not enough evidence to fall back.

Capability check order:

1. Required capabilities are create worker and await or observe worker result.
   If direct tools provide both, use them.
2. If a tool-discovery mechanism such as `tool_search` is available, search for
   create, await, observe, inspect, message, interrupt, release, and close agent
   capabilities. Equivalent namespaces such as `multi_agent_v1.spawn_agent`
   and `multi_agent_v1.wait_agent` satisfy the required capabilities.
3. Optional capabilities are inspect worker state, message worker, interrupt
   worker, and release or close worker. Their absence does not make subagent
   execution unavailable; a runtime may release completed workers automatically.
4. Only after direct lookup and available discovery both fail to provide the
   required capabilities, treat subagent support as unavailable. Do not pretend
   this skill ran as subagent-exec; use `loopx:exec` instead.

Codex environments that require explicit feature flags should enable:

```toml
[features]
multi_agent = true
```

## Execution Rules

- The controller is the only orchestration owner. Implementers, reviewers,
  and fixers are leaf workers: tell them to complete their assigned role
  directly and not spawn, delegate to, or wait for other agents.
- Include this leaf-worker constraint in every dispatch, including fixer and
  final-review dispatches that do not use the implementer or task-reviewer
  templates.
- Create exactly one active worker for the current task stage. Do not create a
  reviewer before its implementer completes, or a fixer before review findings
  exist.
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

## Agent Lifecycle And Waiting

Record each spawned agent's ID, task anchor, role, and current state. Wait only
for recorded active agents whose result is required by the next controller
step.

- Prefer one meaningful wait window over repeated short waits.
- `No agents completed yet` means that the wait window expired. It is not a
  failure, does not imply that an agent is stuck, and does not justify an
  immediate replacement or status message.
- After an empty wait, inspect the known agent state when the runtime supports
  it. If the agent is still running, keep the same agent and wait again only
  when its result is still the next dependency.
- Do not form an unbounded `wait -> empty result -> message -> wait` loop.
  Perform available controller bookkeeping once, then use another meaningful
  wait window without narrating or messaging merely to show progress.
- Send a status or context message only when the agent asks a question, the
  controller has new information, or repeated empty waits plus state evidence
  indicate that progress may be stale. Do not repeatedly prompt an unchanged
  running agent.
- Do not spawn a replacement while the original agent is still running. A
  replacement requires explicit completion, failure, interruption, or a
  `BLOCKED` / `NEEDS_CONTEXT` result handled under the retry rules.
- Integrate a completed result once, close or release the agent when supported,
  and advance the task state before dispatching the next role.
