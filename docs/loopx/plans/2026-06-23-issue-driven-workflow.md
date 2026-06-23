# Issue-Driven Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/issue-driven工作流需求设计文档.md`

**Goal:** Add a bundled issue-driven workflow for bug-class issues with `$issue` diagnosis ledgers and `$fix` bug-fix execution, while preserving the existing feature-driven workflow.

**Architecture:** Add two bundled core workflow skills, `issue` and `fix`, and enhance `debug` with a structured diagnosis summary contract. The workflow remains skill-first: no new runtime CLI command or state machine is introduced; `.loopx/issues/*.md` is the local bug ledger, `finish` remains the terminal commit/PR/merge/keep/discard step, and plugin mirrors are generated from canonical `skills/`.

**Tech Stack:** Node.js ESM package, Markdown skill files, Node built-in `node:test`, existing `scripts/sync-plugin-skills.mjs`, existing `scripts/verify-skills.mjs`.

## Global Constraints

- Do not replace the current feature-driven workflow.
- Issue-driven workflow handles bug-class issues only: bug, regression, failing test, build failure, unexpected behavior.
- Enhancement and feature request issues must route to feature-driven workflow.
- Add bundled core workflow skills `issue` and `fix`.
- Enhance existing `debug` with a structured diagnosis summary contract.
- Do not bind `issue` to GitHub or `gh`; `issue` accepts pasted reports, local files, failing test/build output, and user-written reproduction notes.
- Do not add GitHub issue fetching, commenting, closing, PR creation, or merge automation.
- Do not reuse existing `exec` or `subagent-exec` as the bug fix execution engine.
- Do not introduce git worktrees.
- Do not allow fix subagents to commit, push, or close issues.
- Do not add a global open issue queue state file or `.loop-state.json` style runtime.
- Do not add a new runtime CLI command/state machine.
- `issue` does not perform durable code fixes; it produces a `.loopx/issues/issue-<slug>-<timestamp>.md` ledger and fix brief.
- `issue` may perform temporary diagnostic edits, but must roll them back or record them as diagnostic patches for `fix`.
- `fix` only accepts `.loopx/issues/*.md` ledgers whose `status` is `ready_for_fix`.
- `fix` requires a clean worktree except target `.loopx/issues/` ledger changes.
- `fix` supports multiple unrelated bug fixes with subagents in parallel only when `expected_touched_files` and `parallel_safe` prove no overlap.
- If parallel safety checks fail, `fix` downgrades to serial execution unless high-risk triggers require user confirmation.
- Every code modification through `fix` requires local review per bug and whole diff review.
- `fix` handles Critical/Important findings using `fix-review` discipline and then re-verifies.
- `finish` remains the final completion step.
- Keep root skills and `plugins/loopx/skills/` mirrors byte-identical by running `npm run sync-plugin-skills`.
- Keep package surface explicit: do not add broad `skills/` packaging.

---

## Requirement Anchors

- REQ-001: Add `issue` as a bundled core workflow skill for bug-class issue intake, triage, debug-discipline diagnosis, fix brief, response draft, and handoff routing.
- REQ-002: Add `fix` as a bundled core workflow skill that consumes only `ready_for_fix` `.loopx/issues/*.md` ledgers and performs bug fix execution, verification, review, fix-review, and finish handoff.
- REQ-003: Enhance `debug` with a structured diagnosis summary contract usable by `issue`.
- REQ-004: Define the `.loopx/issues/issue-<slug>-<timestamp>.md` ledger contract with phase, status, diagnosis summary, fix brief, response draft, execution reports, reviews, verification, closeout, and evidence log.
- REQ-005: Support multiple unrelated bug fixes in `fix` through subagents without git worktrees, guarded by `expected_touched_files`, `parallel_safe`, clean worktree preflight, scope validation, and actual changed file checks.
- REQ-006: Update product docs so feature-driven and issue-driven workflows are parallel main flows, and state that issue-driven handles bug-class issues only.
- REQ-007: Update bundled install/package/plugin/governance surfaces for `issue`, `fix`, and changed `debug`.
- REQ-008: Preserve current feature-driven behavior and public CLI command surface.

## Surface Inventory

- Public commands/API/routes/events/config: no new CLI commands; no API, route, event, or config changes.
- Exported functions/types/modules: `LOOPX_BUNDLED_SKILLS` changes through `src/install-discovery.mjs`; no new exported runtime function is required.
- Runtime/generated artifacts and templates: new local scratch convention `.loopx/issues/*.md` and `.loopx/issues/reports/*.md`; no committed runtime artifacts.
- Installer/package/deployment surface: add `skills/issue/`, `skills/fix/`, `plugins/loopx/skills/issue/`, and `plugins/loopx/skills/fix/`; update `package.json.files`; update bundled skill install set.
- Hooks/background jobs/automation: no hook behavior changes.
- Current product docs: `README.md`, `README.zh-CN.md`, `docs/loopx/skills.md`, `docs/loopx/skills.zh-CN.md`, `docs/loopx/specs/installation.md`, `skills/RESOLVER.md`.
- Tests/governance checks: `test/skill-governance.test.mjs`, `scripts/verify-skills.mjs`, `npm test`.
- Compatibility/migration paths: existing feature-driven workflow remains valid; existing `$debug` remains independently usable; existing installed users gain two new skills after install/update.

## Caller Proof And Decision Rules

Run before implementation:

