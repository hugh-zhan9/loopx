# Preserve Custom Export Names

## Source And Goal

- Source: `docs/loopx/design/2026-07-20-custom-export-names/requirements.md`
- Goal: Preserve configured custom export names across configuration reloads.

## Boundaries And Global Constraints

- Do not change the configuration file format or default export naming.

## Execution Slices

### P-001: Preserve custom names during reload

- Outcome: Existing custom export names remain unchanged when configuration is reloaded.
- Depends on: none
- Write scope: `src/config-loader.mjs`, `test/config-loader.test.mjs`
- Relevant paths: `src/config-schema.mjs`
- Exclusive resources: none
- Interfaces consumed: normalized loader configuration.
- Interfaces produced: configured export-name field preserved for reload consumers.
- Source anchors: `AC-001`, `TC-001`
- Acceptance: A configured custom name survives initial load and one reload; configurations without a custom name retain the current default.
- Verification: run the focused configuration-loader tests and observe both custom-name and default-name cases passing.
- Expected evidence: the focused test command exits successfully and reports the reload regression cases as passing.
- Review focus: reload compatibility and preservation of the default-name behavior.

## Authoritative Execution Graph

```loopx-execution-graph
{
  "schema": "loopx.execution-graph.v1",
  "selected_profile": "delegated-serial-v1",
  "selection_rationale": "The plan contains one ready slice.",
  "max_parallel": 4,
  "tasks": [
    {
      "id": "P-001",
      "outcome": "Preserve custom names during reload",
      "depends_on": [],
      "write_scope": ["src/config-loader.mjs", "test/config-loader.test.mjs"],
      "relevant_paths": ["src/config-schema.mjs"],
      "exclusive_resources": [],
      "interfaces": {
        "consumes": ["normalized loader configuration"],
        "produces": ["preserved configured export-name field"]
      },
      "source_anchors": ["AC-001", "TC-001"],
      "acceptance": ["Custom names survive reload and default naming remains unchanged."],
      "verification": ["Run focused configuration-loader tests."],
      "expected_evidence": ["Focused tests pass for custom and default names."],
      "review_focus": ["Reload compatibility and default-name behavior."],
      "parallel_safe": false,
      "parallel_rationale": "Only one slice exists."
    }
  ]
}
```

## Integration And Final Verification

- Run the repository test suite after the focused configuration-loader tests.
- Confirm the public configuration format and default export name are unchanged.

## Handoff And Residual Risks

- Status: `ready_for_exec`
- Blockers: none.
- Residual risks: none known.
- Resume note: none.
