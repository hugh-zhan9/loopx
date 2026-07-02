---
name: review
description: "Dispatches a loopx code reviewer subagent against task evidence or a feature git range with spec compliance and code quality stages. Not for implementation, planning, or unresolved review scope."
when_to_use: "request code review, completed task review, major feature review, pre-merge review, subagent code quality check, spec compliance check"
metadata:
  version: "0.3.10"
---

# Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review early, review often. Check spec compliance first, then code quality. Reviewers are responsible for their own output: findings must be checked against the design and implementation plan before they are returned.

## When to Request Review

**Mandatory:**
- After checkpoint task work when the execution skill requires review
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## Review Stages

Review has two stages. Run them in order. Do not skip stage 1.

When a design proposal, detailed design, implementation plan, task brief, or issue contract exists, include it in the reviewer context. Do not dispatch a code-only review for plan-driven work. If no formal artifact exists, say the review is degraded to intent check and name the source used instead.

### Stage 1: Spec Compliance

**Purpose:** Verify the implementation matches the plan/requirements — nothing missing, nothing extra.

When the formal plan or spec contains `D-*` design anchors, Stage 1 spec compliance must check those anchors alongside `AC-*` requirements. Verify that implemented behavior covers the relevant `D-*`, that uncovered anchors have explicit deferred rationale, and that the diff does not introduce behavior outside the approved `AC-*`/`D-*` contract.

When the formal plan contains `T-*` task anchors, Stage 1 spec compliance must preserve those anchors in findings or coverage notes. Use `T-*` to identify which task introduced a missing requirement, extra behavior, changed interface, or downstream mismatch. Historical plans without `T-*` continue to use `Task N` or the task description.

Task execution evidence is a first-class Stage 1 input beside requirement and design anchors. When available, consume `AC-*`, `D-*`, `T-*`, and task verification evidence together: task completion evidence fields, commands run, relevant output summaries, skipped checks, and remaining risk.

Report missing or weak task evidence as a review finding when it affects confidence in the claimed implementation. If commands, outputs, or evidence summaries do not support claimed `AC-*`/`D-*`/`T-*` completion, record the gap in Stage 1 rather than deferring it to code quality review.

Task and checkpoint review may use a task brief, implementer report, review
package, current code, and test evidence as the review basis. Do not require a
task commit or staged task snapshot when current worktree evidence is provided.

**When to use:** After every task completion where a plan, spec, or task description exists.

**When to degrade:** If there is no formal plan or spec (ad-hoc fix, exploratory change, external PR), degrade Stage 1 to an **intent check**:

- Compare against: commit message, PR description, issue description, or the user's original request
- Only check: "does the change do what it claims to do?" and "does it introduce unrelated changes?"
- Skip: detailed spec-line-by-line comparison (there is no spec to compare against)

**Dispatch spec compliance reviewer:**

Use the platform's native subagent mechanism when available and provide this
inline check:

```
Spec Compliance Check:
- Task requirements: {PLAN_OR_REQUIREMENTS}
- Implementation summary: {WHAT_WAS_BUILT}

Verify:
1. Everything requested is implemented (nothing missing)
2. Nothing unrequested was added (nothing extra)
3. Intent matches, not just literal words
4. Outputs match what downstream tasks expect
5. If `AC-*` anchors exist, findings or coverage notes reference the relevant `AC-*`
6. If `D-*` design anchors exist, findings or coverage notes reference the relevant `D-*`
7. Any uncovered `D-*` has explicit deferred rationale; otherwise treat it as a spec compliance gap
8. If `T-*` task anchors exist, findings or coverage notes reference the relevant `T-*`
9. If task verification evidence exists, commands and outputs support the claimed `AC-*`/`D-*`/`T-*` completion
10. Missing or weak evidence is reported as a finding when it affects confidence
11. Before returning, self-check each finding against the design document, implementation plan, task evidence, and diff; remove findings that are unsupported, duplicate, preference-only, or remedy-only.
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
4. Findings are tied to the stated intent and diff, and unsupported preferences are removed before returning
```

**If spec check fails:** Fix gaps before proceeding to Stage 2.

### Stage 2: Code Quality

**Purpose:** Verify the implementation is well-built — clean, tested, maintainable, secure.

**When to use:** After spec compliance passes. Never run code quality review on code that doesn't match spec — you'll review code that gets rewritten.

### Support Lens Triggers

Before Stage 2 or Stage 3, inspect the changed files, public surface, and requirements. If a trigger applies, read the matching support skill and include its checklist in the reviewer context. Support lenses add domain discipline; they do not replace spec compliance or code quality review.

