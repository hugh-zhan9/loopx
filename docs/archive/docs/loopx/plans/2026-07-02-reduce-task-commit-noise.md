# Reduce Task Commit Noise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-02-reduce-task-commit-noise/需求设计文档.md`

**Goal:** Change loopx execution contracts so task execution and task review no longer create or require per-task git commits or staging, while single-plan work commits once at the plan boundary and multi-plan work commits once per child plan.

**Architecture:** This is a single executable plan because the change is cross-cutting and the source explicitly wants one commit for a single-plan execution. The implementation updates canonical skill contracts, the subagent review-package helper, current public wording, and governance tests together so planning, execution, review, and verification agree on the same commit policy.

**Tech Stack:** Node.js ESM tests with `node:test`; shell helper scripts under `skills/subagent-exec/scripts`; Markdown skill contracts under `skills/`, `README.md`, `README.zh-CN.md`, and `skills/RESOLVER.md`.

**Support lenses:** `cli-developer` for `skills/subagent-exec/scripts/review-package`; `lancet` activates at implementation/review time.

## Global Constraints

- Source design is binding: do not reintroduce per-task commits, per-task staging, checkpoint commits, grouped commits, configurable commit policy, or historical plan compatibility.
- Single-plan execution default: one implementation commit after all tasks and required reviews pass.
- Multi-plan package default: one implementation commit after each child plan completes and passes its plan-level review.
- Task review is a task-contract gate over current code, task brief, implementer report, review package, and test evidence. It is not a commit-range gate.
- Do not replace per-task `git commit` with per-task `git add`.
- Canonical bundled skill source is `skills/`. Normal installs and plugin installs consume package-root `skills/`; do not edit installed user copies.
- Local workflow state under `.loopx/` is scratch and must not be added to repo-tracked outputs.
- Use modern JavaScript ESM, two-space indentation, semicolons, single quotes, and Node built-in `node:test`/`node:assert/strict` patterns.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: same-context `plan-reviewer` rubric applied before final save. Coverage matrix: AC-001 -> T-001/T-002/T-005; AC-002 -> T-001/T-003; AC-003 -> T-001/T-004; AC-004 -> T-001/T-005; AC-005 -> T-002/T-003/T-005; AC-006 -> T-003/T-005; AC-007 -> T-003/T-004; AC-008 -> T-001/T-005. D-001 -> T-002/T-005; D-002 -> T-003/T-005; D-003 -> T-003; D-004 -> T-004; D-005 -> T-005; D-006 -> T-001/T-005. TC-001..TC-011 map to task verification steps below.
- Recheck evidence: same-context recheck found no Critical or Important gaps after adding README/RESOLVER coverage and explicit no-staging negative assertions.
- Residual risk: degraded independence only; no separate plan-reviewer subagent was available in this session.

---

## Surface Inventory

- Public commands/API/routes/events/config: no new public command; internal helper `skills/subagent-exec/scripts/review-package` changes invocation contract.
- Exported functions/types/modules: none.
- Runtime/generated artifacts and templates: `.loopx/subagent-exec/*` scratch review packages and progress ledger wording.
- Installer/package/deployment surface: bundled skill source under `skills/`; plugin install reads package-root canonical skills.
- Hooks/background jobs/automation: none.
- Current product docs: `README.md`, `README.zh-CN.md`, `skills/RESOLVER.md`.
- Tests/governance checks: `test/skill-governance.test.mjs`, `plugins/loopx/scripts/plugin-install.test.mjs`, `scripts/verify-skills.mjs`.
- Compatibility/migration paths: no historical plan compatibility or migration path is allowed by D-006.

Caller proof commands to run during implementation:

```bash
rg -n "Frequent commits|Commit your work|Commits created|scripts/review-package BASE HEAD|commits <base7>|concrete git range|staged review|\"Commit\" is a step|Step 5: Commit|git add tests/path|review-package BASE" skills README.md README.zh-CN.md test plugins docs/loopx/specs
rg -n "review-package" skills test plugins README.md README.zh-CN.md docs/loopx/specs
```

Decision rule:

- References in historical docs or old plans under `docs/loopx/plans/` may remain because they are frozen context.
- Current product surfaces listed in the first command must not preserve removed per-task commit or task commit-range contract wording unless the text explicitly marks it as rejected historical behavior.
- `review-package` callers in current skills/tests must use the new current-worktree evidence contract.

Negative assertions required before finish:

