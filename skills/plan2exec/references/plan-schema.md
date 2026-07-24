# Plan2Exec Schema

Use the sections below. The `loopx-execution-graph` block is the single
field-level authority for scheduling, dependencies, write scopes, resources,
interfaces, verification, evidence, and review focus; the human-readable
slices carry only the reading summary and must stay consistent with the graph.
The current repository remains authoritative for local implementation choices.

# <Feature Name>

## Source And Goal

- Source: `<approved request, intake package, requirements, or design path>`
- Goal: `<observable result this plan must deliver>`

## Boundaries And Global Constraints

- `<non-goals, protected behavior, compatibility rules, dependency limits, and approval boundaries>`

## Execution Slices

### P-001: <coherent outcome>

- Outcome: `<observable result delivered by this slice>`
- Depends on: `<P-* identifiers or none>`
- Source anchors: `<AC-*, D-*, TC-*, summarized requirement, or deferred-with-rationale>`
- Acceptance: `<observable conditions for this slice>`
- Review focus: `<task contract, regression risk, and interfaces the independent reviewer must check>`

Field-level dispatch data (write scope, relevant paths, exclusive resources,
interfaces, verification, expected evidence) lives only in the graph entry with
the same `P-*` id. Do not duplicate those fields into the prose slice; a reader
needing them follows the id into the graph.

Repeat `P-*` slices only for coherent outcomes with distinct dependency,
interface, or acceptance boundaries. Preserve existing identifiers during plan
revision and append new ones instead of renumbering.

## Authoritative Execution Graph

Include exactly one block. The default selected profile for a persistent plan
is `delegated-serial-v1`.

```loopx-execution-graph
{
  "schema": "loopx.execution-graph.v1",
  "selected_profile": "delegated-serial-v1",
  "selection_rationale": "The ready frontier is one or parallel independence is not fully proved.",
  "max_parallel": 4,
  "tasks": [
    {
      "id": "P-001",
      "outcome": "<observable result>",
      "depends_on": [],
      "write_scope": ["src/example.mjs"],
      "relevant_paths": ["test/example.test.mjs"],
      "exclusive_resources": [],
      "interfaces": {
        "consumes": ["<input or contract>"],
        "produces": ["<output or contract>"]
      },
      "source_anchors": ["AC-001"],
      "acceptance": ["<observable condition>"],
      "verification": ["<command or required check>"],
      "expected_evidence": ["<passing output or artifact>"],
      "review_focus": ["<contract or regression risk>"],
      "parallel_safe": false,
      "parallel_rationale": "<pairwise independence proof or why delegated serial is required>"
    }
  ]
}
```

Each graph `tasks` entry corresponds one-to-one with a human-readable
`Execution Slices` entry and keeps its `P-*` id. The graph entry is the
field-level authority; the prose slice's outcome, dependencies, anchors,
acceptance, and review focus must agree with it. Allowed structural profiles are
`delegated-serial-v1` and
`parallel-strict-v1`. Select parallel only when at least two slices are ready at
the same time and every concurrently ready pair is independent across DAG
edges, write scope, exclusive resources, interfaces, mutable state, and
verification outcomes. Missing fields, unknown dependencies, cycles, duplicate
ids, conflicts, or prose/graph mismatches block `ready_for_exec`.

## Integration And Final Verification

- `<cross-slice behavior, regression checks, packaging, documentation, or final suite evidence>`
- `<source anchors covered only at integration level, if any>`

## Handoff And Residual Risks

- Status: `ready_for_exec` | `blocked`
- Blockers: `<none or concrete unresolved blocker>`
- Residual risks: `<none known or concrete remaining risk>`
- Resume note: `<none or the exact point/context needed for an interrupted handoff>`

Do not add step-by-step edit instructions, code snippets, time estimates,
fixed launch schedules, user-facing executor choices, or per-slice commit
commands. Structural profile and scheduler claims belong in the graph above.
