# Platform Subagent Contract

Select the current runtime adapter before initialization.

| Runtime | Adapter |
|---|---|
| Codex / Codex Agent CLI | `codex-subagents.md` |
| Claude Code | `claude-subagents.md` |
| Cursor | `cursor-subagents.md` |

Required capabilities are: create a named worker with an explicit model, bind
it to a controlled worktree, and observe or wait for its terminal result. An
explicit create-time cwd satisfies the binding. Cursor App may instead satisfy
it with the native workspace probe and before/after isolation checks defined in
`cursor-subagents.md`. Missing required capability exits `5` with zero task
dispatch and no executor handoff.

| Runtime | Required implementation |
|---|---|
| Codex native | native create/wait only when the current API exposes model and owned cwd |
| Codex Agent CLI | bundled runner with explicit `--model`, `--cd`, process cwd, workspace sandbox, fingerprinted config, isolated rules, and JSONL lifecycle |
| Claude Code | native Agent lifecycle only when create exposes model and owned cwd |
| Cursor App | native Task with explicit model, observable result, and verified workspace binding |
| Cursor Agent CLI | optional bundled supervisor with explicit `--workspace` and process cwd |

In Codex, discover both native tools and the bundled Codex Agent CLI adapter.
When native create lacks model or cwd, do not stop until `codex inspect` has
checked an installed authenticated CLI. The CLI adapter double-binds process
cwd and `--cd`, selects the model explicitly, disables nested multi-agent,
retains JSONL/thread plus report digest evidence, and uses the workspace
sandbox. Its immutable operation binds role, capability path/hash, expected
executable/version, skill/config fingerprints, prompt hash, and protected
worktrees. Review roles are read-only. Never use
`--dangerously-bypass-approvals-and-sandbox`.

In Cursor App, prefer an already installed and authenticated Cursor Agent CLI
for strict isolation. If none is available, use native Task with explicit
`relaxed-worktree` isolation and do not require or recommend CLI installation.
A native probe worker is capability evidence, not a task reservation or task
dispatch; record it separately and clean its temporary owned worktree before
state initialization.

For Cursor Agent CLI, run `cursor inspect` from `scripts/parallel-exec.mjs`
before state initialization. It verifies Cursor binary identity, authentication,
`--model`, `--workspace`, sandbox mode, headless write mode, and structured
terminal output. Do not use Cursor's `--worktree`; the controller already owns
the worktree.

All roles share one global worker budget. Runtime capacity below the configured
budget applies backpressure. Every prompt includes:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

Capture agent id, requested and observed model evidence, role, node, attempt,
controlled worktree, adapter identity, start/end time, terminal status, and
report path/hash/size in controller state or retained worker evidence. CLI
workers also capture process/supervisor identity, immutable operation and
capability identity, and protected worktree snapshots. Workers operate only in
their assigned owned worktree and return a short status after writing or
returning the report.