```bash
! rg -n "Frequent commits|Commit your work|Commits created|scripts/review-package BASE HEAD|commits <base7>|\"Commit\" is a step|Step 5: Commit|git add tests/path" skills test plugins/loopx/scripts README.md README.zh-CN.md docs/loopx/specs
! rg -n "staged review|per-task staging|git add.*task" skills/subagent-exec skills/exec skills/plan-to-exec test/skill-governance.test.mjs
node --test test/skill-governance.test.mjs
node --test plugins/loopx/scripts/plugin-install.test.mjs
npm test
node scripts/verify-skills.mjs
```

## File Structure

- `test/skill-governance.test.mjs`: add and update governance assertions for the new commit policy, review package helper, prompt wording, progress ledger wording, README/RESOLVER wording, and no historical compatibility branch.
- `plugins/loopx/scripts/plugin-install.test.mjs`: update canonical `plan-to-exec` expectations so plugin install governance no longer expects old task-commit planning language.
- `skills/plan-to-exec/SKILL.md`: remove frequent/per-task commit guidance and add plan-boundary commit policy guidance.
- `skills/exec/SKILL.md`: update inline execution completion and checkpoint wording to avoid task commits while preserving final audit expectations.
- `skills/exec/references/checkpoints-and-resume.md`: change checkpoint ledger `Commit` column to task evidence/review package fields.
- `skills/subagent-exec/SKILL.md`: update orchestration, startup rationale, review package call, completion rules, and boundary commit policy.
- `skills/subagent-exec/implementer-prompt.md`: remove implementer commit requirement and commit-return field.
- `skills/subagent-exec/task-reviewer-prompt.md`: replace commit-range placeholders with current code/worktree evidence package placeholders.
- `skills/subagent-exec/references/task-handoff-and-review.md`: update review package contract and progress ledger row.
- `skills/subagent-exec/references/model-selection-and-retry.md`: update DONE handling to generate current-worktree review evidence.
- `skills/subagent-exec/scripts/review-package`: change helper from mandatory `BASE HEAD` range to current worktree evidence package generation.
- `skills/review/SKILL.md` and `skills/review/code-reviewer.md`: distinguish task/checkpoint review from feature/pre-merge git range review.
- `README.md`, `README.zh-CN.md`, `skills/RESOLVER.md`: update public skill wording that currently implies review always requires a concrete git range or subagent-exec uses staged review.

## Task Completion Policy

This plan is a single-plan source. Executors must not create task-level commits or task-level staging commits while implementing this plan. After all tasks and required reviews pass, create one implementation commit for this plan before `final-review`/`finish`, following the final execution skill contract that this plan implements.

### T-001 / Task 1: Add Governance Tests For Boundary Commits And Worktree Review Evidence

**Files:**
- Modify: `test/skill-governance.test.mjs`
- Modify: `plugins/loopx/scripts/plugin-install.test.mjs`

**Interfaces:**
- Consumes: source design anchors `D-001` through `D-006`; existing helper tests around `subagent-workspace`, `task-brief`, and `review-package`.
- Produces: failing governance coverage that later tasks make pass.

