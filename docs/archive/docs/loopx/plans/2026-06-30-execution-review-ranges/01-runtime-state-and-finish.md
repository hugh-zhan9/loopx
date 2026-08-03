# Runtime State And Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-06-30-execution-review-ranges/需求设计文档.md`

**Goal:** Add runtime support for requirement-level execution range state, `execution-start`, finish evidence, tracked dirty gating, and multi-plan v2 gates.

**Architecture:** Keep `finish-start` immutable baseline semantics unchanged and add `.loopx/execution-ranges/<slug>.json` as a separate start identity. `finish-audit` and `finish-record` consume execution state when available, otherwise they fall back to existing baseline behavior.

**Tech Stack:** Node.js ESM, `node:fs/promises`, `node:child_process`, local JSON files, `node:test`.

**Support lenses:** `architecture-designer`, `cli-developer`

## Global Constraints

- Preserve `finish-start` and `finish-audit` current behavior.
- Do not add `execution-end`.
- `execution-start` full payload is JSON-only; human output stays concise.
- Untracked files do not make workflow state dirty.
- `finish-record --status done` must block tracked staged/unstaged changes.
- Multi-plan v2 child rows use `plan_review.status`, `reviewed_at`, `summary`, and `ready_for_spec_review`; no child commit metadata.
- Keep legacy fallback when execution state is absent.

## Surface Inventory

- Public commands/API/routes/events/config: add `loopx execution-start <slug> --source <path> [--design <path>] [--json]`.
- Exported functions/types/modules: add `resolveExecutionRangeRoot`, `resolveExecutionRangePath`, `executionStartStage`; update finish helpers.
- Runtime/generated artifacts and templates: create `.loopx/execution-ranges/<slug>.json`; extend finish state/report fields.
- Installer/package/deployment surface: no package file change needed because `src/` is already published.
- Hooks/background jobs/automation: no hook changes in this child plan.
- Current product docs: CLI usage in `src/cli.mjs` help.
- Tests/governance checks: `test/workflow.test.mjs`.
- Compatibility/migration paths: read v1 multi-plan state and accept old state only through normalization; new validation uses schema v2.

## Internal Plan Review

- Plan review mode: same-context
- Reviewer independence: degraded
- Unresolved findings: none
- Review evidence: Runtime tasks cover AC-1, AC-2, AC-2a, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-8a, AC-12 and D-001, D-002, D-003, D-008, D-009, D-010.
- Recheck evidence: Added explicit tracked dirty gate and v1/v2 multi-plan validation tasks so finish behavior is testable rather than only documented.
- Residual risk: same-context plan review was not independent.

---

### T-001 / Task 1: Add execution range runtime helpers

**Files:**
- Modify: `src/finish-runtime.mjs`
- Test: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: `cwd`, `slug`, `source`, optional `design`, current git `HEAD`, current worktree root.
- Produces:
  - `resolveExecutionRangeRoot(cwd): string`
  - `resolveExecutionRangePath(cwd, slug): string`
  - `executionStartStage(cwd, slug, { source, design, date }): Promise<{ path, state, reused }>`
  - `.loopx/execution-ranges/<slug>.json`

