---
name: final-review
description: "Performs whole-feature review with requirements coverage verification, runtime validation, regression checklist, and integration risk assessment after implementation. Not for per-task review, unresolved scope, implementation, or pure documentation polish."
when_to_use: "final-review, final code review, whole feature review, integration review, pre-finish review, after subagent-exec, runtime risk review, requirements coverage, 最终评审"
metadata:
  version: "0.3.4"
---

# Final Review

Run the final whole-feature review after implementation is complete and before `finish`.

**Core principle:** Per-task review catches local issues. Final review hunts integration and runtime risk across the complete feature, verifies all requirements are met, and validates real behavior.

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

## Report Artifact

Write the complete final review report to:

```text
.loopx/final-review/<timestamp>-<slug>.md
```

Use a UTC timestamp such as `YYYYMMDDTHHMMSSZ`. Derive `<slug>` from the plan, spec, issue, task brief, or feature name. If no source slug is available, use `final-review`.

The report artifact is local workflow state for human inspection before `finish`. It is not repo-tracked by default. Do not move it under `docs/loopx/` unless the user explicitly asks for repo-tracked review records.

The chat response may summarize the result, but the complete report must be in the artifact file.

## The Final Review Process

Final review is more than just another code review. It has five phases:

### Phase 1: Requirements Coverage Matrix

Before dispatching the code reviewer, build a requirements coverage matrix to verify nothing was missed or misimplemented.

```markdown
## Requirements Coverage

| # | Requirement / Acceptance Criteria | Implemented In | Test Coverage | Status |
|---|----------------------------------|----------------|---------------|--------|
| R1 | [requirement text] | [file:function] | [test file:test name] | ✅ covered / ⚠️ partial / ❌ missing |
```

**How to build:**

1. Extract all requirements/acceptance criteria from the source spec or plan
2. For each requirement, find the implementation location
3. For each requirement, find the test that verifies it
4. Mark status:
   - ✅ **covered** — implemented + tested + verified
   - ⚠️ **partial** — implemented but test is weak or missing edge cases
   - ❌ **missing** — not implemented, or implemented but not tested

**If any requirement is ❌ missing:** This is a Critical finding. Do not proceed to finish.

**If any requirement is ⚠️ partial:** This is an Important finding. Assess whether partial coverage is acceptable or must be fixed.

### Phase 2: Support Lens Risk Scan

Identify domain-specific review lenses from the completed diff, source requirements, and plan. Read only the support skill files that trigger, and use them to sharpen runtime validation, regression checks, and reviewer context.

| Completed feature touches | Use support lens |
|---|---|
| REST, GraphQL, OpenAPI, routes, resources, pagination, API errors, versioning, or client compatibility | `api-designer` |
| Architecture boundaries, ADRs, NFRs, scalability, failure modes, deployment topology, or operational tradeoffs | `architecture-designer` |
| SQL, schema, migrations, indexes, query plans, persistence semantics, backfills, or database performance | `sql-style` |
| CLI commands, flags, stdout/stderr, `--json`, exit codes, help text, prompts, or shell behavior | `cli-developer` |
| Go files, Go tests, errors, context, interfaces, or goroutines | `go-style` |
| Go-Kratos proto/buf APIs, service/biz/data layers, middleware, auth, or config | `kratos` |
| Over-engineering risk, avoidable dependencies, missing repo reuse, stdlib/native alternatives, or deletable abstractions across the completed feature | `lancet` |

Record:

```markdown
## Support Lens Risk Scan

| Support lens | Trigger | Extra checks required | Result |
|---|---|---|---|
| <skill or none> | <diff/source signal> | <checks> | <pass/finding/not applicable> |
```

If the source plan names support lenses, every named lens must either appear in this scan or be explicitly marked no longer applicable with evidence.

### Phase 3: Runtime Validation

When the feature is runnable (has a dev server, CLI, or testable interface), perform runtime validation beyond just tests passing.

**Runtime validation checklist:**

```markdown
## Runtime Validation

### Can the feature be exercised?
- [ ] Dev server starts without errors
- [ ] Feature is accessible (UI route, CLI command, API endpoint)
- [ ] Golden path works end-to-end (not just unit tests)

### Edge cases to try:
- [ ] Empty/missing input
- [ ] Invalid input (wrong type, too large, special characters)
- [ ] Concurrent access (if applicable)
- [ ] Interrupted operation (cancel mid-flow)
- [ ] Repeated operation (idempotency)

### Results:
| Scenario | Expected | Actual | Pass? |
|----------|----------|--------|-------|
```

**When runtime validation is not possible:**
- State explicitly: "Runtime validation not performed because [reason]"
- Increase scrutiny on test quality in Phase 4
- This is acceptable for library code, internal utilities, or CI-only changes

### Phase 4: Regression Checklist

Check whether the implementation introduced unintended changes to existing behavior.

