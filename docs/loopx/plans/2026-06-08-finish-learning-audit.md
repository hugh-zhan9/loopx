# finish 学习审计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** [docs/loopx/design/finish学习审计需求设计文档.md](../design/finish学习审计需求设计文档.md)

**Goal:** Add a local finish audit ledger and choice recorder so finish always leaves explainable learning evidence, rejected-candidate reasons, and a persisted user completion choice.

**Architecture:** Keep dangerous completion actions in the skill flow. Add a small runtime module that creates `.loopx/finish/<audit-id>/finish-state.json` and `finish-report.md`, plus a record command that updates the same audit directory with the final action/status. The finish skill and its plugin mirror become stricter about running audit first, surfacing candidates and reasons, and recording the final choice. Repo-tracked spec candidates remain `docs/loopx/specs/<domain>.md`.

**Tech Stack:** Node.js ESM, `node:test`, `node:fs/promises`, existing loopx workflow and skill governance tests.

---

### Task 1: Add finish audit runtime primitives

**Files:**
- Create: `src/finish-runtime.mjs`
- Test: `test/trellis-hardening.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import { finishAuditStage } from '../src/finish-runtime.mjs';

const execFileAsync = promisify(execFile);

it('creates a finish audit directory with state and report files', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-audit-'));
  await execFileAsync('git', ['init'], { cwd: wd });
  const result = await finishAuditStage(wd, 'finish-audit-flow');

  assert.match(result.auditId, /^\d{8}T\d{6}Z-finish-audit-flow$/);
  assert.equal(result.state.status, 'needs-agent-audit');
  assert.equal(await readFile(result.statePath, 'utf8').then((text) => text.includes('"audit_id"')), true);
  assert.equal(await readFile(result.reportPath, 'utf8').then((text) => text.includes('Finish Audit')), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trellis-hardening.test.mjs -t "creates a finish audit directory with state and report files"`
Expected: FAIL because `src/finish-runtime.mjs` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `src/finish-runtime.mjs` with:

```js
export function resolveFinishAuditRoot(cwd) {}
export function resolveFinishAuditPath(cwd, auditId) {}
export async function finishAuditStage(cwd, slug, { env = process.env } = {}) {}
```

Required behavior:
- create `.loopx/finish/<audit-id>/`
- write `finish-state.json` with `schema_version`, `audit_id`, `slug`, `status`, `inputs.scanned`, `audit`, `choice`
- write `finish-report.md` with human-readable sections for summary, scanned inputs, accepted/rejected candidates, and next steps
- collect git branch/base-branch/worktree evidence defensively, but allow `unknown`/`unavailable` fields when the data cannot be read
- do not write `.loopx/memory` or `docs/loopx/specs` yet

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trellis-hardening.test.mjs -t "creates a finish audit directory with state and report files"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/finish-runtime.mjs test/trellis-hardening.test.mjs
git commit -m "feat: add finish audit runtime primitives"
```

### Task 2: Add finish choice recording

**Files:**
- Modify: `src/finish-runtime.mjs`
- Test: `test/trellis-hardening.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { finishAuditStage, finishRecordStage } from '../src/finish-runtime.mjs';

const execFileAsync = promisify(execFile);