```bash
rg "clarify -> spec\\?|LOOPX_BUNDLED_SKILLS|LOOPX_SKILLS|skills/debug/|fix-review|debug\\`|\\$debug|rm -rf ~/.agents/skills" src scripts test package.json README.md README.zh-CN.md docs/loopx skills plugins/loopx
```

Decision rule:

- Current feature-driven workflow text must be retained but presented as one of two main flows.
- Current `$debug` references must remain valid, but docs should prefer `$issue` for end-to-end bug-class workflow.
- `LOOPX_SKILLS` and `package.json.files` must add `issue` and `fix`.
- Plugin mirror content must be generated from canonical `skills/`, not hand-diverged.
- Historical docs under `docs/loopx/plans/`, `docs/release-notes/`, and `ref/` may keep old wording and do not count as current product surface.

## Negative Assertions

Run after implementation:

```bash
test -e skills/issue/SKILL.md
test -e skills/fix/SKILL.md
test -e plugins/loopx/skills/issue/SKILL.md
test -e plugins/loopx/skills/fix/SKILL.md
! rg "gh issue view|gh issue comment|gh issue close|gh pr create|gh pr merge|Create git worktree|Use `git worktree` for isolation|Run git worktree" skills/issue skills/fix plugins/loopx/skills/issue plugins/loopx/skills/fix
! rg "loopx issue|loopx fix" src README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md
npm pack --dry-run
```

Expected:

- All `test -e` commands exit 0.
- The `rg` commands with `!` exit 0 because forbidden product claims are absent.
- `npm pack --dry-run` lists `skills/issue/`, `skills/fix/`, `plugins/loopx/skills/issue/`, and `plugins/loopx/skills/fix/`.

## File Structure

- Create `skills/issue/SKILL.md`: canonical issue-driven intake and diagnosis workflow.
- Create `skills/fix/SKILL.md`: canonical issue-driven execution workflow.
- Modify `skills/debug/SKILL.md`: add diagnosis summary contract and `issue` integration guidance.
- Modify `skills/RESOLVER.md`: add `issue` and `fix` to core workflow routing.
- Modify `src/install-discovery.mjs`: add `issue` and `fix` to `LOOPX_SKILLS`.
- Modify `package.json`: add explicit `skills/issue/` and `skills/fix/` entries.
- Modify `README.md` and `README.zh-CN.md`: document two main flows and examples.
- Modify `docs/loopx/skills.md` and `docs/loopx/skills.zh-CN.md`: document issue-driven mental model, core skills, routing, and examples.
- Modify `docs/loopx/specs/installation.md`: add `issue` and `fix` to uninstall commands.
- Modify `test/skill-governance.test.mjs`: add governance tests for issue-driven skill surface and docs.
- Generate `plugins/loopx/skills/issue/`, `plugins/loopx/skills/fix/`, and changed plugin mirrors with `npm run sync-plugin-skills`.

## Task 1: Add Governance Tests For Issue-Driven Surface

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: existing `LOOPX_BUNDLED_SKILLS`, `parseFrontmatter`, `assertMarkdownStructure`, `execFileAsync`.
- Produces: failing tests that define the new issue-driven bundled skill contract.

- [ ] **Step 1: Add a bundled skill set assertion**

Append this test inside `describe('loopx skill governance', () => { ... })` after the package surface test:

```js
  it('includes issue-driven workflow skills in the bundled skill set and package surface', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));

    assert.equal(LOOPX_BUNDLED_SKILLS.includes('issue'), true, 'issue must be bundled');
    assert.equal(LOOPX_BUNDLED_SKILLS.includes('fix'), true, 'fix must be bundled');
    assert.equal(packageJson.files.includes('skills/issue/'), true, 'npm package must include issue skill');
    assert.equal(packageJson.files.includes('skills/fix/'), true, 'npm package must include fix skill');
  });
