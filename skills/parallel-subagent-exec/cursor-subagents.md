# Cursor Adapter

When this skill runs in Cursor App, inspect both Cursor adapters before state
initialization. Prefer an already installed and authenticated Cursor Agent CLI
because it supplies strict per-worker workspace isolation. If no authenticated
CLI is available, use Cursor App's native Task tool with explicit
`relaxed-worktree` isolation; do not require or recommend CLI installation.
These are two adapters for the same executor, not executor fallbacks.

## Cursor App Capability Gate

The native branch requires all of the following:

- Task can create a foreground or background subagent with an explicit
  non-auto model and returns a stable agent id;
- the controller can observe the terminal Task result or wait for that exact
  agent id;
- the canonical primary repository is the current Cursor workspace;
- `.worktrees/parallel-subagent-exec/` resolves to a non-symlink descendant of
  that workspace and is writable by the current Cursor sandbox.

Cursor App Task does not expose a create-time `cwd` parameter. Do not reject it
for that reason. Before state initialization, prove the controlled workspace
binding with one foreground Task probe:

1. Create a temporary controller-owned Git worktree at
   `.worktrees/parallel-subagent-exec/capability-gate-<nonce>/probe`, plus a
   unique ignored evidence directory under
   `.loopx/parallel-subagent-exec/_capability-gate/`. Record the invoking
   checkout plus every existing owned worktree's branch, HEAD, index, and status.
2. Invoke Task with an explicit model, a nonce, the canonical workspace, and
   one allowed regular-file marker path inside the temporary owned worktree.
   Require the worker to use absolute paths, write only the marker, return the
   nonce, resolved probe Git root, requested model evidence, and agent id, then
   stop.
3. Accept only a regular non-symlink marker with the exact nonce and canonical
   probe root, a terminal successful Task result, a stable agent id, and
   byte-stable snapshots everywhere else. Remove the temporary worktree and its
   owned ref through the normal worktree cleanup helper, then retain
   `cursor-capabilities.json` with `adapter: "cursor-app-task"` and
   `isolation_mode: "relaxed-worktree"` and `verified_workspace: true`.

Bind the capability record to the current skill version/source hash, canonical
workspace, adapter, requested model, and generation time. Never reuse a record
from another adapter, workspace, source hash, or earlier skill version. In
particular, replace a stale CLI-only record that reports `cursor-agent-cli` or
`create-with-explicit-cwd`; it is not evidence about the Cursor App branch.
Persist the record path, record SHA-256, skill source SHA-256, adapter,
isolation mode, and workspace root in run config before state initialization.

The probe increments `probe_count`, not reservation or task `dispatch_count`.
On failure, keep both task counts at zero and name the exact missing capability:
`task-create`, `create-with-explicit-model`, `observe-or-wait`,
`workspace-contained-worktrees`, or `create-with-controlled-workspace`.

## Cursor App Dispatch

Before each native Task call, write an owner-controlled immutable operation
record containing the raw worker id, nonce, requested model, canonical assigned
worktree, allowed write scope, report path, and pre-dispatch snapshots. Hash the
record and persist that digest with the Task agent id. Use `runtime:
cursor-app` and `isolation_mode: relaxed-worktree`; do not invent CLI process,
supervisor, token, or heartbeat fields. This mode uses separate Git worktrees
but no OS-enforced per-Task cwd. The user has accepted that residual isolation
risk when no authenticated Cursor Agent CLI is available.

Each Task prompt contains exactly:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

It also names the assigned worktree and requires absolute paths for every file
tool, `git -C <assigned-worktree>` for Git reads, no commits/staging/checkouts,
no access to controller state or sibling worktrees, and a final result carrying
the nonce, resolved Git root, changed paths, command evidence, and report body.
The controller writes the report body to the retained report path; a native
worker never writes the central report or state.

Dispatch independent reservations as background Task calls in one controller
message. Persist every returned agent id immediately, then observe or wait for
those exact ids. Cursor's `~/.cursor/subagents/` files are platform lifecycle
evidence, not controller state and not a substitute for the terminal result.
Use read-only Task workers for reviews and plan/final review.

For Cursor App native Tasks, keep the same agent id or agent handle until its
terminal result arrives. Do not read, tail, or poll `~/.cursor/subagents/`, Task
transcripts, or Task output files for progress. Use only the platform's native
wait/terminal notification and the controller's retained state summary.

Treat all concurrently reserved native Tasks as one active batch. Exclude active
batch worktrees from per-worker sibling immutability checks because legitimate
peers may be writing them. Require the invoking checkout, controller artifacts,
and inactive worktrees to remain byte-identical. Do not review or integrate any
batch member until every member is terminal; then validate each worktree's
branch, HEAD, index, declared write scope, nonce, agent id, model evidence, Git
root, operation digest, and terminal result. Any out-of-scope or non-batch
mutation blocks the complete batch and quarantines its worktrees. Resume only
the same Task agent ids, batch identity, and immutable operation digests.

## Cursor Agent CLI Capability Gate

Require the official `cursor-agent` or `agent` CLI for the CLI branch. Prefer
an explicit `LOOPX_CURSOR_AGENT_BIN`; discovery verifies candidates with
`about --format json` and never invokes the Cursor IDE `cursor agent` wrapper,
which may install or update software. Authenticate with `agent login` or the
official `CURSOR_API_KEY` environment variable. Never put credentials in argv,
operation JSON, state, or reports.

Before state initialization run:

```text
node <skill-dir>/scripts/parallel-exec.mjs cursor inspect \
  --output <capability-gate-dir>/cursor-capabilities.json
```

