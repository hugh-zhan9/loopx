---
name: plan-to-exec
description: "Creates bite-sized implementation plans from approved requirements, clarify output, or design specs with exact files, tests, commands, expected output, and execution handoff. Not for unresolved requirements, design decisions, PRD generation, or code changes."
when_to_use: "plan-to-exec, plan, implementation plan, execution plan, task breakdown, approved requirements, approved design spec, docs/loopx/design, 实施计划, 执行计划, 任务拆分"
metadata:
  version: "0.3.0"
argument-hint: "<design spec path or feature name>"
---

# loopx Plan-To-Exec

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, and how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

Use this skill after requirements are clear. The source may be:

- `docs/loopx/design/<需求名>需求设计文档.md`
- `.loopx/intake/clarify-<slug>-<timestamp>.md`
- an issue, PRD, or requirements document that already fixes material decisions

## Repo Specs And Memory Context

Before using this skill in a repository, inspect loopx long-lived context when it exists:

- If `docs/loopx/specs/` exists, inspect the directory names and filenames. If `docs/loopx/specs/index.md` exists, use it as a map, but do not require it. Read only specs relevant to the requested domain, affected files, workflow behavior, or named source document.
- If `.loopx/memory/MEMORY.md` exists, read it as curated project memory before deciding what is already known.
- If `.loopx/memory/index.jsonl` exists, use it only as a retrieval index for relevant active memory cards; do not treat it as an append-only log.
- Treat current user instructions and the named source document as highest priority, `docs/loopx/specs/` as binding long-lived repo rules, and `.loopx/memory/` as advisory context. Memory is advisory and must not override current task instructions, approved source docs, or repo specs.

Do not read every file under `docs/loopx/specs/` by default. Prefer relevant specs selected by filename, title, frontmatter such as `applies_to`, or the files/domains involved in the task.

Do not re-decide product or architecture. If the source is incomplete, contradictory, or missing product behavior, API, data, state, permission, migration, compatibility, or architecture decisions, return to `clarify` or `spec` instead of filling those gaps inside `plan`.

**Announce at start:** "I'm using the plan-to-exec skill to create the implementation plan."

**Save plans to:** `docs/loopx/plans/YYYY-MM-DD-<feature-name>.md`

- User preferences for plan location override this default.

## Scope Check

If the design spec covers multiple independent subsystems, it should have been broken into sub-project specs before planning. If it wasn't, suggest breaking this into separate plans: one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- Prefer smaller, focused files over large files that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure. If a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

Each step is one action, normally 2-5 minutes:

- "Write the failing test" is a step.
- "Run it to make sure it fails" is a step.
- "Implement the minimal code to make the test pass" is a step.
- "Run the tests and make sure they pass" is a step.
- "Commit" is a step.

## Plan Document Header

Every plan must start with this header:

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** [Path to design, clarify bundle, issue, PRD, or requirements document]

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences summarizing the approved approach; do not introduce new design decisions]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are plan failures; never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" without actual test code
- "Similar to Task N"; repeat the code because the engineer may be reading tasks out of order
- Steps that describe what to do without showing how when code is required
- References to types, functions, or methods not defined in any task

## Remember

- Exact file paths always
- Complete code in every step when a step changes code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits
- The approved design spec is binding; do not expand scope

## Self-Review

After writing the complete plan, look at the design spec with fresh eyes and check the plan against it. This is a checklist you run yourself, not a subagent dispatch.

1. **Spec coverage:** Skim each section/requirement in the design spec. Can you point to a task that implements it? List any gaps.
2. **Placeholder scan:** Search your plan for red flags from the "No Placeholders" section. Fix them.
3. **Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks?
4. **Design drift:** Did you introduce a new architecture, API, data model, or business behavior not present in the design spec? If yes, return to `spec`.

If you find issues, fix them inline. If you find a design requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

```text
Plan complete and saved to `docs/loopx/plans/<filename>.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
```

If Subagent Exec is chosen:

- REQUIRED SUB-SKILL: Use `loopx:subagent-exec`
- Fresh subagent per task plus two-stage review

If Inline Execution is chosen:

- REQUIRED SUB-SKILL: Use `loopx:exec`
- Batch execution with checkpoints for review
