---
name: plan-to-exec
description: "Creates bite-sized implementation plans from approved requirements, clarify output, or design specs with exact files, tests, commands, expected output, and execution handoff. Not for unresolved requirements, design decisions, PRD generation, or code changes."
when_to_use: "plan-to-exec, plan, implementation plan, execution plan, task breakdown, approved requirements, approved design spec, docs/loopx/design, 实施计划, 执行计划, 任务拆分"
metadata:
  version: "0.3.20"
argument-hint: "<design spec path or feature name>"
---

# loopx Plan-To-Exec

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, and how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Plan-boundary commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

Use this skill after requirements are clear. The source may be:

- `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md`
- `.loopx/intake/YYYY-MM-DD-<slug>/` intake package directories
- legacy `.loopx/intake/clarify-*.md` clarify bundles
- an issue, PRD, or requirements document that already fixes material decisions

When the source is an intake package directory, read canonical `requirements.md` before planning. Use `clarification.md` only for supporting process evidence, exact user wording, and unresolved-history context.

## Repo Specs And Memory Context

Before using this skill in a repository, inspect loopx long-lived context when it exists:

- If `docs/loopx/specs/` exists, inspect the directory names and filenames. If `docs/loopx/specs/index.md` exists, use it as a map, but do not require it. Read only specs relevant to the requested domain, affected files, workflow behavior, or named source document.
- If `.loopx/memory/MEMORY.md` exists, read it as curated project memory before deciding what is already known.
- If `.loopx/memory/index.jsonl` exists, use it only as a retrieval index for relevant active memory cards; do not treat it as an append-only log.
- Treat current user instructions and the named source document as highest priority, `docs/loopx/specs/` as binding long-lived repo rules, and `.loopx/memory/` as advisory context. Priority order: current user instruction, source document, repo specs, memory. Memory is advisory and must not override current task instructions, approved source docs, or repo specs.

Do not read every file under `docs/loopx/specs/` by default. Prefer relevant specs selected by filename, title, frontmatter such as `applies_to`, or the files/domains involved in the task.

Do not re-decide product or architecture. If the source is incomplete, contradictory, or missing product behavior, API, data, state, permission, migration, compatibility, or architecture decisions, return to `clarify` or `spec` instead of filling those gaps inside `plan`.

The plan must preserve source `AC-*` anchors and cover source `TC-*` scenarios through tasks, verification commands, or deferred-with-rationale rows. For intake package sources, read both from canonical `requirements.md`. For design document sources, read the design document and preserve carried `D-*`, `AC-*`, and `TC-*` anchors from that document. For legacy clarify bundles or other approved source documents, preserve and cover generated requirement anchors from the source. It must not introduce uncovered product/API/data/permission behavior; add explicit rationale for non-product infrastructure, docs-only, test-only, or refactor-only work that has no direct anchor.

When a source design spec contains `D-*` design anchors or a `Design Contract Index / D-*` table, preserve those anchors in the plan. Each implementation-relevant `D-*` must map to at least one task, verification step, review focus, or deferred-with-rationale row. Task briefs should include `Design anchors: D-001, D-002` alongside `Source AC`. If a `D-*` anchor is missing, contradictory, or would require a new design decision to plan safely, return to `spec` instead of inventing the decision in the plan.

## Internal Plan Review

After drafting the complete plan and before saving the final plan or offering execution handoff, run the `plan-reviewer` support lens as a source-to-plan review gate.

Use a reviewer subagent when the platform supports subagents. Give the reviewer only the source artifact, the draft plan, relevant repo spec or memory context already selected for planning, and the `plan-reviewer` rubric. The reviewer must not inspect implementation code, because implementation has not started.

The reviewer is a leaf worker. Its worker-visible prompt must say: "Do not spawn, delegate to, or wait for other agents." Agent lifecycle remains owned by the top-level controller under `skills/shared/agent-topology.md`.

If subagents are unavailable, run the same `plan-reviewer` rubric in the current context. Mark this as degraded independence in the final plan or handoff:

```text
Plan review mode: same-context
Reviewer independence: degraded
Residual risk: source-to-plan coverage was not independently reviewed by a separate subagent
```

Critical or Important plan-review findings block final plan save and execution handoff. Revise the draft plan, then re-check the affected findings before continuing. Record the review evidence and recheck evidence in the final plan or handoff. If the finding exposes missing or contradictory source decisions, return to `clarify` or `spec` instead of inventing the decision in the plan.