it('records a finish choice and refuses done before audit is complete', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-record-'));
  await execFileAsync('git', ['init'], { cwd: wd });
  const audit = await finishAuditStage(wd, 'finish-record-flow');

  await assert.rejects(
    () => finishRecordStage(wd, audit.auditId, { action: 'keep', status: 'done', summary: 'Kept as-is.' }),
    /finish_record_audit_incomplete/,
  );

  const state = JSON.parse(await readFile(audit.statePath, 'utf8'));
  state.status = 'audited';
  state.audit.accepted_candidates = [{
    kind: 'memory',
    type: 'decision',
    domain: 'workflow',
    summary: 'finish records durable learning evidence',
    evidence: ['skills/finish/SKILL.md'],
    future_usefulness: 'Future agents can confirm finish audits were actually recorded.',
    target: '.loopx/memory/entries/finish-record.md',
    confidence: 'high',
    status: 'accepted',
  }];
  await writeFile(audit.statePath, `${JSON.stringify(state, null, 2)}\n`);

  const completed = await finishRecordStage(wd, audit.auditId, {
    action: 'keep',
    status: 'done',
    summary: 'Kept branch as-is.',
  });

  assert.equal(completed.state.choice.action, 'keep');
  assert.equal(completed.state.choice.status, 'done');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trellis-hardening.test.mjs -t "records a finish choice and refuses done before audit is complete"`
Expected: FAIL because `finishRecordStage` is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Extend `src/finish-runtime.mjs` with:

```js
export async function finishRecordStage(cwd, auditIdOrPath, { action, status, summary = null, url = null, env = process.env } = {}) {}
```

Required behavior:
- resolve audit dir from ID or direct path
- validate `action` in `merge|pr|keep|discard`
- validate `status` in `pending|done|failed|aborted`
- refuse `status: done` unless audit state is complete enough to be considered audited
- update `choice`, `choice_history`, `updated_at`, and `finish-report.md`
- preserve previous choice entries when the action changes

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trellis-hardening.test.mjs -t "records a finish choice and refuses done before audit is complete"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/finish-runtime.mjs test/trellis-hardening.test.mjs
git commit -m "feat: record finish completion choices"
```

### Task 3: Wire finish commands into the CLI

**Files:**
- Modify: `src/cli.mjs`
- Modify: `src/finish-runtime.mjs`
- Test: `test/trellis-hardening.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

it('exposes finish-audit and finish-record CLI commands', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-cli-'));
  await execFileAsync('git', ['init'], { cwd: wd });

  const audit = await execFileAsync(process.execPath, [cliPath, 'finish-audit', 'finish-cli-flow'], { cwd: wd });
  assert.match(audit.stdout, /audit_id/);
  assert.match(audit.stdout, /finish-report\.md/);

  const auditId = JSON.parse(audit.stdout).audit_id;
  const record = await execFileAsync(process.execPath, [
    cliPath,
    'finish-record',
    auditId,
    '--action',
    'keep',
    '--status',
    'pending',
    '--summary',
    'Kept branch as-is.',
  ], { cwd: wd });
  assert.match(record.stdout, /choice/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trellis-hardening.test.mjs -t "exposes finish-audit and finish-record CLI commands"`
Expected: FAIL because `src/cli.mjs` does not route these commands yet.

- [ ] **Step 3: Write minimal implementation**

Update `src/cli.mjs`:
- import `finishAuditStage` and `finishRecordStage`
- add `loopx finish-audit [slug] [--json]`
- add `loopx finish-record <audit-id-or-path> --action ... --status ... [--summary ...] [--url ...]`
- keep JSON output consistent with other commands
- return stable error codes via `process.exitCode = 1` on validation failure
- keep `finish-record` focused on choice persistence; do not add a third finish command

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trellis-hardening.test.mjs -t "exposes finish-audit and finish-record CLI commands"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli.mjs src/finish-runtime.mjs test/trellis-hardening.test.mjs
git commit -m "feat: add finish audit CLI commands"
```

### Task 4: Tighten finish skill docs and plugin mirror

**Files:**
- Modify: `skills/finish/SKILL.md`
- Modify: `plugins/loopx/skills/finish/SKILL.md`
- Test: `test/skill-governance.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
it('requires finish audit and choice recording in the finish skill docs', async () => {
  const finish = await readFile(join(repoRoot, 'skills', 'finish', 'SKILL.md'), 'utf8');
  assert.match(finish, /finish-audit/);
  assert.match(finish, /finish-record/);
  assert.match(finish, /no_candidates_reason/);
  assert.match(finish, /rejected candidates/);
  assert.match(finish, /choice recording/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/skill-governance.test.mjs -t "requires finish audit and choice recording in the finish skill docs"`
Expected: FAIL because the current skill text only describes generic learning extraction.

- [ ] **Step 3: Write minimal implementation**

Update both skill mirrors with:
- audit-first flow in Step 4
- explicit mention of `.loopx/finish/<audit-id>/finish-state.json`
- explicit mention that `none` must include scanned inputs and a reason
- explicit mention that accepted candidates require evidence and rejected candidates require reasons
- explicit mention that user completion choice must be persisted through `finish-record`
- keep wording bounded and operational, no new product scope

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/skill-governance.test.mjs -t "requires finish audit and choice recording in the finish skill docs"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/finish/SKILL.md plugins/loopx/skills/finish/SKILL.md test/skill-governance.test.mjs
git commit -m "docs: tighten finish learning audit flow"
```

### Task 5: Add README and command-reference coverage

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Test: `scripts/verify-skills.mjs`

- [ ] **Step 1: Write the failing test**

```js
it('documents finish audit and record commands in the public docs', async () => {
  const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
  assert.match(readme, /finish-audit/);
  assert.match(readme, /finish-record/);
  assert.match(readme, /\.loopx\/finish\//);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-skills.mjs`
Expected: FAIL until the README references are added.

- [ ] **Step 3: Write minimal implementation**

Update docs to explain:
- finish now writes a local audit ledger
- `none` means audited, but no durable learning candidate
- choice recording lives in the local finish audit directory
- repo-tracked spec candidates stay in `docs/loopx/specs/`
- public docs mention `loopx finish-audit` and `loopx finish-record`

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/verify-skills.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh-CN.md scripts/verify-skills.mjs
git commit -m "docs: document finish audit ledger"
```

### Task 6: Add focused regression coverage for none/rejected-candidate behavior

**Files:**
- Modify: `test/trellis-hardening.test.mjs`
- Modify: `test/skill-governance.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
it('keeps finish audit explainable when no memory or spec candidates are accepted', async () => {
  const wd = await mkdtemp(join(tmpdir(), 'loopx-finish-none-'));
  const audit = await finishAuditStage(wd, 'finish-none-flow');
  const state = JSON.parse(await readFile(audit.statePath, 'utf8'));

  assert.equal(state.audit.accepted_candidates.length, 0);
  assert.equal(typeof state.audit.no_candidates_reason, 'string');
  assert.match(await readFile(audit.reportPath, 'utf8'), /rejected candidates/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trellis-hardening.test.mjs -t "keeps finish audit explainable when no memory or spec candidates are accepted"`
Expected: FAIL until the audit report/state includes explicit no-candidate reasoning.

- [ ] **Step 3: Write minimal implementation**

Ensure `finish-audit` always emits:
- `inputs.scanned`
- `audit.accepted_candidates`
- `audit.rejected_candidates`
- `audit.no_candidates_reason`
- a report section that distinguishes accepted, rejected, and none cases

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trellis-hardening.test.mjs -t "keeps finish audit explainable when no memory or spec candidates are accepted"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/finish-runtime.mjs test/trellis-hardening.test.mjs test/skill-governance.test.mjs
git commit -m "test: cover explainable finish audit none cases"
```

### Task 7: Final verification

**Files:**
- Test suite only unless failures require fixes.

- [ ] **Step 1: Run the targeted tests**

Run:
```bash
node --test test/trellis-hardening.test.mjs
node --test test/skill-governance.test.mjs
```
Expected: PASS

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Check packaging and docs alignment**

Run:
```bash
npm pack --dry-run --json
node scripts/verify-skills.mjs
```
Expected: PASS, with README command references and skill-mirror coverage aligned.

- [ ] **Step 4: Commit**

```bash
git add src/finish-runtime.mjs src/cli.mjs README.md README.zh-CN.md skills/finish/SKILL.md plugins/loopx/skills/finish/SKILL.md test/trellis-hardening.test.mjs test/skill-governance.test.mjs scripts/verify-skills.mjs
git commit -m "feat: finish audit ledger and choice recording"
```