**Traceability:**
- Source AC: `AC-1`, `AC-2a`, `AC-6`
- Design anchors: `D-001`, `D-002`, `D-010`
- Test cases: `TC-1`, `TC-6`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/workflow.test.mjs --test-name-pattern "execution-start"`
- `evidence_summary`: tests prove first run creates execution range state and second same-source run reuses it.
- `remaining_risk`: none

**Review focus:**
- Verify execution state is separate from finish baseline files.
- Verify same slug/source/design/worktree is idempotent and different source/design conflicts.
- Verify no end commit or finish evidence is recorded.

**Support lenses:** `architecture-designer`, `cli-developer`

- [ ] **Step 1: Write failing tests for state creation and reuse**

Add tests near existing finish runtime tests in `test/workflow.test.mjs`:

```js
it('creates and reuses execution range state', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-execution-start-'));
  await initGitRepo(wd);
  await writeFile(join(wd, 'plan.md'), '# Plan\n');
  await execGit(wd, ['add', 'plan.md']);
  await execGit(wd, ['commit', '-m', 'initial plan']);
  const head = await gitOutput(wd, ['rev-parse', 'HEAD']);

  const first = await executionStartStage(wd, 'feature-a', {
    source: 'docs/loopx/plans/feature-a.md',
    design: 'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md',
    date: new Date('2026-06-30T00:00:00.000Z'),
  });
  const second = await executionStartStage(wd, 'feature-a', {
    source: 'docs/loopx/plans/feature-a.md',
    design: 'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md',
    date: new Date('2026-06-30T00:01:00.000Z'),
  });

  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.path, join(wd, '.loopx', 'execution-ranges', 'feature-a.json'));
  assert.equal(first.state.start_commit, head);
  assert.equal(first.state.start_commit_short, head.slice(0, 7));
  assert.equal(first.state.source_artifact, 'docs/loopx/plans/feature-a.md');
  assert.equal(first.state.design_artifact, 'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md');
  assert.equal(first.state.canonical_final_review_report, '.loopx/final-review/2026-06-30-feature-a.md');
  assert.deepEqual(second.state, first.state);
});
```

- [ ] **Step 2: Export helper signatures**

In `src/finish-runtime.mjs`, add:

```js
const EXECUTION_RANGE_SCHEMA_VERSION = 1;

export function resolveExecutionRangeRoot(cwd) {
  return join(resolve(cwd), '.loopx', 'execution-ranges');
}

export function resolveExecutionRangePath(cwd, slug) {
  const normalizedSlug = normalizeSlug(slug) || 'execution-range';
  return join(resolveExecutionRangeRoot(cwd), `${normalizedSlug}.json`);
}
```

- [ ] **Step 3: Implement canonical report path derivation**

Add helpers in `src/finish-runtime.mjs`:

```js
function normalizedArtifactPath(value) {
  return String(value || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function canonicalFinalReviewReportPath({ source, design, slug }) {
  const identity = normalizedArtifactPath(design || source);
  const designMatch = identity.match(/docs\/loopx\/design\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\/[^/]+\.md$/);
  const sourceMatch = identity.match(/(?:^|\/)(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)(?:\.md|\/00-overview\.md|\/)?$/);
  const reportSlug = designMatch?.[1] || sourceMatch?.[1] || normalizeSlug(slug) || 'final-review';
  return `.loopx/final-review/${reportSlug}.md`;
}
```

If `normalizedArtifactPath` already exists later in the file, move the existing helper above both callers instead of duplicating it.

- [ ] **Step 4: Implement `executionStartStage`**

Add:

```js
async function readExecutionRangeState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw new Error('execution_start_invalid_state');
  }
}

function sameExecutionIdentity(state, expected) {
  return state.schema_version === EXECUTION_RANGE_SCHEMA_VERSION
    && state.slug === expected.slug
    && state.worktree === expected.worktree
    && normalizedArtifactPath(state.source_artifact) === normalizedArtifactPath(expected.source_artifact)
    && normalizedArtifactPath(state.design_artifact || '') === normalizedArtifactPath(expected.design_artifact || '');
}