```

- [ ] **Step 2: Add an `issue` skill contract test**

Append this test after the bundled skill set assertion:

```js
  it('governs issue skill as the issue-driven intake and diagnosis workflow', async () => {
    const issueSkill = await readFile(join(repoRoot, 'skills', 'issue', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(issueSkill);

    assert.equal(fields.name, 'issue');
    assert.match(fields.description, /bug-class/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /bug|regression|failing test|build failure|unexpected behavior/i);
    assert.match(fields['metadata.version'] ?? '', semverPattern);
    assert.match(issueSkill, /\.loopx\/issues\/issue-<slug>-<timestamp>\.md/);
    assert.match(issueSkill, /phase/);
    assert.match(issueSkill, /status/);
    assert.match(issueSkill, /Evidence Log/);
    assert.match(issueSkill, /Diagnosis Summary/);
    assert.match(issueSkill, /Fix Brief/);
    assert.match(issueSkill, /Response Draft/);
    assert.match(issueSkill, /ready_for_fix/);
    assert.match(issueSkill, /needs_info/);
    assert.match(issueSkill, /not_a_bug/);
    assert.match(issueSkill, /feature_request/);
    assert.match(issueSkill, /\$fix \.loopx\/issues\//);
    assert.match(issueSkill, /debug discipline/i);
    assert.match(issueSkill, /temporary diagnostic/i);
    assert.doesNotMatch(issueSkill, /gh issue view|gh issue comment|gh issue close|gh pr create|gh pr merge/);
    assert.doesNotMatch(issueSkill, /durable code fix/i);
  });
```

- [ ] **Step 3: Add a `fix` skill contract test**

Append this test after the `issue` skill contract test:

```js
  it('governs fix skill as the issue-driven execution workflow', async () => {
    const fixSkill = await readFile(join(repoRoot, 'skills', 'fix', 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(fixSkill);

    assert.equal(fields.name, 'fix');
    assert.match(fields.description, /ready_for_fix/i);
    assert.match(fields.description, /not for/i);
    assert.match(fields.when_to_use, /ready_for_fix|\.loopx\/issues|bug fix/i);
    assert.match(fields['metadata.version'] ?? '', semverPattern);
    assert.match(fixSkill, /status: ready_for_fix/);
    assert.match(fixSkill, /clean worktree/i);
    assert.match(fixSkill, /expected_touched_files/);
    assert.match(fixSkill, /parallel_safe/);
    assert.match(fixSkill, /scope validation/i);
    assert.match(fixSkill, /actual_changed_files/);
    assert.match(fixSkill, /local review/i);
    assert.match(fixSkill, /whole diff review/i);
    assert.match(fixSkill, /fix-review/i);
    assert.match(fixSkill, /finish/i);
    assert.match(fixSkill, /must not commit/i);
    assert.match(fixSkill, /must not push/i);
    assert.match(fixSkill, /must not close/i);
    assert.match(fixSkill, /Do not invoke `subagent-exec` or `loopx:exec`/);
    assert.match(fixSkill, /Do not use `git worktree`/);
    assert.doesNotMatch(fixSkill, /Use `subagent-exec`|Use `loopx:exec`|Create git worktree|gh issue close|gh pr merge/);
  });
```

- [ ] **Step 4: Add a `debug` diagnosis contract test**

Append this test after the `fix` skill contract test:

```js
  it('debug exposes a structured diagnosis summary contract for issue workflow', async () => {
    const debugSkill = await readFile(join(repoRoot, 'skills', 'debug', 'SKILL.md'), 'utf8');

    assert.match(debugSkill, /Diagnosis Summary Contract/);
    assert.match(debugSkill, /classification: bug \| regression \| failing_test \| build_failure \| unexpected_behavior \| not_a_bug \| needs_info/);
    assert.match(debugSkill, /reproduction_status: reproduced \| intermittent \| not_reproduced \| not_attempted/);
    assert.match(debugSkill, /root_cause_status: confirmed \| likely \| unknown/);
    assert.match(debugSkill, /fix_mode: root_cause_fix \| defensive_fix \| blocked \| no_fix_needed/);
    assert.match(debugSkill, /regression_test_required/);
    assert.match(debugSkill, /risk_triggers/);
    assert.match(debugSkill, /issue workflow/i);
  });
```

- [ ] **Step 5: Add docs and resolver governance**

Append this test after the `debug` diagnosis contract test:

```js
  it('documents feature-driven and issue-driven workflows as parallel main flows', async () => {
    const resolver = await readFile(join(repoRoot, 'skills', 'RESOLVER.md'), 'utf8');
    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
    const skillsGuide = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.md'), 'utf8');
    const skillsGuideZh = await readFile(join(repoRoot, 'docs', 'loopx', 'skills.zh-CN.md'), 'utf8');
    const installationSpec = await readFile(join(repoRoot, 'docs', 'loopx', 'specs', 'installation.md'), 'utf8');

    for (const text of [resolver, readme, readmeZh, skillsGuide, skillsGuideZh]) {
      assert.match(text, /issue-driven/i);
      assert.match(text, /\$issue|`issue`/);
      assert.match(text, /\$fix|`fix`/);
      assert.match(text, /bug-class|bug 类|bug-class issues/i);
    }
    assert.match(resolver, /skills\/issue\/SKILL\.md/);
    assert.match(resolver, /skills\/fix\/SKILL\.md/);
    assert.match(readme, /feature-driven/);
    assert.match(readme, /issue-driven/);
    assert.match(readmeZh, /feature-driven/);
    assert.match(readmeZh, /issue-driven/);
    assert.match(installationSpec, /issue/);
    assert.match(installationSpec, /fix/);
  });
```

- [ ] **Step 6: Run the targeted governance test and confirm it fails for intended reasons**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: FAIL with missing `skills/issue/SKILL.md`, missing `skills/fix/SKILL.md`, missing bundled skill entries, missing package entries, missing docs text, and missing `debug` diagnosis contract.

- [ ] **Step 7: Commit the failing tests**

Run:

```bash
git add test/skill-governance.test.mjs
git commit -m "test: define issue-driven workflow governance"
```

Expected: commit succeeds.

## Task 2: Add Canonical `issue` And `fix` Skills And Enhance `debug`

**Files:**
- Create: `skills/issue/SKILL.md`
- Create: `skills/fix/SKILL.md`
- Modify: `skills/debug/SKILL.md`

**Interfaces:**
- Consumes: design contract from `docs/loopx/design/issue-driven工作流需求设计文档.md`.
- Produces:
  - `issue` skill with ledger contract and handoff routing.
  - `fix` skill with ready-ledger execution contract.
  - `debug` diagnosis summary contract consumed by `issue`.

- [ ] **Step 1: Create `skills/issue/SKILL.md`**

Create the file with this content:

````markdown
---
name: issue
description: "Issue-driven bug-class workflow intake: triage a bug report, run debug-discipline diagnosis, create a .loopx/issues ledger, and produce a fix brief. Not for feature requests, enhancements, implementation plans, durable code fixes, GitHub issue automation, or closing issues."
when_to_use: "issue, bug report, regression issue, failing test issue, build failure issue, unexpected behavior, issue-driven, bug-class issue, 问题工单, bug修复流程"
metadata:
  version: "0.1.0"
---

# Issue

Use this as the issue-driven workflow entry for bug-class issues only.

Issue-driven handles:

- bug
- regression
- failing test
- build failure
- unexpected behavior

Issue-driven does not handle feature requests or enhancements. Route those to the feature-driven workflow:

```text
clarify -> spec? -> plan-to-exec -> exec/subagent-exec -> review/final-review -> finish
```

## Contract

`issue` creates or updates a local ledger:

```text
.loopx/issues/issue-<slug>-<timestamp>.md
```

`issue` does not perform a durable code fix. It may read code, run commands, inspect git history, and create temporary diagnostic edits. Temporary diagnostic edits must be rolled back before handoff or recorded as a diagnostic patch for `fix`.

Do not use `gh` or any issue tracker automation. If the source is a GitHub issue, the user must provide the issue text, a local file, or pasted output.

## Inputs

Accept:

- pasted bug report
- local Markdown/text file
- failing test output
- build failure output
- user-written reproduction notes
- an existing `.loopx/issues/*.md` ledger to continue diagnosis

Reject or route:

- feature request -> `feature_request`, suggest `$clarify`
- enhancement -> `feature_request`, suggest `$clarify`
- pure review feedback -> suggest `$fix-review`
- approved implementation plan -> suggest `$exec` or `$subagent-exec`

## Preflight

1. Inspect `git status --porcelain`.
2. Record whether the worktree is clean or dirty.
3. If dirty, record the dirty file list in the ledger.
4. Never revert pre-existing user changes.

## Ledger Template

Write this structure:

```markdown
# Issue Ledger: <title-or-slug>

## Source

- source_type: pasted_report | local_file | failing_output | existing_ledger
- source_reference: <path, command, or user-provided description>
- created_at: <ISO timestamp>
- worktree_baseline: clean | dirty
- dirty_files:
  - <path or none>

## Current State

- phase: intake | triage | diagnosis | fix_brief | closeout
- status: pending | in_progress | ready_for_fix | needs_info | not_a_bug | duplicate | already_fixed | feature_request | blocked
- risk: low | medium | high

## Classification

- class: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info | feature_request | duplicate | already_fixed | blocked
- rationale: <why this classification is correct>

## Diagnosis Summary

```yaml
diagnosis:
  classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info
  reproduction_status: reproduced | intermittent | not_reproduced | not_attempted
  evidence:
    - type: command | log | steps | code | user_report
      value: <evidence>
  root_cause_status: confirmed | likely | unknown
  root_cause: <root cause or explicit unknown>
  hypotheses_rejected:
    - <hypothesis and why rejected>
  fix_mode: root_cause_fix | defensive_fix | blocked | no_fix_needed
  regression_test_required: true | false
  regression_test_exception_reason: <required when false>
  risk_triggers:
    - no_repro
    - defensive_fix
    - public_surface
    - scope_unclear
```

## Fix Brief

```yaml
fix_brief:
  strategy: <root-cause fix or defensive fix strategy>
  expected_touched_files:
    - <path>
  expected_touched_surfaces:
    - <surface or internal behavior>
  parallel_safe: true | false
  parallel_safety_reason: <why unrelated to other ready ledgers>
  regression_test_plan:
    required: true | false
    path: <test path or none>
    command: <focused command>
    exception_reason: <required when no regression test>
  verification_commands:
    - <command>
  risk_triggers:
    - <risk or none>
```

## Execution Reports

None yet. Filled by `$fix`.

## Reviews

None yet. Filled by `$fix`.

## Verification

None yet. Filled by `$fix`.

## Response Draft

<draft response for reporter or user>

## Evidence Log

- <ISO timestamp> - <evidence entry>
```

## Diagnosis Rules

Follow `debug` discipline:

- no durable fix before root cause investigation
- read error messages completely
- reproduce when possible
- inspect recent changes
- compare against working examples
- form and test one hypothesis at a time
- if root cause is unknown, say so

Unable to reproduce does not always block a defensive fix brief, but the ledger must record:

- attempted reproduction
- evidence gap
- why defensive fix is justified
- risk trigger `no_repro`

## Handoff Routing

Use ledger status to decide next action:

- `ready_for_fix` -> output `$fix .loopx/issues/<ledger>.md`
- `needs_info` -> ask for exact missing reproduction, logs, environment, or version details
- `not_a_bug` -> provide the Response Draft explaining expected behavior
- `duplicate` -> provide the Response Draft linking or naming the duplicate
- `already_fixed` -> provide verification evidence and closeout draft
- `feature_request` -> output `$clarify <source>` for feature-driven workflow
- `blocked` -> report the blocker and required external change

## Safety

- Must not call `gh issue view`, `gh issue comment`, `gh issue close`, `gh pr create`, or `gh pr merge`.
- Must not claim the bug is fixed.
- Must not leave unexplained diagnostic modifications in the worktree.
- Must not route enhancement work into issue-driven workflow.
````

- [ ] **Step 2: Create `skills/fix/SKILL.md`**

Create the file with this content:

````markdown
---
name: fix
description: "Issue-driven bug fix executor for ready_for_fix .loopx/issues ledgers: implement scoped fixes, verify, run local and whole review, handle fix-review findings, and hand off to finish. Not for raw bug reports, feature work, approved implementation plans, git worktrees, commits, pushes, or issue closing."
when_to_use: "fix, ready_for_fix, .loopx/issues, issue ledger, bug fix execution, issue-driven fix, 修复ledger, bug执行"
metadata:
  version: "0.1.0"
---

# Fix

Use this to execute one or more issue-driven bug fix ledgers produced by `$issue`.

`fix` does not accept raw bug reports. If the user provides a symptom instead of a ready ledger, route to `$issue`.

## Accepted Input

One or more files:

```text
.loopx/issues/*.md
```

Each ledger must include:

- `status: ready_for_fix`
- Diagnosis Summary
- Fix Brief
- `expected_touched_files`
- `parallel_safe`
- regression test plan or explicit exception
- verification commands

## Preflight

1. Run `git status --porcelain`.
2. Stop if unrelated dirty changes exist.
3. Allow dirty changes only for target `.loopx/issues/*.md` ledgers.
4. Record baseline `HEAD`.
5. Read all target ledgers.
6. Reject any ledger that is not `ready_for_fix`.
7. Reject any ledger missing `expected_touched_files` or `parallel_safe`.

## Scope Validation

Before executing:

- expected files must exist, or be clearly new test files
- expected files must not overlap across parallel ledgers
- expected surfaces must not overlap across parallel ledgers
- lockfiles, generated artifacts, global config, public CLI/API/schema/config, and package metadata are high-risk
- high-risk ledgers require serial execution or user confirmation

Scheduling:

```text
if all ledgers parallel_safe && no file/surface overlap:
  run one bug-fix subagent per ledger
else if no high-risk trigger:
  run ledgers serially
else:
  stop for user confirmation
```

## Bug-Fix Subagent Assignment

Give each subagent only its own assignment:

```text
BUG_FIX_ASSIGNMENT:
- ledger: .loopx/issues/<ledger>.md
- allowed_files:
  - <from expected_touched_files>
- allowed_surfaces:
  - <from expected_touched_surfaces>
- forbidden:
  - public CLI/API/schema/config changes unless listed in the ledger
  - lockfile/generated artifacts unless listed in the ledger
  - files outside allowed_files without stop-and-report
  - commits, pushes, PRs, issue comments, and issue closing
- report_path: .loopx/issues/reports/<ledger-slug>-fix-report.md
```

Subagents must not commit, must not push, and must not close issues.

Subagent report format:

```yaml
status: fixed | blocked | needs_scope_change | failed
actual_changed_files:
  - <path>
regression_test:
  added_or_updated: true | false
  path: <path or none>
  exception_reason: <required when false>
verification:
  - command: <command>
    result: pass | fail
scope_change_requested:
  files:
    - <path>
  reason: <reason>
review_notes: <notes for controller>
residual_risk: <risk or none>
```

## Execution Rules

- Write or update the regression test first unless the ledger records an exception.
- Implement the smallest root-cause or defensive fix described in the Fix Brief.
- Do not modify files outside `expected_touched_files`.
- If a scope change is required, stop and report `needs_scope_change`.
- Do not perform broad formatting.
- Do not use `git worktree`.
- Do not invoke `subagent-exec` or `loopx:exec` as the implementation engine.

## Controller Checks

After each bug fix:

1. Collect report.
2. Compute `actual_changed_files`.
3. Check actual files are within allowed scope.
4. Update the same ledger under Execution Reports.
5. Run focused verification.
6. Run local review against the ledger's Diagnosis Summary and Fix Brief.
7. Apply Critical/Important findings using `fix-review` discipline.
8. Re-run affected tests and local review after code changes.

After all bug fixes:

1. Run whole diff review for cross-bug conflicts and quality risks.
2. Apply Critical/Important findings using `fix-review` discipline.
3. Re-run final verification.
4. Update each ledger's Reviews, Verification, and Response Draft.
5. Output `$finish`.

## Review Rules

Local review must check:

- intent compliance with the ledger
- regression test or exception
- changed files within allowed scope
- no unrelated behavior

Whole diff review must check:

- cross-bug conflicts
- shared behavior regressions
- public surface drift
- actual changed files against all ledgers
- test gaps

## Status Updates

Update ledger state:

- `ready_for_fix -> in_progress`
- `in_progress -> fixed`
- `fixed -> reviewed`
- `reviewed -> complete`

Use `failed` or `blocked` when verification, scope, or review cannot be resolved.

## Finish Handoff

`fix` does not commit, push, merge, or close issues. After final verification and review are clean, hand off to:

```text
$finish
```
````

- [ ] **Step 3: Add diagnosis summary contract to `skills/debug/SKILL.md`**

Insert this section after "The Iron Law" or before "The Four Phases":

````markdown
## Diagnosis Summary Contract

When `debug` is used directly, or when the `issue` workflow performs its diagnosis phase, produce a structured summary that can be copied into `.loopx/issues/*.md`.

```yaml
diagnosis:
  classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info
  reproduction_status: reproduced | intermittent | not_reproduced | not_attempted
  evidence:
    - type: command | log | steps | code | user_report
      value: <specific evidence>
  root_cause_status: confirmed | likely | unknown
  root_cause: <root cause or explicit unknown>
  hypotheses_rejected:
    - <hypothesis and why it was rejected>
  fix_mode: root_cause_fix | defensive_fix | blocked | no_fix_needed
  regression_test_required: true | false
  regression_test_exception_reason: <required when false>
  risk_triggers:
    - no_repro
    - defensive_fix
    - public_surface
    - scope_unclear
```

Rules:

- Do not mark `root_cause_status: confirmed` unless evidence proves the cause.
- If the bug cannot be reproduced, use `reproduction_status: not_reproduced` or `intermittent` and include `no_repro` in `risk_triggers`.
- Defensive fixes are allowed only when the evidence and limitation are explicit; use `fix_mode: defensive_fix` and include `defensive_fix` in `risk_triggers`.
- If more information is required before a fix brief can be written, use `classification: needs_info` or `fix_mode: blocked`.
- The `issue` workflow consumes this contract during diagnosis; keep it stable.
````

- [ ] **Step 4: Bump changed skill metadata versions**

In `skills/debug/SKILL.md`, change:

```yaml
metadata:
  version: "0.3.3"
```

to:

```yaml
metadata:
  version: "0.3.4"
```

New `issue` and `fix` skills already use:

```yaml
metadata:
  version: "0.1.0"
```

- [ ] **Step 5: Run targeted governance test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: still FAIL because bundled install set, package surface, docs, resolver, and plugin mirrors are not updated yet. The failures for missing `issue`/`fix` skill files and missing debug diagnosis contract should be gone.

- [ ] **Step 6: Commit canonical skill contract changes**

Run:

```bash
git add skills/issue/SKILL.md skills/fix/SKILL.md skills/debug/SKILL.md
git commit -m "Add issue-driven skill contracts"
```

Expected: commit succeeds.

## Task 3: Wire Bundled Install, Package, Resolver, And Product Docs

**Files:**
- Modify: `src/install-discovery.mjs`
- Modify: `package.json`
- Modify: `skills/RESOLVER.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`
- Modify: `docs/loopx/specs/installation.md`

**Interfaces:**
- Consumes: `issue` and `fix` canonical skill directories from Task 2.
- Produces: public product surface where issue-driven workflow is discoverable, installable, packaged, and documented.

- [ ] **Step 1: Add `issue` and `fix` to `LOOPX_SKILLS`**

In `src/install-discovery.mjs`, update the `LOOPX_SKILLS` array so the core workflow section reads:

```js
const LOOPX_SKILLS = [
  'clarify',
  'spec',
  'plan-to-exec',
  'subagent-exec',
  'exec',
  'issue',
  'fix',
  'review',
  'final-review',
  'fix-review',
  'finish',
  'refactor-plan',
  'debug',
  'tdd',
  'verify',
  'doc-readability',
  'requirement-analyzer',
  'go-style',
  'kratos',
  'api-designer',
  'architecture-designer',
  'sql-style',
  'cli-developer',
];
```

- [ ] **Step 2: Add package file entries**

In `package.json`, add explicit package entries after `skills/go-style/` or near related skills:

```json
    "skills/issue/",
```

and:

```json
    "skills/fix/",
```

Keep `package.json.files` explicit. Do not add `"skills/"`.

- [ ] **Step 3: Update `skills/RESOLVER.md` core workflow table**

In `skills/RESOLVER.md`, add rows after `exec`:

```markdown
| Bug-class issue intake, triage, debug-discipline diagnosis, fix brief, and response draft | `skills/issue/SKILL.md` |
| Ready `.loopx/issues/*.md` bug fix ledgers need scoped implementation, review, verification, and finish handoff | `skills/fix/SKILL.md` |
```

Update the disambiguation list so items 7 onward become:

```markdown
7. Use `issue` for bug-class issue intake and diagnosis. It produces a `.loopx/issues/*.md` ledger and fix brief; it does not perform durable code fixes.
8. Use `fix` only for `ready_for_fix` issue ledgers. It executes bug fixes, performs review/fix-review/verification, and hands off to `finish`.
9. Use `review` to request code review of completed task or checkpoint work outside `fix`.
10. Use `final-review` after the whole feature is implemented and before `finish`.
11. Use `fix-review` only after feedback exists.
12. Use `finish` only after implementation, final review or issue-driven review, and verification are complete.
```

Renumber later bullets and keep the support-lens language for `debug`.

- [ ] **Step 4: Update `README.md` workflow overview**

Replace the single workflow code block:

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

with:

```text
feature-driven:
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish

issue-driven:
issue -> fix -> review/fix-review -> verify -> finish
```

In "Use In An Agent", add:

```text
$issue <bug-report-or-failing-output>
$fix .loopx/issues/<ledger>.md
```

Add this paragraph after the feature guidance:

```markdown
For a bug-class issue, start with `$issue`. It diagnoses the report using debug discipline and writes a `.loopx/issues/*.md` ledger. If the ledger is `ready_for_fix`, continue with `$fix`. Feature requests and enhancements should stay on the feature-driven path.
```

In the Core Skills table, add:

```markdown
| `issue` | A bug-class report needs intake, triage, root-cause diagnosis, a fix brief, and a response draft. |
| `fix` | A `ready_for_fix` `.loopx/issues/*.md` ledger needs scoped bug fix execution, review, verification, and finish handoff. |
```

Update the support skills sentence so `debug` remains listed as a support lens, not a workflow state.

- [ ] **Step 5: Update `README.zh-CN.md` workflow overview**

Apply the same structure in Chinese. Replace the single workflow code block with:

```text
feature-driven:
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish

issue-driven:
issue -> fix -> review/fix-review -> verify -> finish
```

Add usage examples:

```text
$issue <bug 描述或失败输出>
$fix .loopx/issues/<ledger>.md
```

Add this paragraph:

```markdown
处理 bug 类 issue 时，从 `$issue` 开始。它会按 debug 纪律诊断问题，并写入 `.loopx/issues/*.md` ledger。ledger 状态为 `ready_for_fix` 后，再用 `$fix` 执行修复。feature request 和 enhancement 仍然走 feature-driven 路径。
```

Add Core Skills rows for `issue` and `fix` with Chinese descriptions.

- [ ] **Step 6: Update `docs/loopx/skills.md`**

Change the Mental Model section to:

```markdown
loopx has two core workflow paths:

- Feature-driven workflow moves new product or code changes through clarification, design when needed, planning, execution, review, feedback handling, and finish.
- Issue-driven workflow moves bug-class reports through issue intake, debug-discipline diagnosis, fix brief, scoped fix execution, review, verification, and finish.
```

Replace the recommended flow with:

```text
feature-driven:
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish

issue-driven:
issue -> fix -> review/fix-review -> verify -> finish
```

Add core workflow rows:

```markdown
| `issue` | A bug-class issue, regression, failing test, build failure, or unexpected behavior needs diagnosis and a fix brief. | A `.loopx/issues/*.md` ledger with diagnosis summary, fix brief, response draft, and handoff. |
| `fix` | A `ready_for_fix` `.loopx/issues/*.md` ledger needs scoped implementation, review, verification, and finish handoff. | Updated issue ledger, reviewed fix, verification evidence, and handoff to `finish`. |
```

Update "Choosing The Next Skill" to include:

```markdown
8. If the input is a bug-class report, use `issue`.
9. If `issue` produced a `ready_for_fix` ledger, use `fix`.
10. If tests and final review or issue-driven review are complete, use `finish`.
```

Keep feature-driven routing intact and renumber existing items.

Add examples:

```markdown
Bug-class issue:

```text
$issue failing renewal invoice test
$fix .loopx/issues/issue-renewal-invoice-<timestamp>.md
```
```

- [ ] **Step 7: Update `docs/loopx/skills.zh-CN.md`**

Mirror Step 6 in Chinese. Use this exact recommended flow block:

```text
feature-driven:
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish

issue-driven:
issue -> fix -> review/fix-review -> verify -> finish
```

Add Chinese rows for:

```markdown
| `issue` | bug 类 issue、回归、失败测试、构建失败或异常行为需要诊断和修复边界。 | `.loopx/issues/*.md` ledger，包含 diagnosis summary、fix brief、response draft 和 handoff。 |
| `fix` | `ready_for_fix` 的 `.loopx/issues/*.md` ledger 需要受控修复、评审、验证和 finish handoff。 | 更新后的 issue ledger、已评审修复、验证证据和 `finish` handoff。 |
```

Add a bug example:

```markdown
Bug 类 issue：

```text
$issue failing renewal invoice test
$fix .loopx/issues/issue-renewal-invoice-<timestamp>.md
```
```

- [ ] **Step 8: Update uninstall guidance**

In `docs/loopx/specs/installation.md`, add `issue` and `fix` to both uninstall commands.

The first command should contain:

```bash
rm -rf ~/.agents/skills/{clarify,spec,plan-to-exec,subagent-exec,exec,issue,fix,review,final-review,fix-review,finish,refactor-plan,tdd,debug,verify,doc-readability,requirement-analyzer,go-style,kratos,api-designer,architecture-designer,sql-style,cli-developer}
```

The second command should contain:

```bash
rm -rf ~/.claude/skills/{clarify,spec,plan-to-exec,subagent-exec,exec,issue,fix,review,final-review,fix-review,finish,refactor-plan,tdd,debug,verify,doc-readability,requirement-analyzer,go-style,kratos,api-designer,architecture-designer,sql-style,cli-developer}
```

- [ ] **Step 9: Run targeted governance test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: still FAIL only because plugin mirrors are not synced.

- [ ] **Step 10: Commit product surface changes**

Run:

```bash
git add src/install-discovery.mjs package.json skills/RESOLVER.md README.md README.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md docs/loopx/specs/installation.md
git commit -m "Add issue-driven workflow product surface"
```

Expected: commit succeeds.

## Task 4: Sync Plugin Mirrors And Package Surface

**Files:**
- Create: `plugins/loopx/skills/issue/SKILL.md`
- Create: `plugins/loopx/skills/fix/SKILL.md`
- Modify: `plugins/loopx/skills/debug/SKILL.md`
- Modify as generated: any plugin mirror files affected by `npm run sync-plugin-skills`

**Interfaces:**
- Consumes: canonical `skills/` directories and `LOOPX_BUNDLED_SKILLS`.
- Produces: plugin skill mirror byte-identical to canonical bundled skills.

- [ ] **Step 1: Regenerate plugin mirrors**

Run:

```bash
npm run sync-plugin-skills
```

Expected output contains:

```text
synced 24 plugin skill mirrors
```

If the count differs because the bundled set changes again before execution, verify it equals `LOOPX_BUNDLED_SKILLS.length`.

- [ ] **Step 2: Check sync-only diff**

Run:

```bash
git status --short plugins/loopx/skills
```

Expected: new `plugins/loopx/skills/issue/`, new `plugins/loopx/skills/fix/`, and modified `plugins/loopx/skills/debug/SKILL.md`. No unrelated plugin files should change except mirrors generated from canonical skill changes.

- [ ] **Step 3: Run mirror check**

Run:

```bash
npm run sync-plugin-skills -- --check
```

Expected: exit 0 with no drift output.

- [ ] **Step 4: Run targeted governance test**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit plugin mirror changes**

Run:

```bash
git add plugins/loopx/skills
git commit -m "Sync issue-driven plugin skills"
```

Expected: commit succeeds.

## Task 5: Full Verification, Package Dry-Run, And Plan Coverage Check

**Files:**
- Modify only if verification finds a defect in current task files.

**Interfaces:**
- Consumes: all implementation changes from Tasks 1-4.
- Produces: verified issue-driven workflow implementation ready for final review and finish.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS. Output includes successful `scripts/verify-skills.mjs` and `node --test test/*.test.mjs`.

- [ ] **Step 2: Run package dry-run**

Run:

```bash
npm pack --dry-run
```

Expected: output includes these paths:

```text
skills/issue/SKILL.md
skills/fix/SKILL.md
plugins/loopx/skills/issue/SKILL.md
plugins/loopx/skills/fix/SKILL.md
```

Expected: output does not include broad `skills/` as an entry.

- [ ] **Step 3: Run negative assertions**

Run:

```bash
test -e skills/issue/SKILL.md
test -e skills/fix/SKILL.md
test -e plugins/loopx/skills/issue/SKILL.md
test -e plugins/loopx/skills/fix/SKILL.md
! rg "gh issue view|gh issue comment|gh issue close|gh pr create|gh pr merge|Create git worktree|Use `git worktree` for isolation|Run git worktree" skills/issue skills/fix plugins/loopx/skills/issue plugins/loopx/skills/fix
! rg "loopx issue|loopx fix" src README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md
```

Expected: all commands exit 0.

- [ ] **Step 4: Run source surface proof**

Run:

```bash
rg "issue-driven|ready_for_fix|expected_touched_files|Diagnosis Summary Contract|skills/issue/SKILL.md|skills/fix/SKILL.md" skills plugins/loopx/skills README.md README.zh-CN.md docs/loopx src test package.json
```

Expected: matches show:

- `issue-driven` in README, docs, resolver, issue/fix skills.
- `ready_for_fix` in issue/fix skills and governance test.
- `expected_touched_files` in issue/fix skills and governance test.
- `Diagnosis Summary Contract` in debug root and plugin mirror.
- `skills/issue/SKILL.md` and `skills/fix/SKILL.md` in resolver/governance/package-related surfaces.

- [ ] **Step 5: Self-review against the design spec**

Read `docs/loopx/design/issue-driven工作流需求设计文档.md` and confirm:

- `issue` skill covers all statuses listed in the design.
- `fix` skill rejects non-ready ledgers.
- `fix` documents no worktrees, no commits, no pushes, no issue closing.
- `debug` documents diagnosis summary schema.
- docs state issue-driven handles bug-class issues only.
- no implementation introduced a new runtime CLI command.

- [ ] **Step 6: Commit verification fixes if any**

If Step 1-5 required edits, commit them:

```bash
git add <changed-files>
git commit -m "Fix issue-driven workflow verification gaps"
```

Expected: commit is needed only if verification exposed gaps. If no changes were needed, skip this step and record that no verification-fix commit was necessary.

## Self-Review

### Spec Coverage

| Requirement | Covered By |
|---|---|
| Add `issue` bundled core workflow skill | Tasks 1, 2, 3, 4 |
| Add `fix` bundled core workflow skill | Tasks 1, 2, 3, 4 |
| Enhance `debug` diagnosis summary | Tasks 1, 2, 4 |
| Define `.loopx/issues` ledger contract | Tasks 1, 2 |
| Support multi-ledger no-worktree subagent execution | Tasks 1, 2 |
| Update feature-driven + issue-driven docs | Tasks 1, 3 |
| Update install/package/plugin/governance surfaces | Tasks 1, 3, 4, 5 |
| Preserve public CLI command surface | Tasks 3, 5 negative assertions |

### Placeholder Scan

This plan intentionally contains no `TBD`, `TODO`, `implement later`, or unspecified placeholders in task steps. Angle-bracket values appear only inside skill templates where the skill must fill runtime-specific ledger values.

### Type Consistency

The plan consistently uses these identifiers:

- `issue`
- `fix`
- `ready_for_fix`
- `.loopx/issues/issue-<slug>-<timestamp>.md`
- `expected_touched_files`
- `parallel_safe`
- `Diagnosis Summary Contract`

### Design Drift Check

The plan does not add GitHub automation, git worktrees, runtime CLI commands, or reuse of `exec/subagent-exec` for bug execution. Those are explicitly rejected by the design.

### Surface-Change Coverage

The plan includes Surface Inventory, Caller Proof, Negative Assertions, package dry-run, and current product docs checks because it changes bundled install/package/docs surfaces.

### Subagent Handoff Readiness

Every task lists exact files, interfaces, commands, expected outputs, and commit boundaries. Implementation tasks are independent enough for a fresh implementer and reviewer.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-23-issue-driven-workflow.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
