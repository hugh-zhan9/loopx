---
name: final-review
description: "Performs whole-feature review after implementation and staged task review. Not for per-task review, unresolved scope, implementation, or pure documentation polish."
when_to_use: "final-review, final code review, whole feature review, integration review, pre-finish review, after subagent-exec, runtime risk review, 最终评审"
metadata:
  version: "0.2.4"
---

# Final Review

Run the final whole-feature review after implementation is complete and before `finish`.

**Core principle:** Per-task review catches local issues. Final review hunts integration and runtime risk across the complete feature.

**Announce at start:** "I'm using the final-review skill to review the completed feature."

## When to Use

Use this after:
- `subagent-exec` completed all planned tasks and per-task reviews
- `exec` completed a full plan with verification checkpoints
- ad-hoc implementation is complete and ready for final risk review

Do not use this for:
- reviewing one task or one small checkpoint (`review` is for that)
- fixing review feedback (`fix-review` is for that)
- polishing documentation wording
- incomplete implementation or failing verification

## Required Inputs

Before dispatching the reviewer, collect:
- Full feature git range: base SHA before implementation, head SHA now
- Source requirements: spec, plan, issue, PRD, or accepted task brief
- Implementation summary: what changed and why
- Verification evidence: commands run and results
- Per-task review artifacts, if available

If the git range or requirements are unclear, stop and ask. A final review without a concrete scope is not useful.

## Review Priority

The reviewer must prioritize findings in this order:

1. Runtime bugs, data loss, broken CLI behavior, state corruption
2. Cross-task integration bugs
3. Missing edge cases not covered by tests
4. Test quality problems
5. Architecture and maintainability issues
6. Documentation defects that can mislead users or maintainers, omit required operational facts, or contradict actual behavior

Do not report pure documentation polish, style preferences, or wording tweaks. Do report documentation problems that create wrong usage, wrong maintenance decisions, missing required commands, missing migration notes, or false claims.

## Dispatch

Use the platform's native subagent mechanism when available and fill template at `final-reviewer.md`.

**Placeholders:**
- `{DESCRIPTION}` - concise summary of the completed feature
- `{REQUIREMENTS}` - source requirements or plan/spec excerpts
- `{VERIFICATION}` - test commands and results
- `{PER_TASK_REVIEWS}` - review artifacts or "not available"
- `{BASE_SHA}` - commit before implementation began
- `{HEAD_SHA}` - current commit

## Handle Feedback

- Critical and Important findings must be handled before `finish`
- Use `fix-review` for received feedback
- Push back only with code, test, or requirement evidence
- After fixes, run verification again and repeat final review if the fix changed integration behavior

## Common Mistakes

**Running normal review again**
- Problem: reviewer repeats per-task or documentation comments
- Fix: use `final-reviewer.md`, which focuses on whole-feature runtime risk

**Letting docs hide real risk**
- Problem: "docs only" findings are ignored even when users would be misled
- Fix: distinguish pure polish from operationally incorrect or missing documentation

**Reviewing without base/head SHAs**
- Problem: reviewer sees an unclear or stale diff
- Fix: provide an exact git range every time

**Skipping verification evidence**
- Problem: reviewer cannot judge whether tests prove real behavior
- Fix: include exact commands and pass/fail output summary