export async function executionStartStage(cwd, slug, { source, design = null, date = new Date() } = {}) {
  const normalizedSlug = normalizeSlug(slug) || 'execution-range';
  if (!nonEmptyText(source)) {
    throw new Error('execution_start_source_required');
  }
  const evidence = await resolveGitEvidence(cwd);
  if (evidence.worktree === 'unknown') {
    throw new Error('execution_start_no_valid_head');
  }
  const fullHead = await resolveRequiredHead(cwd);
  const rootCwd = evidence.worktree;
  const stateDate = date instanceof Date ? date : new Date(date);
  await mkdir(resolveExecutionRangeRoot(rootCwd), { recursive: true });
  const path = resolveExecutionRangePath(rootCwd, normalizedSlug);
  const expected = {
    schema_version: EXECUTION_RANGE_SCHEMA_VERSION,
    slug: normalizedSlug,
    worktree: evidence.worktree,
    source_artifact: normalizedArtifactPath(source),
    design_artifact: design ? normalizedArtifactPath(design) : null,
  };
  const existingState = await readExecutionRangeState(path);
  if (existingState) {
    if (!sameExecutionIdentity(existingState, expected)) {
      throw new Error('execution_start_slug_conflict');
    }
    return { path, state: existingState, reused: true };
  }
  const state = {
    ...expected,
    started_at: stateDate.toISOString(),
    branch: evidence.branch,
    start_commit: fullHead,
    start_commit_short: fullHead.slice(0, 7),
    canonical_final_review_report: canonicalFinalReviewReportPath({ source, design, slug: normalizedSlug }),
  };
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
  return { path, state, reused: false };
}
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
node --test test/workflow.test.mjs --test-name-pattern "execution-start"
```

Expected: new test passes.

- [ ] **Step 6: Commit**

```bash
git add src/finish-runtime.mjs test/workflow.test.mjs
git commit -m "Add execution range state runtime"
```

### T-002 / Task 2: Add `loopx execution-start` CLI

**Files:**
- Modify: `src/cli.mjs`
- Test: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: `executionStartStage(cwd, slug, { source, design })`.
- Produces: public CLI command `loopx execution-start <slug> --source <path> [--design <path>] [--json]`.

**Traceability:**
- Source AC: `AC-1`, `AC-2a`, `AC-6`
- Design anchors: `D-002`, `D-010`
- Test cases: `TC-1`, `TC-6`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/workflow.test.mjs --test-name-pattern "execution-start CLI"`
- `evidence_summary`: tests prove human output is concise and JSON output contains `ok`, `command`, `path`, `state`, `reused`.
- `remaining_risk`: none

**Review focus:**
- Verify `--json` stdout is machine-only JSON.
- Verify human output contains slug/path/start/source/design and no interactive prompt.

**Support lenses:** `cli-developer`

- [ ] **Step 1: Write CLI tests**

Add a test that spawns the local CLI:

```js
it('prints execution-start CLI output in human and JSON modes', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-execution-start-cli-'));
  await initGitRepo(wd);
  await writeFile(join(wd, 'README.md'), '# test\n');
  await execGit(wd, ['add', 'README.md']);
  await execGit(wd, ['commit', '-m', 'initial']);

  const human = await runCli(wd, [
    'execution-start',
    'feature-a',
    '--source',
    'docs/loopx/plans/feature-a.md',
    '--design',
    'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md',
  ]);
  assert.match(human.stdout, /execution range: feature-a/);
  assert.match(human.stdout, /path: .*\.loopx\/execution-ranges\/feature-a\.json/);
  assert.match(human.stdout, /start: [0-9a-f]{7}/);
  assert.match(human.stdout, /source: docs\/loopx\/plans\/feature-a\.md/);
  assert.match(human.stdout, /design: docs\/loopx\/design\/2026-06-30-feature-a\/需求设计文档\.md/);

  const json = await runCli(wd, [
    'execution-start',
    'feature-a',
    '--source',
    'docs/loopx/plans/feature-a.md',
    '--design',
    'docs/loopx/design/2026-06-30-feature-a/需求设计文档.md',
    '--json',
  ]);
  const payload = JSON.parse(json.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'execution-start');
  assert.equal(payload.reused, true);
  assert.equal(payload.state.slug, 'feature-a');
});
```

- [ ] **Step 2: Wire CLI import**

In `src/cli.mjs`, extend the finish-runtime import:

```js
import {
  executionStartStage,
  finishAuditStage,
  finishRecordStage,
  finishStartStage,
} from './finish-runtime.mjs';
```

- [ ] **Step 3: Add usage line**

Add to `usage()`:

```js
'  loopx execution-start <slug> --source <path> [--design <path>] [--json]',
```

- [ ] **Step 4: Add command switch case**

Add before `finish-start`:

```js
case 'execution-start': {
  const result = await executionStartStage(process.cwd(), positionals[0], {
    source: options.get('--source'),
    design: options.get('--design') ?? null,
  });
  if (json) {
    console.log(JSON.stringify({
      ok: true,
      command,
      path: result.path,
      state: result.state,
      reused: result.reused,
    }, null, 2));
  } else {
    console.log(`execution range: ${result.state.slug}`);
    console.log(`path: ${result.path}`);
    console.log(`start: ${result.state.start_commit_short}`);
    console.log(`source: ${result.state.source_artifact}`);
    console.log(`design: ${result.state.design_artifact ?? 'null'}`);
  }
  break;
}
```

