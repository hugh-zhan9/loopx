---
name: debug
description: "Applies root-cause diagnosis when explicitly invoked or activated by an issue or implementation workflow for a bug, failing test, build failure, regression, or unexpected behavior. Not for automatic routing of ordinary prompt-first defects, new feature planning, routine code review, or unauthorized fixes."
when_to_use: "explicit debug invocation, issue workflow diagnosis, owning implementation workflow requests root-cause investigation, regression or failure diagnosis, 根因排查"
metadata:
  version: "0.3.6"
---

# Systematic Debugging

The canonical output is [`references/diagnosis-contract.md`](references/diagnosis-contract.md).
When used by `issue`, diagnose and hand off; do not make lasting code changes.

## Overview

Random fixes waste time and create new bugs; quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure. **Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Once explicitly invoked or activated by an owning workflow, use for technical
issues: test failures, production bugs, unexpected behavior, performance
problems, build failures, integration issues.

**Use this ESPECIALLY when:** under time pressure, "just one quick fix" seems
obvious, you've already tried multiple fixes, the previous fix didn't work, or
you don't fully understand the issue. **Don't skip when** the issue seems
simple, you're in a hurry, or someone wants it fixed NOW — simple bugs have
root causes too, and systematic debugging is faster than guess-and-check
thrashing.

## The Four Phases

You MUST complete each phase before proceeding to the next. Read
[references/four-phases.md](references/four-phases.md) for the full process,
including safe diagnostic instrumentation for multi-component systems and your
human partner's course-correction signals.

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors completely, reproduce consistently, check recent changes, gather boundary evidence, trace data flow to the source (`root-cause-tracing.md`) | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, read reference implementations completely, list every difference, understand dependencies | Identify differences |
| **3. Hypothesis** | Form one specific hypothesis, test with the smallest change, one variable at a time; say "I don't know" instead of pretending | Confirmed or new hypothesis |
| **4. Implementation** | Failing test first (`tdd` skill), single root-cause fix, verify; no bundled changes | Bug resolved, tests pass |

Phase 4 is an optional implementation handoff: run it only when the user
explicitly requested a fix. Diagnosis-only calls stop after recording the
diagnosis contract.

**If a fix doesn't work:** STOP. Fewer than 3 attempts → return to Phase 1 and
re-analyze with the new information. **3+ failed fixes → question the
architecture with your human partner before attempting more fixes.** Each fix
revealing a new problem elsewhere is a wrong-architecture signal, not a failed
hypothesis.

## Red Flags - STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals new problem in different place**

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes failed:** Question the architecture (see The Four Phases above)

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |

## Diagnosis Summary Contract

When `debug` is used directly or inside the `issue` workflow, end diagnosis with a structured summary. The issue workflow consumes this contract when writing `.loopx/issues/*.md` ledgers.

```yaml
diagnosis:
  classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info
  reproduction_status: reproduced | intermittent | not_reproduced | not_attempted
  evidence:
    - type: command | log | steps | code | user_report
      value: ...
  root_cause_status: confirmed | likely | unknown
  root_cause: ...
  hypotheses_rejected:
    - ...
  fix_mode: root_cause_fix | defensive_fix | blocked | no_fix_needed
  regression_test_required: true | false
  regression_test_exception_reason: ...
  risk_triggers:
    - no_repro
    - defensive_fix
    - public_surface
    - scope_unclear
```

The field rules (what `confirmed`, `not_reproduced`, `defensive_fix`, `regression_test_required: false`,
and `needs_info` each require) live in [`references/diagnosis-contract.md`](references/diagnosis-contract.md).

## When Process Reveals "No Root Cause"

If systematic investigation reveals the issue is truly environmental,
timing-dependent, or external, remain in diagnosis unless the user explicitly
requested a fix:

1. You've completed the process
2. Document what you investigated
3. Record retry, timeout, error-message, or monitoring options as diagnosis
   findings; do not implement them from a diagnosis-only call
4. If the user explicitly requested a fix, hand off the approved option through
   the issue/fix contract before changing code

**But:** 95% of "no root cause" cases are incomplete investigation.

## Supporting Techniques

These techniques are part of systematic debugging and available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through call stack to find original trigger
- **`defense-in-depth.md`** - Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling

**Related skills:**
- **tdd** - For creating failing test case (Phase 4, Step 1)
- **verify** - Verify fix worked before claiming success
