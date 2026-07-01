---
name: final-review
description: "Performs whole-feature review with requirements coverage verification, runtime validation, regression checklist, and integration risk assessment after implementation. Not for per-task review, unresolved scope, implementation, or pure documentation polish."
when_to_use: "final-review, final code review, whole feature review, integration review, pre-finish review, after subagent-exec, runtime risk review, requirements coverage, 最终评审"
metadata:
  version: "0.3.11"
---

# Final Review

Run the final whole-feature review after implementation is complete and before `finish`.

**Core principle:** Per-task review catches local issues. Final review hunts integration and runtime risk across the complete feature, verifies all requirements are met, and validates real behavior. Claims must be supported by evidence from the same user-facing or system-facing surface they describe.

**Announce at start:** "I'm using the final-review skill to review the completed feature."

## User-Facing Language

Match the user's language for the report artifact, report summary, and readiness/blocking issue wording.

- If the user asked in Chinese, write the final-review report in Chinese.
- If the user asked in English, write the final-review report in English.
- If the user mixed languages, follow the dominant language in the current turn.
- Keep commands, file paths, branch names, skill names, `Ready for finish?`, and exact status values such as `Yes`, `No`, and `With fixes` unchanged.

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

## Review Scope

Final review has two scopes for multi-plan packages:

- Plan-level final-review: run after one child plan is implemented and task-reviewed. Source requirements are the child plan plus relevant `00-overview.md` context. The review decides whether that child plan is ready for spec-level review by updating state only. It must not write a report artifact or authorize `finish`.
- Spec-level final-review: run after all child plans in a multi-plan package are ready. Source requirements include the source spec, `00-overview.md`, every child plan, every child `plan_review.status`, and the complete feature scope anchored by the recorded start commit and current repository state. This is the only multi-plan final-review scope that may set the package `Ready for finish? Yes`.

When reviewing a multi-plan package, plan-level reviews update only the matching `plans[]` row in `.loopx/multi-plan/<feature-slug>/state.json`. Spec-level reviews write the canonical report artifact, then update `spec_final_review.path` and `spec_final_review.ready_for_finish`.

Final review uses a start-anchored current-state model:

- Read `start_commit` from `.loopx/execution-ranges/<slug>.json` when present.
- If execution range state is missing, derive the start from approved source context or finish baseline fallback and state the fallback in the report.
- Review current `HEAD` at review time.
- If tracked staged or unstaged changes exist, include both `git diff` and `git diff --cached` in review inputs and mark `tracked_diff_included: yes`.
- Do not require or invent an execution end commit before final-review.

## Required Inputs

Before dispatching the reviewer, collect:
- `start_commit` from `.loopx/execution-ranges/<slug>.json` when available, plus current `HEAD`
- Source requirements: spec, plan, issue, PRD, or accepted task brief
- Implementation summary: what changed and why
- Verification evidence: commands run and results
- `git diff` and `git diff --cached` when tracked staged or unstaged changes exist
- Per-task review artifacts, if available

If the start state or requirements are unclear, stop and ask. A final review without a concrete scope is not useful.

## Report Artifact

Write the canonical final-review report for single-plan and spec-level final-review. These scopes write one canonical final-review report per design/source:

```text
.loopx/final-review/<design-date>-<design-slug>.md
```

Derive `<design-date>-<design-slug>` from the design artifact when present; otherwise derive it from the source artifact. If no source slug is available, use `final-review`. Repeated final-review for the same design/source updates this same canonical final-review report and appends a `Review Iterations` / `复审记录` entry; do not create `re-review` sibling files.

The report artifact is local workflow state for human inspection before `finish`. It is not repo-tracked by default. Do not move it under `docs/loopx/` unless the user explicitly asks for repo-tracked review records.

The chat response may summarize the result, but the complete report must be in the artifact file.

## The Final Review Process

Final review is more than just another code review. It has six phases. It remains a human whole-feature review focused on requirements coverage, runtime behavior, test trust, and integration risk; do not reduce it to checking file shapes or required headings.

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

**Evidence surface gate:**

- For each covered requirement, identify the surface being claimed: UI/product surface, CLI behavior, API behavior, persistence/schema behavior, background workflow, internal library behavior, or documentation contract.
- Evidence must match that surface. Source code and model/unit tests can support implementation evidence, but they do not by themselves prove user-visible UI, CLI, API, persistence, or end-to-end workflow behavior.
- UI/product-surface claims need user-visible runtime evidence when runnable: screenshot, accessibility tree, UI automation result, recorded manual observation, or equivalent inspection of visible controls, layout, navigation, and states.
- CLI/API/persistence/workflow claims need representative runtime evidence from the actual command, endpoint, storage state, process, or integration path, not only mocked or model-level checks.
- For rewrites, parity work, migrations, and "keep existing behavior" requirements, compare against the accepted contract: source spec, current product/reference implementation, compatibility promise, or documented behavior. A narrow implementation plan cannot erase broader accepted requirements.
- If required surface evidence is missing, mark the row `⚠️ partial` or `❌ missing`; do not mark it covered on lower-level evidence alone.
- `Ready for finish? Yes` requires zero unresolved Critical/Important findings and no unaccepted partial coverage.

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

**User-visible and public-surface validation:**

