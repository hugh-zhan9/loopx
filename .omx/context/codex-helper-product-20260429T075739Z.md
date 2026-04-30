# Context Snapshot: codex-helper product

## Task Statement

Clarify the actual product requirements for `codex-helper` as an independent workflow product before further implementation.

## Desired Outcome

Freeze the V1 product definition, workflow contract, non-goals, and decision boundaries so later planning and implementation stay aligned.

## Stated Solution

An independent workflow product for Codex CLI users built around:

`clarify -> plan -> build/team -> review`

with one corresponding skill per stage.

## Probable Intent Hypothesis

The user wants a workflow product that is materially better than simple prompt-driven development by reducing requirement drift and unstable implementation through explicit staged gating and verification.

## Known Facts / Evidence

- The product is independent, not a compatibility layer or trimmed version of another workflow tool.
- The target user is a Codex CLI user in day-to-day feature development.
- The workflow stages are fixed as `clarify -> plan -> build/team -> review`.
- V1 must include both `build` and `team`; `team` is not deferrable to V1.1.
- Each stage should have a dedicated skill.
- Stage transitions, rollback decisions, and `build` vs `team` selection require user confirmation.

## Constraints

- Do not add compatibility aliases or workflow-product mappings.
- Do not build deep IDE / GitHub / CI integration in V1.
- Do not build enterprise governance, project management, or a generic review platform in V1.
- Do not try to auto-fix every implementation problem; prioritize stable flow and verifiable outcomes.

## Unknowns / Open Questions

- Exact CLI / skill invocation syntax for each stage.
- Exact file layout and lifecycle contract for per-stage artifacts.
- Exact team runtime implementation details and worker launch mechanics.

## Decision-Boundary Unknowns

- None for product boundary; remaining unknowns are implementation-level.

## Likely Codebase Touchpoints

- `README.md`
- `src/cli.mjs`
- `src/workflow.mjs`
- future `skills/` or equivalent stage entrypoints
