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
- Source anchors: `AC-001`, `TC-001`
- Acceptance: A configured custom name survives initial load and one reload; configurations without a custom name retain the current default.
- Verification: run the focused configuration-loader tests and observe both custom-name and default-name cases passing.
- Review focus: reload compatibility and preservation of the default-name behavior.

## Integration And Final Verification

- Run the repository test suite after the focused configuration-loader tests.
- Confirm the public configuration format and default export name are unchanged.

## Handoff And Residual Risks

- Status: `ready`
- Blockers: none.
- Residual risks: none known.
- Resume note: none.

## Execution rules for the consuming agent

- Execute slices in dependency order and verify each slice before dependents.
- Parallelize only dependency-independent slices with disjoint write scopes.
- Follow the installed working agreement throughout.
