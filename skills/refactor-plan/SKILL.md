---
name: refactor-plan
description: "Creates a behavior-preserving refactor plan with user interview, repo evidence, tiny commits, scope boundaries, and testing decisions. Not for feature changes or immediate implementation."
when_to_use: "refactor-plan, refactor request, refactoring RFC, tiny commits, behavior-preserving cleanup, architecture cleanup, 重构计划"
metadata:
  version: "0.3.8"
---

# Refactor Plan

Create a behavior-preserving refactor plan. This skill plans refactoring work; it does not implement it.

## Hard Boundary

Refactoring changes structure without changing externally observable behavior. If the requested work changes product behavior, public API semantics, data contracts, CLI behavior, schemas, permissions, compatibility, or user-visible output, stop and route to `clarify` or `spec` before planning.

Do not use this skill for immediate code edits, feature work, bug fixes, migrations, or broad cleanup with no concrete pain.

## Safety Preflight

Do these before writing the plan. Skip a step only when the user or repo evidence already provides the same information.

1. Inspect `git status --porcelain` and record whether the worktree is clean. Never require the user to discard unrelated dirty files.
2. Ask the user for the problem they want to solve, why now, and any solution ideas they already have.
3. Explore the repo to verify the problem, current structure, boundaries, callers, and existing tests.
4. Identify externally observable behavior that must remain unchanged.
5. Check test coverage for the target area. If coverage is weak, plan characterization tests before refactoring steps.
6. Confirm scope: what will change, what will not change, and which public surfaces must remain stable.

## STOP Conditions

Stop instead of writing a refactor plan when:

- Scope, target modules, or success criteria are unclear.
- The work requires new behavior or behavior changes.
- The work changes public API, schema, data migration, config, permissions, package surface, or compatibility semantics.
- There is no behavior baseline and no practical characterization test plan.
- The requested refactor is incident response or production hotfix work where cleanup would increase repair risk.
- The plan would require unrelated rewrites across multiple ownership boundaries.

When a stop condition appears, explain the blocker and route to `clarify`, `spec`, `debug`, `issue`, or a smaller refactor request as appropriate.

## Planning Flow

1. Interview the user until the purpose and constraints are specific.
2. Verify the current codebase state from repo evidence.
3. Present viable options when more than one refactor path exists.
4. Choose the smallest behavior-preserving path that addresses the pain.
5. Define behavior preservation evidence and verification commands.
6. Break the work into tiny commits. Each commit must leave the codebase working.
7. If the user asks about specific code smells, Fowler-style refactoring techniques, or mechanical refactor steps, read `references/fowler-refactorings.md` and use it as a planning reference. Also read it when the request mentions code smell, extract method, split class, primitive obsession, duplicate code, shotgun surgery, feature envy, or similar Fowler terms.

Use Fowler terminology to choose safe steps, not to justify a large rewrite. Every proposed technique must map to a concrete smell and a behavior-preserving verification step.

## Output

Write the refactor plan to:

```text
docs/loopx/refactors/YYYY-MM-DD-<topic>.md
```

If the repository has an issue tracker and the user explicitly asks for a tracker issue, publish the same plan there. Otherwise keep the plan local.

Use [REFACTOR_PLAN_TEMPLATE.md](REFACTOR_PLAN_TEMPLATE.md) as the required output structure.

The output is both the refactor RFC and the execution plan. It should be complete enough for `exec` or `subagent-exec` to execute directly without a separate `plan-to-exec` pass, unless the template's Execution Handoff says material gaps remain.

Before marking the refactor execution-ready, run `plan-reviewer` against the
Behavior Preservation Contract and current-behavior evidence. Treat the plan's
small units as atomic tasks; execution commit boundaries remain owned by
`exec` or `subagent-exec`.

## Execution Handoff Rules

- Mark the plan ready for `exec` or `subagent-exec` only when every tiny commit has exact files/surfaces, behavior-preservation evidence, verification commands, expected results, and rollback notes.
- Use `subagent-exec` only when commits or tasks are independent enough for fresh workers and reviewers.
- Use `exec` when the refactor is sequential, tightly coupled, or safer in one session.
- Return to `clarify` or `spec` when the refactor plan exposes behavior, API, schema, compatibility, or architecture decisions.
- Do not send a complete refactor plan through `plan-to-exec` by default. Use `plan-to-exec` only if the refactor document is intentionally high-level and lacks execution-ready tiny commits.
