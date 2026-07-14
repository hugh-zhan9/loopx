# Plan Schema Contract

Every plan has Source, Goal, Architecture, Tech Stack, Support lenses, an
evidence-based Execution strategy recommendation with Selection rationale,
Global Constraints, Internal Plan Review, tasks, verification, and execution
handoff. The recommendation is `subagent-exec` or `exec`; neither executor is
the default solely because subagents are available.

Every task uses `### T-NNN / Task N: <name>` and records exact files,
interfaces, Source AC, Design anchors, Test cases, expected execution evidence,
review focus, support lenses, and verification steps. Evidence follows
`../../shared/evidence-contract.md`.

Tasks do not commit or stage. Single plans commit once after all tasks and
reviews; packages commit once per reviewed child plan.

## Strict Parallel Metadata

All newly generated plans include current-only, strict JSON fences. A single or
child plan contains exactly one:

```loopx-parallel-plan
{"schema":"loopx.parallel-plan.v1","max_parallel":4}
```

Every anchored task contains exactly one:

```loopx-parallel-task
{
  "schema":"loopx.parallel-task.v1",
  "task_anchor":"T-001",
  "depends_on":[],
  "write_scope":["src/example.mjs"],
  "parallel_safe":true
}
```

A package overview contains exactly one:

```loopx-parallel-package
{
  "schema":"loopx.parallel-package.v1",
  "max_parallel":4,
  "plans":[
    {
      "path":"docs/loopx/plans/YYYY-MM-DD-example/01-core.md",
      "depends_on":[],
      "can_run_in_parallel":true
    }
  ]
}
```

`max_parallel` defaults to `4`. Dependencies and write ownership are explicit;
never infer them from prose. `write_scope` must exactly equal normalized
`Create:` and `Modify:` paths. `Test:` paths are read-only and excluded unless
the task labels them `Modify:`. Unknown fields/schemas, duplicate fences,
invalid paths, missing dependencies, cycles, and unordered concurrent exact
path overlap are invalid.

Before internal plan review, run the shared owner:

```text
node <plan-to-exec-skill-root>/../shared/scripts/parallel-plan-contract.mjs manifest inspect --input <plan-or-overview> --output <scratch-manifest>
```

Current `exec` and `subagent-exec` package modes remain strictly sequential.
The new executor is manual-only and must not appear in `Execution strategy
recommendation`, automatic routing, or generated execution handoff examples.
