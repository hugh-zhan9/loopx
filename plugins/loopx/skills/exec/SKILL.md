---
name: exec
description: "Executes a written loopx implementation plan sequentially with review checkpoints. Not for unclear plans, missing requirements, or subagent-first execution."
when_to_use: "written implementation plan, inline execution, sequential plan execution, review checkpoints, no subagent lane"
metadata:
  version: "0.2.4"
---

# Exec

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the exec skill to implement this plan."

**Note:** If subagents are available and the tasks are independent, prefer loopx:subagent-exec instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with your human partner before starting
4. If no concerns: create update_plan and proceed

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the final-review skill to review the completed feature."
- **REQUIRED SUB-SKILL:** Use loopx:final-review
- If final-review finds Critical or Important issues, use loopx:fix-review to handle feedback before proceeding
- Announce: "I'm using the finish skill to complete this work."
- **REQUIRED SUB-SKILL:** Use loopx:finish
- Follow finish to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess

## Integration

**Required workflow skills:**
- **loopx:plan** - Creates the plan this skill executes
- **loopx:final-review** - Final whole-feature runtime and integration risk review
- **loopx:fix-review** - Handles final-review feedback before finish
- **loopx:finish** - Complete development after all tasks