| Change or requirement | Use support lens |
|---|---|
| REST, GraphQL, OpenAPI, routes, resources, pagination, API errors, versioning, or client compatibility | `api-designer` |
| Architecture boundaries, ADRs, NFRs, scalability, failure modes, deployment topology, or operational tradeoffs | `architecture-designer` |
| SQL, schema, migrations, indexes, query plans, persistence semantics, backfills, or database performance | `sql-style` |
| CLI commands, flags, stdout/stderr, `--json`, exit codes, help text, prompts, or shell behavior | `cli-developer` |
| Go files, Go tests, errors, context, interfaces, or goroutines | `go-style` |
| Go-Kratos proto/buf APIs, service/biz/data layers, middleware, auth, or config | `kratos` |
| Implementation minimization, over-engineering risk, avoidable dependencies, reusable existing code, stdlib/native alternatives, or deletable abstractions | `lancet` |

When dispatching the reviewer, include:

```text
Support lenses: <none | exact skill names>
Lens-specific checks: <brief bullets from the triggered skills>
```

**Smell checks:** For broad changes, architecture-sensitive changes, performance-sensitive code, or explicit smell/anti-pattern requests, read `references/smell-checklist.md` before dispatching or performing Stage 2. Use it to focus the review on evidence-backed architecture, coupling, cohesion, testing, and complexity issues. Do not dump the checklist into the review output.

**Dispatch code quality reviewer:**

Use the platform's native subagent mechanism when available and fill template at `code-reviewer.md`.

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{REVIEW_PACKAGE}` - Task-scoped review package, when available
- `{BASE_SHA}` - Starting commit for feature, pre-merge, or external PR review
- `{HEAD_SHA}` - Ending commit for feature, pre-merge, or external PR review

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
- [ ] Support lens checks passed for any triggered domain concerns

### Skip Impact Scan When:
- Changes are purely internal (no public interface change)
- New code only (no existing callers)
- Test-only changes
```

## Review Output Self-Check

Before returning any review result, the reviewer must audit the review output itself. This applies to Stage 1, Stage 2, Stage 3, and task-scoped reviewers.

Check:

- Source basis: design proposal, detailed design, implementation plan, task brief, issue contract, `AC-*`, `D-*`, `T-*`, `TC-*`, review focus, and task evidence were used when available. If they were unavailable, the output says which degraded basis was used.
- Finding basis: every Critical or Important finding names the plan/design/requirement basis it enforces, or states why a code-only defect is blocking without a plan anchor.
- Evidence: every finding has concrete code, diff, test, artifact, or command evidence. Do not return speculative findings as blocking.
- Minimal remedy: separate the underlying problem from the suggested implementation. Do not prescribe broad fallback logic, degraded modes, retry paths, wrappers, compatibility shims, new options, or abstractions unless the current user instruction, clarified source requirements, approved design, implementation plan, or issue contract explicitly requires that behavior.
- Fallback authorization: treat unanchored fallback, degradation, retry, silent recovery, or compatibility shim logic as a finding when the implementation adds it without source authorization. The reviewer must not suggest new fallback behavior as a remedy unless the source names the failure mode and expected behavior.
- Deduplication: merge duplicate or one-root-cause findings before output, and calibrate severity by actual user or workflow risk.
- Scope: remove preference-only, unactionable, or plan-contradicting feedback. If the plan itself appears wrong, label the finding as a plan issue instead of silently rewriting the implementation contract.

The output must include a short `Review Output Self-Check` note stating the source basis used and whether unsupported, duplicate, or overbuilt findings were removed.

## Review Evidence Inputs

Task or checkpoint review may use a task brief, implementer report, review
package, current code, and test evidence.

Feature, pre-merge, final integration, or external PR review may use an
explicit git range:

```bash
BASE_SHA=$(git rev-parse origin/main)  # or a recorded baseline
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
| API, schema, CLI, architecture, Go, or Kratos domain change | Stage 1 + Stage 2 + triggered support lens + Stage 3 when public/shared | Standard/Deep |

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
[Just completed T-002: Add verification function]

You: Let me request code review before proceeding.

--- Stage 1: Spec Compliance ---
Task requirements: "Add verifyIndex() that checks 4 issue types and returns report"
Implementation: verifyIndex() checks 4 types, returns structured report, added repairIndex()

Spec reviewer: ❌ Extra: repairIndex() not in spec. Missing: report format doesn't match spec.

[Fix: remove repairIndex(), align report format]

--- Stage 1 retry ---
Spec reviewer: ✅ Spec compliant

--- Stage 2: Code Quality ---
Review package: .loopx/subagent-exec/review-T-002-worktree.diff

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
- Per-task review uses `subagent-exec/task-reviewer-prompt.md`, which combines
  Stage 1 spec compliance and Stage 2 code quality into one task-scoped reviewer.
- The standalone `review` skill remains available for ad-hoc or checkpoint
  review outside `subagent-exec`.

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
