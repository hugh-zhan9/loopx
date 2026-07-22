# Execution Profile Selection

Apply these rules in order. `exec` owns automatic selection; do not ask the user
to choose a profile.

## 1. Decision Readiness

Stop before mutation when requirements or safety-critical decisions remain
unresolved. This is a `clarify` or `spec` reason, not an execution profile.

## 2. Input Class

- A clear, bounded, low-risk prompt with one coherent outcome may select
  `inline-owned-v1`.
- A current persistent plan uses its validated `selected_profile`.
- A legacy lean plan without `loopx.execution-graph.v1` selects
  `delegated-serial-v1`.
- Persistent planned work never selects inline execution.

## 3. Planned Default

`delegated-serial-v1` is the default structural profile. Keep it when the ready
frontier has fewer than two slices or any independence dimension is uncertain.
Fresh workers and mandatory independent review remain valuable even when tasks
must execute serially.

## 4. Parallel Proof

`parallel-strict-v1` is admissible only when the current ready frontier contains
at least two slices and every concurrently ready pair proves all of:

- no dependency path in either direction;
- disjoint normalized write scopes;
- no conflicting exclusive resource or shared mutable state;
- no producer-consumer interface between the pair;
- independent implementation decisions and verification outcomes;
- `parallel_safe: true` with a concrete rationale;
- reliable isolated worktree binding and protected integration.

Shared immutable baseline reads may appear in `relevant_paths`, but runtime must
protect them from concurrent or user-owned mutation. Worker availability or a
high task count alone is not parallel proof.

## 5. Runtime Narrowing

Runtime may narrow `parallel-strict-v1` to `delegated-serial-v1` when isolation
or an independence claim no longer holds. Temporary capacity one may instead
retain the profile with effective concurrency one. In both cases record the
reason. Never silently narrow planned work to `inline-owned-v1`.

Missing implementer or independent-review capability blocks planned execution.
Do not substitute controller self-implementation or self-review.

## 6. Shared Budget

The default shared worker budget is four. Effective concurrency is the minimum
of ready admissible leaf work, observed host capacity, and configured budget.
Implementers, reviewers, fixers, and final reviewers consume the same budget.

## Decision Report

Record the selected structural profile, effective profile or concurrency, graph
or prompt evidence, and any runtime narrowing reason.