**Traceability:**
- Source AC: `AC-001`, `AC-002`, `AC-003`, `AC-004`, `AC-007`, `AC-008`
- Design anchors: `D-001`, `D-003`, `D-004`, `D-005`, `D-006`
- Test cases: `TC-001`, `TC-002`, `TC-003`, `TC-005`, `TC-006`, `TC-009`, `TC-010`, `TC-011`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs`: expected FAIL before later tasks because old skill/helper wording still requires per-task commits and commit ranges.
  - `node --test plugins/loopx/scripts/plugin-install.test.mjs`: expected FAIL before later tasks if plugin governance still locks old planning contract.
- `evidence_summary`: failing assertions prove current contracts still contain removed commit/staging/range assumptions.
- `remaining_risk`: none after later tasks pass the same tests.

**Review focus:**
- Verify tests assert the new source contract without forcing a specific implementation wording beyond D-001 through D-006.
- Check assertions scan only current product surfaces and explicitly exclude historical plan files from strict negative assertions.
- Confirm tests do not require per-task staging as a replacement for per-task commits.

**Support lenses:** none

- [ ] **Step 1: Add helper assertions for current skill text**

  In `test/skill-governance.test.mjs`, add a new `it` block near the existing subagent helper and main-chain governance tests:

  ```js
  it('governs boundary commit policy and task review worktree evidence', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    const execSkill = await readSkillSurface('exec', ['checkpoints-and-resume.md']);
    const subagentSkill = await readSkillSurface('subagent-exec', ['task-handoff-and-review.md', 'model-selection-and-retry.md']);
    const implementerPrompt = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'implementer-prompt.md'), 'utf8');
    const reviewerPrompt = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'task-reviewer-prompt.md'), 'utf8');
    const reviewSkill = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    const resolver = await readFile(resolverPath, 'utf8');
    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');

    for (const text of [planSkill, execSkill, subagentSkill, implementerPrompt, reviewerPrompt]) {
      assert.doesNotMatch(text, /Frequent commits|Commit your work|Commits created|Step 5: Commit|"Commit" is a step/);
      assert.doesNotMatch(text, /scripts\/review-package BASE HEAD|commits <base7>\.\.<head7>/);
    }

    assert.match(planSkill, /single-plan.*one.*commit|one.*commit.*single-plan/is);
    assert.match(planSkill, /multi-plan.*child plan.*one.*commit|one.*commit.*child plan/is);
    assert.match(subagentSkill, /current worktree|worktree evidence/i);
    assert.match(implementerPrompt, /Do not commit|must not commit/i);
    assert.match(implementerPrompt, /Do not stage|must not stage|do not run `git add`/i);
    assert.match(reviewerPrompt, /current code|worktree evidence/i);
    assert.match(reviewSkill, /task.*current code|worktree evidence/is);
    assert.doesNotMatch(resolver, /staged review/i);
    assert.doesNotMatch(readme, /concrete git range needs independent code review/i);
    assert.doesNotMatch(readmeZh, /具体 git range 需要独立代码评审/);
  });
  ```

- [ ] **Step 2: Replace the existing review-package helper test range with worktree evidence**

  In the existing subagent helper test around `const packagePath = ... review-package`, stop creating a second commit for `change app`.

  Replace the second commit setup:

  ```js
  await writeFile(join(wd, 'app.txt'), 'one\ntwo\n');
  await execFileAsync('git', ['add', '.'], { cwd: wd });
  await execFileAsync('git', ['commit', '-m', 'change app'], { cwd: wd });
  const head = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: wd })).stdout.trim();
  ```

  with:

  ```js
  await writeFile(join(wd, 'app.txt'), 'one\ntwo\n');
  ```

  Then replace:

  ```js
  const packagePath = (await execFileAsync(join(scriptsDir, 'review-package'), [base, head], { cwd: wd })).stdout.trim();
  ```

  with:

  ```js
  const packagePath = (await execFileAsync(join(scriptsDir, 'review-package'), ['--worktree', 'T-001'], { cwd: wd })).stdout.trim();
  ```

  Update assertions to require:

  ```js
  assert.match(reviewPackage, /# Review Package/);
  assert.match(reviewPackage, /Mode: worktree/);
  assert.match(reviewPackage, /Task: T-001/);
  assert.match(reviewPackage, /## Git Status/);
  assert.match(reviewPackage, /## Diff Stat/);
  assert.match(reviewPackage, /## Diff/);
  assert.match(reviewPackage, /two/);
  assert.doesNotMatch(reviewPackage, /## Commits/);
  ```

- [ ] **Step 3: Update the progress ledger assertion**

  Replace the progress append/read assertion:

  ```js
  await appendFile(progressPath, 'Task 1: complete (commits base..head, review clean)\n');
  assert.equal(
    await readFile(progressPath, 'utf8'),
    'Task 1: complete (commits base..head, review clean)\n',
  );
  ```

  with:

  ```js
  await appendFile(progressPath, 'Task 1: complete (review clean, brief brief.md, report report.md, review review.diff)\n');
  assert.equal(
    await readFile(progressPath, 'utf8'),
    'Task 1: complete (review clean, brief brief.md, report report.md, review review.diff)\n',
  );
  ```

- [ ] **Step 4: Add negative assertion coverage for no staging replacement**

  In the new governance test, include:

  ```js
  for (const text of [planSkill, execSkill, subagentSkill, implementerPrompt]) {
    assert.doesNotMatch(text, /per-task staging/i);
    assert.doesNotMatch(text, /git add.*task/i);
  }
  ```

  This protects `TC-010`.

- [ ] **Step 5: Update plugin install governance**

  In `plugins/loopx/scripts/plugin-install.test.mjs`, update `locks plan-to-exec as the canonical implementation-planning contract` so it asserts the new policy:

  ```js
  assert.match(planSkill, /Plan Boundary Commit Policy|Boundary Commit Policy/);
  assert.match(planSkill, /single-plan.*one.*commit|one.*commit.*single-plan/is);
  assert.doesNotMatch(planSkill, /Frequent commits|Step 5: Commit|"Commit" is a step/);
  ```

  Keep existing assertions for `Bite-Sized Task Granularity`, `No Placeholders`, plan paths, and `loopx:subagent-exec`.

- [ ] **Step 6: Run focused tests and record expected red state**

  ```bash
  node --test test/skill-governance.test.mjs
  node --test plugins/loopx/scripts/plugin-install.test.mjs
  ```

  Expected: FAIL only on assertions for the not-yet-updated skill/helper contracts.

### T-002 / Task 2: Update Plan-To-Exec Contract To Remove Per-Task Commit Planning

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `plugins/loopx/scripts/plugin-install.test.mjs` only if Task 1 did not fully update plugin expectations

**Interfaces:**
- Consumes: `D-001`, `D-002`, `D-006`; plan header/task template consumed by future `exec` and `subagent-exec`.
- Produces: new planning contract that generates task steps without `git add`/`git commit` and states boundary commit policy.

**Traceability:**
- Source AC: `AC-001`, `AC-005`, `AC-006`, `AC-008`
- Design anchors: `D-001`, `D-002`, `D-006`
- Test cases: `TC-001`, `TC-005`, `TC-007`, `TC-008`, `TC-011`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`:
  - `node --test plugins/loopx/scripts/plugin-install.test.mjs`: expected PASS for plan-to-exec contract after this task if Task 1 plugin assertions are complete.
  - `node --test test/skill-governance.test.mjs`: may still FAIL on downstream execution/review contracts until later tasks.
- `evidence_summary`: `plan-to-exec` no longer contains removed per-task commit template text and contains boundary commit policy wording.
- `remaining_risk`: downstream skills still need updates until T-003/T-004.

**Review focus:**
- Verify task examples remain actionable and test-driven while no step defaults to commit or staging.
- Confirm source design priority is preserved: no historical compatibility branch, no user-configurable commit policy, no checkpoint commits.
- Check `metadata.version` is bumped for changed skill content.

**Support lenses:** none

- [ ] **Step 1: Bump skill metadata version**

  In `skills/plan-to-exec/SKILL.md`, bump:

  ```yaml
  metadata:
    version: "0.3.12"
  ```

  to:

  ```yaml
  metadata:
    version: "0.3.13"
  ```

- [ ] **Step 2: Replace the overview commit wording**

  Replace the final sentence of the overview paragraph:

  ```text
  Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.
  ```

  with:

  ```text
  Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Plan-boundary commits.
  ```

- [ ] **Step 3: Add a Plan Boundary Commit Policy section**

  Add after `## Task Right-Sizing`:

  ```markdown
  ## Plan Boundary Commit Policy

  New plans must not put `git add` or `git commit` inside individual task steps by default.
  Task execution evidence proves task completion; Git commits are created only at the execution boundary.

  - Single-plan execution: create one implementation commit after all tasks and required reviews pass.
  - Multi-plan package execution: create one implementation commit after each child plan completes and its plan-level review passes.
  - Direct child plan execution: create one implementation commit after that child plan completes and its plan-level review passes.

  Do not replace per-task commits with per-task staging. Do not add historical-plan compatibility tasks.
  ```

- [ ] **Step 4: Rewrite Bite-Sized Task Granularity**

  Replace:

  ```markdown
  - "Commit" is a step.
  ```

  with:

  ```markdown
  - "Record task evidence" is a step.
  - Plan-boundary commit instructions belong in the execution handoff, not inside individual task steps.
  ```

- [ ] **Step 5: Rewrite the Task Structure example**

  Replace the example `Step 5: Commit` block with:

  ````markdown
  - [ ] **Step 5: Record task evidence**

  Record the task evidence fields expected by `exec` or `subagent-exec`:

  ```yaml
  task_anchor: T-001
  source_ac:
    - AC-001
  design_anchors:
    - D-001
  test_cases:
    - TC-001
  commands_run:
    - pytest tests/path/test.py::test_name -v: PASS
  evidence_summary: specific behavior is implemented and verified
  remaining_risk: none
  ```
  ````

- [ ] **Step 6: Update the Remember checklist**

  Replace:

  ```markdown
  - DRY, YAGNI, TDD, frequent commits
  ```

  with:

  ```markdown
  - DRY, YAGNI, TDD, plan-boundary commits
  - Never require per-task commits or per-task staging unless a future approved design explicitly changes the commit policy.
  ```

- [ ] **Step 7: Update Execution Handoff text**

  In the execution handoff section, add before the multi-plan handoff snippet:

  ```markdown
  Commit policy for generated plans:

  - Single-plan execution creates one implementation commit after all tasks and required reviews pass.
  - Multi-plan package execution creates one implementation commit after each child plan completes and its plan-level review passes.
  - Task-level reviews use task evidence and review packages; they do not require task-level commits or staging.
  ```

- [ ] **Step 8: Run focused plan contract checks**

  ```bash
  node --test plugins/loopx/scripts/plugin-install.test.mjs
  node --test test/skill-governance.test.mjs
  ```

  Expected: plugin plan-to-exec test passes. Governance may still fail on `exec`, `subagent-exec`, `review-package`, README, or resolver contracts until later tasks.

### T-003 / Task 3: Update Exec And Subagent Contracts To Defer Commits To Plan Boundaries

**Files:**
- Modify: `skills/exec/SKILL.md`
- Modify: `skills/exec/references/checkpoints-and-resume.md`
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `skills/subagent-exec/implementer-prompt.md`
- Modify: `skills/subagent-exec/references/task-handoff-and-review.md`
- Modify: `skills/subagent-exec/references/model-selection-and-retry.md`

**Interfaces:**
- Consumes: plan boundary commit policy from T-002; review package helper contract from T-004.
- Produces: executor and implementer contracts that no longer create task commits or require staging.

**Traceability:**
- Source AC: `AC-002`, `AC-005`, `AC-006`, `AC-007`
- Design anchors: `D-002`, `D-003`, `D-004`
- Test cases: `TC-002`, `TC-007`, `TC-008`, `TC-009`, `TC-010`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs`: may still FAIL on helper script behavior until T-004, but text assertions for executor/prompt contracts should pass.
- `evidence_summary`: `exec` and `subagent-exec` describe task evidence and boundary commits, while implementer prompt forbids task commits/staging.
- `remaining_risk`: helper script implementation remains until T-004.

**Review focus:**
- Verify `subagent-exec` still requires task review after every subagent task and still gates Critical/Important findings.
- Confirm `finish-start` rationale no longer assumes implementers commit.
- Check multi-plan direct child mode commits only at child completion, not per task.

**Support lenses:** none

- [ ] **Step 1: Bump changed skill metadata versions**

  In `skills/exec/SKILL.md`, bump `metadata.version` from `0.3.9` to `0.3.10`.

  In `skills/subagent-exec/SKILL.md`, bump `metadata.version` from `0.3.12` to `0.3.13`.

- [ ] **Step 2: Update `exec` task and completion wording**

  In `skills/exec/SKILL.md`, after Required Startup, add:

  ```markdown
  ## Commit Policy

  Do not create task-level commits or task-level staging checkpoints.

  - Single plan: create one implementation commit after all tasks and checkpoint obligations are clean, before `loopx:final-review`.
  - Multi-plan package: create one implementation commit after each child plan completes and its plan-level review is clean.
  - Direct child plan: create one implementation commit after that child plan completes and its plan-level review is clean.

  Task completion is proven by evidence fields and review results, not by commit SHAs.
  ```

  Update `Completion By Scope` so each scope explicitly references the boundary commit before final-review/finish.

- [ ] **Step 3: Update exec checkpoint reference**

  In `skills/exec/references/checkpoints-and-resume.md`, replace the checkpoint sample:

  ```markdown
  - Current SHA: <latest commit>
  ...
  | Task | Status | Commit | Notes |
  ```

  with:

  ```markdown
  - Current status: <git status --short summary or clean>
  ...
  | Task | Status | Evidence | Notes |
  ```

  Replace sample rows with evidence paths or summaries:

  ```markdown
  | T-001 / Task 1 | completed | task evidence recorded | review clean |
  | T-002 / Task 2 | in_progress | - | |
  | T-003 / Task 3 | pending | - | |
  ```

- [ ] **Step 4: Update `subagent-exec` orchestration**

  In `skills/subagent-exec/SKILL.md`:

  - Replace “generate a review package with `scripts/review-package`” wording with “generate a current-worktree review package with `scripts/review-package --worktree <task-anchor>`”.
  - Replace “even after implementers commit their work” with “while task work remains uncommitted until the plan or child-plan boundary”.
  - Replace `scripts/review-package BASE HEAD` with `scripts/review-package --worktree <task-anchor>`.
  - Add a `## Commit Policy` section matching the plan-boundary rules from T-002.
  - In `Completion By Scope`, state the boundary commit happens before the relevant `final-review`.

- [ ] **Step 5: Update implementer prompt**

  In `skills/subagent-exec/implementer-prompt.md`:

  - Replace job step `4. Commit your work` with `4. Do not commit or stage your work; leave changes in the working tree for task review`.
  - Replace `Return only status, commits, a one-line test summary...` with `Return only status, changed files, a one-line test summary...`.
  - Replace the final status bullet `Commits created (short SHA + subject)` with `Changed files`.
  - Add this rule under `## Your Job`:

    ```markdown
    Do not run `git add` or `git commit` for task completion. Task completion is proven through the report fields and review package.
    ```

- [ ] **Step 6: Update task handoff reference**

  In `skills/subagent-exec/references/task-handoff-and-review.md`, replace the `## Review Package` section with:

  ```markdown
  ## Review Package

  Generate the review package from the current working tree:

  ```bash
  scripts/review-package --worktree T-001
  ```

  The package must include git status, changed files, diff stat, and full diff context. It must not require a task commit, `HEAD~1`, or per-task staging.
  ```

  Replace the progress ledger row with:

  ```text
  T-001 / Task 1: complete (review clean, brief <path>, report <path>, review <path>)
  ```

  Remove the historical-plan compatibility sentence for old `Task N` rows only if it implies preserving commit-range behavior. Keep legacy numeric task heading support only when scoped to `task-brief` parsing.

- [ ] **Step 7: Update model retry reference**

  In `skills/subagent-exec/references/model-selection-and-retry.md`, replace:

  ```markdown
  Generate the review package with `scripts/review-package BASE HEAD`, then
  dispatch the task reviewer.
  ```

  with:

  ```markdown
  Generate the current-worktree review package with `scripts/review-package --worktree <task-anchor>`, then dispatch the task reviewer.
  ```

- [ ] **Step 8: Run focused governance**

  ```bash
  node --test test/skill-governance.test.mjs
  ```

  Expected: executor/prompt text assertions pass. Helper behavior may still fail until T-004.

### T-004 / Task 4: Implement Current-Worktree Review Package Helper

**Files:**
- Modify: `skills/subagent-exec/scripts/review-package`
- Modify: `skills/subagent-exec/task-reviewer-prompt.md`
- Modify: `test/skill-governance.test.mjs` only if Task 1 helper assertions need alignment with the final helper output

**Interfaces:**
- Consumes: `scripts/review-package --worktree <task-anchor> [OUTFILE]` contract from T-003.
- Produces: review packages for uncommitted and unstaged current working tree changes.

**Traceability:**
- Source AC: `AC-003`, `AC-007`
- Design anchors: `D-004`
- Test cases: `TC-003`, `TC-006`, `TC-009`, `TC-010`
- Task anchor: `T-004`

**Expected execution evidence:**
- `commands_run`:
  - `node --test test/skill-governance.test.mjs`: expected PASS for helper behavior after this task unless remaining docs wording fails.
- `evidence_summary`: helper generates worktree review package without `git add`, `git commit`, `BASE`, or `HEAD` arguments.
- `remaining_risk`: README/review wording remains until T-005.

**Review focus:**
- Verify helper writes only scratch package files and does not mutate working tree, index, or HEAD.
- Check stdout/stderr contract: success prints only path; usage/errors go to stderr with nonzero exit.
- Confirm diff includes unstaged changes and does not require staged changes.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Replace helper usage and argument parsing**

  In `skills/subagent-exec/scripts/review-package`, replace the usage block with:

  ```bash
  usage() {
    echo "usage: review-package --worktree TASK_ANCHOR [OUTFILE]" >&2
  }

  if [ $# -lt 2 ] || [ $# -gt 3 ] || [ "$1" != "--worktree" ]; then
    usage
    exit 2
  fi

  task_anchor=$2
  ```

  Keep `set -euo pipefail`.

- [ ] **Step 2: Keep output path behavior stable**

  Preserve optional outfile behavior:

  ```bash
  script_dir=$(cd "$(dirname "$0")" && pwd)
  if [ $# -eq 3 ]; then
    out=$3
    mkdir -p "$(dirname "$out")"
  else
    dir=$("$script_dir/subagent-workspace")
    safe_anchor=$(printf '%s' "$task_anchor" | tr -c 'A-Za-z0-9._-' '-')
    out="$dir/review-${safe_anchor}-worktree.diff"
  fi
  ```

- [ ] **Step 3: Generate current-worktree evidence**

  Replace the commit range body with:

  ```bash
  {
    echo "# Review Package"
    echo ""
    echo "Mode: worktree"
    echo "Task: $task_anchor"
    echo "Head: $(git rev-parse HEAD)"
    echo ""
    echo "## Git Status"
    echo ""
    git status --short
    echo ""
    echo "## Changed Files"
    echo ""
    git diff --name-only
    echo ""
    echo "## Diff Stat"
    echo ""
    git diff --stat
    echo ""
    echo "## Diff"
    echo ""
    git diff -U10
  } > "$out"
  ```

  Do not run `git add`, `git commit`, or any command that mutates the index/HEAD.

- [ ] **Step 4: Preserve success stdout**

  Keep the existing final path print:

  ```bash
  cd "$(dirname "$out")" && printf '%s/%s\n' "$(pwd)" "$(basename "$out")"
  ```

- [ ] **Step 5: Update task reviewer prompt placeholders**

  In `skills/subagent-exec/task-reviewer-prompt.md`:

  - Change “diff package” to “review package” in the intro.
  - Replace the `## Diff Under Review` section with:

    ```markdown
    ## Current Code Under Review

    **Task:** [TASK_ANCHOR]
    **Review package:** [REVIEW_PACKAGE_FILE]

    Read the review package once. It contains current HEAD, git status, changed files, diff stat, and full working-tree diff with context. This is task-scoped review evidence, not a task commit range.
    ```

  - Replace references to “actual diff” with “review package, current code, and test evidence”.
  - Replace placeholders `[BASE_SHA]`, `[HEAD_SHA]`, `[DIFF_FILE]` with `[TASK_ANCHOR]` and `[REVIEW_PACKAGE_FILE]`.
  - Keep the read-only rule and explicitly include index/HEAD mutation prohibition.

- [ ] **Step 6: Run focused helper tests**

  ```bash
  node --test test/skill-governance.test.mjs
  ```

  Expected: helper and prompt assertions pass. README/RESOLVER/review text may still fail until T-005.

### T-005 / Task 5: Align Review, Public Wording, Final Audit Contract, And Release Verification

**Files:**
- Modify: `skills/review/SKILL.md`
- Modify: `skills/review/code-reviewer.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `skills/RESOLVER.md`
- Modify: `test/skill-governance.test.mjs` only to add final negative assertions if missing

**Interfaces:**
- Consumes: updated plan/execution/helper contracts from T-002 through T-004.
- Produces: current product wording and release verification that preserve final audit while no longer implying task review requires a git range.

**Traceability:**
- Source AC: `AC-001`, `AC-004`, `AC-005`, `AC-006`, `AC-008`
- Design anchors: `D-001`, `D-002`, `D-005`, `D-006`
- Test cases: `TC-004`, `TC-005`, `TC-007`, `TC-008`, `TC-011`
- Task anchor: `T-005`

**Expected execution evidence:**
- `commands_run`:
  - `rg -n "Frequent commits|Commit your work|Commits created|scripts/review-package BASE HEAD|commits <base7>|concrete git range|staged review|\"Commit\" is a step|Step 5: Commit|git add tests/path|review-package BASE" skills README.md README.zh-CN.md test plugins docs/loopx/specs`: expected no current-surface matches except test pattern definitions that assert absence.
  - `node --test test/skill-governance.test.mjs`: expected PASS.
  - `node --test plugins/loopx/scripts/plugin-install.test.mjs`: expected PASS.
  - `npm test`: expected PASS.
  - `node scripts/verify-skills.mjs`: expected PASS.
- `evidence_summary`: all current skill/public surfaces align on boundary commits, worktree task review evidence, and final audit preservation.
- `remaining_risk`: none.

**Review focus:**
- Verify `review` still supports git range review for major feature/pre-merge work but no longer says every review is a concrete git range.
- Confirm `final-review` and `finish` audit gates remain unchanged and tests still pass.
- Ensure no historical compatibility or migration task was added.

**Support lenses:** none

- [ ] **Step 1: Bump review skill metadata if changed**

  In `skills/review/SKILL.md`, bump `metadata.version` from `0.3.9` to `0.3.10`.

- [ ] **Step 2: Update review skill description and SHA guidance**

  In `skills/review/SKILL.md`, replace the frontmatter description:

  ```yaml
  description: "Dispatches a loopx code reviewer subagent against a concrete git range and requirements with spec compliance and code quality stages. Not for implementation, planning, or unresolved review scope."
  ```

  with:

  ```yaml
  description: "Dispatches a loopx code reviewer subagent against task evidence or a feature git range with spec compliance and code quality stages. Not for implementation, planning, or unresolved review scope."
  ```

  Replace `## How to Get Git SHAs` with:

  ```markdown
  ## Review Evidence Inputs

  Task or checkpoint review may use a task brief, implementer report, review package, current code, and test evidence.

  Feature, pre-merge, final integration, or external PR review may use a concrete git range:

  ```bash
  BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main, or a recorded baseline
  HEAD_SHA=$(git rev-parse HEAD)
  ```
  ```

- [ ] **Step 3: Update code reviewer prompt**

  In `skills/review/code-reviewer.md`, change `## Git Range to Review` to `## Evidence to Review`.

  Keep git range commands for feature/pre-merge review, but add:

  ```markdown
  For task-scoped review, the caller may provide a review package instead of a git range. Use that package, the task brief, implementation report, current code, and test evidence as the review basis.
  ```

  Do not remove support for `{BASE_SHA}` and `{HEAD_SHA}` because feature-level review still uses git ranges.

- [ ] **Step 4: Update README skill tables**

  In `README.md`, replace:

  ```markdown
  | `review` | A concrete git range needs independent code review. |
  ```

  with:

  ```markdown
  | `review` | Completed task evidence, checkpoint work, or a feature git range needs independent code review. |
  ```

  In `README.zh-CN.md`, replace:

  ```markdown
  | `review` | 具体 git range 需要独立代码评审。 |
  ```

  with:

  ```markdown
  | `review` | 已完成 task evidence、checkpoint work 或 feature git range 需要独立代码评审。 |
  ```

- [ ] **Step 5: Update resolver wording**

  In `skills/RESOLVER.md`, replace:

  ```markdown
  | Approved plan has independent tasks and should run with subagents plus staged review | `skills/subagent-exec/SKILL.md` |
  ```

  with:

  ```markdown
  | Approved plan has independent tasks and should run with subagents plus task-scoped review | `skills/subagent-exec/SKILL.md` |
  ```

  Replace:

  ```markdown
  | Completed task, major feature, or pre-merge work needs independent code review | `skills/review/SKILL.md` |
  ```

  with:

  ```markdown
  | Completed task evidence, checkpoint work, major feature, or pre-merge work needs independent code review | `skills/review/SKILL.md` |
  ```

- [ ] **Step 6: Run current-surface negative assertions**

  ```bash
  rg -n "Frequent commits|Commit your work|Commits created|scripts/review-package BASE HEAD|commits <base7>|concrete git range|staged review|\"Commit\" is a step|Step 5: Commit|git add tests/path|review-package BASE" skills README.md README.zh-CN.md test plugins docs/loopx/specs
  ```

  Expected: no matches except intentionally escaped regex strings inside tests that assert absence. If test regex strings appear, confirm they are absence assertions, not product contract text.

  ```bash
  rg -n "per-task staging|git add.*task" skills/subagent-exec skills/exec skills/plan-to-exec test/skill-governance.test.mjs
  ```

  Expected: no product contract matches except negative assertions or explicit rejection wording.

- [ ] **Step 7: Run focused and full verification**

  ```bash
  node --test test/skill-governance.test.mjs
  node --test plugins/loopx/scripts/plugin-install.test.mjs
  npm test
  node scripts/verify-skills.mjs
  ```

  Expected: PASS. If `npm test` count changes because governance assertions were added, record the new count in task evidence.

## Self-Review

- Spec coverage: Tasks T-001 through T-005 cover AC-001 through AC-008 and D-001 through D-006.
- Placeholder scan: no task uses TBD/TODO/fill-in placeholders. Implementation snippets are concrete and tied to exact files.
- Type consistency: no exported JS APIs are changed; shell helper signature is consistently `scripts/review-package --worktree <task-anchor> [OUTFILE]`.
- Design drift: plan does not add configurable commit policy, checkpoint commits, staging-based review, or historical compatibility.
- Anchor coverage: every D anchor maps to task verification and review focus.
- Task anchor coverage: all tasks use `T-*` headings, Source AC, Design anchors, Test cases, Expected execution evidence, Review focus, and Support lenses.
- Surface-change coverage: Surface Inventory, caller proof commands, negative assertions, README/RESOLVER updates, package/plugin verification, and governance tests are included.
- Support lens coverage: `cli-developer` is applied to T-004 helper script behavior; `lancet` is recorded for implementation/review-time minimization.
- Subagent handoff readiness: every task lists files, interfaces, commands, expected outcomes, and review focus.
- Test-case coverage: TC-001 through TC-011 map to tasks and verification commands above.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-07-02-reduce-task-commit-noise.md`.

Commit policy for executing this plan:

- Do not create task-level commits.
- Do not create task-level staging checkpoints.
- After all tasks and required reviews pass, create one implementation commit for this single plan before `final-review`/`finish`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review.
2. Inline Execution - execute tasks in this session using exec, with checkpoint reviews.

Recommended:

```text
$subagent-exec docs/loopx/plans/2026-07-02-reduce-task-commit-noise.md
```

Inline fallback:

```text
$exec docs/loopx/plans/2026-07-02-reduce-task-commit-noise.md
```