Minor findings may remain only when they do not risk missed implementation, extra behavior, weak verification, or failed handoff; record the residual risk.

Optional scratch review artifacts may be written to `.loopx/plan-to-exec/<slug>-plan-review.md`. They are local workflow state and not repo-tracked docs by default.

## Task Anchor Contract

For new implementation plans, assign every implementation task a stable plan-local `T-*` task anchor such as `T-001`, `T-002`, and `T-003`. Use the heading format `### T-001 / Task 1: <task name>` so `T-*` is the stable downstream reference while `Task N` remains readable and compatible with numeric task selection.

`T-*` anchors are unique within one plan. If a plan is edited later, preserve existing `T-*` anchors and append new `T-*` anchors for inserted tasks instead of renumbering old anchors. Do not migrate historical `### Task N: ...` plans.

For multi-plan packages, each child plan may use plan-local `T-*` anchors starting at `T-001`. Cross-plan references must combine the child plan slug or path with the task anchor, such as `01-auth/T-001`, `01-auth::T-001`, or `docs/loopx/plans/YYYY-MM-DD-feature/01-auth.md#T-001`.

Every task must include `Review focus`. Use concrete bullets that tell reviewers which contract, behavior, surface, or regression risk to check. `Review focus: not_applicable` is allowed only with a concrete rationale such as docs-only wording, test-only coverage, or mechanical synchronization with no product behavior.

Every task must also include `Expected execution evidence`. This is the evidence contract consumed by `exec`, `subagent-exec`, and later by `review`: name the commands, report fields, artifacts, manual checks, or negative assertions that should prove the task completed its Source AC, Design anchors, and Test cases. Do not use `Expected execution evidence` to create new acceptance criteria or design decisions; it translates existing anchors into execution proof.

## Parallel Metadata
Every new plan emits `loopx-parallel-plan` and one `loopx-parallel-task` per task; packages also emit `loopx-parallel-package`. Required fields are `max_parallel`, `depends_on`, `write_scope`, `parallel_safe`, and `can_run_in_parallel`. `write_scope` equals `Create:` plus `Modify:` paths; `Test:` paths stay read-only. Resolve `../shared/scripts/parallel-plan-contract.mjs` from this skill root and validate before internal review. Current package execution stays strictly sequential, and `parallel-subagent-exec` remains manual-only, never an Execution strategy recommendation or handoff.

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
- Package execution handoff: list both `$subagent-exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md` and `$exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md`; apply the package's evidence-based Execution strategy instead of treating either executor as the default.
- Direct child plan execution is targeted/resume/manual-control mode only, such as `$subagent-exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/01-example.md`.
- Package mode executes child plans strictly sequentially even when `00-overview.md` says some child plans can run in parallel.
- Final gate: after each child plan, run plan-level `final-review` and update `.loopx/multi-plan/<feature-slug>/state.json` with `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review`; child plan-level review does not create a final-review report artifact. After all child plans are ready, package mode runs one spec-level `final-review`, then `finish`

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

## Execution Strategy Selection

Choose from the completed plan; subagent availability alone is not a reason to
prefer `subagent-exec`, and neither executor is recommended by default.

- Use `subagent-exec` only for stable, independently delegable tasks when fresh
  workers need little shared context and isolation plus review justify dispatch cost.
- Use `exec` for tightly coupled files or state, judgment that flows between
  tasks, continuous debugging, or tasks too small to repay worker orientation.
Record concrete rationale. Interfaces and evidence fields alone do not prove
independent delegation.

## Plan Boundary Commit Policy

New plans must not put `git add` or `git commit` inside individual task steps by default.
Task execution evidence proves task completion; Git commits are created only at the execution boundary.

- Single-plan execution: create one implementation commit after all tasks and required reviews pass.
- Multi-plan package execution: create one implementation commit after each child plan completes and its plan-level review passes.
- Direct child plan execution: create one implementation commit after that child plan completes and its plan-level review passes.

Do not use the Git index as a task boundary. Do not add historical-plan compatibility tasks.

## High-Risk Change Planning

For any removal or compatibility change, apply
[`references/surface-change-planning.md`](references/surface-change-planning.md).
The plan must contain a Surface Inventory, current-source caller proof, strict
current paths, historical-path exclusions, and exact negative assertions.

