# Subagent Exec Combined Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** User request on 2026-06-22: absorb Superpowers updates into loopx by combining `subagent-exec` spec and review into one task reviewer to reduce token use and improve speed, and adopt file handoffs, durable progress, Global Constraints/Interfaces, reviewer discipline, and pre-flight plan conflict scanning.

**Goal:** Update loopx's governed `subagent-exec` workflow so each task uses one combined task reviewer, bulk task/review artifacts move through files, progress survives context compaction, and plans carry the constraints/interfaces subagents need.

**Architecture:** Keep loopx's skill-first v1 workflow and final whole-feature review intact. Inside `subagent-exec`, replace the per-task spec-reviewer plus code-quality-reviewer pair with one `task-reviewer-prompt.md` that returns both spec compliance and task quality verdicts. Add shell helpers under `skills/subagent-exec/scripts/` for task briefs, review packages, and the gitignored `.loopx/subagent-exec/` workspace; mirror all bundled skill files under `plugins/loopx/skills/`.

**Tech Stack:** Node.js ESM package, Markdown skill files, POSIX shell helper scripts, Node built-in `node:test`, existing `scripts/verify-skills.mjs` and `test/skill-governance.test.mjs` governance.

---

## Requirement Anchors

- REQ-001: `subagent-exec` must use one combined per-task reviewer that returns both spec compliance and code quality/task quality verdicts.
- REQ-002: `subagent-exec` must hand large artifacts to subagents through files: task brief, implementer report, and review package.
- REQ-003: `subagent-exec` must track durable task progress in a gitignored ledger under the working tree so context compaction does not cause re-dispatch.
- REQ-004: Review prompts and workflow guidance must require read-only review, distrust implementer reports, prevent controller pre-judging reviewer findings, and require evidence-backed file:line findings.
- REQ-005: `subagent-exec` must run a pre-flight plan conflict scan before Task 1 and batch any plan conflicts or plan-mandated defects to the user.
- REQ-006: `plan-to-exec` must add `Global Constraints` and per-task `Interfaces` blocks so task briefs carry cross-task contracts.
- REQ-007: Root skills, plugin mirror skills, package/governance tests, and public docs/release notes must stay consistent.

## Global Constraints

- Preserve loopx v1 workflow: `clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish`.
- `subagent-exec` per-task review changes from two subagents to one combined task reviewer, but `final-review` remains mandatory after all tasks.
- Keep anchor traceability and surface-change contracts from loopx `0.3.1`; combined review must check both.
- Do not introduce a new CLI command or runtime state machine.
- Use `.loopx/subagent-exec/` for scratch artifacts; `.loopx/` is already ignored by the repository.
- Update `skills/` and `plugins/loopx/skills/` in lockstep; governance requires byte-identical mirrors.
- Keep source style: two-space JavaScript indentation, semicolons, single quotes, Node built-in tests.
- Do not count `docs/release-notes/`, old plans, or `ref/superpowers/` as current product callers.

## Surface Inventory

- Public commands/API/routes/events/config: no new CLI command; no public runtime command changes.
- Exported functions/types/modules: no `src/` module exports changed.
- Runtime/generated artifacts and templates: new skill scratch artifacts under `.loopx/subagent-exec/` at runtime; not committed.
- Installer/package/deployment surface: `package.json.files` already includes `skills/subagent-exec/` and `plugins/loopx/`; new prompt/scripts are shipped through those directories.
- Hooks/background jobs/automation: none.
- Current product docs: `skills/subagent-exec/*`, `skills/review/SKILL.md`, `skills/plan-to-exec/SKILL.md`, plugin mirrors, README only if current workflow wording mentions two-stage per-task review.
- Tests/governance checks: `test/skill-governance.test.mjs`, `scripts/verify-skills.mjs`, `npm test`.
- Compatibility/migration paths: remove or stop current references to `skills/subagent-exec/spec-reviewer-prompt.md` and `skills/subagent-exec/code-quality-reviewer-prompt.md` from current product docs. Historical release notes and old implementation plans may keep those names.

## Caller Proof And Decision Rules

Run these before deleting or replacing prompt references:

```bash
rg "spec-reviewer-prompt|code-quality-reviewer-prompt|two-stage review|Stage 1 \\+ Stage 2" skills plugins README.md README.zh-CN.md docs/loopx/design docs/loopx/specs test src
```

Expected before implementation: current hits in `skills/subagent-exec/`, `plugins/loopx/skills/subagent-exec/`, `skills/review/SKILL.md`, `plugins/loopx/skills/review/SKILL.md`, and possibly `skills/plan-to-exec/SKILL.md`.

Decision rule:

- Current `subagent-exec` task review references must move to `task-reviewer-prompt.md`.
- Current standalone `review` may keep staged Stage 1/Stage 2 semantics, but it must not point at deleted `subagent-exec/spec-reviewer-prompt.md`.
- Historical docs under `docs/release-notes/`, old `docs/loopx/plans/`, and ignored `ref/` are not blockers.

Negative assertions after implementation:

