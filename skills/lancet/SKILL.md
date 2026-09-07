---
name: lancet
description: "Applies loopx implementation-layer minimization discipline for over-engineering, reuse checks, stdlib and native alternatives, and smallest-correct-diff review. Not for replacing clarify, spec, workflow planning, or creating a new workflow state."
when_to_use: "lancet, over-engineering, YAGNI, unnecessary dependency, simplest diff, implementation minimization, review minimization, Codex implementation discipline"
metadata:
  version: "0.1.5"
---

# Lancet

`lancet` is a support lens, not a workflow state. Apply it inside `exec`, `fix`,
host-native implementation, or review when choosing implementation details.
Product, API, schema, and architecture decisions remain with their source owners.

## Find the smallest correct diff

Check these options before adding code:

1. Omit the change if no requirement needs it; delete only within authorized scope.
2. Reuse a suitable repository implementation and inspect its callers.
3. Use the language standard library or native platform capability.
4. Reuse an installed dependency.
5. Add new code, files, or dependencies when the simpler options do not suffice.

Show sufficiency against applicable `AC-*`, `D-*`, `TC-*`, task or issue anchors,
and regression checks. Fewer lines are not an improvement if they weaken required
validation, error handling, security, accessibility, migration safety, or evidence.

Prefer a direct root-cause repair. Justify an abstraction by actual reuse or a
necessary boundary; avoid speculative extension points and boilerplate wrappers.
Keep a runnable check for non-trivial changed logic.

Retries, fallback, degradation, silent recovery, and compatibility shims require
a named scenario and expected behavior in the current user instruction or
accepted source contract. Do not invent them as implementation defaults. Preserve
existing required failure behavior; identify an unresolved decision if the task
cannot be completed without choosing a new policy.

## Review output

Report concrete unnecessary work and the smaller correct alternative, including
which requirement it still satisfies. If no meaningful simplification exists,
say so briefly. This lens adds no scoring report, workflow stage, or approval gate.