Use `--agent <absolute-path>` when discovery is ambiguous. The command exits
`5` when binary identity, authentication, explicit model, explicit cwd,
workspace sandboxing, headless create, or observe/wait is unavailable. Keep
reservations and dispatch count at zero on that exit.

## Cursor Agent CLI Worker Exchange

Keep the operation, prompt, source inputs, controller state, and retained
reports outside the assigned worktree. Derive a filesystem-safe id before
creating worker control or report paths while retaining the raw scheduler id
in `worker_id`:

```text
node <skill-dir>/scripts/parallel-exec.mjs cursor artifact-id \
  --worker-id <reservation-id>
```

Use the returned 64-hex `artifact_id` for `<worker-dir>` and retained filenames
on every OS. Create one owner-only operation beside its retained evidence:

```json
{
  "schema": "loopx.cursor-worker-operation.v1",
  "worker_id": "<raw-reservation-id>",
  "agent_path": "<cursor-capabilities.agent_path>",
  "workspace": "<canonical-owned-worktree>",
  "model": "<explicit-non-auto-model>",
  "prompt_path": "<controller-owned-prompt>",
  "timeout_ms": 3600000,
  "inputs": [
    {
      "name": "brief",
      "source_path": "<controller-brief>",
      "target_path": "inbox/brief.md"
    }
  ],
  "outputs": [
    {
      "name": "report",
      "source_path": "outbox/report.md",
      "retained_path": "<run-root>/reports/<artifact-id>.md",
      "required": true
    }
  ]
}
```

Use `{{input:brief}}` and `{{output:report}}` in the prompt. The adapter copies
inputs into a worker-local ignored inbox and expands placeholders to absolute
paths. The supervisor accepts only regular non-symlink outputs inside the
original canonical exchange and atomically retains them after Cursor exits.
The adapter rejects controller and retained paths inside the workspace.
`.loopx/` must be gitignored in the target repository.

The supervisor always enables Cursor's workspace sandbox. Treat an ambient
Cursor sandbox policy that grants the run/control root as unsupported; remove
that broad write grant before dispatch. Owner-only modes and lifecycle digests
are integrity checks, not a replacement for this boundary.

Every prompt contains exactly:

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

## Cursor Agent CLI Lifecycle

Start one already-reserved worker:

```text
node <skill-dir>/scripts/parallel-exec.mjs cursor start \
  --operation <worker-dir>/operation.json
```

`start` uses an atomic per-operation lock, creates one fresh Cursor chat,
launches a durable supervisor, and returns only after a matching heartbeat and
validated `system/init`. Persist `set_worker_runtime` with these returned
fields:

- common: `runtime`, `agent_id`, `model`, `cwd`, `requested_model`,
  `report_path`, and `started_at`;
- Cursor lifecycle: `process_id`, `supervisor_pid`, `operation_path`,
  `operation_digest`, `supervisor_token`, and `heartbeat_path`;
- controller state status: `running`.

Do not rewrite an attached identity. A repeated transition is valid only when
all persisted identity fields match.

Observe without occupying another worker slot:

```text
node <skill-dir>/scripts/parallel-exec.mjs cursor wait \
  --operation <worker-dir>/operation.json \
  --timeout-ms 900000 --format compact
```

Use one long-lived wait per active operation. If the controller tool yields a
background process or session handle, reuse the same wait session until it
returns; do not start another wait for the operation. Compact output retains
only scheduler-facing status and identity. Omit `--format compact` only for
explicit lifecycle diagnosis. Do not inspect `events.ndjson`, `heartbeat.json`,
or `stderr.log` during normal progress observation. A wait timeout returns
`status: running`; start a new wait only after the prior wait has returned.
Request interruption through the operation:

```text
node <skill-dir>/scripts/parallel-exec.mjs cursor interrupt \
  --operation <worker-dir>/operation.json
```

`interrupt` atomically writes a digest/token-bound `cancel.json`; it never
signals a persisted PID. The supervisor terminates the owned POSIX process
group or runs Windows `taskkill.exe /PID <pid> /T /F`, then retains terminal
evidence before the command returns.

Never use `--worktree`, `--continue`, a reused chat id, caller-provided shell
command strings, or an asynchronous Cloud Agent branch/PR. The supervisor sets
both process cwd and `--workspace` to the canonical owned worktree, selects the
model explicitly, enables the sandbox, and observes `stream-json`. Native
executables use direct argv; Windows `.cmd`/`.bat` launchers use the bundled
quoted `cmd.exe` adapter.

## Cursor Agent CLI Acceptance And Resume

Accept success only when all are true:

- one matching `system/init` supplies cwd, session id, and observed model;
- every streamed session id remains stable;
- the process exits zero with one terminal successful `result`;
- inbox hashes are unchanged and required outbox files are contained and valid;
- assigned symbolic branch, HEAD, and index remain unchanged;
- retained report/review validators pass.

The supervisor stores `prepared.json`, `supervisor.json`, `handshake.json`,
`heartbeat.json`, optional `cancel.json`, `events.ndjson`, `stderr.log`, and
`completion.json` beside the operation; `start.lock` is transient. Lifecycle
JSON binds the worker, workspace/model, operation path/digest, and supervisor
token. Trust a persisted PID only with a matching fresh heartbeat. Repeated or
concurrent `start` attaches to that supervisor instead of dispatching twice.

Resume only from the same immutable operation. A missing supervisor without
terminal completion blocks and quarantines the worktree; never guess a
replacement or signal the recorded child PID. Abrupt supervisor loss can leave
an OS process tree whose identity cannot be proven portably, so require manual
process verification before cleanup or resume.
