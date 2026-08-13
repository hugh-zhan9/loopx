# Prompt Lint Rubric

Use this rubric after extracting the prompt's explicit claims. Score adequacy
for the actual task type, not the number of sections or words.

The rubric is calibrated to OpenAI's outcome-focused guidance: state the goal,
relevant context, constraints, required evidence, success criteria, and useful
output form; keep instructions lean and define autonomy or approval boundaries
for agentic work. The stable source used when this rubric was created was:
<https://developers.openai.com/api/docs/guides/latest-model>.

## Verdict Before Score

Assign the verdict using blockers first:

- **Insufficient input**: no identifiable prompt was supplied; return the
  unscored request defined in `SKILL.md`.
- **Not ready**: at least one Must supply item remains.
- **Ready with notes**: no Must supply item remains, but Worth adding items or a
  material non-blocking risk remain.
- **Ready**: no Must supply item or material prompt-definition risk remains.

Use the numeric score as explanation, not as a readiness gate. Never upgrade a
blocked prompt because its total crosses a threshold.

For each scored subdimension, use only these anchors, rounded to the nearest
whole point:

- **100%**: fully adequate for this task, or immaterial to it.
- **75%**: usable with one small, non-blocking weakness.
- **50%**: partly defined; multiple reasonable interpretations remain.
- **25%**: only a weak signal is present.
- **0%**: absent, contradictory, or unusable.

Do not invent fine-grained distinctions between these anchors. Cite the prompt
or inspected context that justifies each dimension total.

## Scoring

### Goal and outcome — 25

- **Action (0-8):** Is the requested kind of work explicit?
- **Object and scope (0-7):** Is the subject or target identifiable?
- **Desired outcome (0-10):** Can the agent distinguish success from merely
  doing activity?

Deduct for unsupported verbs such as "improve", "optimize", "handle", or
"check" when the intended change or decision cannot be inferred. Do not deduct
when a short prompt has one obvious outcome.

### Necessary context — 20

- **Material domain facts (0-8):** Are non-discoverable facts that affect the
  result supplied?
- **Inputs and evidence anchors (0-7):** Are named artifacts, examples, errors,
  or data available when the task depends on them?
- **Context placement (0-5):** Is input data distinguishable from instructions,
  and can the relevant context be found without guessing?

Award full credit when no special context is needed or all omitted facts are
available through safe inspection. Do not demand file paths, code structure,
callers, tests, or project conventions that an agent working in the repository
can discover.

### Boundaries and authority — 20

- **Behavioral boundaries (0-8):** Are compatibility, preservation, scope, and
  non-goals explicit where a wrong assumption would matter?
- **Authority and side effects (0-7):** Is it clear whether the agent should
  inspect, diagnose, modify, or perform external/destructive/costly actions?
- **Priority and conflict handling (0-5):** Are hard constraints distinguishable
  from preferences and free of contradiction?

Award full credit when the task is read-only, reversible, locally scoped, and
ordinary host policy already defines authority. Require explicit approval
boundaries for external writes, destructive operations, purchases, secret
handling, or material scope expansion.

### Success and evidence — 25

- **Observable completion (0-10):** Does the prompt say what must be true at the
  end?
- **Verification or supporting evidence (0-10):** Is the expected proof
  appropriate to the task—tests, reproduction, citations, comparison, rendered
  output, or stated reasoning?
- **Material edge conditions (0-5):** Are critical preservation rules, failure
  cases, or input boundaries named when they affect correctness?

Adapt evidence to the task. An explanatory answer may need an accurate
conclusion and relevant support; a code change normally needs regression
coverage and fresh checks; a destructive operation needs resolved targets and
confirmation. Do not mechanically require tests for prose or one-step answers.

### Signal quality — 10

- **Consistency (0-4):** No conflicting instructions or incompatible goals.
- **Economy (0-3):** Important instructions are stated once without noise.
- **Implementation freedom (0-3):** The prompt specifies outcomes and hard
  constraints without unnecessary thought scripts, role-play, or microsteps.

Do not reward headings by themselves. Deduct only when verbosity, repetition,
ritual language, or prescribed reasoning obscures priorities or reduces useful
implementation freedom.

## Gap Classification Test

Before listing a missing item, ask:

1. Can the agent discover it through safe, in-scope inspection?
   - Yes: Agent can discover.
2. If the agent chooses a reasonable default, could that produce a materially
   different, incompatible, unsafe, destructive, or unverifiable result?
   - Yes: Must supply.
3. Would the information mainly improve precision, efficiency, or presentation?
   - Yes: Worth adding.
4. Is the category irrelevant to this task?
   - Yes: omit it and do not deduct.

## Calibration Examples

### Short but ready

Prompt:

> Correct the typo "recieve" to "receive" in README.md. Do not change other
> wording.

This can be Ready despite having no formal test section. The target, outcome,
and preservation boundary are observable; the file and occurrence are safely
inspectable.

### Detailed but blocked

Prompt:

> Migrate all customers to the new billing plan. Work carefully, think step by
> step, verify everything, and produce a professional report.

This is Not ready. The target plan, migration mapping, timing, authorization,
rollback expectations, and proof of correctness are unavailable. Ritual
phrases do not compensate for missing decisions.

### Repository-aware review

Prompt:

> Fix the final partial batch being skipped. Keep the public API unchanged and
> add regression coverage for 0, 1, 100, and 101 records.

Do not ask the user for filenames, current batching code, callers, or test
commands when those are available in the repository. Those belong under Agent
can discover.

### Missing product decision

Prompt:

> When an expired invitation is accepted, make it work again.

If neither prompt nor product context defines whether to renew the existing
invitation, create a replacement, or reject with recovery guidance, classify
that behavior as Must supply because each choice changes public semantics.
