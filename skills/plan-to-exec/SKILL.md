---
name: plan-to-exec
description: "Creates bite-sized implementation plans from approved requirements, clarify output, or design specs with exact files, tests, commands, expected output, and execution handoff. Not for unresolved requirements, design decisions, PRD generation, or code changes."
when_to_use: "plan-to-exec, plan, implementation plan, execution plan, task breakdown, approved requirements, approved design spec, docs/loopx/design, 实施计划, 执行计划, 任务拆分"
metadata:
  version: "0.3.6"
argument-hint: "<design spec path or feature name>"
---

# loopx Plan-To-Exec

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, and how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

Use this skill after requirements are clear. The source may be:

- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`
- `.loopx/intake/clarify-<slug>-YYYY-MM-DD.md`
- an issue, PRD, or requirements document that already fixes material decisions

## Repo Specs And Memory Context

Before using this skill in a repository, inspect loopx long-lived context when it exists:

- If `docs/loopx/specs/` exists, inspect the directory names and filenames. If `docs/loopx/specs/index.md` exists, use it as a map, but do not require it. Read only specs relevant to the requested domain, affected files, workflow behavior, or named source document.
- If `.loopx/memory/MEMORY.md` exists, read it as curated project memory before deciding what is already known.
- If `.loopx/memory/index.jsonl` exists, use it only as a retrieval index for relevant active memory cards; do not treat it as an append-only log.
- Treat current user instructions and the named source document as highest priority, `docs/loopx/specs/` as binding long-lived repo rules, and `.loopx/memory/` as advisory context. Priority order: current user instruction, source document, repo specs, memory. Memory is advisory and must not override current task instructions, approved source docs, or repo specs.

Do not read every file under `docs/loopx/specs/` by default. Prefer relevant specs selected by filename, title, frontmatter such as `applies_to`, or the files/domains involved in the task.

Do not re-decide product or architecture. If the source is incomplete, contradictory, or missing product behavior, API, data, state, permission, migration, compatibility, or architecture decisions, return to `clarify` or `spec` instead of filling those gaps inside `plan`.

The plan must preserve and cover generated requirement anchors from `clarify` output or `spec` source documents. It must not introduce uncovered product/API/data/permission behavior; add explicit rationale for non-product infrastructure, docs-only, test-only, or refactor-only work that has no direct anchor.

**Announce at start:** "I'm using the plan-to-exec skill to create the implementation plan."

**Save plans to:**

- Single plan: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`
- Multiple plans from one source: `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`
  - `00-overview.md`
  - `01-<plan-slug>.md`
  - `02-<plan-slug>.md`

- User preferences for plan location override this default.

## Scope Check

If the design spec covers multiple independent subsystems, it should have been broken into sub-project specs before planning. If it wasn't, suggest breaking this into separate plans: one per subsystem. Each plan should produce working, testable software on its own.

When one source artifact needs multiple implementation plans, create the plan directory up front instead of writing sibling files at `docs/loopx/plans/`. Use the directory name to preserve the source date and feature slug. Write `00-overview.md` with the source path, split rationale, execution order, dependencies between plans, and which plans can run in parallel. Each numbered child plan must still be a complete executable plan with its own Source, Goal, Global Constraints, tasks, tests, and execution handoff. If the source produces exactly one executable plan, use the single-file path and do not create a directory.

For a multi-plan package, `00-overview.md` must include:

- Source spec path
- Package slug and local state path: `.loopx/multi-plan/<feature-slug>/state.json`
- Child plan list with each `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md`
- Split rationale for each child plan
- Execution order and dependencies
- Which child plans can run in parallel
- Final gate: every child plan needs plan-level `final-review`; the package needs one spec-level `final-review`; only then may `finish` run

Each child plan remains independently executable and must not assume the agent can see sibling child plans except through explicit Interfaces and `00-overview.md`.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- Prefer smaller, focused files over large files that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure. If a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Implementation Support Lenses

When the source design or repo rules require `lancet`, record it in Support
lenses and remind implementers that lancet activates at implementation time; do
not collapse planning-stage analysis into implementation shortcuts. Planning
still owns complete requirements, interfaces, tests, and surface-change evidence.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. Fold setup, configuration, scaffolding, and documentation
into the task whose deliverable needs them. Split only where a reviewer could
meaningfully reject one task while approving its neighbor.

## High-Risk Change Planning

