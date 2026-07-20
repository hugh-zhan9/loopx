# <Topic> Refactor Plan

> **For agentic workers:** This document is both the refactor RFC and the execution plan. Execute only if the Behavior Preservation Contract, Tiny Commits, Verification Plan, and Execution Handoff are complete.

**Source:** <user request, discussion, issue, code smell report, or existing document>

**Goal:** <one sentence describing the structure improvement>

**Refactor Type:** <extract method | split module | move responsibility | remove duplication | rename | delete dead code | other>

**Behavior Change:** None intended. If behavior change is required, stop and route to `clarify` or `spec`.

**Baseline:** <branch/commit, worktree state, relevant tests, current behavior evidence>

---

## Problem Statement

Describe the maintainability, evolvability, testability, or comprehension problem. Include repo evidence such as files, call sites, test gaps, repeated code, confusing ownership, or code smells.

## Current Behavior Evidence

List the evidence that defines current externally observable behavior:

- Existing tests:
- Manual reproduction or command output:
- Public callers, commands, APIs, schemas, config, docs, or generated artifacts:
- Important edge cases:

## Behavior Preservation Contract

- Externally observable behavior that must not change:
- Public surfaces that must remain stable:
- Existing callers or workflows that must keep working:
- Data, config, schema, CLI/API, package, or generated artifact compatibility requirements:
- Characterization tests to add before refactoring:

## Scope Boundaries

### In Scope

- Files/modules/responsibilities to refactor:
- Allowed internal seams:
- Test files that may be added or updated:

### Out Of Scope

- Behavior changes:
- Public API/schema/config/permission/migration changes:
- Broad rewrites:
- Unrelated cleanup:
- Deferred smells:

## Stop Conditions

Stop execution and return for clarification or design if:

- A commit requires files or surfaces outside the approved scope.
- A test failure suggests behavior changed.
- A public contract, schema, CLI/API behavior, permission rule, config key, package surface, or generated artifact must change.
- Characterization tests cannot be written or run.
- The refactor requires a larger redesign than this plan approved.

## Refactor Strategy

Explain the chosen path and why it is behavior-preserving. Include alternatives considered and why they were rejected.

## File And Surface Inventory

| Path / Surface | Current Responsibility | Planned Change | Public? | Verification |
|---|---|---|---:|---|
| `<path>` | <current role> | <move/extract/rename/delete/leave unchanged> | yes/no | <command/check> |

## Testing Decisions

- Existing tests that protect current behavior:
- Characterization tests to add before structural edits:
- Tests that must not be weakened because they represent external behavior:
- Test anti-patterns to avoid:

## Tiny Commits

Each commit must leave the codebase working and behavior-preserving. Use exact file paths, commands, and expected outputs.

### Commit 1: <small refactor action>

**Intent:** <why this step exists>

**Behavior preserved:** <specific behavior or public surface that remains unchanged>

**Files:**

- Create: `<exact/path>`
- Modify: `<exact/path>`
- Delete: `<exact/path>`

**Interfaces:**

- Consumes: <existing functions/types/modules/files, exact names when known>
- Produces: <same public behavior, renamed internal helper, extracted private module, etc.>

**Refactoring technique:** <Fowler technique or simple mechanical operation>

**Steps:**

- [ ] Step 1: <small action>
- [ ] Step 2: <small action>
- [ ] Step 3: <small action>

**Verification command:**

```bash
<exact command>
```

**Expected result:** <exact pass/fail expectation or output pattern>

**Rollback note:** <how to revert this commit or what to undo>

### Commit 2: <small refactor action>

Repeat the same structure. Do not combine unrelated refactorings in one commit.

## Verification Plan

### Baseline

```bash
<commands to run before any refactor>
```

Expected:

- <expected output>

### Per Commit

| Commit | Command | Expected Result |
|---|---|---|
| 1 | `<command>` | <expected result> |

### Final

```bash
<final verification commands>
```

Expected:

- <expected output>

## Rollback Plan

- Commit-level rollback:
- Full refactor rollback:
- How to detect that rollback is needed:
- Files or generated artifacts to restore or regenerate:

## Risk Assessment

| Risk | Severity | Mitigation | Stop Condition |
|---|---|---|---|
| <risk> | low/medium/high | <mitigation> | <when to stop> |

## Execution Handoff

**Ready for:** `exec` | `clarify` | `spec` | `blocked`

**Reason:**

**Required sub-skills:** `tdd` | `go-style` | `sql-style` | `review` | `verify` | none

**Execution notes:**

- Use `exec` for sequential or tightly coupled refactors.
- Let `exec` decide whether independent tasks admit isolated concurrency.
- Use `plan` only when this document is intentionally high-level and missing an execution-ready lean plan.

## Further Notes

Optional context that does not belong in the execution path.
