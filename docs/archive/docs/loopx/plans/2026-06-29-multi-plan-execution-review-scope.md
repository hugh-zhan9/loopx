# Multi-Plan Execution Review Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-29-multi-plan-execution-review-scope/需求设计文档.md`

**Goal:** Add local multi-plan package state tracking and a finish-time runtime gate so child plans can be executed independently while the whole spec finishes only after spec-level final-review is clean.

**Architecture:** Keep `subagent-exec` as a single-plan executor and use `.loopx/multi-plan/<feature-slug>/state.json` as local runtime state for multi-plan packages. `final-review` remains skill-driven with plan-level and spec-level scopes; `finishRecordStage(...status: "done")` enforces the multi-plan gate only when `finish-start --source` points at a multi-plan package path.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, local JSON runtime state under `.loopx/`, Markdown skill contracts.

**Support lenses:** `architecture-designer`, `cli-developer`

## Global Constraints

Copied from the approved design:

- Multi-plan runtime state path: `.loopx/multi-plan/<feature-slug>/state.json`.
- `00-overview.md` remains the repo-tracked human-readable package overview; mutable execution state stays local.
- `finish` must enforce multi-plan completion state when a matching multi-plan package is in scope.
- `final-review` must support plan-level and spec-level review semantics through skill instructions/state updates, but not through a runtime hard block.
- Multi-plan state discovery is source-path based, not global-scan based.
- Do not add automatic execution of all child plans in a directory.
- Do not add automatic parallel scheduling for child plans.
- Do not hard-block `final-review` at runtime.
- Do not store mutable execution state in repo-tracked plan directories.
- Do not discover the active package by enumerating `.loopx/multi-plan/*/state.json`.
- Do not require child plan base/head tracking in the first schema.
- Single-plan workflows remain unchanged.
- `finish` allows completion only after every child plan is complete and the spec-level final-review reports `Ready for finish? Yes`.
- No new public CLI command is part of this plan.

---

## Surface Inventory

- Public commands/API/routes/events/config:
  - Keep existing public CLI signatures:
    - `loopx finish-start [slug] [--source <path>] [--json]`
    - `loopx finish-audit [slug] [--baseline <git-ref>] [--json]`
    - `loopx finish-record <audit-id-or-path> --action <merge|pr|keep|discard> --status <pending|done|failed|aborted> [--summary <text>] [--url <url>]`
  - Add no `loopx multi-plan` command.
- Exported functions/types/modules:
  - Modify `finishRecordStage(cwd, auditIdOrPath, options)` behavior for `status: "done"` when matching multi-plan state is discovered.
  - Keep existing exported function names unchanged.
- Runtime/generated artifacts and templates:
  - Add local state convention `.loopx/multi-plan/<feature-slug>/state.json`.
  - Keep `.loopx/final-review/YYYY-MM-DD-<slug>.md`.
  - Keep `.loopx/finish/` audit artifacts.
- Installer/package/deployment surface:
  - Skills remain bundled through existing package `files` entries.
  - No new dependency.
- Hooks/background jobs/automation:
  - No hook change.
  - No automatic child-plan orchestration.
- Current product docs:
  - `skills/plan-to-exec/SKILL.md`
  - `skills/subagent-exec/SKILL.md`
  - `skills/final-review/SKILL.md`
  - `skills/finish/SKILL.md`
  - `skills/RESOLVER.md`
  - `skills/clarify/SKILL.md`
- Tests/governance checks:
  - `test/workflow.test.mjs`
  - `test/skill-governance.test.mjs`
  - `scripts/verify-skills.mjs`
- Compatibility/migration paths:
  - Single-plan `finish-record --status done` remains unchanged when no matching multi-plan source path exists.
  - Historical plan files are not migrated.

Caller proof commands to run during implementation:

```bash
rg "finishRecordStage|finish-start|finish-audit|finish-record" src test skills README.md docs/loopx
rg "docs/loopx/plans/YYYY-MM-DD-<feature-slug>|00-overview|multi-plan|final-review" skills test docs/loopx
```

Decision rules:

