# Execution Selection

Apply these rules in priority order. The decision is qualitative and must name
the concrete evidence; do not ask the user to select an executor.

## 1. Decision Readiness

Stop before mutation when requirements or safety-critical decisions are still
unresolved. This is a `clarify` or `spec` reason, not an execution choice.

## 2. Strong Coupling

Execute serially in the current context when outcomes:

- change the same file or overlapping behavior;
- define a producer and consumer of the same new API;
- update or consume one shared generated output;
- continue the same debugging or hypothesis chain;
- require intermediate reasoning or state from one another.

State the concrete coupling reason. Do not split continuous reasoning merely
because more than one file or outcome exists.

## 3. Independence

Concurrent work is admissible only when dependencies, write surfaces,
decisions, verification, baseline inputs, and integration outcomes are all
independent. If any dimension is uncertain, execute serially.

For example, one clear prompt may decompose into two adapters with distinct
files, no shared contract decision, independent tests, and no integration
ordering. That graph may run concurrently without first writing a plan.

## 4. Runtime Capability

Concurrent mutation requires reliable task-worktree binding and a protected
integration workspace. Missing capacity or isolation selects serial execution
inside `exec`; it does not select a legacy executor or fail otherwise valid
work. Read-only work may overlap only when it cannot mutate shared state.

## 5. Shared Budget

The default shared worker budget is four. Effective concurrency is the minimum
of admitted ready work, observed host capacity, and the configured budget.
Implementers, reviewers, and fixers consume the same budget, and every worker
remains a leaf owned by the top-level controller.

## Decision Report

Report `serial` or `concurrent` plus the concrete reason. Do not expose a user
mode selector, numeric classifier, or parallelism target.
