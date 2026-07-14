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
