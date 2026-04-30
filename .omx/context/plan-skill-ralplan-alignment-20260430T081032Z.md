# Context Snapshot: plan-skill-ralplan-alignment

## Task Statement

Improve the LoopX `plan` skill by using `ralplan` as the reference.

## Desired Outcome

Produce a clear requirements target for upgrading `skills/plan/SKILL.md` and the mirrored plugin skill so `plan` is no longer a thin placeholder and can stand as the canonical planning surface.

## Stated Solution

Reference `skills/ralplan/SKILL.md` and bring the important planning mechanics into `plan`.

## Probable Intent Hypothesis

The user wants `plan` to become the real planning workflow contract, while `ralplan` should remain an alias or specialized consensus invocation rather than the only detailed source of planning behavior.

## Known Facts / Evidence

- `skills/plan/SKILL.md` is currently a brief repo-local planning description.
- `plugins/loopx/skills/plan/SKILL.md` currently mirrors the same brief content.
- `skills/ralplan/SKILL.md` contains richer behavior: pre-context intake, consensus mode, RALPLAN-DR summary, Planner -> Architect -> Critic sequencing, max-5 iteration loop, interactive approvals, execution handoff contracts, and pre-execution gating.
- Current LoopX release surface includes `clarify -> plan -> build -> review`, with `autopilot` also bundled.
- Prior clarified product boundary says LoopX should avoid reintroducing legacy OMX surfaces as the visible product contract.

## Constraints

- Keep LoopX skill-first and product-local.
- Avoid making `plan` a hidden alias back to legacy OMX mode names unless that is an explicit compatibility intent.
- Keep `ralplan` semantics available, but decide whether they become the default `plan` behavior or only `plan --consensus`.
- Preserve explicit user confirmation for execution handoff.
- Mirror canonical skill updates into `plugins/loopx/skills/plan/SKILL.md`.

## Unknowns / Open Questions

- Should consensus planning become the default `plan` behavior, or only an opt-in `--consensus` mode?
- Should `plan` include direct planning and consensus planning in one skill, or should it only document the canonical direct plan path and point to `ralplan` for consensus?
- Which RALPLAN-DR requirements are mandatory for every plan versus high-risk / deliberate-only?
- What runtime state fields should `plan` maintain analogous to the newly completed `clarify` state machine?

## Decision-Boundary Unknowns

- Whether `plan` may automatically launch Planner/Architect/Critic review without asking.
- Whether `plan` may auto-handoff to `build`, `autopilot`, `ralph`, or `team`.
- Whether `ralph` / `team` handoff language should remain in LoopX now that current release docs say no public `team` surface.

## Likely Codebase Touchpoints

- `skills/plan/SKILL.md`
- `plugins/loopx/skills/plan/SKILL.md`
- `skills/ralplan/SKILL.md`
- `src/workflow.mjs`
- `templates/plan.md`
- `templates/architecture.md`
- `templates/development-plan.md`
- `templates/test-plan.md`
- `test/workflow.test.mjs`