```bash
test ! -e skills/subagent-exec/spec-reviewer-prompt.md
test ! -e skills/subagent-exec/code-quality-reviewer-prompt.md
test ! -e plugins/loopx/skills/subagent-exec/spec-reviewer-prompt.md
test ! -e plugins/loopx/skills/subagent-exec/code-quality-reviewer-prompt.md
! rg "spec-reviewer-prompt|code-quality-reviewer-prompt|two-stage review" skills plugins README.md README.zh-CN.md docs/loopx/design docs/loopx/specs test src
npm pack --dry-run
```

Expected: all commands exit 0; `npm pack --dry-run` lists `skills/subagent-exec/task-reviewer-prompt.md` and `skills/subagent-exec/scripts/` files through the existing broad skill directory entries.

## Task 1: Add Governance Tests For Combined Review And File Handoffs

**Files:**
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: existing helper functions `recursiveFiles`, `assertMarkdownStructure`, `LOOPX_BUNDLED_SKILLS`.
- Produces: failing tests that define the new governed skill contract before implementation.

- [ ] **Step 1: Add imports for script execution and temp git fixtures**

Modify the import block at the top of `test/skill-governance.test.mjs`:

```js
import { execFile } from 'node:child_process';
import { chmod, existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
```

Add after `repoRoot` constants:

```js
const execFileAsync = promisify(execFile);
```

- [ ] **Step 2: Add test for combined task reviewer prompt and old prompt removal**

Append inside `describe('loopx skill governance', () => { ... })`:

```js
  it('governs subagent-exec combined task review surface', async () => {
    const rootSkillDir = join(repoRoot, 'skills', 'subagent-exec');
    const pluginSkillDir = join(repoRoot, 'plugins', 'loopx', 'skills', 'subagent-exec');
    const rootSkill = await readFile(join(rootSkillDir, 'SKILL.md'), 'utf8');
    const pluginSkill = await readFile(join(pluginSkillDir, 'SKILL.md'), 'utf8');
    const taskReviewer = await readFile(join(rootSkillDir, 'task-reviewer-prompt.md'), 'utf8');
    const implementer = await readFile(join(rootSkillDir, 'implementer-prompt.md'), 'utf8');
    const codexReference = await readFile(join(rootSkillDir, 'codex-subagents.md'), 'utf8');

    assert.equal(pluginSkill, rootSkill, 'subagent-exec SKILL.md mirror drifted');
    assert.equal(existsSync(join(rootSkillDir, 'task-reviewer-prompt.md')), true);
    assert.equal(existsSync(join(pluginSkillDir, 'task-reviewer-prompt.md')), true);
    assert.equal(existsSync(join(rootSkillDir, 'spec-reviewer-prompt.md')), false);
    assert.equal(existsSync(join(rootSkillDir, 'code-quality-reviewer-prompt.md')), false);
    assert.equal(existsSync(join(pluginSkillDir, 'spec-reviewer-prompt.md')), false);
    assert.equal(existsSync(join(pluginSkillDir, 'code-quality-reviewer-prompt.md')), false);

    assert.match(rootSkill, /task-reviewer-prompt\.md/);
    assert.match(rootSkill, /progress ledger/);
    assert.match(rootSkill, /Pre-Flight Plan Review/);
    assert.match(rootSkill, /review package/);
    assert.doesNotMatch(rootSkill, /spec-reviewer-prompt|code-quality-reviewer-prompt|two-stage review/i);
    assert.match(taskReviewer, /Spec Compliance/);
    assert.match(taskReviewer, /Task quality/);
    assert.match(taskReviewer, /Anchor traceability/);
    assert.match(taskReviewer, /Surface-change compliance/);
    assert.match(taskReviewer, /read-only/i);
    assert.match(taskReviewer, /Do Not Trust the Report/);
    assert.match(taskReviewer, /Cannot verify from diff/);
    assert.match(implementer, /Read your task brief first/);
    assert.match(implementer, /REPORT_FILE/);
    assert.match(codexReference, /task-reviewer-prompt\.md/);
    assert.doesNotMatch(codexReference, /spec reviewer, and code quality reviewer/);
  });
```

- [ ] **Step 3: Add test for helper script behavior**

Append:

```js
  it('subagent-exec helper scripts create gitignored file handoff artifacts', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-subagent-exec-'));
    await execFileAsync('git', ['init'], { cwd: wd });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: wd });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: wd });
    await writeFile(join(wd, 'plan.md'), [
      '# Example Plan',
      '',
      '## Global Constraints',
      '',
      '- Runtime: Node.js ESM.',
      '',
      '### Task 1: Add greeting',
      '',
      '**Interfaces:**',
      '- Consumes: none',
      '- Produces: `greet(name)` returns `Hello, <name>`.',
      '',
      '- [ ] **Step 1: Write file**',
      '',
      '### Task 2: Use greeting',
      '',
      '- [ ] **Step 1: Import function**',
      '',
    ].join('\n'));
    await writeFile(join(wd, 'app.txt'), 'one\n');
    await execFileAsync('git', ['add', '.'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: wd });
    const base = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: wd })).stdout.trim();
    await writeFile(join(wd, 'app.txt'), 'one\ntwo\n');
    await execFileAsync('git', ['add', '.'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'change app'], { cwd: wd });
    const head = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: wd })).stdout.trim();

    const scriptsDir = join(repoRoot, 'skills', 'subagent-exec', 'scripts');
    await chmod(join(scriptsDir, 'subagent-workspace'), 0o755);
    await chmod(join(scriptsDir, 'task-brief'), 0o755);
    await chmod(join(scriptsDir, 'review-package'), 0o755);

    const workspace = (await execFileAsync(join(scriptsDir, 'subagent-workspace'), [], { cwd: wd })).stdout.trim();
    assert.equal(workspace, join(wd, '.loopx', 'subagent-exec'));
    assert.equal(await readFile(join(workspace, '.gitignore'), 'utf8'), '*\n');

    const briefPath = (await execFileAsync(join(scriptsDir, 'task-brief'), ['plan.md', '1'], { cwd: wd })).stdout.trim();
    const brief = await readFile(briefPath, 'utf8');
    assert.match(brief, /# Task 1 Brief/);
    assert.match(brief, /Runtime: Node\.js ESM/);
    assert.match(brief, /Produces: `greet\(name\)`/);
    assert.doesNotMatch(brief, /Task 2: Use greeting/);

    const packagePath = (await execFileAsync(join(scriptsDir, 'review-package'), [base, head], { cwd: wd })).stdout.trim();
    const reviewPackage = await readFile(packagePath, 'utf8');
    assert.match(reviewPackage, /# Review Package/);
    assert.match(reviewPackage, /## Commits/);
    assert.match(reviewPackage, /change app/);
    assert.match(reviewPackage, /## Diff Stat/);
    assert.match(reviewPackage, /## Diff/);
    assert.match(reviewPackage, /two/);
  });
```

- [ ] **Step 4: Add plan-to-exec structure assertion**

Append:

```js
  it('plan-to-exec requires global constraints and task interfaces for subagent handoff', async () => {
    const planSkill = await readFile(join(repoRoot, 'skills', 'plan-to-exec', 'SKILL.md'), 'utf8');
    assert.match(planSkill, /## Global Constraints/);
    assert.match(planSkill, /\*\*Interfaces:\*\*/);
    assert.match(planSkill, /Consumes:/);
    assert.match(planSkill, /Produces:/);
    assert.match(planSkill, /combined task review|task reviewer/i);
  });
```

- [ ] **Step 5: Run the targeted test and confirm it fails for the intended reasons**

Run:

```bash
node --test test/skill-governance.test.mjs
```

Expected: FAIL. Failures should mention missing `task-reviewer-prompt.md`, old prompt files still existing, missing helper scripts, and missing `Global Constraints` / `Interfaces` in `plan-to-exec`.

- [ ] **Step 6: Commit the failing tests**

```bash
git add test/skill-governance.test.mjs
git commit -m "test: define combined subagent review governance"
```

## Task 2: Add Subagent Exec File Handoff Scripts

**Files:**
- Create: `skills/subagent-exec/scripts/subagent-workspace`
- Create: `skills/subagent-exec/scripts/task-brief`
- Create: `skills/subagent-exec/scripts/review-package`
- Create mirrored files under `plugins/loopx/skills/subagent-exec/scripts/`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: git repository root from `git rev-parse --show-toplevel`.
- Produces: `.loopx/subagent-exec/` scratch directory, `task-N-brief.md`, `review-<base>..<head>.diff`, and `.gitignore` containing `*`.

- [ ] **Step 1: Create `subagent-workspace`**

Create `skills/subagent-exec/scripts/subagent-workspace`:

```bash
#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
dir="$root/.loopx/subagent-exec"
mkdir -p "$dir"
printf '*\n' > "$dir/.gitignore"
cd "$dir" && pwd
```

- [ ] **Step 2: Create `task-brief`**

Create `skills/subagent-exec/scripts/task-brief`:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "usage: task-brief PLAN_FILE TASK_NUMBER [OUTFILE]" >&2
  exit 2
fi

plan=$1
task_number=$2

if [ ! -f "$plan" ]; then
  echo "plan file not found: $plan" >&2
  exit 1
fi

if ! [[ "$task_number" =~ ^[0-9]+$ ]]; then
  echo "TASK_NUMBER must be numeric: $task_number" >&2
  exit 2
fi

script_dir=$(cd "$(dirname "$0")" && pwd)
if [ $# -eq 3 ]; then
  out=$3
  mkdir -p "$(dirname "$out")"
else
  dir=$("$script_dir/subagent-workspace")
  out="$dir/task-${task_number}-brief.md"
fi

awk -v n="$task_number" -v source="$plan" '
  BEGIN {
    task_header = "^### Task " n "([: ].*)?$"
    next_task = "^### Task [0-9]+([: ].*)?$"
    in_global = 0
    in_task = 0
    found_task = 0
    print "# Task " n " Brief"
    print ""
    print "Source plan: " source
    print ""
  }
  /^## Global Constraints[[:space:]]*$/ {
    in_global = 1
    print "## Global Constraints"
    print ""
    next
  }
  /^## / && in_global {
    in_global = 0
  }
  in_global {
    print
    next
  }
  $0 ~ task_header {
    in_task = 1
    found_task = 1
    print ""
    print "## Task"
    print ""
    print
    next
  }
  in_task && $0 ~ next_task {
    in_task = 0
    next
  }
  in_task {
    print
  }
  END {
    if (!found_task) {
      exit 42
    }
  }
