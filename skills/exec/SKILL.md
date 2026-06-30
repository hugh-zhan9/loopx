---
name: exec
description: "Executes a written loopx implementation plan sequentially with spec verification, mandatory checkpoint reviews, and checkpoint-based resume. Not for unclear plans, missing requirements, or subagent-first execution."
when_to_use: "written implementation plan, inline execution, sequential plan execution, mandatory checkpoint review, no subagent lane"
metadata:
  version: "0.3.7"
---

# Exec

## Overview

Load plan, review critically, execute all tasks with spec verification and mandatory checkpoint reviews, report when complete.

**Announce at start:** "I'm using the exec skill to implement this plan."

**Note:** If subagents are available and the tasks are independent, prefer loopx:subagent-exec instead of this skill.

## The Process

### Step 1: Load and Review Plan

1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If the plan removes, replaces, narrows, migrates, or changes compatibility for existing behavior or public surface, verify that it includes a Surface Inventory, caller proof commands, negative assertion commands, strict current product paths, historical/frozen paths, and package/deploy/governance checks
4. If surface-change evidence is missing: stop before editing, classify this as a plan defect, and ask for a plan update
5. If other concerns exist: Raise them with your human partner before starting
6. If no concerns: create update_plan and proceed

### Step 1.5: Record Execution Range and Finish Baseline

Before implementation starts, record both requirement identity and finish audit baseline:

```bash
loopx execution-start <slug> --source <plan-path> [--design <design-path>]
loopx finish-start <slug> --source <plan-path>
```

`execution-start` records the requirement start commit and canonical final-review report identity. `finish-start` remains the committed audit baseline for `finish-audit`; do not merge these responsibilities.

Use the plan filename slug when no workflow slug is available.

### Step 2: Execute Tasks

For each task:

If the plan task heading contains a `T-*` task anchor such as `T-001 / Task 1`, preserve that anchor in `update_plan`, checkpoint rows, blocked escalation, and review requests. Historical plans without `T-*` continue to use `Task N`.

1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. **Spec check** — verify the implementation matches the task description (see Spec Verification below)
5. Record task completion evidence before marking a `T-*` task done. Task completion evidence fields are exactly:

```yaml
task_anchor: <T-* or Task N>
source_ac: <AC-* ids or not_applicable>
design_anchors: <D-* ids or not_applicable>
test_cases: <TC-* ids, manual checks, or deferred-with-rationale>
commands_run: <commands and outcomes>
evidence_summary: <short proof summary tied to Expected execution evidence>
remaining_risk: <none or concrete residual risk>
```

6. **Review checkpoint gate** — if this task hits a mandatory review checkpoint (see below), request `loopx:review` before continuing. Include the task completion evidence and review focus triggers.
7. If checkpoint review finds Critical or Important issues, fix them with `loopx:fix-review`, re-run focused verification, and re-run `loopx:review` for the task or changed range.
8. Mark as completed only after required checkpoint review for that task is clean or all Critical/Important feedback has been handled and rechecked. If no checkpoint is due, spec self-check plus verification is sufficient for this task.
9. **Checkpoint** — record progress (see Checkpoint/Resume below)

If the plan names `lancet` as a support lens, use `lancet` discipline before
editing each task: check deletion, repo reuse, stdlib, native platform, and
already-installed dependencies before adding new code, files, or dependencies.
Keep the smallest correct diff that still satisfies validation, error handling,
security, accessibility, and regression coverage.

### Mandatory Review Checkpoints

Use checkpoint reviews, not mandatory review after every task. Request `loopx:review` (Stage 1 spec compliance + Stage 2 code quality) when any checkpoint condition below applies. These checkpoints are mandatory, not suggestions. Inline execution may skip review for small mechanical tasks only when no checkpoint condition applies.

Checkpoint conditions:

- The completed task changes a public interface, exported type, or shared utility
- The completed task removes, replaces, narrows, migrates, or changes compatibility for existing behavior
- The completed task deletes modules, generated artifacts, templates, hooks, package entries, migrations, or installer/governance rules
- The completed task rewrites or deletes tests for existing behavior
- The completed task changes current public docs that describe product behavior
- The completed task touches 5+ files
- The completed task involves security-sensitive code (auth, permissions, crypto, user input)
- You have completed 3 consecutive tasks without a review
- The plan explicitly marks a task as a review checkpoint
- You are about to leave Step 2 because all tasks are implemented. Before announcing all tasks complete or starting `loopx:final-review`, run a final checkpoint `loopx:review` unless the latest clean checkpoint review already covers every change since the previous review.