Use this section for any plan that removes, replaces, narrows, migrates, or changes compatibility for an existing behavior or public surface. This is not project-specific; it applies to CLI commands, APIs, schemas, events, config, package contents, templates, generated artifacts, docs, hooks, background jobs, permissions, migrations, and user-visible workflows.

For these plans, add an explicit **Surface Inventory** before the task list:

```markdown
## Surface Inventory

- Public commands/API/routes/events/config:
- Exported functions/types/modules:
- Runtime/generated artifacts and templates:
- Installer/package/deployment surface:
- Hooks/background jobs/automation:
- Current product docs:
- Tests/governance checks:
- Compatibility/migration paths:
```

For every item that might be kept, moved, or deleted, include a **Caller Proof** command and a decision rule:

```bash
rg "symbolOrFilename|old-command|old-field" src scripts test package.json README.md docs
```

Decision rule:

- retained caller exists in current source/runtime code -> keep it and name the caller in the plan
- only historical docs, release notes, old plans, or frozen external content reference it -> do not count that as a retained caller
- no retained caller -> delete it or remove it from current governance/package/docs

For removal or compatibility-ending work, add **Negative Assertions** with exact commands and expected output. Examples:

```bash
test ! -e path/to/deleted-file
! rg "removedSymbol|removedCommand|removedField" src scripts test package.json
! rg "removed public text" README.md docs/current-product-specs
npm pack --dry-run
```

State which paths are strict current product surface and which paths are historical context. Historical paths may mention removed behavior; strict paths must not unless the new behavior explicitly requires it.

If a plan rewrites or deletes tests, include a task that proves the new tests still guard against old behavior returning. A passing happy-path test is not enough for removal work.

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

**Support lenses:** [Copy from source design: none, or exact skill names such as `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, `go-style`, `kratos`. Do not invent new lenses.]

## Global Constraints

[Project-wide requirements copied exactly from the source: version floors,
dependency limits, naming/copy rules, platform requirements, compatibility
requirements, package contents, and exact values. Every task implicitly includes
this section.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [inputs from previous tasks or existing code, with exact names/signatures]
- Produces: [outputs later tasks or callers rely on, with exact names/signatures]

**Support lenses:** [none, or the subset of source support lenses this task must apply]

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
- Global Constraints that paraphrase exact source values instead of copying them
- Interfaces blocks that omit exact names, signatures, paths, file formats, CLI flags, or return values later tasks depend on
- Omitting Support lenses when the source design names `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, `go-style`, or `kratos`

## Remember

- Exact file paths always
- Complete code in every step when a step changes code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits
- The approved design spec is binding; do not expand scope
- Preserve anchor coverage for every generated requirement anchor

## Self-Review

After writing the complete plan, look at the design spec with fresh eyes and check the plan against it. This is a checklist you run yourself, not a subagent dispatch.

1. **Spec coverage:** Skim each section/requirement in the design spec. Can you point to a task that implements it? List any gaps.
2. **Placeholder scan:** Search your plan for red flags from the "No Placeholders" section. Fix them.
3. **Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks?
4. **Design drift:** Did you introduce a new architecture, API, data model, or business behavior not present in the design spec? If yes, return to `spec`.
5. **Anchor coverage:** Does each generated requirement anchor map to a task, verification step, or deferred-with-rationale row? If not, fix the plan before handoff.
6. **Surface-change coverage:** If this plan removes, replaces, narrows, migrates, or changes compatibility, does it include a Surface Inventory, Caller Proof commands, Negative Assertions, and package/deployment checks? If not, add them before handoff.
7. **Support lens coverage:** If the source design names support lenses, does each relevant task list them and include verification or review steps that exercise their discipline? If not, add them before handoff.
8. **Subagent handoff readiness:** Does every task brief carry enough Global Constraints, Interfaces, and Support lenses for an implementer and task reviewer who cannot see the rest of the plan?

If you find issues, fix them inline. If you find a design requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

For multi-plan packages, offer execution per child plan. Do not ask one agent to execute the whole directory in a single run. After each child plan, run plan-level `final-review` and update `.loopx/multi-plan/<feature-slug>/state.json`. After all child plans are ready, run one spec-level `final-review`, then `finish`.

```text
Plan complete and saved to `<plan path>`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
```

If Subagent Exec is chosen:

- REQUIRED SUB-SKILL: Use `loopx:subagent-exec`
- Fresh subagent per task plus combined task review and final-review

If Inline Execution is chosen:

- REQUIRED SUB-SKILL: Use `loopx:exec`
- Batch execution with checkpoints for review