- For UI or product-surface work, exercise the visible screen or app state behind each user-facing claim. Record what was observed and how: screenshot, accessibility tree, UI automation, manual observation, or a clear reason it could not be checked.
- For CLI/API/public workflow work, run representative commands or calls and capture the observed output, exit code, response, state change, or persisted result.
- Successful build, app launch, server start, smoke JSON, view-model state, or unit tests can support runtime validation, but cannot replace the surface-specific checks above when the claim is about visible or public behavior.

**When runtime validation is not possible:**
- State explicitly: "Runtime validation not performed because [reason]"
- Increase scrutiny on test quality in Phase 5
- This is acceptable for library code, internal utilities, or CI-only changes
- Mark any user-visible or public-surface requirement that lacks required runtime evidence as partial unless the source requirements explicitly accepted model-only or non-runtime evidence.

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

### Phase 5: Test Trust

Build an independent `Test Trust` assessment after runtime validation and regression verification, before dispatching the reviewer. This phase evaluates whether the verification evidence is strong enough to trust the feature, without turning final-review into file-shape checking.

```markdown
## Test Trust

**Level:** High | Medium | Low
**Evidence:** [fresh commands, relevant outputs, covered paths]
**Skipped checks:** [none or explicit skipped checks with rationale]
**Residual risk:** [remaining confidence gaps]
```

Classify trust using:

- **High** — evidence freshness is current for this diff, command specificity matches the changed surface, coverage relevance maps to requirements and risk areas, and unexplained skips are absent.
- **Medium** — evidence is mostly fresh and relevant, but command specificity, coverage relevance, or skipped-check rationale leaves limited residual risk.
- **Low** — evidence is stale, commands are too generic for the changed surface, coverage misses important requirements or integration paths, or unexplained skips materially weaken confidence.

If trust is Low, include an Important or Critical finding unless the source requirements explicitly accepted the remaining risk.

Evidence mismatch lowers trust. If the verification proves only construction-level behavior while the requirement claims product, CLI, API, persistence, or workflow behavior, classify trust as Medium at best for that surface and record the residual risk.

### Phase 6: Dispatch Code Reviewer

Use the platform's native subagent mechanism when available and fill template at `final-reviewer.md`.

**Placeholders:**
- `{DESCRIPTION}` - concise summary of the completed feature
- `{REQUIREMENTS}` - source requirements or plan/spec excerpts
- `{VERIFICATION}` - test commands and results + runtime validation results
- `{TEST_TRUST}` - Test Trust level, evidence, skipped checks, and residual risk
- `{PER_TASK_REVIEWS}` - review artifacts or "not available"
- `{START_COMMIT}` - recorded `start_commit` or stated fallback start
- `{REVIEW_HEAD}` - current `HEAD` at review time
- `{TRACKED_DIFF_INCLUDED}` - `yes` when tracked staged or unstaged changes were included, otherwise `no`

**Additional context to include:**
- The requirements coverage matrix from Phase 1
- The support lens risk scan from Phase 2
- Any runtime validation findings from Phase 3
- The regression checklist results from Phase 4
- The independent Test Trust assessment from Phase 5
- Any claim-to-evidence gaps where the report can only support partial coverage

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

Before writing the final-review artifact, read the report template matching the user's language:

- Chinese users: `references/report-template.zh-CN.md`
- English users: `references/report-template.en.md`

Use the selected template as the complete report structure. Keep `Ready for finish?` and exact status values `Yes`, `No`, and `With fixes` unchanged.

After writing the artifact, tell the user:

```text
Final review report saved to `.loopx/final-review/<design-date>-<design-slug>.md`.
Ready for finish: <Yes | No | With fixes>
Blocking issues: <none | summary>
```

Do not proceed to `finish` when the report says `Ready for finish? No` or unresolved Critical/Important findings remain.

For multi-plan child plan-level final-review, run the review process but do not write a `.loopx/final-review/*.md` report. Update `.loopx/multi-plan/<feature-slug>/state.json` for the child row:

```json
{
  "plan_review": {
    "status": "passed",
    "reviewed_at": "2026-06-30T00:00:00.000Z",
    "summary": "No blocking issues"
  },
  "ready_for_spec_review": true
}
```

Child plan-level final-review must not write report artifacts or record child `start_commit`, current `HEAD`, or end commit metadata. Only spec-level final-review writes the persisted package report.

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

**Treating lower-level evidence as product evidence**
- Problem: model tests, construction checks, app launch, or server start are used to claim UI, CLI, API, persistence, or workflow parity
- Fix: require evidence from the claimed surface; if it is missing, mark the requirement partial or missing and block a green finish

**Letting docs hide real risk**
- Problem: "docs only" findings are ignored even when users would be misled
- Fix: distinguish pure polish from operationally incorrect or missing documentation

**Reviewing without a concrete scope**
- Problem: reviewer sees an unclear or stale diff
- Fix: provide the recorded start commit and current repository state every time

**Skipping verification evidence**
- Problem: reviewer cannot judge whether tests prove real behavior
- Fix: include exact commands and pass/fail output summary

**Skipping regression checklist for "safe" changes**
- Problem: "I only changed internal code" but actually broke a public export
- Fix: always check public interfaces, even for "internal" changes

**Letting narrow plan anchors override accepted scope**
- Problem: a review uses a narrow implementation plan to ignore broader parity, migration, compatibility, or accepted behavior requirements
- Fix: compare against the source spec and accepted existing contract; unresolved parity gaps are partial or missing coverage
