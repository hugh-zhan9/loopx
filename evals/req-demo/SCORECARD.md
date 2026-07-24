# req-demo Scorecard (FitPulse)

Experiment:

- Date:
- Model:
- Product source: `sources/fitpulse/REQUIREMENTS.md`
- Clarify intake: `.loopx/intake/2026-07-22-fitpulse-v1/` (from ~/project/fitpulse)
- Baseline ref:
- Candidate ref:

## Quality gates

| Arm | Runtime | artifact verify | FitPulse plan/design | intake unchanged | Notes |
|-----|---------|-----------------|----------------------|------------------|-------|
| bare | codex / claude / cursor | pass/fail | PLAN.md | n/a or yes | |
| loopx-a | | | design+plan | yes/no | |
| loopx-b | | | design+plan | yes/no | |

## Workflow observance

Bare / no-loopx (requirements → PLAN.md → implement):

| Arm | read docs/product/REQUIREMENTS.md | wrote PLAN.md | implemented from plan | Notes |
|-----|-----------------------------------|---------------|-----------------------|-------|
| bare | | | | |

Installed loopx (spec → plan2exec → exec → final-review):

| Arm | spec | plan2exec | exec | final-review | Skipped/reordered steps |
|-----|------|-----------|------|--------------|-------------------------|
| loopx-a | | | | | |
| loopx-b | | | | | |

## Resources (quality-passed arms only)

| Arm | Runtime | input tokens | output tokens | wall clock | Notes |
|-----|---------|--------------|---------------|------------|-------|
| bare | | | | | |
| loopx-a | | | | | |
| loopx-b | | | | | |

## Verdict

- Quality winner:
- Resource note (only if quality non-worse):
- Inconclusive reasons:
