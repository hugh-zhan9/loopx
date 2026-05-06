---
name: clarify
description: Comprehensive loopx clarify skill for requirements, boundaries, and design-ready specs.
---

# loopx Clarify

<Purpose>
`clarify` is loopx's full pre-implementation clarification skill. It combines:

- the Socratic pressure and ambiguity control of `deep-interview`
- the design-shaping discipline of `brainstorming`

Its job is not just to ask questions. Its job is to turn a vague or overloaded request into a written clarify spec that is:

- explicit about intent
- explicit about non-goals and decision boundaries
- concrete enough to hand to `plan`
- structured enough that downstream execution does not re-discover the task from scratch
</Purpose>

<Use_When>
- The request is broad, ambiguous, or mixes problem, solution, and implementation detail.
- The user needs help defining scope, non-goals, acceptance criteria, or tradeoffs before planning.
- A design direction exists only implicitly and would otherwise be invented during implementation.
- The task will later be handed to `plan`, `build`, or `autopilot`, and you want a high-signal spec first.
</Use_When>

<Do_Not_Use_When>
- The task already has concrete file/symbol targets and clear acceptance criteria.
- A complete and approved spec/plan already exists for the same task.
- The user explicitly asks to skip clarification and execute immediately.
</Do_Not_Use_When>

<Why_This_Exists>
Most implementation drift happens before coding begins. Teams often think they need “more planning,” when the real problem is weaker intent clarity, hidden assumptions, fuzzy boundaries, or a design shape that was never made explicit. `clarify` exists to solve those upstream failures before `plan` or `build` magnifies them.
</Why_This_Exists>

<Core_Principles>
- Ask one question at a time.
- Prefer the highest-leverage unresolved question, not broad coverage.
- Keep digging on the same thread until one assumption, one boundary, or one tradeoff becomes clearer.
- Treat every answer as a claim to pressure-test, not a final truth to copy down.
- Make `Non-goals` and `Decision Boundaries` mandatory gates.
- Do not stop at “requirements”; shape the solution enough that the next stage has a coherent starting design.
</Core_Principles>

<Profiles>
- **Standard (`--standard`, default)**:
  - default loopx clarify mode
  - target threshold: `<= 0.20`
  - max rounds: `15`
- **Deep (`--deep`)**:
  - higher-rigor clarify mode with heavier pressure-testing and design shaping
  - target threshold: `<= 0.10`
  - max rounds: `25`

If no flag is provided, use **Standard**.
</Profiles>

<Runtime_State_Machine>
`clarify` must maintain these runtime fields in `.loopx/workflows/<slug>/state.json` and mirror them in the clarify spec frontmatter:

- `clarify_current_round` / `current_round`: starts at `0`; increments after each user-answer round.
- `clarify_ambiguity_score` / `ambiguity_score`: starts at `1`; must be `<= clarify_target_ambiguity_threshold` before handoff.
- `clarify_non_goals_resolved` / `non_goals_resolved`: `true` only after non-goals are explicit.
- `clarify_decision_boundaries_resolved` / `decision_boundaries_resolved`: `true` only after human-vs-agent decision boundaries are explicit.
- `clarify_pressure_pass_complete` / `pressure_pass_complete`: `true` only after at least one prior answer has been revisited with explicit pressure.

The `clarify -> plan` gate is blocked until all of the following are true:

- `unresolved_ambiguity_count` is `0`
- `clarify_current_round` is between `1` and `clarify_max_rounds`
- `clarify_ambiguity_score` is at or below the selected profile threshold
- non-goals are resolved
- decision boundaries are resolved
- pressure pass is complete

Do not mark a clarify spec handoff-ready by prose alone. Update the frontmatter fields so the runtime can enforce the same readiness decision.
</Runtime_State_Machine>

<Execution_Policy>
- Explore repo context before asking the user about internals.
- Prefer evidence-backed clarification in brownfield work:
  - “I found X in Y. Should this clarify spec preserve that pattern?”
- Ask about intent and boundaries before implementation detail.
- Stay on the same thread when the answer is still weak instead of rotating dimensions just for coverage.
- Revisit at least one earlier answer with an explicit assumption, evidence, or tradeoff follow-up before crystallizing.
- If the task is too large for one coherent spec, decompose it before pretending it is ready.
- Keep user effort low: do not ask for facts that can be discovered directly.
</Execution_Policy>

