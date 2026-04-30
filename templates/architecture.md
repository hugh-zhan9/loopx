---
schema_version: 1
workflow_id: <workflow id>
stage: plan
decision_id: loopx-v1
chosen_option: skill-first-runtime-substrate
---

# LoopX Architecture: <task name>

## Intent

- keep LoopX skill-first while reusing the deterministic runtime/debug substrate

## Boundaries

- skills are the primary user surface
- CLI remains runtime/debug support
- approvals remain explicit
- review stays independent from build

## Chosen Design

- canonical LoopX artifacts under `.LoopX/`
- single build lane, no public `team`
- bounded `autopilot` composition over clarify/plan/build/review

## Alternatives Considered

- thin skill wrappers over a CLI-first product
- plugin-first rebuild