- retained caller exists in current source/runtime code -> keep it and name the caller in the implementation report
- only historical docs, release notes, old plans, or frozen external content reference it -> do not count that as a retained caller
- no retained caller -> remove stale current-product wording from skill/docs surfaces

Negative assertions:

```bash
! rg "loopx multi-plan" src scripts package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md
! rg "scan (every|all).*\\.loopx/multi-plan" src skills test README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md
npm pack --dry-run --json
```

Historical paths under `docs/loopx/plans/` and `docs/release-notes/` may mention older workflow wording. Strict current product surfaces are `src/`, `skills/`, `scripts/`, `test/`, `README.md`, `README.zh-CN.md`, `docs/loopx/cli.md`, `docs/loopx/cli.zh-CN.md`, and `docs/loopx/skills*.md`.

## Task 1: Add Failing Finish Runtime Tests

**Files:**
- Modify: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: existing `finishStartStage`, `finishAuditStage`, `finishRecordStage`.
- Produces: failing coverage proving `finishRecordStage(...status: "done")` blocks incomplete matching multi-plan state and still allows complete matching multi-plan state.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Add `mkdir` import for state directory setup**

In `test/workflow.test.mjs`, change:

```js
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
```

to:

```js
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
```

- [ ] **Step 2: Add helper functions near `writeResolvedSpec`**

Add this code after `writeResolvedSpec`:

```js
async function initGitRepo(wd) {
  await execFileAsync('git', ['init'], { cwd: wd });
  await execFileAsync('git', ['config', 'user.email', 'loopx@example.com'], { cwd: wd });
  await execFileAsync('git', ['config', 'user.name', 'LoopX'], { cwd: wd });
  await writeFile(join(wd, 'README.md'), 'finish audit\n');
  await execFileAsync('git', ['add', 'README.md'], { cwd: wd });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: wd });
}

async function markFinishAuditReviewed(audit) {
  const state = JSON.parse(await readFile(audit.statePath, 'utf8'));
  state.status = 'audited';
  state.audit.no_candidates_reason = 'No multi-plan extraction candidates were accepted for this test.';
  state.audit.extraction_candidates = [];
  await writeFile(audit.statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function writeMultiPlanState(wd, featureSlug, state) {
  const root = join(wd, '.loopx', 'multi-plan', featureSlug);
  await mkdir(root, { recursive: true });
  const path = join(root, 'state.json');
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
  return path;
}
```

- [ ] **Step 3: Add failing test for incomplete matching multi-plan state**

Add this test after `finish audit lifecycle records a local decision`:

```js
  it('blocks finish done when matching multi-plan state is incomplete', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-block-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/01-core.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    await writeMultiPlanState(wd, featureSlug, {
      schema_version: 1,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}/`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      status: 'in_progress',
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          plan_final_review: `.loopx/final-review/${featureSlug}-01-core.md`,
          ready_for_spec_review: true,
        },
        {
          path: `docs/loopx/plans/${featureSlug}/02-ui.md`,
          status: 'in_progress',
          plan_final_review: null,
          ready_for_spec_review: false,
        },
      ],
      spec_final_review: null,
    });

    await assert.rejects(
      () => finishRecordStage(wd, audit.auditId, {
        action: 'keep',
        status: 'done',
        summary: 'Should be blocked.',
      }),
      /finish_record_multi_plan_incomplete/,
    );
  });
