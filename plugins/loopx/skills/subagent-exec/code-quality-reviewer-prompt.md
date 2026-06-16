# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**

This reviewer is the `loopx:review` Stage 2 code quality review running inside
the `subagent-exec` workflow. The source of truth for review standards and
output format is `review/code-reviewer.md`.

Do not re-run spec compliance here unless a code quality issue clearly reveals a
spec mismatch. If that happens, send the task back to spec compliance review.

```
Native Codex subagent:
  Use Stage 2 of loopx:review with template at review/code-reviewer.md

  DESCRIPTION: [task summary, from implementer's report plus spec review outcome]
  PLAN_OR_REQUIREMENTS: [FULL TEXT of Task N, or exact task requirements pasted inline]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]
  SPEC_REVIEW_RESULT: [approved spec compliance result, or latest fixed issues]
  VERIFICATION_EVIDENCE: [commands run, exit codes, and summaries]
  SURFACE_CHANGE_CONTEXT: [surface context and implementer `surface_change` block, or not_applicable]
```

**In addition to standard code quality concerns, the reviewer should check:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Is the implementation following the file structure from the plan?
- Did this implementation create new files that are already large, or significantly grow existing files? (Don't flag pre-existing file sizes — focus on what this change contributed.)
- For surface-changing tasks, did the implementation leave orphaned helpers, tests,
  templates, generated artifacts, docs claims, package entries, or governance rules
  that no retained current product path uses?
- For surface-changing tasks, are caller proof, negative assertions, and package/
  governance checks practical to rerun and specific enough to catch regressions?

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Recommendations, Assessment
