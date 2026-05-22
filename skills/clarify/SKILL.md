---
name: clarify
description: "Clarifies ambiguous loopx work into requirements, non-goals, decision boundaries, and design-ready specs before planning. Not for already-approved plans or concrete implementation tasks."
when_to_use: "clarify, requirements, ambiguous request, unclear scope, non-goals, decision boundaries, acceptance criteria, 需求澄清, 范围不清"
metadata:
  version: "0.1.9"
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
- The task will later be handed to `plan`, and you want a high-signal spec first.
</Use_When>

<Do_Not_Use_When>
- The task already has concrete file/symbol targets and clear acceptance criteria.
- A complete and approved spec/plan already exists for the same task.
- The user explicitly asks to skip clarification and execute immediately.
</Do_Not_Use_When>

<Why_This_Exists>
Most implementation drift happens before coding begins. Teams often think they need “more planning,” when the real problem is weaker intent clarity, hidden assumptions, fuzzy boundaries, or a design shape that was never made explicit. `clarify` exists to solve those upstream failures before `plan` turns the clarified intent into an execution contract.
</Why_This_Exists>

<Core_Principles>
- Ask one question at a time.
- Prefer bounded multiple-choice questions when the option space is known; use open-ended questions only when the option space is genuinely unknown.
- Prefer the highest-leverage unresolved question, not broad coverage.
- Keep digging on the same thread until one assumption, one boundary, or one tradeoff becomes clearer.
- Treat every answer as a claim to pressure-test, not a final truth to copy down.
- Make `Non-goals` and `Decision Boundaries` mandatory gates.
- Default to YAGNI: shrink speculative scope unless the user gives a concrete reason it belongs in the first pass.
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
- Always run a preflight context intake before the first interview question.
- If supplied context is too large for safe prompt use, first request or create a concise prompt-safe summary that preserves goals, constraints, success criteria, non-goals, decision boundaries, and source references.
- Explore repo context before asking the user about internals.
- Prefer evidence-backed clarification in brownfield work:
  - “I found X in Y. Should this clarify spec preserve that pattern?”
- Route facts before judgment:
  - discoverable codebase facts should be inspected directly
  - evidence-backed inferences should be confirmed with the user
  - product intent, tradeoffs, scope, non-goals, and decision boundaries must be treated as human decisions
- Ask about intent and boundaries before implementation detail.
- Respect stage priority:
  1. intent, outcome, scope, non-goals, decision boundaries
  2. constraints and success criteria
  3. brownfield grounding and integration details
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

<Socratic_Questioning>
`clarify` should be Socratic without being vague.

- Ask one focused round at a time.
- Prefer bounded choices when they reduce user effort:
  - use single-choice when one answer should drive the next branch
  - use multi-choice when several constraints, non-goals, or success checks may all apply
  - include `Other` only when the known options are likely incomplete
- Lead with the recommended option when repo evidence or prior answers support it, but make the tradeoff visible.
- Do not hide a branching interview tree inside one overloaded question. If an option would require a follow-up, ask that follow-up next.
- After each answer, decide whether the next highest-value move is:
  - deeper pressure on the same thread
  - zooming out to another unresolved breadth track
  - crystallizing the spec
</Socratic_Questioning>

<Breadth_Ledger>
Maintain a lightweight breadth ledger across independent ambiguity tracks:

- scope
- constraints
- outputs / deliverables
- verification and success criteria
- brownfield integration
- user-mentioned workstreams or stakeholder requirements

The ledger is a guard, not a rotation rule. Stay deep on the current thread until it has been pressure-tested, then zoom out only when another material track remains unresolved and would change downstream execution.
</Breadth_Ledger>

<Challenge_Modes>
Use these assumption stress tests when applicable:

- **Contrarian**: challenge a core assumption when an answer rests on an untested belief.
- **Simplifier**: probe the smallest viable first pass when scope expands faster than outcome clarity.
- **Ontologist**: reframe toward essence/root cause when the user keeps describing symptoms or when ambiguity stalls.

Track which challenge modes have been used in the ambiguity register. Do not repeat a mode mechanically.
</Challenge_Modes>

<Design_Shaping>
`clarify` should not stop at “what do you want?” Once the intent is understandable, it should also shape the task enough that the downstream plan is not starting from zero.

When there is a real design choice:

- propose 2-3 viable approaches
- lead with the recommended one
- explain tradeoffs briefly
- right-size the design to the task
- identify likely component boundaries, data flow, or user-facing flow when that would materially affect planning
- reject speculative features unless they are necessary for the stated outcome

The goal is not to produce a full architecture doc here. The goal is to make the clarify spec design-ready.
</Design_Shaping>

<Incremental_Validation>
For non-trivial designs, validate the design in small sections before writing the final clarify spec.

Present a compact design summary and ask whether it matches the user's intent. When relevant, validate these sections separately:

- user-facing behavior or workflow
- component boundaries / ownership
- data flow or API contract
- error handling and edge cases
- test and verification shape
- explicitly deferred work

If the user rejects a section, continue the interview loop instead of writing a handoff-ready spec.
</Incremental_Validation>