```markdown
## Regression Checklist

### Public Interface Changes
| Interface | Change | Callers | Backward Compatible? |
|-----------|--------|---------|---------------------|

### Configuration Changes
| Config Key | Change | Default Preserved? | Migration Needed? |
|-----------|--------|--------------------|--------------------|

### Schema / Data Changes
| Entity | Change | Migration | Rollback Safe? |
|--------|--------|-----------|----------------|

### Behavioral Changes
| Existing Behavior | Changed To | Intentional? | Documented? |
|-------------------|-----------|--------------|-------------|

### Dependency Changes
| Package | Change | Breaking? | Justification |
|---------|--------|-----------|---------------|
```

**Skip sections that don't apply.** A pure frontend feature doesn't need schema checks. A pure backend change doesn't need UI regression checks.

**Regression red flags:**
- Public function signature changed without updating all callers
- Config default changed (breaks existing deployments)
- Schema migration is destructive (no rollback path)
- Existing test assertions changed to make new code pass (test was right, code is wrong?)
- Package major version bump without changelog review

### Phase 5: Dispatch Code Reviewer

Use the platform's native subagent mechanism when available and fill template at `final-reviewer.md`.

**Placeholders:**
- `{DESCRIPTION}` - concise summary of the completed feature
- `{REQUIREMENTS}` - source requirements or plan/spec excerpts
- `{VERIFICATION}` - test commands and results + runtime validation results
- `{PER_TASK_REVIEWS}` - review artifacts or "not available"
- `{BASE_SHA}` - commit before implementation began
- `{HEAD_SHA}` - current commit

**Additional context to include:**
- The requirements coverage matrix from Phase 1
- The support lens risk scan from Phase 2
- Any runtime validation findings from Phase 3
- The regression checklist results from Phase 4

## Review Priority

The reviewer must prioritize findings in this order:

1. Runtime bugs, data loss, broken CLI behavior, state corruption
2. Requirements not met (from coverage matrix)
3. Cross-task integration bugs
4. Regression issues (from regression checklist)
5. Missing edge cases not covered by tests
6. Test quality problems
7. Architecture and maintainability issues
8. Documentation defects that can mislead users or maintainers, omit required operational facts, or contradict actual behavior

Do not report pure documentation polish, style preferences, or wording tweaks. Do report documentation problems that create wrong usage, wrong maintenance decisions, missing required commands, missing migration notes, or false claims.

## Handle Feedback

- Critical and Important findings must be handled before `finish`
- Use `fix-review` for received feedback
- Push back only with code, test, or requirement evidence
- After fixes, run verification again and repeat final review if the fix changed integration behavior

## Final Review Output

The complete final review output should include:

```markdown
# Final Review Report

## Change Summary
[User-readable summary of the completed change, including main files/modules touched and the intended behavior delivered.]

## Requirements / Design Alignment
| Design Point / Requirement | Implementation Evidence | Status | Notes |
|---|---|---|---|
| [requirement text] | [file:function or test evidence] | aligned / partial / not aligned | [short reason] |

## Requirements Coverage Matrix
[from Phase 1]

## Support Lens Risk Scan
[from Phase 2]

## Runtime Validation Results
[from Phase 3]

## Code Review Findings
[from Phase 5 — reviewer output]

## Regression Assessment
[from Phase 4]

## Overall Assessment

**Ready for finish?** [Yes | No | With fixes]

**Coverage:** X/Y requirements fully covered
**Runtime:** [Validated / Not validated + reason]
**Regression:** [Clean / Issues found]

**Blocking issues:** [list or "none"]
```

After writing the artifact, tell the user:

```text
Final review report saved to `.loopx/final-review/<timestamp>-<slug>.md`.
Ready for finish: <Yes | No | With fixes>
Blocking issues: <none | summary>
```

Do not proceed to `finish` when the report says `Ready for finish? No` or unresolved Critical/Important findings remain.

## Common Mistakes

**Running normal review again**
- Problem: reviewer repeats per-task or documentation comments
- Fix: use `final-reviewer.md`, which focuses on whole-feature runtime risk

**Skipping requirements coverage matrix**
- Problem: a requirement was never implemented but nobody checked
- Fix: always build the matrix from source requirements before dispatching reviewer

**Skipping runtime validation when it's possible**
- Problem: tests pass but feature doesn't actually work (mocking, environment differences)
- Fix: if it can run, run it. Type checking and tests verify code correctness, not feature correctness

**Letting docs hide real risk**
- Problem: "docs only" findings are ignored even when users would be misled
- Fix: distinguish pure polish from operationally incorrect or missing documentation

**Reviewing without base/head SHAs**
- Problem: reviewer sees an unclear or stale diff
- Fix: provide an exact git range every time

**Skipping verification evidence**
- Problem: reviewer cannot judge whether tests prove real behavior
- Fix: include exact commands and pass/fail output summary

**Skipping regression checklist for "safe" changes**
- Problem: "I only changed internal code" but actually broke a public export
- Fix: always check public interfaces, even for "internal" changes
