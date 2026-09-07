---
schema: loopx-plan/v1
source: docs/loopx/design/2026-07-20-custom-export-names/requirements.md
status: blocked
slices:
  - id: P-001
    status: pending
    depends: []
---

# Preserve Custom Export Names

## Goal And Boundaries

Preserve configured custom export names across configuration reloads. The
configuration file format and the default export naming must not change.

## P-001 Preserve custom names during reload

A configured custom export name survives the initial load and one reload,
and configurations without a custom name keep the current default name. The
loader keeps user-set names instead of regenerating them on reload; nothing
else about loading changes.

> writes: `src/config-loader.mjs`, `test/config-loader.test.mjs`
> anchors: AC-001, TC-001
> architecture: extend the existing config loader; keep configuration ownership and reload behavior inside that module; verify one source of naming policy through focused tests
> verify: run the focused configuration-loader tests and observe both custom-name and default-name cases passing
> review: reload compatibility and preservation of the default-name behavior

## Integration And Final Verification

- Run the repository test suite after the focused configuration-loader tests.
- Confirm the public configuration format and default export name are unchanged.
- Confirm the integrated diff keeps export-name policy in the existing loader and does not create a second source of truth.

## Handoff And Residual Risks

- Review evidence: pending.
- Blockers: Independent plan review pending.
- Residual risks: none known.
- Resume note: none.

## Execution rules for the consuming agent

- Begin only after independent plan review permits `status: ready`.
- Execute slices in frontmatter dependency order; verify each slice with its
  `verify` line before starting dependents, and update its frontmatter
  `status` as work proceeds.
- Parallelize only slices where neither depends on the other and `writes`
  paths are disjoint; integrate results sequentially.
- Follow the installed working agreement throughout.
