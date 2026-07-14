# Cursor Adapter

Use this executor only when the current Cursor runtime exposes native isolated
worker creation and an observable terminal result inside the controller
session. An asynchronous external branch or PR alone does not satisfy the
contract. Each worker needs explicit model, owned cwd, brief, and report path.

Every worker prompt includes:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

The controller keeps the global budget, review ordering, state, refs, and Git
integration. If create plus observe-or-wait cannot be proven, exit `5`, persist
zero dispatch, and do not hand off to another executor.