- [ ] **Step 5: Run focused tests**

```bash
node --test test/workflow.test.mjs --test-name-pattern "execution-start"
```

Expected: all execution-start tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli.mjs test/workflow.test.mjs
git commit -m "Add execution-start CLI"
```

### T-003 / Task 3: Add requirement start evidence to finish audit/report

**Files:**
- Modify: `src/finish-runtime.mjs`
- Test: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: `.loopx/execution-ranges/<slug>.json` or finish baseline fallback.
- Produces: `audit.change_window.requirement_start_commit`, `requirement_start_commit_short`, `requirement_start_source`, `final_head`, `tracked_status`, `untracked_status`.

**Traceability:**
- Source AC: `AC-4`, `AC-7`, `AC-8`, `AC-8a`
- Design anchors: `D-008`, `D-010`
- Test cases: `TC-4`, `TC-8`, `TC-9`, `TC-9b`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/workflow.test.mjs --test-name-pattern "finish report includes requirement start|untracked files do not block finish"`
- `evidence_summary`: finish report shows execution start commit and final HEAD; untracked-only status does not block done.
- `remaining_risk`: none

**Review focus:**
- Verify finish baseline fallback remains when execution state is absent.
- Verify final `HEAD` is captured at audit/record time and report labels are auditable.
- Verify untracked entries are separated from tracked entries.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Write failing tests**

Add:

```js
it('finish report includes requirement start commit from execution range', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-execution-range-'));
  await initGitRepo(wd);
  await writeFile(join(wd, 'README.md'), '# initial\n');
  await execGit(wd, ['add', 'README.md']);
  await execGit(wd, ['commit', '-m', 'initial']);
  const start = await gitOutput(wd, ['rev-parse', 'HEAD']);

  await executionStartStage(wd, 'feature-a', { source: 'docs/loopx/plans/feature-a.md' });
  await finishStartStage(wd, 'feature-a', { source: 'docs/loopx/plans/feature-a.md' });
  await writeFile(join(wd, 'README.md'), '# changed\n');
  await execGit(wd, ['add', 'README.md']);
  await execGit(wd, ['commit', '-m', 'implement feature']);
  const finalHead = await gitOutput(wd, ['rev-parse', 'HEAD']);

  const audit = await finishAuditStage(wd, 'feature-a');
  const report = await readFile(audit.reportPath, 'utf8');
  assert.equal(audit.state.audit.change_window.requirement_start_commit, start);
  assert.equal(audit.state.audit.change_window.final_head, finalHead.slice(0, 7));
  assert.match(report, new RegExp(`requirement_start_commit: ${start.slice(0, 7)}`));
  assert.match(report, new RegExp(`final_HEAD: ${finalHead.slice(0, 7)}`));
});
```

- [ ] **Step 2: Split tracked and untracked status**

Add helper:

```js
function splitStatusShort(lines) {
  const statusLines = Array.isArray(lines) ? lines : [];
  const tracked = [];
  const untracked = [];
  for (const line of statusLines) {
    if (String(line).startsWith('?? ')) {
      untracked.push(line);
    } else {
      tracked.push(line);
    }
  }
  return { tracked, untracked };
}
```

- [ ] **Step 3: Read execution state in change window**

Add:

```js
async function readExecutionRangeForSlug(cwd, slug) {
  const path = resolveExecutionRangePath(cwd, slug);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw new Error('execution_range_invalid_state');
  }
}
```

In `resolveChangeWindow`, after status parsing, compute:

```js
const executionRange = await readExecutionRangeForSlug(rootCwd, slug);
const requirementStartCommit = executionRange?.start_commit || baseline?.head || null;
const statusGroups = splitStatusShort(uncommittedStatus);
const fullHead = await resolveFullHead(cwd);
const finalHead = fullHead === 'unknown' ? evidence.head : fullHead.slice(0, 7);
```

Add these fields to both return branches:

```js
requirement_start_commit: requirementStartCommit,
requirement_start_commit_short: requirementStartCommit ? requirementStartCommit.slice(0, 7) : null,
requirement_start_source: executionRange ? 'execution-range' : baseline?.head ? 'baseline' : 'none',
final_head: finalHead,
tracked_status: statusGroups.tracked,
untracked_status: statusGroups.untracked,
```