When a checkpoint condition applies, call it out explicitly in the review request. When no checkpoint condition applies, spec self-check (Step 4) plus verification is sufficient; do not spend review tokens on every mechanical task.

Before announcing all tasks complete or starting `loopx:final-review`, run a final checkpoint `loopx:review` unless the latest clean checkpoint review already covers every change since the previous review. Before that final checkpoint, inspect both unstaged and staged changes with `git diff` and `git diff --cached` so the review request covers the actual implementation range.

The final checkpoint review is an implementation-stage code/spec checkpoint. It does not replace `loopx:final-review`, which still performs whole-feature integration, runtime, and test-gap review in Step 3.

**After review:** If review finds Critical or Important issues, fix them (use `loopx:fix-review`) before continuing to the next task.

Only mark the task complete and update the checkpoint after all required checkpoint review issues for that task are resolved.

### Checkpoint Review Questions

For plans with `T-*`, include the relevant task anchor in the review request so findings can reference it directly.

For checkpoint reviews, include the task text, changed files, test results, and the exact evidence commands you ran. The review handoff must preserve the task anchor, Source AC, Design anchors, Test cases, Expected execution evidence, and task completion evidence. For removal, replacement, compatibility, migration, package, installer, template, hook, or public-surface changes, the review must explicitly answer:

1. **Plan coverage:** Did this task implement every requested removal/addition/update and nothing extra?
2. **Negative surface:** Do removed commands, APIs, exports, fields, files, templates, docs claims, or package entries still exist in current product paths?
3. **Caller proof:** For every kept helper/module/template/migration path that the plan marked conditional, is there a retained current-source caller? Historical docs, release notes, old plans, and frozen external content do not count.
4. **Orphan scan:** Did the task leave source modules, tests, templates, generated artifacts, or docs that claim behavior no retained path produces?
5. **Governance/package/deploy:** Do package manifests, installer governance, generated file lists, hooks, CI, and release checks match the new surface?
6. **Current docs:** Do README/current specs/templates describe the new behavior without preserving stale instructions?

If any answer is unknown because evidence was not collected, collect the evidence before proceeding. Do not mark the task complete based only on passing happy-path tests.

### Step 3: Complete Development

After Step 2 is complete, including any required final checkpoint `loopx:review`, and all tasks are verified:
- Announce: "I'm using the final-review skill to review the completed feature."
- **REQUIRED SUB-SKILL:** Use loopx:final-review
- If final-review finds Critical or Important issues, use loopx:fix-review to handle feedback before proceeding
- Only start `loopx:finish` after `loopx:final-review` is clean or all Critical/Important feedback has been handled and rechecked.
- Announce: "I'm using the finish skill to complete this work."
- **REQUIRED SUB-SKILL:** Use loopx:finish
- Follow finish to verify tests, present options, execute choice

## Spec Verification

After each task completes, perform a lightweight spec compliance check before proceeding to the next task. This prevents drift accumulation.

**Self-check questions:**

1. Did I implement everything the task description requested? (nothing missing)
2. Did I implement anything NOT requested by the task? (nothing extra)
3. Does my implementation match the plan's intent, not just the literal words?
4. If I deviated from the plan, is it a justified improvement or an accidental departure?
5. Do the outputs of this task match what the next task expects as input?
6. If this task removed or narrowed behavior, did I prove the old surface is absent with negative assertions?
7. If this task kept a conditional helper/module/template, did I prove a retained caller still consumes it?

**When spec check fails:**

- If missing: implement the missing piece before marking complete
- If extra: remove or flag for plan update discussion
- If deviation: document why, continue if improvement, revert if accidental

**Verification depth by task type:**

| Task Type | Spec Check |
|-----------|-----------|
| Mechanical (isolated file, clear spec) | Quick self-check (30 seconds) |
| Integration (multi-file, cross-module) | Careful comparison against plan + downstream task inputs |
| Architecture (design decisions, patterns) | Full plan re-read for this section, check consistency with other tasks |

## Checkpoint/Resume

Track execution progress so that if the session is interrupted (context exhaustion, crash, user pause), work can resume from the last completed task.

### Checkpoint file location

Store the checkpoint in a sibling file next to the plan:

```
docs/loopx/plans/<slug>-checkpoint.md
```