```

Expected before implementation: FAIL because `finishRecordStage` does not inspect `.loopx/multi-plan/<feature-slug>/state.json`.

- [ ] **Step 4: Add failing test for complete matching multi-plan state**

Add this test after the incomplete-state test:

```js
  it('allows finish done when matching multi-plan state has clean spec review', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-multi-plan-pass-'));
    await initGitRepo(wd);

    const featureSlug = '2026-06-29-feature';
    await finishStartStage(wd, featureSlug, {
      source: `docs/loopx/plans/${featureSlug}/00-overview.md`,
    });
    const audit = await finishAuditStage(wd, featureSlug);
    await markFinishAuditReviewed(audit);

    await writeMultiPlanState(wd, featureSlug, {
      schema_version: 1,
      feature_slug: featureSlug,
      plan_package: `docs/loopx/plans/${featureSlug}/`,
      source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
      status: 'ready_for_finish',
      plans: [
        {
          path: `docs/loopx/plans/${featureSlug}/01-core.md`,
          status: 'complete',
          plan_final_review: `.loopx/final-review/${featureSlug}-01-core.md`,
          ready_for_spec_review: true,
        },
        {
          path: `docs/loopx/plans/${featureSlug}/02-ui.md`,
          status: 'complete',
          plan_final_review: `.loopx/final-review/${featureSlug}-02-ui.md`,
          ready_for_spec_review: true,
        },
      ],
      spec_final_review: {
        path: `.loopx/final-review/${featureSlug}.md`,
        ready_for_finish: 'Yes',
      },
    });

    const recorded = await finishRecordStage(wd, audit.auditId, {
      action: 'keep',
      status: 'done',
      summary: 'Multi-plan package complete.',
    });
    assert.equal(recorded.state.status, 'completed');
    assert.equal(recorded.state.choice.status, 'done');
  });
```

Expected before implementation: FAIL if Task 2 has not been implemented.

- [ ] **Step 5: Add a single-plan done regression test**

Add this test after the complete-state test:

```js
  it('keeps single-plan finish done unchanged when no multi-plan source matches', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-single-plan-done-'));
    await initGitRepo(wd);

    await finishStartStage(wd, 'single-plan', { source: 'docs/loopx/plans/2026-06-29-single-plan.md' });
    const audit = await finishAuditStage(wd, 'single-plan');
    await markFinishAuditReviewed(audit);

    const recorded = await finishRecordStage(wd, audit.auditId, {
      action: 'keep',
      status: 'done',
      summary: 'Single plan complete.',
    });
    assert.equal(recorded.state.status, 'completed');
    assert.equal(recorded.state.choice.summary, 'Single plan complete.');
  });
