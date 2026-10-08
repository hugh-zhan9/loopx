# Parallel Plan Contract

This contract is the sole machine-readable input for `parallel-subagent-exec`.
Planning, plan review, and execution consume the same current-only schemas and
validator. Missing, duplicate, malformed, unknown-version, or unknown-field
metadata is invalid; prose never supplies dependencies or write scopes.

## Schemas

Each single or child plan contains exactly one plan block:

```loopx-parallel-plan
{
  "schema": "loopx.parallel-plan.v1",
  "max_parallel": 4
}
```

Each `### T-NNN / Task N:` section contains exactly one task block:

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-001",
  "depends_on": [],
  "write_scope": ["src/example.mjs", "test/example.test.mjs"],
  "parallel_safe": true
}
```

Each package `00-overview.md` contains exactly one package block:

```loopx-parallel-package
{
  "schema": "loopx.parallel-package.v1",
  "max_parallel": 4,
  "plans": [
    {
      "path": "docs/loopx/plans/2026-07-14-example/01-core.md",
      "depends_on": [],
      "can_run_in_parallel": true
    }
  ]
}
```

No other fields are allowed. Schema identifiers are exact and current-only.
`max_parallel` is a positive integer. Dependencies are unique, local to their
DAG, non-self-referential, present, and acyclic.

## Paths And Write Ownership

Paths are unique normalized repository-relative exact file paths. Absolute
paths, parent traversal, glob syntax, empty segments, and realpath escape are
invalid. A task `write_scope` must exactly equal its `Files` entries marked
`Create:` or `Modify:`. `Test:` entries are read-only verification inputs and
must not appear in `write_scope` unless relabeled `Modify:`.

Two unordered tasks that are both `parallel_safe: true` may not own the same
path. Two unordered child plans that are both `can_run_in_parallel: true` may
not have overlapping unions of task write scopes. A false capability is an
exclusive barrier at its DAG scope.

## Normalized Manifest

Successful inspection returns immutable `loopx.parallel-exec-manifest.v1`:

```json
{
  "schema": "loopx.parallel-exec-manifest.v1",
  "scope": "single-plan",
  "input": {
    "path": "docs/loopx/plans/2026-07-14-example.md",
    "sha256": "<64 lowercase hex>"
  },
  "max_parallel": 4,
  "plans": [
    {
      "path": "docs/loopx/plans/2026-07-14-example.md",
      "sha256": "<64 lowercase hex>",
      "depends_on": [],
      "can_run_in_parallel": true,
      "tasks": []
    }
  ]
}
```

Invocation `--max-parallel` overrides the input value. The executor persists
the complete manifest and hashes as run identity; it does not infer or repair
metadata.

## Failure And Handoff

Validation fails before runtime or worktree setup. Missing or legacy metadata
and direct numbered-child input stop with an actionable same-path handoff to
`$subagent-exec`. Runtime capability failure is a separate executor concern and
must not be converted into this metadata handoff.

The CLI form is:

```text
node skills/shared/scripts/parallel-plan-contract.mjs manifest inspect --input PATH [--max-parallel N] --output FILE
```

It writes one JSON summary to stdout, diagnostics to stderr, and exits `2` for
usage or contract validation errors.
