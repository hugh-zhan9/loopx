# Context Snapshot: LoopX product pivot

## Task Statement

Clarify a new product-direction pivot for the current `codex-helper` repo before any more planning or implementation.

## Desired Outcome

Freeze the scope and decision boundaries for a new release direction that:

- removes `team` from this phase
- incorporates the user's initial `workflow-reference.md`
- renames the project to `LoopX`

## Stated Solution

The user explicitly requested a deep-interview pass rather than immediate code changes.

## Probable Intent Hypothesis

The user wants to de-scope the product into a smaller, more coherent release, while also reframing the workflow language and project identity around `LoopX`.

## Known Facts / Evidence

- The current repo implementation and docs still use the name `codex-helper`.
- The current implementation already includes a working `team` path in `src/workflow.mjs` and `src/team-runtime.mjs`.
- `workflow-reference.md` introduces a broader `LoopX` workflow framing with `.LoopX/...` paths and mode descriptions for `plan`, `build`, `autopilot`, and `clarify`.
- The previous approved PRD/test-spec for this repo assumed `team` was mandatory in V1.
- The new user message explicitly overrides that prior product boundary by saying this phase should completely remove `team`.

## Constraints

- This turn is in `deep-interview` mode, so it should not implement directly.
- One question per round.
- Intent, scope, non-goals, and decision boundaries must be clarified before a new planning handoff.

## Unknowns / Open Questions

- Is `team` removed only from this release, or from the product definition altogether?
- How authoritative is `workflow-reference.md`: concept draft, release contract, or migration target?
- Does the rename to `LoopX` include only brand/docs, or also CLI command names, package name, and workspace/state directory names?
- Should existing `build` / `plan` / `review` semantics remain, or also be reshaped to match `workflow-reference.md`?

## Decision-Boundary Unknowns

- Whether this phase is a scope-reduction release or a full product-contract rewrite.
- Whether `LoopX` rename should include runtime surfaces (`codex-helper` command, `.codex-helper` directory) in the same phase.

## Likely Codebase Touchpoints

- `workflow-reference.md`
- `README.md`
- `package.json`
- `src/cli.mjs`
- `src/workflow.mjs`
- `src/team-runtime.mjs`
- `.omx/plans/*codex-helper*`
