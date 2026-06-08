# Finish Audit Change Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** Current conversation on 2026-06-08: finish learning/spec extraction misses content when plan execution already committed the code and `git diff` is empty.

**Goal:** Make finish learning/spec audit inspect a stable committed change window, not only the current uncommitted diff.

**Architecture:** Add a local finish baseline command that records the execution start commit before implementation begins. Extend `finish-audit` to load that baseline and persist a compact `baseline..HEAD` change window in the audit state and report, while keeping memory/spec promotion as an agent audit decision instead of automatic runtime mutation.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, Git CLI through `execFile`, Markdown skill docs.

---

## File Structure

- Modify: `src/finish-runtime.mjs`
  - Own finish baseline persistence and finish audit change-window evidence.
  - Export `finishStartStage(cwd, slug, options)` alongside `finishAuditStage`.
  - Keep existing `finishRecordStage` behavior compatible with older audit state files.
- Modify: `src/cli.mjs`
  - Add `loopx finish-start [slug] [--source <path>] [--json]`.
  - Pass `--baseline <git-ref>` through to `finish-audit` for manual recovery when no baseline file exists.
- Modify: `test/trellis-hardening.test.mjs`
  - Add regression coverage for committed-but-clean worktrees.
  - Update existing finish audit shape assertions for the new `audit.change_window` object.
- Modify: `skills/finish/SKILL.md`
  - Require agents to inspect `audit.change_window` before deciding no memory/spec candidates.
  - Clarify that "already committed" and "empty git diff" are not reasons to skip extraction.
- Modify: `plugins/loopx/skills/finish/SKILL.md`
  - Mirror the canonical finish skill changes.
- Modify: `skills/subagent-exec/SKILL.md`
  - Run `loopx finish-start <slug> --source <plan-path>` before the first implementation dispatch.
- Modify: `plugins/loopx/skills/subagent-exec/SKILL.md`
  - Mirror the canonical subagent-exec skill changes.
- Modify: `skills/exec/SKILL.md`
  - Run `loopx finish-start <slug> --source <plan-path>` before the first task.
- Modify: `plugins/loopx/skills/exec/SKILL.md`
  - Mirror the canonical exec skill changes.
- Modify: `README.md`
  - Document the new baseline command and finish audit change-window behavior.
- Modify: `README.zh-CN.md`
  - Document the same behavior in Chinese.
- Modify: `test/skill-governance.test.mjs`
  - Require README and mirrored skills to mention `finish-start` and committed change windows.

## Runtime Data Shape

`loopx finish-start learning-audit --source docs/loopx/plans/2026-06-08-finish-learning-audit.md` writes:

```json
{
  "schema_version": 1,
  "slug": "learning-audit",
  "created_at": "2026-06-08T00:00:00.000Z",
  "worktree": "/repo",
  "branch": "main",
  "head": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "head_short": "aaaaaaa",
  "source": "docs/loopx/plans/2026-06-08-finish-learning-audit.md"
}
```

Baseline files live under:

```text
.loopx/finish/baselines/<slug>.json
.loopx/finish/baselines/latest.json
```

`loopx finish-audit learning-audit` writes this compact evidence into `.loopx/finish/<audit-id>/finish-state.json`:

```json
{
  "audit": {
    "change_window": {
      "source": "baseline",
      "baseline_ref": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "baseline_ref_short": "aaaaaaa",
      "range": "aaaaaaa..HEAD",
      "commit_count": 1,
      "commits": [
        {
          "sha": "bbbbbbb",
          "subject": "feat: finish audit ledger and choice recording"
        }
      ],
      "changed_files": [
        {
          "status": "M",
          "path": "src/finish-runtime.mjs"
        }
      ],
      "diff_stat": "src/finish-runtime.mjs | 80 +++++++++++++++++++++++++++++",
      "uncommitted_status": [],
      "source_artifacts": [
        "docs/loopx/plans/2026-06-08-finish-learning-audit.md"
      ]
    }
  }
}
```

If no matching baseline exists, `finish-audit` falls back in this order:

1. `--baseline <git-ref>`
2. `.loopx/finish/baselines/<slug>.json`
3. `.loopx/finish/baselines/latest.json` when the slug was omitted or the latest baseline slug matches the current branch/worktree
4. `git merge-base HEAD <base_branch>` when it is older than `HEAD`
5. no committed range, with only `git status --short` recorded