If the plan is at `docs/loopx/plans/feature-plan.md`, the checkpoint is at `docs/loopx/plans/feature-plan-checkpoint.md`.

### Checkpoint format

After each task is marked complete, write or update the checkpoint file:

```markdown
# Execution Checkpoint

- Plan: docs/loopx/plans/<slug>.md
- Baseline SHA: <finish-start SHA>
- Current SHA: <latest commit>
- Last updated: YYYY-MM-DD

## Progress

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| T-001 / Task 1 | completed | abc1234 | |
| T-002 / Task 2 | completed | def5678 | review requested after this task |
| T-003 / Task 3 | in_progress | - | blocked: missing API key config |
| T-004 / Task 4 | pending | - | |
| T-005 / Task 5 | pending | - | |

## Context for Resume

- Last completed task produced: [key outputs, new files, changed interfaces]
- Last completed task evidence: [task_anchor, source_ac, design_anchors, test_cases, commands_run, evidence_summary, remaining_risk]
- Next task depends on: [any context from prior tasks]
- Open issues: [any unresolved review feedback or known concerns]
```

### How to resume

When resuming an interrupted execution:

1. Read the plan file and checkpoint file
2. Verify completed tasks are still committed and passing tests
3. Read the "Context for Resume" section to establish state
4. Continue from the next uncompleted task
5. Do NOT re-execute completed tasks unless tests are failing

### When to update the checkpoint

- After each task completion
- After fixing a review issue
- When status changes (e.g., task becomes blocked)
- Before any risky operation (migration, large refactor)

If a checkpoint review sends a task back for fixes, update the checkpoint to reflect that the task is still `in_progress` or `blocked`. Do not leave a reviewed-and-rejected task recorded as completed.

## Blocker Escalation

When execution is blocked, classify the blocker and take the appropriate action:

### Blocker Levels

| Level | Signal | Action |
|-------|--------|--------|
| **Context gap** | Need information not in the plan (file path, config value, API detail) | Search codebase, check docs. If still unclear: ask human with specific question |
| **Plan defect** | Plan step is wrong, contradictory, or impossible given current codebase state | Stop. Report what's wrong and what you expected. Propose fix. Wait for plan update |
| **Dependency missing** | Requires something that doesn't exist yet (another task's output, external service, package) | Check if it's a task ordering issue (can re-order). If not: report dependency and block |
| **Test failure** | Verification fails despite correct implementation | Investigate root cause. If test is wrong: fix test. If implementation is wrong: fix implementation. If unclear: ask with diagnosis |
| **Environment issue** | Build fails, dependency can't install, tool unavailable | Report exact error. Do not retry blindly. Ask if environment fix is needed |

### Escalation format

When stopping to ask for help:

```markdown
## Blocked: [task anchor or task number and name]

**Blocker type:** [context gap / plan defect / dependency / test failure / environment]

**What happened:** [specific error or confusion]

**What I tried:** [what you investigated before asking]

**What I need:** [specific question or decision]

**Impact:** [what downstream tasks are affected]
```

### Do NOT:

- Retry the same failing approach hoping it works
- Guess at unclear requirements and hope you're right
- Skip a blocked task and continue with dependent tasks
- Spend more than 5 minutes investigating before asking

## Cross-Task Context

When starting a new task, briefly review:

1. What the previous task produced (new files, changed interfaces, new exports)
2. Whether the current task references anything from previous tasks
3. Whether any review feedback from previous tasks affects this task

If a previous task's review changed a public interface that this task uses, adapt before implementing.

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (use escalation format above)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly (>2 attempts)
- A review issue suggests the plan itself is wrong

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking
- Blocker reveals plan is structurally wrong

**Don't force through blockers** - stop and ask.

## Remember

- Review plan critically first
- Follow plan steps exactly
- Spec-check after every task
- Request `loopx:review` whenever a mandatory review checkpoint applies
- Checkpoint after every task
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Classify blockers, don't just say "stuck"

## Integration

**Required workflow skills:**
- **loopx:plan-to-exec** - Creates the plan this skill executes
- **loopx:review** - Required at mandatory checkpoint reviews, including before leaving Step 2 unless the latest clean checkpoint review already covers all changes
- **loopx:final-review** - Final whole-feature runtime and integration risk review
- **loopx:fix-review** - Handles checkpoint review or final-review feedback before finish
- **loopx:finish** - Complete development after all tasks