- [ ] **Step 4: Render finish evidence**

In `buildFinishReport`, render under `## Change Window`:

```js
`- requirement_start_commit: ${singleLineText(changeWindow.requirement_start_commit_short ?? changeWindow.requirement_start_commit)}`,
`- requirement_start_source: ${singleLineText(changeWindow.requirement_start_source)}`,
`- final_HEAD: ${singleLineText(changeWindow.final_head)}`,
```

Add sections:

```js
const trackedStatus = Array.isArray(changeWindow.tracked_status) && changeWindow.tracked_status.length > 0
  ? changeWindow.tracked_status.map((item) => `- ${singleLineText(item)}`).join('\n')
  : '- none';
const untrackedStatus = Array.isArray(changeWindow.untracked_status) && changeWindow.untracked_status.length > 0
  ? changeWindow.untracked_status.map((item) => `- ${singleLineText(item)}`).join('\n')
  : '- none';
```

Render headings `### Tracked Status` and `### Untracked Status` before the legacy `### Uncommitted Status` section or replace it if no tests require the old heading.

- [ ] **Step 5: Run focused tests**

```bash
node --test test/workflow.test.mjs --test-name-pattern "finish report includes requirement start|untracked"
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/finish-runtime.mjs test/workflow.test.mjs
git commit -m "Record finish requirement evidence"
```

### T-004 / Task 4: Enforce tracked dirty gate and multi-plan state v2

**Files:**
- Modify: `src/finish-runtime.mjs`
- Test: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: finish audit state, `.loopx/multi-plan/<feature-slug>/state.json`.
- Produces: finish completion gate requiring no tracked dirty entries and multi-plan v2 readiness.

**Traceability:**
- Source AC: `AC-3`, `AC-4`, `AC-5`, `AC-8`, `AC-8a`, `AC-12`
- Design anchors: `D-005`, `D-008`, `D-009`, `D-010`
- Test cases: `TC-3`, `TC-4`, `TC-5`, `TC-9`, `TC-9b`, `TC-14`, `TC-15`
- Task anchor: `T-004`

**Expected execution evidence:**
- `commands_run`: `node --test test/workflow.test.mjs --test-name-pattern "multi-plan|tracked dirty|untracked"`
- `evidence_summary`: v2 state passes, missing `plan_review.status` blocks, `plan_final_review` no longer required, tracked dirty blocks done, untracked-only does not block.
- `remaining_risk`: v1 write-back migration is covered in governance plan; this runtime task only normalizes reads.

**Review focus:**
- Verify `plan_final_review` is not required for readiness.
- Verify child plan commit metadata is rejected or ignored as invalid if validation covers forbidden fields.
- Verify finish does not complete with tracked dirty changes.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Update multi-plan tests to v2**

Replace existing passing test state shape:

```js
{
  schema_version: 2,
  feature_slug: featureSlug,
  plan_package: `docs/loopx/plans/${featureSlug}`,
  source_spec: `docs/loopx/design/${featureSlug}/需求设计文档.md`,
  plans: [
    {
      path: `docs/loopx/plans/${featureSlug}/01-core.md`,
      status: 'complete',
      plan_review: {
        status: 'passed',
        reviewed_at: '2026-06-30T00:00:00.000Z',
        summary: 'No blocking issues',
      },
      ready_for_spec_review: true,
    }
  ],
  spec_final_review: {
    path: `.loopx/final-review/${featureSlug}.md`,
    ready_for_finish: 'Yes',
  },
}
```

Add a blocking test where `plan_review` is missing and assert:

```js
await assert.rejects(
  () => finishRecordStage(wd, audit.auditId, { action: 'keep', status: 'done', summary: 'done' }),
  /finish_record_multi_plan_incomplete:.*plan_review.status must be passed/
);
```

- [ ] **Step 2: Add tracked dirty finish test**

