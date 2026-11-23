---
name: clarify
description: "Resolve missing requirements or conflicting domain meanings in structured rounds before coding (需求澄清)."
disable-model-invocation: true
metadata:
  version: "0.7.0"
  when_to_use: "clarify, unresolved intent, unclear scope, acceptance criteria, permission decision, 需求澄清, 分轮提问"
---

# Clarify

Resolve only ambiguity that can materially change the requested outcome.
Treat requirements as a **design tree**: each decision branches into downstream
decisions that depend on it.

## Process

1. **Discover facts yourself.** Inspect the request, repository code, specs
   (`docs/loopx/specs/`), `GLOSSARY.md`, and tests first. Finding facts is your
   job; only genuine decisions go to the user. Check domain terminology with
   [domain-language.md](../shared/domain-language.md). When reviewing a Chinese
   PRD or vague brief, consult [ambiguity-table.md](references/ambiguity-table.md).
2. **Work the frontier in rounds.** The **frontier** is every unresolved
   material decision (goals, scope, scenarios, acceptance, permissions,
   compatibility, data, ownership) whose prerequisites are already settled.
   Ask the whole frontier together in one round; hold dependent questions for
   the next round.
3. **Give a concrete recommendation.** Word each question so answering "yes"
   accepts your recommended option, and state the main tradeoff. Use the host's
   question tool when available, or format as:

```text
Q1. <title>: <question and options>
Recommended: <answer and tradeoff>
```

4. **Route external-owner decisions cleanly.** When a decision belongs to
   another stakeholder, prepare a focused handoff using
   [owner-questions.md](references/owner-questions.md) instead of asking the
   current user to guess.
5. **Recompute and finish.** After each reply, propagate settled choices through
   the tree and ask the newly unblocked frontier. Finish when the frontier for
   the active scope is empty. Record unanswered items as `[PENDING]` with the
   behavior they leave undecided.

## Output

Update an existing approved requirements document in place when present.
Otherwise write a local intake package under `.loopx/intake/YYYY-MM-DD-<slug>/`:

- `requirements.md` (canonical): goal, scope, non-goals, confirmed decisions,
  boundaries, observable `AC-*` criteria, `TC-*` scenarios (each referencing at
  least one `AC-*`), evidence targets, and any `[PENDING]` items.
- `clarification.md` (optional): question history and exact user wording.

## Boundaries

- Do not write an implementation plan, change code, or automatically invoke the next skill.
- Keep routine implementation choices out of user questions.
- Preserve exact user wording for settled decisions; never fabricate answers to look complete.
- End by reporting the document path(s) and any remaining `[PENDING]` items.
