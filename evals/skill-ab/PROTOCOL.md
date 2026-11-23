# Skill A/B Benchmark Protocol — v1

Evaluates whether individual loopx skills (`debug`, `spec`, `plan2exec`) produce
measurable end-to-end engineering improvement over bare models and a slim
working agreement (`AGENTS.md` only), and whether the refactored skill suite
beats the pre-refactor baseline (`v0.11.0`).

## Pre-registered Arms

| Arm | Host Home Setup | Purpose |
|---|---|---|
| `bare` | Empty isolated host home; no `AGENTS.md`, no skills | Raw frontier model baseline |
| `slim-agents` | Empty host home + refactored `templates/working-agreement.md` copied as repo `AGENTS.md`, no skills | **Control bar**: proves whether a skill earns its keep over one short document |
| `loopx-old` | Immutable pre-refactor Git ref (e.g. `v0.11.0` / pre-refactor `main`) installed cleanly | Pre-refactor baseline (23 skills, 161-line agreement) |
| `loopx-new` | Candidate refactored Git ref (e.g. `HEAD`) installed cleanly | Refactored suite (dual-channel invocation, Matt Pocock patterns, guardrail scripts) |

## Evaluation Modes

1. **Direct End-to-End (`debug`)**:
   - Single stage in a fresh fixture repo copy.
   - Judge injects hidden test suite (`.skill-ab-hidden/`), runs verification,
     checks static guardrails (no `[DEBUG-` leftovers, no unrequested sleep/retry
     hacks, dirty-tree immutability for read-only diagnosis), and removes hidden
     files before recording diff evidence.

2. **Two-Stage Downstream Blind Implementation (`spec`, `plan2exec`)**:
   - **Stage 1 (Artifact Generation)**: The arm under test runs on the fresh
     fixture repo with the requirement/planning prompt and produces its design
     or plan document (for `bare` / `slim-agents`, the prompt asks for a concise
     design or plan markdown file at the same handoff path so Stage 2 receives
     a fair comparable artifact).
   - **Stage 2 (Blind Standard Implementation)**: A clean, fixed standard
     implementer agent (empty host home, **no loopx skills and no loopx
     working agreement**) receives ONLY the repository plus the Stage 1
     document path and implements the change.
   - **Judge**: Hidden integration/concurrency/compatibility tests + static
     guardrail scanners run on the Stage 2 repository state.

This prevents grading `spec` or `plan2exec` by subjective prose aesthetics: a
design or plan is only as good as the working code a fresh implementer builds
from it.

## Statistical Parameters & Decision Rule

- **Model**: identical model ID and reasoning effort across all arms and both stages.
- **Order**: crossover across arms per replicate.
- **Replicates**: `n >= 5` per task per arm for live decisions (run `n = 1`
  pilot first to sanity-check traces; discard pilot from scored aggregate).
- **Bootstrap**: seeded (`seed = 1`), `10,000` iterations, 95% percentile CI.
- **Total Token Cost**: `stage1.total_tokens + stage2.total_tokens` (or single
  stage for `debug`).

### Keep / Cut Rule (Per Skill Category)

Compare `loopx-new` against `slim-agents` within each skill category (`debug`,
`spec`, `plan2exec`):

- **KEEP**: Pass-rate delta >= `+10pp` over `slim-agents`, OR pass-rate non-inferior
  (`>= 0pp`) while beating `loopx-old` on pass rate or reducing median tokens by `>= 20%`.
- **CUT / FOLD**: Pass-rate delta `< +10pp` over `slim-agents` AND median token
  cost `> +30%` higher than `slim-agents` (skill adds cost without proven lift).
- **INCONCLUSIVE**: Confidence interval spans both cut and keep thresholds; add
  replicates or harder tasks before deciding.