## Task 1: Baseline Command

**Files:**
- Modify: `src/finish-runtime.mjs`
- Modify: `src/cli.mjs`
- Test: `test/trellis-hardening.test.mjs`

- [ ] **Step 1: Import `rm` for test cleanup if needed**

In `test/trellis-hardening.test.mjs`, keep the existing imports and only add extra imports when the implementation needs them. The baseline tests can use the existing `mkdtemp`, `readFile`, `writeFile`, and `execFileAsync` helpers.

- [ ] **Step 2: Write the failing runtime test for `finishStartStage`**

Add `finishStartStage` to the existing import from `../src/finish-runtime.mjs`.

Add this test near the existing finish audit tests:

```js
  it('records a finish baseline before committed execution work begins', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-start-'));
    await execFileAsync('git', ['init'], { cwd: wd });
    await execFileAsync('git', ['config', 'user.email', 'loopx@example.com'], { cwd: wd });
    await execFileAsync('git', ['config', 'user.name', 'LoopX'], { cwd: wd });
    await writeFile(join(wd, 'README.md'), 'baseline\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: wd });
    const { stdout: headStdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: wd });
    const head = headStdout.trim();

    const result = await finishStartStage(wd, 'finish-baseline-flow', {
      source: 'docs/loopx/plans/example.md',
      date: new Date('2026-06-08T00:00:00.000Z'),
    });

    assert.equal(result.state.slug, 'finish-baseline-flow');
    assert.equal(result.state.head, head);
    assert.equal(result.state.head_short, head.slice(0, 7));
    assert.equal(result.state.source, 'docs/loopx/plans/example.md');
    assert.match(result.path, /\.loopx\/finish\/baselines\/finish-baseline-flow\.json$/);
    assert.deepEqual(JSON.parse(await readFile(result.path, 'utf8')), result.state);
    assert.deepEqual(JSON.parse(await readFile(result.latestPath, 'utf8')), result.state);
  });
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
node --test --test-name-pattern "records a finish baseline" test/trellis-hardening.test.mjs
```

Expected: fail with `SyntaxError` or export error because `finishStartStage` does not exist yet.

- [ ] **Step 4: Implement baseline helpers**

In `src/finish-runtime.mjs`, extend imports:

```js
import { basename, dirname, join, resolve } from 'node:path';
```

Add these helpers near the existing finish path helpers:

```js
export function resolveFinishBaselineRoot(cwd) {
  return join(resolveFinishAuditRoot(cwd), 'baselines');
}

export function resolveFinishBaselinePath(cwd, slug) {
  return join(resolveFinishBaselineRoot(cwd), `${normalizeSlug(slug) || 'finish-audit'}.json`);
}

export function resolveLatestFinishBaselinePath(cwd) {
  return join(resolveFinishBaselineRoot(cwd), 'latest.json');
}
```

Add a full-HEAD helper near `resolveGitEvidence`:

```js
async function resolveFullHead(cwd) {
  return readGitField(cwd, ['rev-parse', 'HEAD']);
}
```

Add `finishStartStage` near `finishAuditStage`:

```js
export async function finishStartStage(cwd, slug, { source = null, date = new Date() } = {}) {
  const baselineDate = date instanceof Date ? date : new Date(date);
  const normalizedSlug = normalizeSlug(slug) || 'finish-audit';
  await mkdir(resolveFinishBaselineRoot(cwd), { recursive: true });

  const evidence = await resolveGitEvidence(cwd);
  const fullHead = await resolveFullHead(cwd);
  const state = {
    schema_version: FINISH_SCHEMA_VERSION,
    slug: normalizedSlug,
    created_at: baselineDate.toISOString(),
    worktree: evidence.worktree,
    branch: evidence.branch,
    head: fullHead,
    head_short: fullHead === 'unknown' ? evidence.head : fullHead.slice(0, 7),
    source: source ? String(source) : null,
  };

  const path = resolveFinishBaselinePath(cwd, normalizedSlug);
  const latestPath = resolveLatestFinishBaselinePath(cwd);
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(latestPath, `${JSON.stringify(state, null, 2)}\n`);
  return { path, latestPath, state };
}
```

- [ ] **Step 5: Add CLI support**

In `src/cli.mjs`, update the import:

```js
import { finishAuditStage, finishRecordStage, finishStartStage } from './finish-runtime.mjs';
```

Add this usage line before `finish-audit`:

```js
'  loopx finish-start [slug] [--source <path>] [--json]',
```

Add a `case 'finish-start'` before `case 'finish-audit'`:

```js
      case 'finish-start': {
        const result = await finishStartStage(process.cwd(), positionals[0], {
          source: options.get('--source') || null,
        });
        if (options.get('--json')) {
          console.log(JSON.stringify({
            ok: true,
            command,
            path: result.path,
            latestPath: result.latestPath,
            state: result.state,
          }, null, 2));
        } else {
          console.log(`finish baseline: ${result.state.slug}`);
          console.log(`path: ${result.path}`);
          console.log(`head: ${result.state.head_short}`);
          console.log(`source: ${result.state.source ?? '(none)'}`);
        }
        return;
      }
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
node --test --test-name-pattern "records a finish baseline" test/trellis-hardening.test.mjs
```

Expected: `# pass 1`.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/finish-runtime.mjs src/cli.mjs test/trellis-hardening.test.mjs
git commit -m "feat: record finish audit baseline"
```

## Task 2: Finish Audit Committed Change Window

**Files:**
- Modify: `src/finish-runtime.mjs`
- Modify: `src/cli.mjs`
- Test: `test/trellis-hardening.test.mjs`

- [ ] **Step 1: Write the failing clean-worktree regression test**

Add this test near the baseline test:

```js
  it('includes committed change evidence when the worktree diff is empty', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-window-'));
    await execFileAsync('git', ['init'], { cwd: wd });
    await execFileAsync('git', ['config', 'user.email', 'loopx@example.com'], { cwd: wd });
    await execFileAsync('git', ['config', 'user.name', 'LoopX'], { cwd: wd });
    await writeFile(join(wd, 'README.md'), 'before\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: wd });
    const baseline = await finishStartStage(wd, 'finish-window-flow', {
      source: 'docs/loopx/plans/window.md',
      date: new Date('2026-06-08T00:00:00.000Z'),
    });

    await writeFile(join(wd, 'README.md'), 'before\nafter\n');
    await writeFile(join(wd, 'feature.txt'), 'new committed file\n');
    await execFileAsync('git', ['add', 'README.md', 'feature.txt'], { cwd: wd });
    await execFileAsync('git', ['commit', '-m', 'feat: committed finish evidence'], { cwd: wd });
    const { stdout: statusStdout } = await execFileAsync('git', ['status', '--short'], { cwd: wd });
    assert.equal(statusStdout, '');

    const audit = await finishAuditStage(wd, 'finish-window-flow');

    assert.equal(audit.state.audit.change_window.source, 'baseline');
    assert.equal(audit.state.audit.change_window.baseline_ref, baseline.state.head);
    assert.equal(audit.state.audit.change_window.commit_count, 1);
    assert.deepEqual(audit.state.audit.change_window.commits, [{
      sha: audit.state.audit.change_window.commits[0].sha,
      subject: 'feat: committed finish evidence',
    }]);
    assert.match(audit.state.audit.change_window.commits[0].sha, /^[0-9a-f]{7,40}$/);
    assert.deepEqual(audit.state.audit.change_window.changed_files, [
      { status: 'M', path: 'README.md' },
      { status: 'A', path: 'feature.txt' },
    ]);
    assert.deepEqual(audit.state.audit.change_window.uncommitted_status, []);
    assert.deepEqual(audit.state.audit.change_window.source_artifacts, ['docs/loopx/plans/window.md']);
    assert.match(audit.state.inputs.scanned.join('\n'), /change_range=/);
    assert.match(audit.state.inputs.scanned.join('\n'), /committed_change_count=1/);
    assert.match(await readFile(audit.reportPath, 'utf8'), /## Change Window/);
    assert.match(await readFile(audit.reportPath, 'utf8'), /feat: committed finish evidence/);
    assert.match(await readFile(audit.reportPath, 'utf8'), /feature\.txt/);
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test --test-name-pattern "includes committed change evidence" test/trellis-hardening.test.mjs
```

Expected: fail because `audit.change_window` is missing.

- [ ] **Step 3: Implement baseline loading and Git range helpers**

In `src/finish-runtime.mjs`, add:

```js
async function readJsonIfExists(path) {
  if (!await pathExists(path)) {
    return null;
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function readFinishBaseline(cwd, slug) {
  const normalizedSlug = normalizeSlug(slug) || 'finish-audit';
  return await readJsonIfExists(resolveFinishBaselinePath(cwd, normalizedSlug))
    ?? await readJsonIfExists(resolveLatestFinishBaselinePath(cwd));
}

function parseNameStatus(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, firstPath, secondPath] = line.split('\t');
      return {
        status,
        path: secondPath || firstPath,
      };
    });
}

function parseCommitLog(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(' ');
      return {
        sha: separator === -1 ? line : line.slice(0, separator),
        subject: separator === -1 ? '' : line.slice(separator + 1),
      };
    });
}

