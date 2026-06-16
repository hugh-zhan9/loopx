---
name: review
description: "Dispatches a loopx code reviewer subagent against a concrete git range and requirements with spec compliance and code quality stages. Not for implementation, planning, or unresolved review scope."
when_to_use: "request code review, completed task review, major feature review, pre-merge review, subagent code quality check, spec compliance check"
metadata:
  version: "0.3.1"
---

# Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review early, review often. Check spec compliance first, then code quality.

## When to Request Review

**Mandatory:**
- After each task in subagent-exec
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## Review Stages

Review has two stages. Run them in order. Do not skip stage 1.

### Stage 1: Spec Compliance

**Purpose:** Verify the implementation matches the plan/requirements — nothing missing, nothing extra.

**When to use:** After every task completion where a plan, spec, or task description exists.

**When to degrade:** If there is no formal plan or spec (ad-hoc fix, exploratory change, external PR), degrade Stage 1 to an **intent check**:

- Compare against: commit message, PR description, issue description, or the user's original request
- Only check: "does the change do what it claims to do?" and "does it introduce unrelated changes?"
- Skip: detailed spec-line-by-line comparison (there is no spec to compare against)

**Dispatch spec compliance reviewer:**

Use the platform's native subagent mechanism when available and fill template at `spec-reviewer-prompt.md` (in the subagent-exec directory), or use this inline check:

```
Spec Compliance Check:
- Task requirements: {PLAN_OR_REQUIREMENTS}
- Implementation summary: {WHAT_WAS_BUILT}

Verify:
1. Everything requested is implemented (nothing missing)
2. Nothing unrequested was added (nothing extra)
3. Intent matches, not just literal words
4. Outputs match what downstream tasks expect
```

**Intent Check (degraded, no formal spec):**

```
Intent Check:
- Stated intent: {COMMIT_MESSAGE_OR_PR_DESCRIPTION}
- Implementation summary: {WHAT_WAS_BUILT}

Verify:
1. The change does what it claims
2. No unrelated changes bundled in
3. Scope is proportional to the stated intent
```

**If spec check fails:** Fix gaps before proceeding to Stage 2.

### Stage 2: Code Quality

**Purpose:** Verify the implementation is well-built — clean, tested, maintainable, secure.

**When to use:** After spec compliance passes. Never run code quality review on code that doesn't match spec — you'll review code that gets rewritten.

**Dispatch code quality reviewer:**

Use the platform's native subagent mechanism when available and fill template at `code-reviewer.md`.

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit

### Stage 3 (Optional): Impact Scan

**Purpose:** Check whether changes affect other modules, callers, or shared interfaces.

**When to use:** When the change touches public interfaces, shared utilities, exported types, database schemas, or API contracts.

**Impact scan checklist:**

```markdown
## Impact Scan

### Changed Public Interfaces
| File | Interface/Export | Change Type | Callers Affected |
|------|----------------|-------------|------------------|

### Regression Risk
- [ ] All callers of changed interfaces still compile/pass
- [ ] No behavioral change to existing functionality (unless intended)
- [ ] Schema changes are backward compatible (or migration exists)
- [ ] API changes are backward compatible (or version bump exists)

### Skip Impact Scan When:
- Changes are purely internal (no public interface change)
- New code only (no existing callers)
- Test-only changes
```

## How to Get Git SHAs

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main, or last task commit
HEAD_SHA=$(git rev-parse HEAD)
```

## Acting on Feedback

**Priority order:**
1. Fix Critical issues immediately
2. Fix Important issues before proceeding
3. Note Minor issues for later (or fix if quick)
4. Push back if reviewer is wrong (with reasoning)

**After fixing:** Re-request the relevant review stage to confirm the fix.

## Review Depth

Not every review needs the same depth. Match depth to risk:

| Context | Stages | Depth |
|---------|--------|-------|
| Small isolated task, clear spec | Stage 1 (quick) + Stage 2 | Light |
| Multi-file change, integration points | Stage 1 + Stage 2 + Stage 3 | Standard |
| Architecture change, public API, security-sensitive | Stage 1 + Stage 2 + Stage 3 (full) | Deep |

## Optional: Health Score

For ongoing quality tracking, the code quality reviewer can assign a health score:

```markdown
## Code Health Score

| Dimension | Score (1-5) |
|-----------|------------|
| Correctness | |
| Test coverage | |
| Error handling | |
| Readability | |
| Architecture fit | |
| **Average** | |
```

- 4.5-5.0: Excellent — merge confidently
- 3.5-4.4: Good — merge with noted improvements
- 2.5-3.4: Acceptable — fix Important issues first
- < 2.5: Needs work — do not proceed

This score is informational. The Critical/Important/Minor severity system still governs action.

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

--- Stage 1: Spec Compliance ---
Task requirements: "Add verifyIndex() that checks 4 issue types and returns report"
Implementation: verifyIndex() checks 4 types, returns structured report, added repairIndex()

Spec reviewer: ❌ Extra: repairIndex() not in spec. Missing: report format doesn't match spec.

[Fix: remove repairIndex(), align report format]

--- Stage 1 retry ---
Spec reviewer: ✅ Spec compliant

--- Stage 2: Code Quality ---
BASE_SHA=a7981ec HEAD_SHA=3df7661

Code reviewer:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed with fix
  Health Score: 4.2/5

[Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent Exec:**
- Both stages run automatically per task (spec → quality)
- Uses dedicated prompt templates

**Exec:**
- Self-check spec compliance after each task
- Request full code quality review at natural checkpoints
- Impact scan when touching shared code

**Ad-Hoc Development:**
- Review before merge (both stages)
- Review when stuck (Stage 2 only, for fresh perspective)

## Red Flags

**Never:**
- Skip spec compliance ("it's obviously right")
- Run code quality review before spec compliance passes
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback without evidence

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See templates at:
- `review/code-reviewer.md` — code quality review prompt
- `subagent-exec/spec-reviewer-prompt.md` — spec compliance review prompt