## Bite-Sized Task Granularity

Each step is one action, normally 2-5 minutes:

- "Write the failing test" is a step.
- "Run it to make sure it fails" is a step.
- "Implement the minimal code to make the test pass" is a step.
- "Run the tests and make sure they pass" is a step.
- "Record task evidence" is a step.
- Plan-boundary commit instructions belong in the execution handoff, not inside individual task steps.

## Plan Document Header

Every plan must start with this header:

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for independently delegable tasks or `loopx:exec` for tightly coupled or context-continuous work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** [Path to design, clarify bundle, issue, PRD, or requirements document]

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences summarizing the approved approach; do not introduce new design decisions]

**Tech Stack:** [Key technologies/libraries]

**Support lenses:** [Copy from source design: none, or exact skill names such as `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, `go-style`, `kratos`. Do not invent new lenses.]

**Execution strategy recommendation:** [`subagent-exec` | `exec`]

**Selection rationale:** [Concrete evidence from task coupling, shared context, write scopes, debugging continuity, and dispatch cost. Do not cite subagent availability alone.]

## Global Constraints

[Project-wide requirements copied exactly from the source: version floors,
dependency limits, naming/copy rules, platform requirements, compatibility
requirements, package contents, and exact values. Every task implicitly includes
this section.]

## Internal Plan Review

- Plan review mode: subagent | same-context
- Reviewer independence: independent | degraded
- Unresolved findings: none | <summary of unresolved findings, or none>
- Review evidence: <review report path, summary, or inline reviewer result>
- Recheck evidence: none | <fixed Critical/Important findings and re-check result>
- Residual risk: none | <concrete residual risk>

---
```

## Task Structure

````markdown
### T-001 / Task 1: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [inputs from previous tasks or existing code, with exact names/signatures]
- Produces: [outputs later tasks or callers rely on, with exact names/signatures]

**Traceability:**
- Source AC: [exact `AC-*` ids or `not_applicable` with rationale]
- Design anchors: [exact `D-*` ids, `not_applicable`, or `deferred-with-rationale`]
- Test cases: [exact `TC-*` ids, manual check, or deferred-with-rationale]
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: [exact commands the executor should run]
- `evidence_summary`: [what output, artifact, or manual observation should prove completion]
- `remaining_risk`: [expected residual risk, or `none`]

**Review focus:**
- Verify `T-001` implements the listed Source AC, Design anchors, and Test cases without extra behavior.
- Check downstream interfaces listed in `Produces` still match later task consumers.

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

- [ ] **Step 5: Record task evidence**

Record the task evidence fields expected by `exec` or `subagent-exec`:

```yaml
task_anchor: T-001
source_ac:
  - AC-001
design_anchors:
  - D-001
test_cases:
  - TC-001
commands_run:
  - pytest tests/path/test.py::test_name -v: PASS
evidence_summary: specific behavior is implemented and verified
remaining_risk: none
```
````

Docs-only, test-only, or mechanical synchronization tasks may replace the
bullet list form with `**Review focus:** not_applicable - <concrete rationale>`
when they have no product behavior or compatibility risk to inspect.

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
- DRY, YAGNI, TDD, plan-boundary commits
- Never require per-task commits or Git-index checkpoints unless a future approved design explicitly changes the commit policy.
- The approved design spec is binding; do not expand scope
- Preserve anchor coverage for every generated requirement anchor
- Preserve design anchor coverage for every `D-*` in the source design spec.
- Preserve task anchor coverage for every `T-*` generated by this plan.

## Self-Review

After writing the complete plan, look at the design spec with fresh eyes and check the plan against it. This is a checklist you run yourself, not a subagent dispatch.

1. **Spec coverage:** Skim each section/requirement in the design spec. Can you point to a task that implements it? List any gaps.
2. **Placeholder scan:** Search your plan for red flags from the "No Placeholders" section. Fix them.
3. **Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks?
4. **Design drift:** Did you introduce a new architecture, API, data model, or business behavior not present in the design spec? If yes, return to `spec`.
5. **Anchor coverage:** Does each generated requirement anchor and each `D-*` design anchor map to a task, verification step, review focus, or deferred-with-rationale row? If not, fix the plan before handoff.
6. **Task anchor coverage:** Does every implementation task have a unique plan-local `T-*`, a compatible `Task N` label, exact `AC-*`/`D-*`/`TC-*` traceability, and a `Review focus` field? If this is a multi-plan package, are cross-plan references qualified with the child plan slug or path?
7. **Surface-change coverage:** If this plan removes, replaces, narrows, migrates, or changes compatibility, does it include a Surface Inventory, Caller Proof commands, Negative Assertions, and package/deployment checks? If not, add them before handoff.
8. **Support lens coverage:** If the source design names support lenses, does each relevant task list them and include verification or review steps that exercise their discipline? If not, add them before handoff.
9. **Subagent handoff readiness:** Does every task brief carry enough Global Constraints, Interfaces, and Support lenses for an implementer and task reviewer who cannot see the rest of the plan?
10. **Test-case coverage:** Does each source `TC-*` map to a task verification step, integration/e2e/API/CLI/manual check, or deferred-with-rationale row?
11. **Internal plan review readiness:** Is the draft complete enough for `plan-reviewer` to audit source-to-plan coverage, and does the final plan record `Plan review mode`, `Reviewer independence`, `Unresolved findings`, and `Residual risk`?

If you find issues, fix them inline. If you find a design requirement with no task, add the task.

## STOP Conditions

Stop before saving or handing off the plan when:

- Critical or Important plan-review findings remain unresolved.
- Any source `AC-*`, `D-*`, or `TC-*` lacks task coverage, verification, review focus, or deferred-with-rationale treatment.
- The plan introduces product, API, data, permission, workflow, runtime, or compatibility behavior not present in the source.
- A task cannot be executed independently from its stated context, interfaces, support lenses, and expected evidence.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| Source lacks implementation-ready decisions | Return to `clarify` or `spec` with the missing decision list | Do not fill product or design gaps inside the plan |
| Internal review finds uncovered anchors | Revise the affected tasks and rerun the review gate | Do not offer execution choices until findings are closed |
| Multi-plan split creates cross-plan coupling | Add explicit Interfaces and overview coordination | Keep the coupled work in one child plan if isolation cannot be proven |

## Execution Handoff

Normative details:

- [`references/plan-schema.md`](references/plan-schema.md)
- [`references/internal-plan-review.md`](references/internal-plan-review.md)
- [`references/surface-change-planning.md`](references/surface-change-planning.md)

Do not offer execution choice until the internal plan review gate is complete and no Critical or Important findings remain unresolved.

After saving the plan, offer execution choice:

Commit policy for generated plans:

- Single-plan execution creates one implementation commit after all tasks and required reviews pass.
- Multi-plan package execution creates one implementation commit after each child plan completes and its plan-level review passes.
- Task-level reviews use task evidence and review packages; they do not require task-level commits or Git-index checkpoints.

For multi-plan packages, offer package mode as the primary handoff scope. Package mode accepts either the package directory or `00-overview.md`, executes child plans strictly sequentially, runs plan-level `final-review` after each child plan, updates `.loopx/multi-plan/<feature-slug>/state.json` with `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review`, then runs one spec-level `final-review` and enters `finish` only when the spec-level review is clean. Package mode does not make `subagent-exec` the default executor; use the recorded Execution strategy.

Direct numbered child plan execution remains available for targeted, resume, or manual-control runs. Do not present direct child plan execution as the primary handoff for a newly generated package.

```text
Plan complete and saved to `<plan path>`.

For this multi-plan package, use package mode:

Execution strategy recommendation: `<subagent-exec | exec>`
Selection rationale: `<concrete plan evidence>`

Subagent execution path:
$subagent-exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md

Inline execution path:
$exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md

Direct child plan execution is reserved for targeted/resume/manual-control runs:
$subagent-exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/01-example.md
$exec docs/loopx/plans/YYYY-MM-DD-<feature-slug>/01-example.md

Two execution options:

1. Subagent Exec - use for independently delegable tasks when context isolation and per-task review justify dispatch cost
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
```

If Subagent Exec is chosen:

- REQUIRED SUB-SKILL: Use `loopx:subagent-exec`
- Fresh subagent per task plus combined task review and final-review

If Inline Execution is chosen:

- REQUIRED SUB-SKILL: Use `loopx:exec`
- Batch execution with checkpoints for review