function parseStatusShort(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}
```

Add a change-window resolver:

```js
async function resolveMergeBaseRef(cwd, baseBranch) {
  if (!baseBranch || baseBranch === 'unknown') {
    return null;
  }
  const value = await gitOutputAllowFailure(cwd, ['merge-base', 'HEAD', baseBranch]);
  return /^[0-9a-f]{7,40}$/.test(value) ? value : null;
}

async function resolveChangeWindow(cwd, slug, evidence, { baselineRef = null } = {}) {
  const baseline = baselineRef
    ? { head: String(baselineRef), head_short: String(baselineRef).slice(0, 7), source: null }
    : await readFinishBaseline(cwd, slug);
  const fallbackMergeBase = baseline ? null : await resolveMergeBaseRef(cwd, evidence.base_branch);
  const ref = baseline?.head || fallbackMergeBase;
  const source = baseline?.head ? 'baseline' : fallbackMergeBase ? 'merge-base' : 'none';
  const statusText = await gitOutputAllowFailure(cwd, ['status', '--short']);
  const uncommittedStatus = parseStatusShort(statusText);

  if (!ref || ref === 'unknown') {
    return {
      source,
      baseline_ref: null,
      baseline_ref_short: null,
      range: null,
      commit_count: 0,
      commits: [],
      changed_files: [],
      diff_stat: '',
      uncommitted_status: uncommittedStatus,
      source_artifacts: baseline?.source ? [baseline.source] : [],
    };
  }

  const range = `${ref}..HEAD`;
  const commits = parseCommitLog(await gitOutputAllowFailure(cwd, ['log', '--oneline', range]));
  const changedFiles = parseNameStatus(await gitOutputAllowFailure(cwd, ['diff', '--name-status', range]));
  const diffStat = await gitOutputAllowFailure(cwd, ['diff', '--stat', range]);
  return {
    source,
    baseline_ref: ref,
    baseline_ref_short: baseline?.head_short || ref.slice(0, 7),
    range: `${ref.slice(0, 7)}..HEAD`,
    commit_count: commits.length,
    commits,
    changed_files: changedFiles,
    diff_stat: diffStat,
    uncommitted_status: uncommittedStatus,
    source_artifacts: baseline?.source ? [baseline.source] : [],
  };
}
```

- [ ] **Step 4: Persist the change window in audit state**

Change the `finishAuditStage` signature:

```js
export async function finishAuditStage(cwd, slug, { env = process.env, date = new Date(), baselineRef = null } = {}) {
```

Before `scannedInputs`, resolve the window:

```js
  const changeWindow = await resolveChangeWindow(cwd, normalizedSlug, evidence, { baselineRef });
```

Append these scanned inputs:

```js
    `change_window_source=${changeWindow.source}`,
    `change_range=${changeWindow.range ?? 'none'}`,
    `committed_change_count=${changeWindow.commit_count}`,
    `changed_files_count=${changeWindow.changed_files.length}`,
    `uncommitted_change_count=${changeWindow.uncommitted_status.length}`,
```

Add `change_window: changeWindow` inside `state.audit`.

- [ ] **Step 5: Render a `## Change Window` report section**

In `buildFinishReport`, add:

```js
  const changeWindow = auditChoices.change_window || {};
  const commits = Array.isArray(changeWindow.commits) && changeWindow.commits.length > 0
    ? changeWindow.commits.map((item) => `- ${singleLineText(item.sha)} ${singleLineText(item.subject)}`).join('\n')
    : '- none';
  const changedFiles = Array.isArray(changeWindow.changed_files) && changeWindow.changed_files.length > 0
    ? changeWindow.changed_files.map((item) => `- ${singleLineText(item.status)} ${singleLineText(item.path)}`).join('\n')
    : '- none';
  const uncommitted = Array.isArray(changeWindow.uncommitted_status) && changeWindow.uncommitted_status.length > 0
    ? changeWindow.uncommitted_status.map((item) => `- ${singleLineText(item)}`).join('\n')
    : '- none';
  const sourceArtifacts = Array.isArray(changeWindow.source_artifacts) && changeWindow.source_artifacts.length > 0
    ? changeWindow.source_artifacts.map((item) => `- ${singleLineText(item)}`).join('\n')
    : '- none';
```

Insert this section after `## Scanned Inputs`:

```js
    '## Change Window',
    '',
    `- source: ${singleLineText(changeWindow.source)}`,
    `- baseline_ref: ${singleLineText(changeWindow.baseline_ref_short ?? changeWindow.baseline_ref)}`,
    `- range: ${singleLineText(changeWindow.range)}`,
    `- committed_change_count: ${singleLineText(changeWindow.commit_count)}`,
    '',
    '### Commits',
    '',
    commits,
    '',
    '### Changed Files',
    '',
    changedFiles,
    '',
    '### Uncommitted Status',
    '',
    uncommitted,
    '',
    '### Source Artifacts',
    '',
    sourceArtifacts,
    '',
```

- [ ] **Step 6: Validate optional `change_window` shape without breaking old audits**

In `validateFinishRecordState`, after the accepted/rejected array checks, add:

```js
  if (state.audit.change_window !== undefined && !plainObject(state.audit.change_window)) {
    throwInvalidFinishState();
  }
```

Do not require `change_window`; older audit records must remain recordable.

- [ ] **Step 7: Pass manual baseline refs through the CLI**

In `src/cli.mjs`, change `finishAuditStage` invocation:

```js
const result = await finishAuditStage(process.cwd(), positionals[0], {
  baselineRef: options.get('--baseline') || null,
});
```

Update usage:

```js
'  loopx finish-audit [slug] [--baseline <git-ref>] [--json]',
```

- [ ] **Step 8: Update existing finish audit assertions**

In `creates finish audit runtime artifacts with audit state and report`, update the expected audit keys to include `change_window`:

```js
    assert.deepEqual(Object.keys(result.state.audit).sort(), [
      'accepted_candidates',
      'base_branch',
      'branch',
      'change_window',
      'head',
      'no_candidates_reason',
      'rejected_candidates',
      'report_candidates',
      'worktree',
    ]);
```

Add assertions:

```js
    assert.equal(persistedState.audit.change_window.source, 'none');
    assert.deepEqual(persistedState.audit.change_window.commits, []);
    assert.deepEqual(persistedState.audit.change_window.changed_files, []);
    assert.match(reportText, /## Change Window/);
```

- [ ] **Step 9: Run the finish tests**

Run:

```bash
node --test --test-name-pattern "finish" test/trellis-hardening.test.mjs
```

Expected: all finish tests pass.

- [ ] **Step 10: Commit Task 2**

```bash
git add src/finish-runtime.mjs src/cli.mjs test/trellis-hardening.test.mjs
git commit -m "feat: audit committed finish change window"
```

## Task 3: Skill Workflow Updates

**Files:**
- Modify: `skills/finish/SKILL.md`
- Modify: `plugins/loopx/skills/finish/SKILL.md`
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `plugins/loopx/skills/subagent-exec/SKILL.md`
- Modify: `skills/exec/SKILL.md`
- Modify: `plugins/loopx/skills/exec/SKILL.md`
- Test: `test/skill-governance.test.mjs`

- [ ] **Step 1: Write failing governance assertions**

In `test/skill-governance.test.mjs`, extend the finish assertions:

```js
    assert.match(finish, /finish-start/);
    assert.match(finish, /change_window/);
    assert.match(finish, /baseline\.\.HEAD/);
    assert.match(finish, /empty git diff/i);
```

Extend the subagent/exec assertions:

```js
    assert.match(subagentDriven, /finish-start/);
    assert.match(subagentDriven, /--source <plan-path>/);
    assert.match(executingPlans, /finish-start/);
    assert.match(executingPlans, /--source <plan-path>/);
```

Add mirror checks:

```js
    assert.equal(
      await readFile(join(repoRoot, 'plugins', 'loopx', 'skills', 'finish', 'SKILL.md'), 'utf8'),
      finish,
    );
    assert.equal(
      await readFile(join(repoRoot, 'plugins', 'loopx', 'skills', 'subagent-exec', 'SKILL.md'), 'utf8'),
      subagentDriven,
    );
    assert.equal(
      await readFile(join(repoRoot, 'plugins', 'loopx', 'skills', 'exec', 'SKILL.md'), 'utf8'),
      executingPlans,
    );
```

- [ ] **Step 2: Run governance test and verify it fails**

Run:

```bash
node --test --test-name-pattern "keeps workflow skill handoff commands unambiguous|bundles every loopx execution skill" test/skill-governance.test.mjs
```

Expected: fail because the skills do not mention `finish-start` yet.

- [ ] **Step 3: Update `skills/subagent-exec/SKILL.md`**

In "The Process", insert a box before "Read plan, extract all tasks...":

```dot
    "Record finish baseline with loopx finish-start <slug> --source <plan-path>" [shape=box];
    "Record finish baseline with loopx finish-start <slug> --source <plan-path>" -> "Read plan, extract all tasks with full text, note context, create update_plan";
```

In the process prose before task dispatch, add:

```markdown
### Step 0: Record Finish Baseline

Before dispatching the first implementer, run:

```bash
loopx finish-start <slug> --source <plan-path>
```

Use the plan filename slug when no workflow slug is available. This preserves the starting `HEAD` so `finish-audit` can inspect `baseline..HEAD` even after implementers commit their work and the current `git diff` is empty.
```

- [ ] **Step 4: Update `skills/exec/SKILL.md`**

After "Step 1: Load and Review Plan", add:

```markdown
### Step 1.5: Record Finish Baseline

Before editing files or running the first task, run:

```bash
loopx finish-start <slug> --source <plan-path>
```

Use the plan filename slug when no workflow slug is available. This preserves the starting `HEAD` for finish learning/spec audit after the execution commits code.
```

- [ ] **Step 5: Update `skills/finish/SKILL.md`**

In "Step 4: Audit-First Learning Extraction", replace the allowed input list with:

```markdown
Allowed inputs:
- `finish-state.json` `audit.change_window`, especially `baseline..HEAD` commits and changed files
- current uncommitted git diff and `git status --short`
- executed verification output
- plan, spec, and review artifacts used in this task
- explicit user decisions in the current conversation
- existing `.loopx/memory/MEMORY.md` and `.loopx/memory/index.jsonl`
- existing `docs/loopx/specs/*.md`
```

Add this rule immediately after the list:

```markdown
An empty git diff does not mean there is no learning candidate. When `audit.change_window.commit_count > 0`, inspect the committed range before deciding memory/spec candidates. "Already committed" is not a rejection reason; reject only when the committed change window contains no durable behavior, contract, invariant, pitfall, or user decision worth preserving.
```

- [ ] **Step 6: Mirror skill changes**

Copy the updated canonical skill files into the plugin mirror:

```bash
cp skills/finish/SKILL.md plugins/loopx/skills/finish/SKILL.md
cp skills/subagent-exec/SKILL.md plugins/loopx/skills/subagent-exec/SKILL.md
cp skills/exec/SKILL.md plugins/loopx/skills/exec/SKILL.md
```

- [ ] **Step 7: Run governance and skill verification**

Run:

```bash
node --test --test-name-pattern "keeps workflow skill handoff commands unambiguous|bundles every loopx execution skill" test/skill-governance.test.mjs
node scripts/verify-skills.mjs
```

Expected: both commands pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add skills/finish/SKILL.md plugins/loopx/skills/finish/SKILL.md skills/subagent-exec/SKILL.md plugins/loopx/skills/subagent-exec/SKILL.md skills/exec/SKILL.md plugins/loopx/skills/exec/SKILL.md test/skill-governance.test.mjs
git commit -m "docs: preserve finish audit baselines in skills"
```

## Task 4: README and CLI Contract Coverage

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `test/skill-governance.test.mjs`
- Test: `test/trellis-hardening.test.mjs`

- [ ] **Step 1: Add README governance assertions**

In the README command list in `test/skill-governance.test.mjs`, add:

```js
      'loopx finish-start',
      'loopx finish-audit',
      'loopx finish-record',
```

Add these required terms to the README memory/spec section:

```js
      'baseline..HEAD',
      'change_window',
```

- [ ] **Step 2: Run README governance test and verify it fails**

Run:

```bash
node --test --test-name-pattern "documents current CLI and workflow commands" test/skill-governance.test.mjs
```

Expected: fail because README files do not document the new command yet.

- [ ] **Step 3: Update README command sections**

In both `README.md` and `README.zh-CN.md`, add `loopx finish-start [slug] [--source <path>]` near `finish-audit`.

Add a short finish audit paragraph:

```markdown
`loopx finish-start` records the starting commit for plan execution. `loopx finish-audit` uses that baseline to include committed `baseline..HEAD` evidence, changed files, and uncommitted status in `.loopx/finish/<audit-id>/finish-state.json`, so finish learning/spec extraction still has input after the worktree is clean.
```

Chinese version:

```markdown
`loopx finish-start` 会记录计划执行开始时的提交。`loopx finish-audit` 使用这个基线把已提交的 `baseline..HEAD` 证据、变更文件和未提交状态写入 `.loopx/finish/<audit-id>/finish-state.json`，因此即使执行过程中已经 commit、当前工作区是 clean，finish 的记忆/spec 提取仍有稳定输入。
```

- [ ] **Step 4: Add CLI JSON regression for `finish-start`**

In the existing CLI finish test in `test/trellis-hardening.test.mjs`, before the human `finish-audit` run, add:

```js
    const startRun = await execFileAsync('node', [
      cliPath,
      'finish-start',
      'finish-cli-flow',
      '--source',
      'docs/loopx/plans/finish-cli-flow.md',
      '--json',
    ], { cwd: wd });
    const startJson = JSON.parse(startRun.stdout);
    assert.equal(startJson.ok, true);
    assert.equal(startJson.command, 'finish-start');
    assert.equal(startJson.state.slug, 'finish-cli-flow');
    assert.equal(startJson.state.source, 'docs/loopx/plans/finish-cli-flow.md');
```

- [ ] **Step 5: Run focused CLI and README tests**

Run:

```bash
node --test --test-name-pattern "exposes finish audit and finish record through the CLI|documents current CLI and workflow commands" test/trellis-hardening.test.mjs test/skill-governance.test.mjs
```

Expected: both selected tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add README.md README.zh-CN.md test/skill-governance.test.mjs test/trellis-hardening.test.mjs
git commit -m "docs: document finish change windows"
```

## Task 5: Full Verification and Packaging

**Files:**
- No planned source edits unless verification exposes a regression.

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run skill verification**

```bash
node scripts/verify-skills.mjs
```

Expected: exits 0.

- [ ] **Step 3: Run package dry-run**

```bash
npm pack --dry-run --json
```

Expected: exits 0 and includes updated `src/`, `skills/`, `plugins/loopx/skills/`, README files, and tests are still excluded according to existing package policy.

- [ ] **Step 4: Check whitespace**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Confirm the regression manually in a temp repo**

Run:

```bash
tmpdir="$(mktemp -d)"
cd "$tmpdir"
git init
git config user.email loopx@example.com
git config user.name LoopX
printf 'before\n' > README.md
git add README.md
git commit -m init
node /Users/zhangyukun/project/loopx/src/cli.mjs finish-start finish-window --source docs/loopx/plans/window.md --json
printf 'after\n' > feature.txt
git add feature.txt
git commit -m 'feat: committed evidence'
test -z "$(git status --short)"
node /Users/zhangyukun/project/loopx/src/cli.mjs finish-audit finish-window --json
```

Expected: the final JSON has `state.audit.change_window.commit_count` equal to `1`, `changed_files[0].path` equal to `feature.txt`, and `uncommitted_status` equal to `[]`.

- [ ] **Step 6: Commit any verification-only fixes**

If verification required code or docs changes, commit them with:

```bash
git add <changed-files>
git commit -m "fix: harden finish audit change window"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- **Spec coverage:** The plan directly covers the reported failure: clean worktree after committed execution still needs finish learning/spec evidence. Task 1 records the baseline, Task 2 audits committed changes, Task 3 changes execution/finish skills, and Task 4 documents the CLI contract.
- **Placeholder scan:** The plan contains concrete file paths, command names, test snippets, data shapes, expected outputs, and commit messages.
- **Type consistency:** The plan consistently uses `finishStartStage`, `finishAuditStage`, `audit.change_window`, `baseline_ref`, `commit_count`, `changed_files`, `uncommitted_status`, and `source_artifacts`.
- **Design drift:** The plan does not automate memory/spec promotion. It only supplies durable audit evidence so the existing finish skill can make the extraction decision with committed changes visible.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-08-finish-audit-change-window.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