<Practical_Closure_Audit>
Treat a low ambiguity score as permission to audit closure, not as automatic permission to stop.

Before crystallizing, ask:

- Would one more question materially change implementation, test strategy, or scope?
- Are non-goals and decision boundaries explicit enough for downstream agents?
- Has at least one assumption or tradeoff been pressure-tested?
- Is remaining uncertainty residual risk rather than actionable ambiguity?

If remaining uncertainty would not change execution, crystallize the spec and preserve it as residual risk instead of opening a low-value branch.
</Practical_Closure_Audit>

<Spec_Self_Review>
Before marking a clarify spec handoff-ready, perform a self-review pass:

- remove placeholders such as `TBD`, `TODO`, `REPLACE_ME`, or vague “etc.”
- check for internal contradictions
- check whether the scope is still too broad for one coherent execution package
- check whether any requirement can be interpreted two materially different ways
- verify that non-goals, decision boundaries, acceptance criteria, and residual risks are explicit
- verify that brownfield evidence is labeled separately from inference
</Spec_Self_Review>

<Process>

## 1. Explore Context

- Read relevant files, docs, and current patterns first.
- Classify the work as brownfield or greenfield.
- For brownfield work, collect concrete evidence before questioning.
- Create or update a compact context snapshot for the task when the conversation, source docs, or repo evidence would otherwise be too large to carry safely.

## 2. Interview

- Ask one question per round.
- Prefer bounded choices for known option spaces; use open-ended questions only when the valid answers cannot be enumerated.
- Before asking each question, show a compact status line with:
  - `round`: current round and max rounds
  - `ambiguity_score`: current score
  - `target`: selected profile threshold
  - `open_items`: unresolved ambiguity count
- Also state the current focus dimension and whether the round is fact confirmation or human judgment.
- After the user answers and the round is updated, show the revised `ambiguity_score`, whether it moved up/down/unchanged, and the main reason for that change before asking the next question.
- After each answered round, update `current_round`, the ambiguity register, and `ambiguity_score`.
- Target the weakest unresolved dimension within the stage-priority order.
- Maintain the breadth ledger; do not rotate dimensions just for coverage.
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
- Apply incremental validation for non-trivial designs before finalizing the spec.

## 4.5. Closure and Self-Review

- Run the practical closure audit.
- Run the spec self-review checklist before marking handoff-ready.
- If the round cap is reached or the user chooses to proceed despite ambiguity, preserve an explicit residual-risk warning in the spec and handoff recommendation.

## 5. Write the Clarify Spec

Write the output to the loopx runtime namespace:

- `.loopx/intake/clarify-<slug>-<timestamp>.md`

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
- pressure-pass findings
- brownfield evidence vs inference
- breadth ledger / unresolved tracks, if any
- design direction / preferred approach
- residual risks
- explicit next handoff recommendation

## 6. Handoff

After the clarify spec is ready:

- hand off to `plan`; do not start implementation, TDD, `build`, or `autopilot` from `clarify`
- if the user asks to execute immediately, explain that loopx requires the `plan` gate first and provide the plan invocation
- if a task is too small to justify planning, do not use `clarify`; handle that request outside the clarify workflow from the start

Preferred explicit handoff contract:

- Default handoff after normal loopx clarify: `$plan <slug>`
- Conditional artifact-pinned handoff: `$plan --direct <spec-path>`
- Recommend `$plan --direct <spec-path>` when the user explicitly wants to plan from a specific requirements artifact, when the source is external/manual/legacy, or when multiple plausible spec files exist and the user has chosen one as the planning source of truth.
- Do not use `$plan --direct` to work around unclear workflow state, missing approvals, or an uncertain slug; inspect or repair the loopx runtime state instead.
- For the normal loopx clarify happy path, prefer `$plan <slug>` because the active workflow slug already anchors the clarify artifact and runtime state.
- Consumer behavior: treat the clarify spec as the source of truth for intent, non-goals, decision boundaries, constraints, and design direction; do not reopen clarification by default

`clarify` itself does not implement the feature. The handoff recommendation must name `plan` as the next workflow step.

</Process>

<Readiness_Gates>
- `Non-goals` are explicit
- `Decision Boundaries` are explicit
- At least one pressure-pass follow-up has revisited an earlier answer
- The practical closure audit has passed
- The spec self-review pass has removed placeholders, contradictions, and material ambiguity
- A written clarify spec exists
- The task is small enough and clear enough for real downstream handoff
- The selected profile threshold is met:
  - `standard`: weighted ambiguity `<= 0.20`
  - `deep`: weighted ambiguity `<= 0.10`
</Readiness_Gates>

<Must_Not_Decide_Automatically>
- approval to move from clarify into plan
- skipping `plan` after producing a clarify spec
- implementation details that were never clarified or grounded
- widening the task because a broader redesign sounds cleaner
</Must_Not_Decide_Automatically>

<Output_Contract>
- primary artifact: a loopx clarify spec
- secondary artifact: an explicit ambiguity register and next-step recommendation
- preferred handoff: `plan`
</Output_Contract>