```js
it('blocks finish done when tracked changes remain uncommitted', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-tracked-dirty-'));
  await initGitRepo(wd);
  await writeFile(join(wd, 'README.md'), '# initial\n');
  await execGit(wd, ['add', 'README.md']);
  await execGit(wd, ['commit', '-m', 'initial']);
  await finishStartStage(wd, 'feature-a', { source: 'docs/loopx/plans/feature-a.md' });
  const audit = await finishAuditStage(wd, 'feature-a');
  await writeFile(join(wd, 'README.md'), '# dirty\n');

  await assert.rejects(
    () => finishRecordStage(wd, audit.auditId, { action: 'keep', status: 'done', summary: 'done' }),
    /finish_record_tracked_dirty/
  );
});
```

- [ ] **Step 3: Bump multi-plan schema constant**

Change:

```js
const MULTI_PLAN_SCHEMA_VERSION = 2;
```

- [ ] **Step 4: Normalize v1 and validate v2**

Add:

```js
function normalizeMultiPlanStateForValidation(multiPlanState) {
  if (!plainObject(multiPlanState)) {
    return multiPlanState;
  }
  if (multiPlanState.schema_version === MULTI_PLAN_SCHEMA_VERSION) {
    return multiPlanState;
  }
  if (multiPlanState.schema_version !== 1) {
    return multiPlanState;
  }
  return {
    ...multiPlanState,
    schema_version: MULTI_PLAN_SCHEMA_VERSION,
    plans: Array.isArray(multiPlanState.plans)
      ? multiPlanState.plans.map((plan) => ({
          ...plan,
          plan_review: plainObject(plan?.plan_review) || (nonEmptyText(plan?.plan_final_review)
            ? {
                status: 'passed',
                reviewed_at: null,
                summary: `Migrated from ${plan.plan_final_review}`,
              }
            : plan?.plan_review),
        }))
      : multiPlanState.plans,
  };
}
```

In `assertMultiPlanReadyForFinish`, call validation on normalized state.

- [ ] **Step 5: Replace `plan_final_review` gate**

In `validateMultiPlanState`, replace the old check with:

```js
const planReview = plainObject(plan.plan_review);
if (!planReview || planReview.status !== 'passed') {
  issues.push(multiPlanGateIssue('plan_review.status must be passed', {
    path: path || `(index ${index})`,
    actual: planReview?.status ?? null,
  }));
}
if (planReview && !nonEmptyText(planReview.summary)) {
  issues.push(multiPlanGateIssue('plan_review.summary is required', {
    path: path || `(index ${index})`,
  }));
}
for (const forbidden of ['start_commit', 'current_head', 'end_commit']) {
  if (Object.hasOwn(plan, forbidden)) {
    issues.push(multiPlanGateIssue(`${forbidden} must not be recorded on child plan state`, {
      path: path || `(index ${index})`,
    }));
  }
}
```

- [ ] **Step 6: Gate tracked dirty on done**

Add:

```js
async function assertNoTrackedDirtyForFinish(cwd) {
  const statusText = await gitOutputAllowFailure(cwd, ['status', '--short']);
  const { tracked } = splitStatusShort(parseStatusShort(statusText));
  if (tracked.length > 0) {
    throw new Error(`finish_record_tracked_dirty:${tracked.join('; ')}`);
  }
}
```

Call it inside `finishRecordStage` before multi-plan readiness:

```js
if (normalizedStatus === 'done') {
  await assertNoTrackedDirtyForFinish(cwd);
  await assertMultiPlanReadyForFinish(cwd, state);
}
```

- [ ] **Step 7: Run focused tests**

```bash
node --test test/workflow.test.mjs --test-name-pattern "multi-plan|tracked dirty|untracked"
```

Expected: focused tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/finish-runtime.mjs test/workflow.test.mjs
git commit -m "Update finish gates for execution ranges"
```

## Plan-Level Verification

Run:

```bash
node --test test/workflow.test.mjs
```

Expected: workflow tests pass. If governance tests fail because skill docs still reference old fields, leave that for child plan 3 and record the failure in task evidence.

## Execution Handoff

Implement this child plan first. After all tasks pass, run plan-level `final-review` for this child plan and update `.loopx/multi-plan/2026-06-30-execution-review-ranges/state.json` with `plan_review.status: "passed"` and `ready_for_spec_review: true`. Do not write a child `.loopx/final-review/*.md` report.
