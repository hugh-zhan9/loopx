# Context Snapshot: autopilot-loopx-alignment

## Task Statement

Implement the loopx `autopilot` skill by referencing `/Users/zhangyukun/project/oh-my-codex/skills/autopilot`, but integrate it into the loopx stage flow.

## Desired Outcome

Define a precise requirements target for upgrading loopx `autopilot` from a thin bounded composition description into a stronger autopilot surface that still uses the loopx workflow model.

## Stated Solution

Reuse the design ideas from the parent `oh-my-codex` `autopilot` skill, but adapt the actual flow to loopx stages.

## Probable Intent Hypothesis

The user wants loopx `autopilot` to stop being a lightweight wrapper description and become a real autonomous orchestration surface, while preserving loopx's stage model and existing local runtime artifacts.

## Known Facts / Evidence

- `skills/autopilot/SKILL.md` in `codex-helper` is currently a short bounded composition description.
- `/Users/zhangyukun/project/oh-my-codex/skills/autopilot/SKILL.md` defines a much richer multi-phase autonomous workflow:
  - expansion
  - planning
  - execution
  - QA
  - validation
- `src/workflow.mjs` `autopilotStage()` currently composes `clarify -> plan -> build -> review` directly and records internal control events.
- Current loopx release flow is still built around `clarify -> plan -> build -> review`, with `autopilot` as a composition surface rather than a separate public stage family.
- `plan` and `build` runtime have already been strengthened in this repo relative to earlier lightweight versions.

## Constraints

- Keep the user-facing flow rooted in loopx stages.
- Avoid importing the parent repo autopilot literally if it conflicts with loopx's local stage/runtime contracts.
- Preserve canonical loopx artifacts and runtime roots.
- Do not widen scope casually into unrelated stage redesigns unless explicitly required.

## Unknowns / Open Questions

- Should this change upgrade only the loopx `autopilot` skill contract, or also the runtime implementation in `autopilotStage()`?
- How much of the parent autopilot phase model should survive once mapped onto loopx stages?
- Should loopx `autopilot` still remain bounded, or become a fuller autonomous pipeline with QA/validation layers?
- What completion artifacts and control-plane state should `autopilot` own beyond the existing `.loopx/autopilot/<slug>/run.json`?

## Decision-Boundary Unknowns

- Whether `autopilot` may internally satisfy stage approvals for loopx stages automatically.
- Whether `autopilot` should internally invoke the newly strengthened `plan` and `build` runtimes as-is, or own a separate orchestration/runtime path.
- Whether multi-review validation from the parent autopilot should be imported, or whether loopx `review` remains the only final acceptance stage.

## Likely Codebase Touchpoints

- `skills/autopilot/SKILL.md`
- `plugins/loopx/skills/autopilot/SKILL.md`
- `/Users/zhangyukun/project/oh-my-codex/skills/autopilot/SKILL.md`
- `src/workflow.mjs`
- `src/cli.mjs`
- `test/workflow.test.mjs`