```

Expected after implementation: PASS.

- [ ] **Step 6: Run the focused tests and confirm the red state**

Run:

```bash
node --test --test-name-pattern "multi-plan|single-plan finish done" test/workflow.test.mjs
```

Expected before Task 2: incomplete and complete multi-plan tests fail because no multi-plan gate exists; single-plan regression may pass after `markFinishAuditReviewed` helper is present.

- [ ] **Step 7: Commit the failing tests**

```bash
git add test/workflow.test.mjs
git commit -m "test: cover multi-plan finish gate"
```

## Task 2: Implement Multi-Plan Finish Gate

**Files:**
- Modify: `src/finish-runtime.mjs`
- Test: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: finish audit state `audit.change_window.source_artifacts`.
- Produces:
  - `finish_record_multi_plan_state_missing`
  - `finish_record_multi_plan_state_invalid`
  - `finish_record_multi_plan_incomplete`
  - source-path-based discovery of `.loopx/multi-plan/<feature-slug>/state.json`

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Add constants for multi-plan state**

In `src/finish-runtime.mjs`, after `const FINISH_SCHEMA_VERSION = 1;`, add:

```js
const MULTI_PLAN_SCHEMA_VERSION = 1;
const MULTI_PLAN_PACKAGE_PATTERN = /^docs\/loopx\/plans\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\/(?:00-overview|[0-9]{2}-[a-z0-9-]+)\.md$/;
```

- [ ] **Step 2: Add path discovery helpers after `readJsonIfExists`**

Add this code after `readJsonIfExists`:

```js
function normalizedArtifactPath(path) {
  return String(path || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function multiPlanPackageFromSourceArtifact(sourceArtifact) {
  const normalized = normalizedArtifactPath(sourceArtifact);
  const match = normalized.match(MULTI_PLAN_PACKAGE_PATTERN);
  if (!match) {
    return null;
  }
  const featureSlug = match[1];
  return {
    featureSlug,
    planPackage: `docs/loopx/plans/${featureSlug}/`,
    sourceArtifact: normalized,
    statePath: join('.loopx', 'multi-plan', featureSlug, 'state.json'),
  };
}

function firstMultiPlanPackageFromState(state) {
  const sourceArtifacts = Array.isArray(state?.audit?.change_window?.source_artifacts)
    ? state.audit.change_window.source_artifacts
    : [];
  for (const sourceArtifact of sourceArtifacts) {
    const result = multiPlanPackageFromSourceArtifact(sourceArtifact);
    if (result) {
      return result;
    }
  }
  return null;
}

function runtimeStateRoot(cwd, state) {
  const worktree = state?.audit?.worktree;
  return nonEmptyText(worktree) && worktree !== 'unknown'
    ? worktree
    : cwd;
}
```

- [ ] **Step 3: Add state validation helpers after `plainObject` helper definitions**

Find the existing helper area where `plainObject`, `nonEmptyText`, and related helpers live. Add this code after `plainObject` and `nonEmptyText` are available:

```js
function multiPlanGateIssue(message, details = {}) {
  return {
    message,
    ...details,
  };
}

function validateMultiPlanState(multiPlanState, expected) {
  const issues = [];
  if (!plainObject(multiPlanState)) {
    return [multiPlanGateIssue('state file must contain a JSON object')];
  }
  if (multiPlanState.schema_version !== MULTI_PLAN_SCHEMA_VERSION) {
    issues.push(multiPlanGateIssue('schema_version must be 1'));
  }
  if (multiPlanState.feature_slug !== expected.featureSlug) {
    issues.push(multiPlanGateIssue('feature_slug must match source path', {
      expected: expected.featureSlug,
      actual: multiPlanState.feature_slug ?? null,
    }));
  }
  if (multiPlanState.plan_package !== expected.planPackage) {
    issues.push(multiPlanGateIssue('plan_package must match source path', {
      expected: expected.planPackage,
      actual: multiPlanState.plan_package ?? null,
    }));
  }
  if (!nonEmptyText(multiPlanState.source_spec)) {
    issues.push(multiPlanGateIssue('source_spec is required'));
  }
  if (!Array.isArray(multiPlanState.plans) || multiPlanState.plans.length === 0) {
    issues.push(multiPlanGateIssue('plans[] must be non-empty'));
    return issues;
  }

  const seenPlanPaths = new Set();
  for (const [index, plan] of multiPlanState.plans.entries()) {
    if (!plainObject(plan)) {
      issues.push(multiPlanGateIssue('plan entry must be an object', { index }));
      continue;
    }
    const path = normalizedArtifactPath(plan.path);
    if (!nonEmptyText(path)) {
      issues.push(multiPlanGateIssue('plan.path is required', { index }));
    } else if (seenPlanPaths.has(path)) {
      issues.push(multiPlanGateIssue('plan.path must be unique', { path }));
    } else {
      seenPlanPaths.add(path);
    }
    if (plan.status !== 'complete') {
      issues.push(multiPlanGateIssue('plan.status must be complete', {
        path: path || `(index ${index})`,
        actual: plan.status ?? null,
      }));
    }
    if (!nonEmptyText(plan.plan_final_review)) {
      issues.push(multiPlanGateIssue('plan_final_review is required', {
        path: path || `(index ${index})`,
      }));
    }
    if (plan.ready_for_spec_review !== true) {
      issues.push(multiPlanGateIssue('ready_for_spec_review must be true', {
        path: path || `(index ${index})`,
        actual: plan.ready_for_spec_review ?? null,
      }));
    }
  }

  const specReview = multiPlanState.spec_final_review;
  if (!plainObject(specReview)) {
    issues.push(multiPlanGateIssue('spec_final_review is required'));
  } else {
    if (!nonEmptyText(specReview.path)) {
      issues.push(multiPlanGateIssue('spec_final_review.path is required'));
    }
    if (specReview.ready_for_finish !== 'Yes') {
      issues.push(multiPlanGateIssue('spec_final_review.ready_for_finish must be Yes', {
        actual: specReview.ready_for_finish ?? null,
      }));
    }
  }

  return issues;
}
```

- [ ] **Step 4: Add the finish gate function before `finishRecordStage`**

Add this function immediately before `export async function finishRecordStage`:

```js
async function assertMultiPlanReadyForFinish(cwd, finishState) {
  const multiPlanPackage = firstMultiPlanPackageFromState(finishState);
  if (!multiPlanPackage) {
    return;
  }

  const stateRoot = runtimeStateRoot(cwd, finishState);
  const absoluteStatePath = join(stateRoot, multiPlanPackage.statePath);
  const multiPlanState = await readJsonIfExists(absoluteStatePath);
  if (!multiPlanState) {
    throw new Error(`finish_record_multi_plan_state_missing:${multiPlanPackage.statePath}`);
  }

  const issues = validateMultiPlanState(multiPlanState, multiPlanPackage);
  if (issues.length > 0) {
    const summary = issues
      .map((issue) => {
        const path = issue.path ? ` path=${issue.path}` : '';
        const actual = Object.hasOwn(issue, 'actual') ? ` actual=${String(issue.actual)}` : '';
        return `${issue.message}${path}${actual}`;
      })
      .join('; ');
    throw new Error(`finish_record_multi_plan_incomplete:${multiPlanPackage.statePath}:${summary}`);
  }
}
```

- [ ] **Step 5: Call the gate in `finishRecordStage`**

In `finishRecordStage`, after:

```js
  validateFinishRecordState(state, root);
```

insert:

```js
  if (normalizedStatus === 'done') {
    await assertMultiPlanReadyForFinish(cwd, state);
  }
```

Keep the existing audit completeness check directly after this new gate:

```js
  if (normalizedStatus === 'done' && !isFinishAuditReadyForDone(state)) {
    throw new Error('finish_record_audit_incomplete');
  }
```

- [ ] **Step 6: Run the focused workflow tests**

Run:

```bash
node --test --test-name-pattern "multi-plan|single-plan finish done|finish audit lifecycle" test/workflow.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Run caller proof and negative assertions**

Run:

```bash
rg "finishRecordStage|finish-start|finish-audit|finish-record" src test skills README.md docs/loopx
! rg "loopx multi-plan" src scripts package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md
! rg "scan (every|all).*\\.loopx/multi-plan" src skills test README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md
```

Expected:
- First command finds current retained callers.
- Negative assertions produce no matches and exit 0.

- [ ] **Step 8: Commit runtime implementation**

```bash
git add src/finish-runtime.mjs test/workflow.test.mjs
git commit -m "feat: gate finish on multi-plan state"
```

## Task 3: Update Skill Contracts And Governance

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `skills/final-review/SKILL.md`
- Modify: `skills/finish/SKILL.md`
- Modify: `skills/RESOLVER.md`
- Modify: `skills/clarify/SKILL.md`
- Modify: `test/skill-governance.test.mjs`

**Interfaces:**
- Consumes: approved design source and runtime gate behavior from Task 2.
- Produces: current product skill contracts that describe plan-level final-review, spec-level final-review, `.loopx/multi-plan/` state, and finish-only hard gate.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Bump changed skill metadata versions**

Update only skills whose content changes:

- `skills/plan-to-exec/SKILL.md`: `0.3.5` -> `0.3.6`
- `skills/subagent-exec/SKILL.md`: `0.3.5` -> `0.3.6`
- `skills/final-review/SKILL.md`: `0.3.7` -> `0.3.8`
- `skills/finish/SKILL.md`: `0.3.4` -> `0.3.5`
- `skills/clarify/SKILL.md`: bump from its current version to the next patch version only if you change its content in Step 6.

- [ ] **Step 2: Extend `plan-to-exec` multi-plan package output contract**

In `skills/plan-to-exec/SKILL.md`, in the `Scope Check` section after the existing paragraph that starts `When one source artifact needs multiple implementation plans`, add:

```markdown
For a multi-plan package, `00-overview.md` must include:

- Source spec path
- Package slug and local state path: `.loopx/multi-plan/<feature-slug>/state.json`
- Child plan list with each `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/NN-<plan-slug>.md`
- Split rationale for each child plan
- Execution order and dependencies
- Which child plans can run in parallel
- Final gate: every child plan needs plan-level `final-review`; the package needs one spec-level `final-review`; only then may `finish` run

Each child plan remains independently executable and must not assume the agent can see sibling child plans except through explicit Interfaces and `00-overview.md`.
```

In the `Execution Handoff` section, before the two execution options, add:

```markdown
For multi-plan packages, offer execution per child plan. Do not ask one agent to execute the whole directory in a single run. After each child plan, run plan-level `final-review` and update `.loopx/multi-plan/<feature-slug>/state.json`. After all child plans are ready, run one spec-level `final-review`, then `finish`.
```

- [ ] **Step 3: Update `subagent-exec` child-plan behavior**

In `skills/subagent-exec/SKILL.md`, after `## When to Use`, add:

```markdown
## Multi-Plan Child Plans

When the plan file is a numbered child plan under `docs/loopx/plans/YYYY-MM-DD-<feature-slug>/`, execute only that child plan. Do not execute sibling child plans and do not proceed to `finish` after the child plan completes.

After all tasks in the child plan pass task review, run plan-level `loopx:final-review` for that child plan and update `.loopx/multi-plan/<feature-slug>/state.json`:

```json
{
  "path": "docs/loopx/plans/YYYY-MM-DD-<feature-slug>/01-example.md",
  "status": "complete",
  "plan_final_review": ".loopx/final-review/YYYY-MM-DD-01-example.md",
  "ready_for_spec_review": true
}
```

Only after every child plan in the package is complete should an agent run spec-level `loopx:final-review` for the source spec and package overview. `loopx:finish` is allowed only after the spec-level final-review is clean.
```

In the process diagram and prose, replace wording that implies every `subagent-exec` run always enters `finish` with wording that says single-plan runs proceed to final-review then finish, while multi-plan child runs stop after plan-level final-review/state update.

- [ ] **Step 4: Update `final-review` scope contract**

In `skills/final-review/SKILL.md`, after `## When to Use`, add:

```markdown
## Review Scope

Final review has two scopes for multi-plan packages:

- Plan-level final-review: run after one child plan is implemented and task-reviewed. Source requirements are the child plan plus relevant `00-overview.md` context. The report decides whether that child plan is ready for spec-level review. It must not authorize `finish`.
- Spec-level final-review: run after all child plans in a multi-plan package are ready. Source requirements include the source spec, `00-overview.md`, every child plan, every plan-level final-review artifact, and the full feature git range. This is the only multi-plan final-review scope that may set the package `Ready for finish? Yes`.

When reviewing a multi-plan package, update `.loopx/multi-plan/<feature-slug>/state.json` after writing the report artifact. Plan-level reviews update the matching `plans[]` row. Spec-level reviews update `spec_final_review.path` and `spec_final_review.ready_for_finish`.
```

Keep the existing report artifact path `.loopx/final-review/YYYY-MM-DD-<slug>.md`.

- [ ] **Step 5: Update `finish` contract**

In `skills/finish/SKILL.md`, after `### Step 4: Check Final Review Report`, add:

```markdown
### Step 4.5: Check Multi-Plan Finish Gate

When the finish baseline source points at a multi-plan package path such as:

```text
docs/loopx/plans/YYYY-MM-DD-<feature-slug>/00-overview.md
docs/loopx/plans/YYYY-MM-DD-<feature-slug>/01-<plan-slug>.md
```

`finish` must check `.loopx/multi-plan/<feature-slug>/state.json` before recording completion. Completion is allowed only when:

- `plans[]` is non-empty
- every child plan has `status: "complete"`
- every child plan has `plan_final_review`
- every child plan has `ready_for_spec_review: true`
- `spec_final_review.path` is present
- `spec_final_review.ready_for_finish` is exactly `"Yes"`

If the gate is incomplete, stop and report the missing child plan or review gate. Do not present merge/PR/keep/discard completion as done until the gate passes.
```

Also update the Integration section so `finish` says it is allowed after clean final-review, and for multi-plan packages that means clean spec-level final-review.

- [ ] **Step 6: Update resolver and clarify direct-to-plan wording**

In `skills/RESOLVER.md`, update disambiguation item 9 from:

```markdown
9. Use `final-review` after the whole feature is implemented and before `finish`.
```

to:

```markdown
9. Use `final-review` after the whole feature is implemented and before `finish`; for multi-plan packages, child plans receive plan-level final-review and the package receives one spec-level final-review before finish.
```

In `skills/clarify/SKILL.md`, under `direct_to_plan`, add one sentence after the two plan output bullets:

```markdown
For multiple plans from one source, child plans are executed independently; each child plan gets plan-level final-review, and the package gets one spec-level final-review before `finish`.
```

- [ ] **Step 7: Add governance assertions**

In `test/skill-governance.test.mjs`, in `plan-to-exec requires global constraints and task interfaces for subagent handoff`, add reads for `subagent-exec`, `final-review`, and `finish`:

```js
    const subagentExecSkill = await readFile(join(repoRoot, 'skills', 'subagent-exec', 'SKILL.md'), 'utf8');
    const finalReviewSkill = await readFile(join(repoRoot, 'skills', 'final-review', 'SKILL.md'), 'utf8');
    const finishSkill = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');
```

Then add these assertions before the end of the test:

```js
    assert.match(planSkill, /\.loopx\/multi-plan\/<feature-slug>\/state\.json/);
    assert.match(planSkill, /plan-level `final-review`/);
    assert.match(planSkill, /spec-level `final-review`/);
    assert.match(subagentExecSkill, /Multi-Plan Child Plans/);
    assert.match(subagentExecSkill, /Do not execute sibling child plans/);
    assert.match(subagentExecSkill, /Do not .*finish/i);
    assert.match(finalReviewSkill, /Plan-level final-review/);
    assert.match(finalReviewSkill, /Spec-level final-review/);
    assert.match(finalReviewSkill, /\.loopx\/multi-plan\/<feature-slug>\/state\.json/);
    assert.match(finishSkill, /Step 4\.5: Check Multi-Plan Finish Gate/);
    assert.match(finishSkill, /spec_final_review\.ready_for_finish/);
    assert.match(resolver, /plan-level final-review and the package receives one spec-level final-review/);
```

- [ ] **Step 8: Run focused governance tests**

Run:

```bash
node --test --test-name-pattern "plan-to-exec requires|final-review persists|finish presents" test/skill-governance.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Run skill verifier**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected:

```text
ok: verified 26 loopx bundled skills
```

- [ ] **Step 10: Commit skill contract updates**

```bash
git add skills/plan-to-exec/SKILL.md skills/subagent-exec/SKILL.md skills/final-review/SKILL.md skills/finish/SKILL.md skills/RESOLVER.md skills/clarify/SKILL.md test/skill-governance.test.mjs
git commit -m "docs: define multi-plan review gates"
```

## Task 4: Full Verification And Package Surface Check

**Files:**
- Verify: `src/finish-runtime.mjs`
- Verify: `test/workflow.test.mjs`
- Verify: `test/skill-governance.test.mjs`
- Verify: `skills/`
- Verify: `package.json`

**Interfaces:**
- Consumes: Task 1-3 implementation.
- Produces: release-ready verification evidence and package surface proof.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected:

```text
ok: verified 26 loopx bundled skills
```

and all Node test suites pass.

- [ ] **Step 2: Run package dry-run**

Run:

```bash
npm pack --dry-run --json
```

Expected:

- Output JSON includes `skills/plan-to-exec/`, `skills/subagent-exec/`, `skills/final-review/`, `skills/finish/`, `skills/RESOLVER.md`, `src/finish-runtime.mjs`, and tests remain excluded according to current package policy.
- Output JSON does not include `.loopx/`.

- [ ] **Step 3: Run final caller proof and negative assertions**

Run:

```bash
rg "finish_record_multi_plan|multi-plan|plan-level final-review|spec-level final-review" src test skills docs/loopx/design/2026-06-29-multi-plan-execution-review-scope
! rg "loopx multi-plan" src scripts package.json README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md
! rg "scan (every|all).*\\.loopx/multi-plan" src skills test README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/skills.md docs/loopx/skills.zh-CN.md
```

Expected:

- First command shows the new runtime, tests, skill contracts, and design docs.
- Negative assertions exit 0.

- [ ] **Step 4: Smoke test the CLI finish-record path**

Run this command block from the repo root:

```bash
wd=$(mktemp -d)
git -C "$wd" init
git -C "$wd" config user.email loopx@example.com
git -C "$wd" config user.name LoopX
printf 'finish audit\n' > "$wd/README.md"
git -C "$wd" add README.md
git -C "$wd" commit -m init
node "$PWD/src/cli.mjs" finish-start 2026-06-29-feature --source docs/loopx/plans/2026-06-29-feature/01-core.md --json >/tmp/loopx-finish-start.json
node "$PWD/src/cli.mjs" finish-audit 2026-06-29-feature --json > /tmp/loopx-finish-audit.json
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const audit = JSON.parse(fs.readFileSync('/tmp/loopx-finish-audit.json', 'utf8'));
const state = JSON.parse(fs.readFileSync(audit.statePath, 'utf8'));
state.status = 'audited';
state.audit.no_candidates_reason = 'No multi-plan extraction candidates were accepted for this smoke test.';
state.audit.extraction_candidates = [];
fs.writeFileSync(audit.statePath, `${JSON.stringify(state, null, 2)}\n`);
const root = path.join(process.cwd(), '.loopx', 'multi-plan', '2026-06-29-feature');
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'state.json'), `${JSON.stringify({
  schema_version: 1,
  feature_slug: '2026-06-29-feature',
  plan_package: 'docs/loopx/plans/2026-06-29-feature/',
  source_spec: 'docs/loopx/design/2026-06-29-feature/需求设计文档.md',
  status: 'ready_for_finish',
  plans: [{
    path: 'docs/loopx/plans/2026-06-29-feature/01-core.md',
    status: 'complete',
    plan_final_review: '.loopx/final-review/2026-06-29-01-core.md',
    ready_for_spec_review: true
  }],
  spec_final_review: {
    path: '.loopx/final-review/2026-06-29-feature.md',
    ready_for_finish: 'Yes'
  }
}, null, 2)}\n`);
console.log(audit.audit_id);
NODE
```

Then run:

```bash
audit_id=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/loopx-finish-audit.json','utf8')).audit_id)")
node "$PWD/src/cli.mjs" finish-record "$audit_id" --action keep --status done --summary "Multi-plan smoke complete" --json
```

Expected JSON contains:

```json
{
  "ok": true,
  "command": "finish-record"
}
```

and `state.status` is `"completed"`.

- [ ] **Step 5: Clean up smoke temp files**

Run:

```bash
rm -f /tmp/loopx-finish-start.json /tmp/loopx-finish-audit.json
```

Expected: command exits 0.

- [ ] **Step 6: Commit verification-only adjustments if any**

If verification required small test or doc corrections, commit them:

```bash
git status --short
git add <intentional-files>
git commit -m "test: verify multi-plan finish workflow"
```

If `git status --short` shows only expected committed changes or ignored runtime files, skip this commit.

## Self-Review Checklist

- Spec coverage:
  - Runtime state schema: Task 2.
  - Finish source-path discovery: Task 2.
  - Finish hard gate only: Task 2.
  - Final-review not runtime-blocked: Task 3.
  - Child plan independent execution and no automatic directory execution: Task 3.
  - Single-plan compatibility: Task 1 and Task 2 tests.
  - Governance and verification: Task 3 and Task 4.
- Placeholder scan:
  - No task uses "TBD", "TODO", or "add appropriate handling" without concrete code.
- Type consistency:
  - State fields match approved design: `schema_version`, `feature_slug`, `plan_package`, `source_spec`, `status`, `plans`, `plan_final_review`, `ready_for_spec_review`, `spec_final_review.ready_for_finish`.
- Design drift:
  - No new public CLI command.
  - No automatic child-plan execution.
  - No repo-tracked mutable status.
- Surface-change coverage:
  - Surface Inventory, Caller Proof, Negative Assertions, package dry-run, and current product path rules are included.
- Support lens coverage:
  - `architecture-designer` covered in state ownership and finish boundary.
  - `cli-developer` covered in command compatibility, stable errors, and JSON smoke.
- Subagent handoff readiness:
  - Each task contains exact files, interfaces, commands, expected output, and commit steps.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-29-multi-plan-execution-review-scope.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, use one combined task reviewer per task, then final-review
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