' "$plan" > "$out" || {
  status=$?
  rm -f "$out"
  if [ "$status" -eq 42 ]; then
    echo "task not found: Task $task_number in $plan" >&2
  fi
  exit "$status"
}

cd "$(dirname "$out")" && printf '%s/%s\n' "$(pwd)" "$(basename "$out")"
```

- [ ] **Step 3: Create `review-package`**

Create `skills/subagent-exec/scripts/review-package`:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "usage: review-package BASE HEAD [OUTFILE]" >&2
  exit 2
fi

base=$1
head=$2

git rev-parse --verify --quiet "$base" >/dev/null || { echo "bad BASE: $base" >&2; exit 1; }
git rev-parse --verify --quiet "$head" >/dev/null || { echo "bad HEAD: $head" >&2; exit 1; }

script_dir=$(cd "$(dirname "$0")" && pwd)
if [ $# -eq 3 ]; then
  out=$3
  mkdir -p "$(dirname "$out")"
else
  dir=$("$script_dir/subagent-workspace")
  out="$dir/review-$(git rev-parse --short "$base")..$(git rev-parse --short "$head").diff"
fi

{
  echo "# Review Package"
  echo ""
  echo "Base: $base"
  echo "Head: $head"
  echo ""
  echo "## Commits"
  echo ""
  git log --oneline "$base..$head"
  echo ""
  echo "## Diff Stat"
  echo ""
  git diff --stat "$base..$head"
  echo ""
  echo "## Diff"
  echo ""
  git diff -U10 "$base..$head"
} > "$out"

cd "$(dirname "$out")" && printf '%s/%s\n' "$(pwd)" "$(basename "$out")"
```

- [ ] **Step 4: Make scripts executable**

Run:

```bash
chmod +x skills/subagent-exec/scripts/subagent-workspace \
  skills/subagent-exec/scripts/task-brief \
  skills/subagent-exec/scripts/review-package
```

Expected: no output, exit 0.

- [ ] **Step 5: Mirror scripts to plugin skill**

Run:

```bash
mkdir -p plugins/loopx/skills/subagent-exec/scripts
cp skills/subagent-exec/scripts/subagent-workspace plugins/loopx/skills/subagent-exec/scripts/subagent-workspace
cp skills/subagent-exec/scripts/task-brief plugins/loopx/skills/subagent-exec/scripts/task-brief
cp skills/subagent-exec/scripts/review-package plugins/loopx/skills/subagent-exec/scripts/review-package
chmod +x plugins/loopx/skills/subagent-exec/scripts/subagent-workspace \
  plugins/loopx/skills/subagent-exec/scripts/task-brief \
  plugins/loopx/skills/subagent-exec/scripts/review-package
```

Expected: no output, exit 0.

- [ ] **Step 6: Run targeted helper test**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "helper scripts"
```

Expected: PASS for helper script behavior; other governance tests may still fail until later tasks.

- [ ] **Step 7: Commit helper scripts**

```bash
git add skills/subagent-exec/scripts plugins/loopx/skills/subagent-exec/scripts test/skill-governance.test.mjs
git commit -m "Add subagent exec file handoff helpers"
```

## Task 3: Replace Per-Task Two Reviewer Prompts With Combined Task Reviewer

**Files:**
- Create: `skills/subagent-exec/task-reviewer-prompt.md`
- Modify: `skills/subagent-exec/implementer-prompt.md`
- Delete: `skills/subagent-exec/spec-reviewer-prompt.md`
- Delete: `skills/subagent-exec/code-quality-reviewer-prompt.md`
- Mirror all changes under `plugins/loopx/skills/subagent-exec/`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: task brief file path, implementer report file path, review package file path, base/head SHAs, anchor context, surface-change context.
- Produces: one reviewer report containing `Spec Compliance`, `Strengths`, `Issues`, and `Assessment` with `Task quality`.

- [ ] **Step 1: Create `task-reviewer-prompt.md`**

Create `skills/subagent-exec/task-reviewer-prompt.md` with this structure and exact required sections:

```markdown
# Task Reviewer Prompt Template

Use this template when dispatching a task reviewer subagent. The reviewer reads one task's brief, implementer report, and diff package once, then returns two verdicts: spec compliance and task quality.

**Purpose:** Verify one task's implementation matches its requirements, preserves anchor and surface-change contracts, and is well-built enough for downstream tasks to rely on.