<Dimensions>
- **Intent**: why the user wants this
- **Outcome**: what end state they actually want
- **Scope**: how far the change should go
- **Constraints**: what must remain true
- **Success Criteria**: how completion will be judged
- **Context**: how this fits the existing codebase (brownfield only)
</Dimensions>

<Pressure_Patterns>
When an answer is still weak, prefer one of these next:

1. Ask for a concrete example or counterexample.
2. Expose the hidden assumption that makes the answer true.
3. Force a boundary:
   - what should not happen
   - what should be deferred
   - what should be rejected
4. If the answer is still describing symptoms, reframe toward root cause.
</Pressure_Patterns>

<Design_Shaping>
`clarify` should not stop at “what do you want?” Once the intent is understandable, it should also shape the task enough that the downstream plan is not starting from zero.

When there is a real design choice:

- propose 2-3 viable approaches
- lead with the recommended one
- explain tradeoffs briefly
- right-size the design to the task

The goal is not to produce a full architecture doc here. The goal is to make the clarify spec design-ready.
</Design_Shaping>

<Process>

## 1. Explore Context

- Read relevant files, docs, and current patterns first.
- Classify the work as brownfield or greenfield.
- For brownfield work, collect concrete evidence before questioning.

## 2. Interview

- Ask one question per round.
- After each answered round, update `current_round`, the ambiguity register, and `ambiguity_score`.
- Target the weakest unresolved dimension.
- Keep `Non-goals` and `Decision Boundaries` explicit from early in the process.
- Respect the selected profile:
  - `standard`: stop only when the clarify spec is handoff-ready or `15` rounds are exhausted
  - `deep`: stop only when the clarify spec is handoff-ready or `25` rounds are exhausted

## 3. Pressure-Test

- Apply explicit follow-up pressure to at least one earlier answer.
- Set `pressure_pass_complete: true` only after the pressure follow-up is answered and reflected in the spec.
- Do not crystallize while assumptions are still hidden or boundaries are still fuzzy.
- In `deep`, expect more persistence on the same thread before moving on.

## 4. Shape the Design

- Where needed, propose a small set of options.
- Recommend one approach.
- Clarify what that approach implies for scope and downstream execution.

## 5. Write the Clarify Spec

Write the output to the loopx runtime namespace:

- `.loopx/specs/clarify-<slug>-<timestamp>.md`

The clarify spec should include:

- metadata
- runtime readiness frontmatter:
  - `current_round`
  - `ambiguity_score`
  - `non_goals_resolved`
  - `decision_boundaries_resolved`
  - `pressure_pass_complete`
  - `unresolved_ambiguity_count`
- intent
- desired outcome
- in-scope
- out-of-scope / non-goals
- decision boundaries
- constraints
- success criteria
- assumptions exposed and resolved
- brownfield evidence vs inference
- design direction / preferred approach
- explicit next handoff recommendation

## 6. Handoff

After the clarify spec is ready:

- hand off to `plan` by default
- hand off to `build` only if the user explicitly wants direct execution and the task is already concrete enough
- hand off to `autopilot` only when the scope is sufficiently tight for a bounded end-to-end run

`clarify` itself does not implement the feature.

</Process>

<Readiness_Gates>
- `Non-goals` are explicit
- `Decision Boundaries` are explicit
- At least one pressure-pass follow-up has revisited an earlier answer
- A written clarify spec exists
- The task is small enough and clear enough for real downstream handoff
- The selected profile threshold is met:
  - `standard`: weighted ambiguity `<= 0.20`
  - `deep`: weighted ambiguity `<= 0.10`
</Readiness_Gates>

<Must_Not_Decide_Automatically>
- approval to move from clarify into plan
- implementation details that were never clarified or grounded
- widening the task because a broader redesign sounds cleaner
</Must_Not_Decide_Automatically>

<Output_Contract>
- primary artifact: a loopx clarify spec
- secondary artifact: an explicit ambiguity register and next-step recommendation
- preferred handoff: `plan`
</Output_Contract>
