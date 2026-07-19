# Claude Code Adapter

Require the native Agent capability plus a way to observe foreground or
background Agent completion. Select the worker explicitly and set its model,
owned cwd, task brief, and report path. Background Agents are allowed only for
already-reserved independent stages within the global budget.

Every Agent prompt includes:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

The controller records Agent identity and result, runs review after
implementation, and alone mutates state or Git. If Agent creation or completion
observation is unavailable, exit `5` with zero dispatch and no fallback.

For each foreground or background Agent, reuse the same Agent handle or id until
terminal completion. Use Claude Code's native completion notification or exact
Agent wait operation; do not create shell polling loops. Do not read, tail, or
poll Agent output files, transcript files, or `~/.claude` subagent artifacts for
progress. Those files may be inspected only after terminal failure or when the
user explicitly requests diagnostics. Report progress from controller state
only when its revision changes, an Agent becomes terminal, or a five-minute
heartbeat is due.