```
Native subagent:
  description: "Review Task N (spec + quality)"
  model: [MODEL - REQUIRED: choose per SKILL.md Model Selection]
  prompt: |
    You are reviewing one task's implementation. This is a task-scoped gate, not the final whole-feature review.

    ## What Was Requested

    Read the task brief: [BRIEF_FILE]

    Global constraints from the plan/spec that bind this task:
    [GLOBAL_CONSTRAINTS]

    ## Anchor Context

    [ANCHOR_CONTEXT plus the implementer's anchor report block]

    ## Surface Change Context

    [SURFACE_CHANGE_CONTEXT plus the implementer's surface_change report block, or not_applicable]

    ## What The Implementer Claims They Built

    Read the implementer's report: [REPORT_FILE]

    ## Diff Under Review

    **Base:** [BASE_SHA]
    **Head:** [HEAD_SHA]
    **Diff file:** [DIFF_FILE]

    Read the diff file once. It contains the commit list, diff stat, and full diff with context. Do not re-run broad git commands unless the diff file is missing. Inspect code outside the diff only for a concrete named risk, and name the risk and the file you checked.

    ## Read-Only Review

    Your review is read-only. Do not mutate the working tree, index, HEAD, branch state, scratch workspace, or task report files.

    ## Do Not Trust The Report

    Treat the implementer's report as unverified claims. Verify claims against the diff, task brief, anchor context, surface context, and test evidence. A design rationale in the report never downgrades a real finding.

    ## Tests

    The implementer already ran tests and reported evidence. Do not re-run the whole suite just to confirm the report. Run a focused test only when reading the code raises a specific doubt that no reported test answers. Test output warnings or noise are findings.

    ## Part 1: Spec Compliance

    Compare the diff against the task brief, global constraints, anchor context, and surface-change context:

    - Missing: requirements skipped, claimed without implementation, or not evidenced
    - Extra: unrequested behavior or scope expansion
    - Misunderstood: right feature implemented with wrong names, signatures, paths, formats, state, or behavior
    - Cannot verify from diff: requirements that live in unchanged code or span tasks

    ## Anchor traceability

    Verify `anchor_coverage`, `implemented_anchor_ids`, `tests_for_anchor_ids`, `extra_behavior`, and `missing_context` against actual diff and test evidence. Do not approve if an implemented/tested anchor lacks evidence, or if product/API/data/permission behavior is added without an anchor or explicit plan rationale.

    ## Surface-change compliance

    For surface-changing tasks, verify removed behavior is absent from strict current product paths, retained items have current-source callers, negative assertions and package/governance checks support the claim, and current docs/templates/tests/package surfaces match the new behavior. Historical docs, release notes, old plans, and frozen external content do not count as retained callers.

    ## Part 2: Task Quality

    Check:
    - Clean separation of concerns and file responsibilities
    - Proper error handling
    - DRY without premature abstraction
    - Edge cases handled
    - Tests verify real behavior, not mocks
    - Task outputs match downstream interfaces
    - New files or changed files remain understandable within the plan's structure

    ## Calibration

    Critical means must fix before continuing. Important means this task cannot be trusted until fixed. Minor means useful but not blocking. If the plan explicitly mandates something this rubric calls a defect, report it as Important and label it plan-mandated; the controller must ask the user which governs.

    ## Output Format

    ### Spec Compliance

    - Status: SPEC_COMPLIANT | ISSUES_FOUND | NEEDS_CONTEXT
    - Verdict: [short verdict with file:line evidence]
    - Cannot verify from diff: [items or "none"]

    ### Strengths

    [Specific strengths with evidence.]

    ### Issues

    #### Critical
    #### Important
    #### Minor

    For each issue: file:line, what is wrong, why it matters, how to fix.

    ### Assessment

    **Task quality:** Approved | Needs fixes

    **Reasoning:** [1-2 sentence technical assessment]
```

**Placeholders:**
- `[MODEL]` - required reviewer model
- `[BRIEF_FILE]` - path from `scripts/task-brief PLAN_FILE N`
- `[GLOBAL_CONSTRAINTS]` - binding exact values copied from the plan/spec
- `[ANCHOR_CONTEXT]` - task anchor block and implementer anchor report
- `[SURFACE_CHANGE_CONTEXT]` - task surface block and implementer surface report
- `[REPORT_FILE]` - implementer report file
- `[BASE_SHA]` - commit before this task
- `[HEAD_SHA]` - current commit
- `[DIFF_FILE]` - path from `scripts/review-package BASE HEAD`

