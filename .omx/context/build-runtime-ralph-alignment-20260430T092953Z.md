# Context Snapshot: build-runtime-ralph-alignment

## Task Statement

Implement the LoopX `build` skill/runtime in the style of `skills/ralph/SKILL.md`.

## Desired Outcome

Define a precise requirements target for upgrading `build` from a lightweight execution artifact stage into a Ralph-style execution runtime with stronger persistence, verification, and completion gates.

## Stated Solution

Use `skills/ralph/SKILL.md` as the reference model for `build`.

## Probable Intent Hypothesis

The user wants `build` to stop being a shallow "write execution-record draft" stage and instead become the real execution lane with retry/verification rigor, while still fitting LoopX's public stage surface.

## Known Facts / Evidence

- `skills/build/SKILL.md` is currently a minimal repo-local execution description.
- `src/workflow.mjs` `buildStage()` currently only writes `execution-record.md` from a template and marks `execution_record_status=partial`.
- `buildStage()` does not currently implement:
  - persistence loop
  - parallel delegation
  - architect verification
  - deslop pass
  - regression re-verification
- current repo-local release surface still says there is no public `team` execution lane.
- `skills/ralph/SKILL.md` defines a stronger execution model with:
  - persistence loop
  - parallel delegation
  - architect verification
  - deslop
  - regression re-verification
  - clean completion/cancel lifecycle

## Constraints

- Keep LoopX public stage surface coherent with current product direction.
- Avoid reintroducing a public `team` mode unless explicitly requested.
- Preserve `review` as a separate independent stage after `build`.
- Keep execution evidence machine-checkable.

## Unknowns / Open Questions

- Should `build` default to full Ralph-style behavior, or only a subset of it?
- Should `build` internally use parallel delegation even though public `team` remains absent?
- Which Ralph behaviors are mandatory blockers for `build -> review`?
- How much of Ralph state/lifecycle should become native `build` runtime state?

## Decision-Boundary Unknowns

- Whether `build` may internally orchestrate multiple lanes while still presenting one public `build` surface.
- Whether `build` should own architect verification before review approval, or leave that entirely to `review`.
- Whether deslop/regression re-verification are mandatory for every `build` run.

## Likely Codebase Touchpoints

- `skills/build/SKILL.md`
- `src/workflow.mjs`
- `src/cli.mjs`
- `test/workflow.test.mjs`
- `templates/execution-record.md`
- `skills/ralph/SKILL.md`
