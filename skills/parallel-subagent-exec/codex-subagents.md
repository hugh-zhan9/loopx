# Codex Adapter

Inspect both Codex adapters before state initialization:

- native create/wait is strict only when worker creation exposes an explicit
  model and owned cwd;
- otherwise use the bundled Codex Agent CLI adapter when an installed and
  authenticated `codex` executable passes `codex inspect`.

Do not reject Codex merely because `spawn_agent` lacks model or cwd. Do not
weaken those requirements or claim prompt-only cwd isolation.

## Codex Agent CLI Capability Gate

Run:

```text
node <skill-dir>/scripts/parallel-exec.mjs codex inspect \
  --output <capability-gate-dir>/codex-capabilities.json
```

Use `--agent <absolute-path>` when discovery is ambiguous. The inspector binds
the capability artifact to the real executable, CLI version, authentication,
explicit model and cwd flags, approval and workspace sandbox flags, JSONL
thread lifecycle, terminal output, `--ignore-rules`, current skill source, and
a fingerprint of `CODEX_HOME` plus effective Codex configuration. It exits `5`
with zero task dispatch when any required capability is absent. Do not pass
`--ignore-user-config`: authenticated installations may depend on a custom
model provider or base URL declared there.

The current strict CLI supervisor requires durable POSIX process-group
ownership. On Windows, `codex inspect` reports
`durable-process-tree-ownership` unavailable and exits `5`; do not claim strict
support until a Job Object or equivalent durable tree supervisor is available.

Resolve one concrete non-auto model before creating the operation: prefer an
explicit model supplied by the approved run/plan configuration; otherwise use
the current controller model when Codex exposes it; otherwise use the explicit
configured model/provider selected by the operator. Record the requested model
in the operation and terminal evidence. If no non-auto model can be resolved,
stop before state initialization; never silently use `auto` or infer a model
from an opaque provider label. Do not copy credentials or raw `codex login
status` output into state, reports, or capability artifacts.

## Worker Operation

Derive a filesystem-safe artifact id:

```text
node <skill-dir>/scripts/parallel-exec.mjs codex artifact-id \
  --worker-id <reservation-id>
```

Create one immutable owner-only operation JSON outside the assigned worktree.
It cryptographically binds the raw reservation id and role, capability
artifact, expected executable/version, skill/config fingerprints, canonical
worktree, protected invoking and sibling worktrees, explicitly concurrent peer
worktrees, explicit model, sandbox
(`workspace-write` for implementers/fixers/reconciliation and `read-only` for
all review roles), prompt path/hash, timeout, and retained report path. The
runner captures pre-dispatch worktree content itself. The operation contains:

```json
{
  "schema": "loopx.codex-worker-operation.v1",
  "worker_id": "<raw-reservation-id>",
  "role": "implementation",
  "codex_path": "<codex-capabilities.agent_path>",
  "capability_path": "<owner-only-codex-capabilities.json>",
  "capability_sha256": "<64-lowercase-hex>",
  "expected_agent_path": "<codex-capabilities.agent_path>",
  "expected_cli_version": "<codex-capabilities.cli_version>",
  "skill_source_sha256": "<codex-capabilities.skill_source_sha256>",
  "codex_home_config_fingerprint": "<codex-capabilities.codex_home_config_fingerprint>",
  "workspace": "<canonical-owned-worktree>",
  "protected_worktrees": ["<canonical-invoking-checkout>", "<canonical-sibling-worktree>"],
  "concurrent_worktrees": ["<same-batch-active-worker-worktree>"],
  "model": "<explicit-non-auto-model>",
  "sandbox": "workspace-write",
  "prompt_path": "<owner-only-prompt>",
  "prompt_sha256": "<64-lowercase-hex>",
  "report_path": "<retained-report-outside-worktree>",
  "timeout_ms": 3600000
}
```

Derive both sets from `git worktree list`: `protected_worktrees` must exactly
cover every non-active worktree except the explicitly listed same-batch
`concurrent_worktrees`. Concurrent peers are validated by the controller batch
barrier instead of per-worker immutable snapshots; a topology worktree cannot
be omitted from both sets.

`task_review`, `plan_review`, and `final_review` operations require
`sandbox: "read-only"`; their complete worktree content snapshot must remain
unchanged. Writer roles require `workspace-write`. The capability artifact,
prompt, report, and lifecycle directory remain outside the assigned worktree.

`You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

Run the already-reserved worker:

```text
node <skill-dir>/scripts/parallel-exec.mjs codex run \
  --operation <worker-dir>/operation.json
```

The runner invokes Codex with safe argv, process cwd and `--cd` both set to the
owned worktree, the explicit model, `-a never`, the declared sandbox,
`--disable multi_agent`, `--ignore-rules`, `--json`, and
`--output-last-message`. It passes the prompt through stdin. It never uses
shell interpolation, `--add-dir`, `--ignore-user-config`,
`--dangerously-bypass-approvals-and-sandbox`, or a reused thread.

The runner retains owner-only JSONL events, running identity, terminal
completion, and report evidence. Persist `runtime: codex`, adapter
`codex-agent-cli`, role, thread id, requested and observed model evidence,
canonical cwd, process id, operation path/digest, capability path/hash,
expected executable/version, skill/config fingerprints, prompt hash, protected
worktrees, report/events/completion paths, and start time before the reservation
is active.

## Observe, Interrupt, And Resume

Observe the same immutable operation:

```text
node <skill-dir>/scripts/parallel-exec.mjs codex wait \
  --operation <worker-dir>/operation.json --timeout-ms 30000
```

A wait timeout returns the retained `running` record, or `status: not_started`
when no lifecycle evidence exists; it never invents a running process.
Interrupt only the digest-bound operation:

```text
node <skill-dir>/scripts/parallel-exec.mjs codex interrupt \
  --operation <worker-dir>/operation.json
```

Accept success only when one stable thread id reaches terminal success, the
report is a regular non-symlink file whose SHA-256 and byte size match retained
completion evidence, requested/observed model evidence is consistent, process
and declared cwd bindings match the assigned worktree, the operation and
capability digests match, the Codex executable/version plus skill/config
fingerprints still match, and every protected worktree remains content-identical.
Writer roles must also preserve the assigned branch, HEAD, and index; read-only
roles preserve the complete assigned worktree content snapshot. Controller
scope-checks a writer diff before review or integration.

Resume only from the same capability path/hash, executable/version,
skill/config fingerprints, operation/prompt digests, role, protected and
concurrent worktree sets, thread/process identity, model, cwd, report path/hash/size, and worktree
identity. `wait` revalidates terminal report bytes. Missing lifecycle evidence
is `not_started`; never guess a replacement while a retained process may still
be active. Timeout and interrupt require terminal cancellation evidence after
graceful termination and process-tree escalation.

## Strict Native Dispatch

When a native create API exposes both explicit model and owned cwd, use
`spawn_agent` for reserved stages and `wait_agent` or an equivalent observer.
Persist the native agent id, observed model, and cwd before treating the
reservation as active. An observer that wakes for any agent must inspect the
recorded agents and advance only the matching terminal reservation; unrelated
completion never satisfies a target wait.