**Reviewer returns:** spec compliance status, cannot-verify items, strengths, issues by severity, and task quality verdict.
```

- [ ] **Step 2: Update implementer prompt to use brief/report files**

In `skills/subagent-exec/implementer-prompt.md`:

- Replace `[FULL TEXT of task from plan - paste it here, don't make subagent read file]` with:

```markdown
Read your task brief first: [BRIEF_FILE]
It contains the full task text from the plan, including Global Constraints and task Interfaces.
```

- Add after "Work from: [directory]":

```markdown
Write your detailed report to: [REPORT_FILE]
Return only status, commits, a one-line test summary, concerns, and the report file path.
```

- Add under testing self-review:

```markdown
- Is the test output pristine, with no unexplained warnings or noise?
```

- Replace the "When done, report:" section so the full detail goes to `[REPORT_FILE]`, while the final message stays under 15 lines.

- [ ] **Step 3: Delete old per-task reviewer prompt files**

Run:

```bash
rm skills/subagent-exec/spec-reviewer-prompt.md skills/subagent-exec/code-quality-reviewer-prompt.md
rm plugins/loopx/skills/subagent-exec/spec-reviewer-prompt.md plugins/loopx/skills/subagent-exec/code-quality-reviewer-prompt.md
```

Expected: no output, exit 0.

- [ ] **Step 4: Mirror task reviewer and implementer prompt**

Run:

```bash
cp skills/subagent-exec/task-reviewer-prompt.md plugins/loopx/skills/subagent-exec/task-reviewer-prompt.md
cp skills/subagent-exec/implementer-prompt.md plugins/loopx/skills/subagent-exec/implementer-prompt.md
```

Expected: no output, exit 0.

- [ ] **Step 5: Run targeted governance test**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "combined task review"
```

Expected: still may fail because `SKILL.md` and `codex-subagents.md` are not updated yet, but should no longer fail on missing `task-reviewer-prompt.md` or old prompt existence.

- [ ] **Step 6: Commit prompt changes**

```bash
git add skills/subagent-exec plugins/loopx/skills/subagent-exec test/skill-governance.test.mjs
git commit -m "Consolidate subagent task review prompt"
```

## Task 4: Update Subagent Exec Workflow Guidance

**Files:**
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `skills/subagent-exec/codex-subagents.md`
- Modify mirrored files under `plugins/loopx/skills/subagent-exec/`
- Modify: `skills/review/SKILL.md`
- Modify mirrored file: `plugins/loopx/skills/review/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: helper scripts and `task-reviewer-prompt.md` from Tasks 2-3.
- Produces: current workflow instructions that dispatch one reviewer per task, check the progress ledger, run pre-flight scan, and route final review through `loopx:final-review`.

- [ ] **Step 1: Update `subagent-exec` frontmatter**

In `skills/subagent-exec/SKILL.md`, change:

```yaml
description: "Executes approved loopx implementation plans with fresh subagents per independent task and combined task review. Not for planning, unclear requirements, or tightly coupled edits."
when_to_use: "approved implementation plan, independent tasks, subagent execution, combined task review, spec and quality verdicts, parallel-capable execution"
metadata:
  version: "0.3.2"
```

- [ ] **Step 2: Replace core principle and process flow**

Replace the opening summary with:

```markdown
Execute plan by dispatching a fresh implementer subagent per task, one combined task reviewer after each task, and `loopx:final-review` for the whole feature at the end.

**Core principle:** Fresh subagent per task + combined task review (spec + quality) + final whole-feature review = high quality with fewer subagent turns.
```

Update the dot graph so the per-task cluster contains:

```dot
"Run scripts/task-brief PLAN_FILE N" [shape=box];
"Dispatch implementer subagent (./implementer-prompt.md)" [shape=box];
"Implementer writes report file and returns short status" [shape=box];
"Run scripts/review-package BASE HEAD" [shape=box];
"Dispatch task reviewer subagent (./task-reviewer-prompt.md)" [shape=box];
"Task reviewer reports spec compliant and task quality approved?" [shape=diamond];
"Dispatch one fix subagent for Critical/Important findings" [shape=box];
"Mark task complete in update_plan and progress ledger" [shape=box];
```

- [ ] **Step 3: Add Pre-Flight Plan Review section**

Insert after the process graph:

```markdown
## Pre-Flight Plan Review

Before dispatching Task 1, scan the plan once for conflicts:

- tasks that contradict each other
- tasks that contradict Global Constraints
- missing Interfaces that downstream tasks rely on
- anything the plan explicitly mandates that the task reviewer rubric treats as a defect

Batch findings into one question to the user. Show the plan text and the conflicting requirement side by side, and ask which governs. If the scan is clean, proceed without comment.
```

- [ ] **Step 4: Add File Handoffs and Durable Progress sections**

Add:

```markdown
## File Handoffs

Use files for bulky artifacts so controller context stays small:

- Task brief: run `scripts/task-brief PLAN_FILE N`; pass the printed path to the implementer.
- Report file: use the same workspace path with `task-N-report.md`; the implementer writes the full report there and returns only a short status.
- Review package: run `scripts/review-package BASE HEAD`; pass the printed path to the task reviewer.
- Reviewer prompt: provide the brief path, report path, review package path, Global Constraints, ANCHOR_CONTEXT, and SURFACE_CHANGE_CONTEXT.

Use the BASE commit recorded before dispatching the implementer. Never use `HEAD~1` for multi-commit tasks.

## Durable Progress

At skill start, check:

```bash
cat "$(git rev-parse --show-toplevel)/.loopx/subagent-exec/progress.md"
```

If the ledger marks a task complete, do not re-dispatch it. After a clean task review, append:

```text
Task N: complete (commits <base7>..<head7>, review clean, brief <path>, report <path>, review <path>)
```

The ledger is gitignored scratch. If `git clean -fdx` removes it, recover from `git log` and existing commits.
```

- [ ] **Step 5: Update model selection and reviewer prompt construction**

In `Model Selection`, add:

```markdown
Always specify the model explicitly when dispatching a subagent. An omitted model inherits the session default and can silently put cheap review work on the most expensive model.

Turn count beats token price. Use the cheapest model only for transcription-level tasks or single-file mechanical fixes. Use a mid-tier floor for reviewers and prose-driven implementers; use the most capable available model for final whole-feature review.
```

Add a `Constructing Reviewer Prompts` subsection:

```markdown
Do not tell a reviewer what not to flag, do not pre-rate severity, and do not paste accumulated history. If your dispatch says "do not flag", "at most Minor", or "the plan chose this", stop and remove that pre-judgment. The task reviewer gets only the task brief, report file, review package, Global Constraints, ANCHOR_CONTEXT, and SURFACE_CHANGE_CONTEXT.
```

- [ ] **Step 6: Update handling reviewer results**

Add:

```markdown
The task reviewer returns both required gates:

- Spec Compliance: SPEC_COMPLIANT | ISSUES_FOUND | NEEDS_CONTEXT
- Task quality: Approved | Needs fixes

Do not mark a task complete unless spec compliance is SPEC_COMPLIANT and task quality is Approved. Resolve `Cannot verify from diff` items yourself before marking the task complete. Dispatch one fix subagent with all Critical and Important findings; re-run focused tests; then re-run `scripts/review-package` and dispatch the task reviewer again.
```

- [ ] **Step 7: Update `codex-subagents.md`**

Replace the execution rules with:

```markdown
- Spawn fresh implementer subagents with a task brief path, report file path, and only the context they need.
- Use `task-reviewer-prompt.md` for per-task review; it returns both spec and quality verdicts.
- Do not paste full task text or full diffs into controller messages when helper scripts can write them to files.
- Keep implementation tasks sequential unless write scopes are clearly disjoint.
- Use `wait_agent` only when the next controller step needs that result.
- Close completed agents after their result is integrated.
- Keep the controller responsible for pre-flight plan review, progress ledger updates, review loops, final-review, and finish.
```

- [ ] **Step 8: Update `review/SKILL.md` integration notes**

In `skills/review/SKILL.md`, keep standalone staged review but change `Subagent Exec` integration to:

```markdown
**Subagent Exec:**
- Per-task review uses `subagent-exec/task-reviewer-prompt.md`, which combines Stage 1 spec compliance and Stage 2 code quality into one task-scoped reviewer.
- The standalone `review` skill remains available for ad-hoc or checkpoint review outside `subagent-exec`.
```

Remove current references to `subagent-exec/spec-reviewer-prompt.md`.

- [ ] **Step 9: Mirror modified files**

Run:

```bash
cp skills/subagent-exec/SKILL.md plugins/loopx/skills/subagent-exec/SKILL.md
cp skills/subagent-exec/codex-subagents.md plugins/loopx/skills/subagent-exec/codex-subagents.md
cp skills/review/SKILL.md plugins/loopx/skills/review/SKILL.md
```

Expected: no output, exit 0.

- [ ] **Step 10: Run targeted governance tests**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "combined task review"
```

Expected: PASS.

- [ ] **Step 11: Commit workflow guidance**

```bash
git add skills/subagent-exec skills/review plugins/loopx/skills/subagent-exec plugins/loopx/skills/review test/skill-governance.test.mjs
git commit -m "Update subagent exec to combined task review"
```

## Task 5: Add Global Constraints And Interfaces To Plan-To-Exec

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `plugins/loopx/skills/plan-to-exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: existing plan header and task structure.
- Produces: plan documents with `## Global Constraints` and per-task `Interfaces` blocks that `scripts/task-brief` can extract and pass to subagents.

- [ ] **Step 1: Insert task right-sizing guidance**

After "This structure informs the task decomposition", add:

```markdown
## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate. Fold setup, configuration, scaffolding, and documentation into the task whose deliverable needs them. Split only where a reviewer could meaningfully reject one task while approving its neighbor.
```

- [ ] **Step 2: Add `Global Constraints` to the plan header template**

In `Plan Document Header`, before `---`, add:

```markdown
## Global Constraints

[Project-wide requirements copied exactly from the source: version floors, dependency limits, naming/copy rules, platform requirements, compatibility requirements, package contents, and exact values. Every task implicitly includes this section.]
```

- [ ] **Step 3: Add `Interfaces` to task structure**

In `Task Structure`, after `**Files:**`, add:

```markdown
**Interfaces:**
- Consumes: [inputs from previous tasks or existing code, with exact names/signatures]
- Produces: [outputs later tasks or callers rely on, with exact names/signatures]
```

- [ ] **Step 4: Update No Placeholders and Self-Review**

Add these No Placeholder failures:

```markdown
- Global Constraints that paraphrase exact source values instead of copying them
- Interfaces blocks that omit exact names, signatures, paths, file formats, CLI flags, or return values later tasks depend on
```

Add this self-review item:

```markdown
7. **Subagent handoff readiness:** Does every task brief carry enough Global Constraints and Interfaces for an implementer and task reviewer who cannot see the rest of the plan?
```

- [ ] **Step 5: Update execution handoff text**

Change Subagent Exec description from "review between tasks" / "two-stage review" to:

```text
1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
```

And:

```markdown
- Fresh subagent per task plus combined task review and final-review
```

- [ ] **Step 6: Mirror plan skill**

Run:

```bash
cp skills/plan-to-exec/SKILL.md plugins/loopx/skills/plan-to-exec/SKILL.md
```

Expected: no output, exit 0.

- [ ] **Step 7: Run targeted test**

Run:

```bash
node --test test/skill-governance.test.mjs --test-name-pattern "plan-to-exec requires"
```

Expected: PASS.

- [ ] **Step 8: Commit plan skill update**

```bash
git add skills/plan-to-exec/SKILL.md plugins/loopx/skills/plan-to-exec/SKILL.md test/skill-governance.test.mjs
git commit -m "Add subagent handoff structure to plans"
```

## Task 6: Release Notes, Negative Assertions, And Full Verification

**Files:**
- Create: `docs/release-notes/0.3.2.md`
- Modify only if needed: `README.md`
- Modify only if needed: `README.zh-CN.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: completed skill changes and test coverage.
- Produces: user-visible release note and full verification evidence.

- [ ] **Step 1: Create release notes**

Create `docs/release-notes/0.3.2.md`:

```markdown
# loopx 0.3.2

`0.3.2` reduces `subagent-exec` per-task review cost by replacing separate spec and code-quality reviewer dispatches with one combined task reviewer, while preserving anchor traceability, surface-change checks, and final whole-feature review.

## Changes

- Added `subagent-exec/task-reviewer-prompt.md` for one task-scoped review that returns both spec compliance and task quality verdicts.
- Added `subagent-exec/scripts/task-brief`, `review-package`, and `subagent-workspace` so task text, reports, diffs, and progress move through gitignored files instead of controller context.
- Added durable progress ledger guidance under `.loopx/subagent-exec/progress.md`.
- Added pre-flight plan conflict scanning before Task 1.
- Updated `plan-to-exec` to include `Global Constraints` and per-task `Interfaces` blocks for subagent handoff.
- Updated governance tests to keep root and plugin skill mirrors aligned.
```

- [ ] **Step 2: Check whether README files mention two-stage review**

Run:

```bash
rg "two-stage review|spec reviewer|code quality reviewer|combined task review|subagent-exec" README.md README.zh-CN.md
```

Expected: if README files mention the old per-task two-reviewer behavior, update them to "combined task review"; otherwise no README change.

- [ ] **Step 3: Run negative assertions**

Run:

```bash
test ! -e skills/subagent-exec/spec-reviewer-prompt.md
test ! -e skills/subagent-exec/code-quality-reviewer-prompt.md
test ! -e plugins/loopx/skills/subagent-exec/spec-reviewer-prompt.md
test ! -e plugins/loopx/skills/subagent-exec/code-quality-reviewer-prompt.md
! rg "spec-reviewer-prompt|code-quality-reviewer-prompt|two-stage review" skills plugins README.md README.zh-CN.md docs/loopx/design docs/loopx/specs test src
```

Expected: no output, exit 0.

- [ ] **Step 4: Run package dry-run**

Run:

```bash
npm pack --dry-run
```

Expected: exit 0. Output includes:

```text
skills/subagent-exec/task-reviewer-prompt.md
skills/subagent-exec/scripts/subagent-workspace
skills/subagent-exec/scripts/task-brief
skills/subagent-exec/scripts/review-package
plugins/loopx/skills/subagent-exec/task-reviewer-prompt.md
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
```

Expected:

```text
node scripts/verify-skills.mjs
node --test test/*.test.mjs
```

All tests pass.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits 0. `git status --short` lists only intentional changes under:

```text
docs/release-notes/0.3.2.md
skills/plan-to-exec/SKILL.md
skills/review/SKILL.md
skills/subagent-exec/
plugins/loopx/skills/plan-to-exec/SKILL.md
plugins/loopx/skills/review/SKILL.md
plugins/loopx/skills/subagent-exec/
test/skill-governance.test.mjs
```

- [ ] **Step 7: Commit release and verification updates**

```bash
git add docs/release-notes/0.3.2.md README.md README.zh-CN.md \
  skills plugins/loopx/skills test/skill-governance.test.mjs
git commit -m "Document combined subagent review release"
```

## Self-Review

- Spec coverage: REQ-001 is covered by Tasks 1, 3, and 4. REQ-002 is covered by Tasks 1, 2, 3, and 4. REQ-003 is covered by Task 4. REQ-004 is covered by Tasks 3 and 4. REQ-005 is covered by Task 4. REQ-006 is covered by Task 5. REQ-007 is covered by Tasks 1 and 6.
- Placeholder scan: no task uses "TBD", "TODO", "similar to", or unspecified tests. Code-bearing steps include concrete content or exact replacement text.
- Type consistency: script names are consistently `subagent-workspace`, `task-brief`, and `review-package`; prompt name is consistently `task-reviewer-prompt.md`.
- Design drift: this plan does not introduce new CLI commands or runtime state machines; it changes governed skill behavior only.
- Anchor coverage: requirement anchors REQ-001 through REQ-007 map to tasks and verification steps.
- Surface-change coverage: prompt deletion and current product docs are covered by Surface Inventory, Caller Proof, Negative Assertions, and package dry-run.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-22-subagent-exec-combined-review.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
