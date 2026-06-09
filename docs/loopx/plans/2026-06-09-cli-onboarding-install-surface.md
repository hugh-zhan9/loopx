# CLI Onboarding Install Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** Current conversation on 2026-06-09: approved product UX hardening for first-use CLI output, removal of `archive` from the public product flow, and installer/package surface tightening.

**Goal:** Make loopx friendlier for first-time users while keeping machine-readable output available through explicit `--json` flags and removing `archive` from the normal user-facing flow.

**Architecture:** Keep runtime behavior backwards-compatible where removing it would require a breaking archival subsystem migration, but remove `archive` from default help, generated guidance, hooks, and next-step hints. Reuse the existing `status` pattern: human output by default, `--json` for full state payloads. Add installer opt-out/dry-run/summary behavior without weakening existing conflict protection.

**Tech Stack:** Node.js ESM, built-in `node:test`, `node:assert/strict`, npm package file governance.

---

## File Structure

- Modify `src/cli.mjs`
  - Add first-run help text.
  - Add `--json` handling for `init`, `doctor`, and `install-skills`.
  - Add human output helpers for init, doctor, and install command results.
  - Keep the hidden `archive` command callable for compatibility, but remove it from default help.
- Modify `src/next-skill.mjs`
  - Remove `$archive` from next skill recommendations.
  - Return a concrete CLI approval command for review-approved workflows that still need `review -> done` approval.
- Modify `src/workflow.mjs`
  - Remove `archive` from initialized workspace product surface metadata and generated `.loopx/README.md`.
  - Change recommended next actions and Chinese review messages so they no longer instruct users to run archive.
  - Keep `archiveStage` exported for compatibility with existing local runtime state and old tests unless a later breaking-change plan deletes it.
- Modify `scripts/codex-workflow-hook.mjs`
  - Remove `$archive` hook suggestions so agent prompt advisories match the product flow.
- Modify `scripts/install-skills.mjs`
  - Support `LOOPX_SKIP_POSTINSTALL=1` and `LOOPX_POSTINSTALL=0`.
  - Print concise install summaries by default.
  - Preserve JSON output when `--json` is passed.
- Modify `src/install-discovery.mjs`
  - Export a target inspection helper for install dry-run output, or reuse `verifyInstallTargets` from callers without writing files.
  - Do not bypass existing ownership/conflict checks for real installs.
- Modify `README.md` and `README.zh-CN.md`
  - Document quickstart, human/JSON output split, hidden/deprecated archive relationship, postinstall opt-out, dry-run, written paths, repair, and hooks disablement.
- Modify `package.json`
  - Replace broad `skills/` package inclusion with explicit bundled skill directories plus `skills/RESOLVER.md`.
- Modify `test/workflow.test.mjs`
  - Update CLI help/doctor tests.
  - Add human output and archive-removal regressions.
  - Add installer dry-run and postinstall opt-out CLI/script tests.
- Modify `test/skill-governance.test.mjs`
  - Assert npm package contains exactly bundled skill directories, not auxiliary skill sources such as `skills/deepsearch/`.
- Modify `scripts/verify-skills.mjs`
  - Mirror package surface assertions for release governance.

## Product Decisions

- `archive` is no longer part of the user-facing loopx product flow.
- The existing `archiveStage` implementation stays available as a hidden compatibility command for old runtime state. This avoids a large breaking deletion of spec-delta archival code in the same change.
- Default command output is for humans. Full JSON remains available with `--json`.
- `postinstall` remains convenient by default, but users get explicit opt-out and concise summaries.
- `install-skills --dry-run` never writes skills, hooks, lock files, settings, or template hashes.

## Expected Human Output Contracts

`loopx --help` should start with:

```text
Quick start:
  loopx install-skills --target all --yes
  loopx init --slug my-feature
  loopx clarify my-feature
  loopx status my-feature

Usage:
```

`loopx init --slug demo` should print:

```text
loopx workspace initialized
workspace: /abs/path/to/repo/.loopx
workflow: demo
stage: clarify
next: loopx clarify demo
details: loopx init --slug demo --json
```

`loopx doctor` should print a compact status:

```text
loopx doctor: attention needed
workspace: /abs/path/to/repo/.loopx
install: failed
conflicts: 2
fix:
  loopx repair-install
details: loopx doctor --json
```

`loopx install-skills --target codex --dry-run` should print:

```text
loopx install-skills dry run
target: codex
skills: 16 bundled
writes: none
next: loopx install-skills --target codex --yes
```

---

### Task 1: Add Human Defaults For Help, Init, And Doctor

**Files:**
- Modify: `src/cli.mjs`
- Test: `test/workflow.test.mjs`

- [ ] **Step 1: Write failing CLI tests for quickstart help and hidden archive**

In `test/workflow.test.mjs`, update the existing `CLI exposes loopx runtime/debug commands and no public team command` test near the bottom of the file.

Replace the help assertions with this block:

```js
    const { stdout: help } = await execFileAsync(process.execPath, [cliPath, '--help'], { cwd: repoRoot, env });
    assert.match(help, /^Quick start:\n/m);
    assert.match(help, /loopx install-skills --target all --yes/);
    assert.match(help, /loopx init --slug my-feature/);
    assert.match(help, /loopx clarify my-feature/);
    assert.match(help, /loopx status my-feature/);
    assert.match(help, /loopx repair-install/);
    assert.match(help, /loopx plan \[slug\] \[--interactive\] \[--deliberate\]/);
    assert.doesNotMatch(help, /--direct/);
    assert.match(help, /loopx build <slug> \[--no-deslop\]/);
    assert.match(help, /loopx build --from-review <review-report-path> \[--no-deslop\]/);
    assert.doesNotMatch(help, /loopx archive <slug>/);
    assert.doesNotMatch(help, /loopx team/);
```

- [ ] **Step 2: Run the help test and confirm failure**

Run:

```bash
node --test --test-name-pattern "CLI exposes loopx runtime/debug commands and no public team command" test/workflow.test.mjs
```

Expected: fail because help does not contain `Quick start:` and still exposes `loopx archive <slug>`.

- [ ] **Step 3: Update `usage()`**

In `src/cli.mjs`, replace the existing `usage()` body with:

```js
function usage() {
  return [
    'Quick start:',
    '  loopx install-skills --target all --yes',
    '  loopx init --slug my-feature',
    '  loopx clarify my-feature',
    '  loopx status my-feature',
    '',
    'Usage:',
    '  loopx --version',
    '  loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>] [--json]',
    '  loopx clarify <slug> [--standard|--deep]',
    '  loopx approve <slug> --from <stage> --to <stage>',
    '  loopx plan [slug] [--interactive] [--deliberate]',
    '  loopx build <slug> [--no-deslop]',
    '  loopx build --from-review <review-report-path> [--no-deslop]',
    '  loopx review <slug> [--reviewer <name>]',
    '  loopx autopilot <slug> [--reviewer <name>]',
    '  loopx finish-start [slug] [--source <path>] [--json]',
    '  loopx finish-audit [slug] [--baseline <git-ref>] [--json]',
    '  loopx finish-record <audit-id-or-path> --action <merge|pr|keep|discard> --status <pending|done|failed|aborted> [--summary <text>] [--url <url>]',
    '  loopx render [slug|--all]',
    '  loopx status [slug] [--json]',
    '  loopx setup-context',
    '  loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--yes] [--dry-run] [--json]',
    '  loopx doctor [--json]',
    '  loopx migrate',
    '  loopx repair-install',
  ].join('\n');
}
```

- [ ] **Step 4: Write failing init output tests**

In `test/workflow.test.mjs`, add this test after the CLI help test or near other CLI tests:

```js
  it('prints human init output by default and full init state with --json', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-cli-init-human-'));
    const home = await mkdtemp(join(tmpdir(), 'loopx-cli-init-home-'));
    const env = loopxEnv(home);

    const { stdout: human } = await execFileAsync(process.execPath, [cliPath, 'init', '--slug', 'demo-flow'], { cwd: wd, env });
    assert.match(human, /^loopx workspace initialized$/m);
    assert.match(human, /workflow: demo-flow/);
    assert.match(human, /stage: clarify/);
    assert.match(human, /next: loopx clarify demo-flow/);
    assert.match(human, /details: loopx init --slug demo-flow --json/);
    assert.throws(() => JSON.parse(human));

    const { stdout: json } = await execFileAsync(process.execPath, [cliPath, 'init', '--slug', 'json-flow', '--json'], { cwd: wd, env });
    const parsed = JSON.parse(json);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.command, 'init');
    assert.equal(parsed.workflow.slug, 'json-flow');
    assert.equal(parsed.workflow.current_stage, 'clarify');
  });
```

- [ ] **Step 5: Run the init output test and confirm failure**

Run:

```bash
node --test --test-name-pattern "prints human init output" test/workflow.test.mjs
```

Expected: fail because default `loopx init` currently prints JSON and `--json` is not handled explicitly.

- [ ] **Step 6: Add human init printer**

In `src/cli.mjs`, add this helper after `printHumanStatus`:

```js
function printHumanInit(result, options = new Map()) {
  const workflow = result.workflow?.state ?? null;
  console.log('loopx workspace initialized');
  console.log(`workspace: ${result.workspaceRoot}`);
  if (!workflow) {
    console.log('workflow: (none)');
    console.log('next: loopx clarify <slug>');
    console.log('details: loopx init --json');
    return;
  }
  console.log(`workflow: ${workflow.slug}`);
  console.log(`stage: ${workflow.current_stage ?? '(none)'}`);
  console.log(`next: loopx clarify ${workflow.slug}`);
  const slug = options.get('--slug') || workflow.slug;
  console.log(`details: loopx init --slug ${slug} --json`);
}
```

- [ ] **Step 7: Change `init` command output**

In the `case 'init'` block in `src/cli.mjs`, replace the final `console.log(JSON.stringify(...))` with:

```js
        if (options.get('--json')) {
          console.log(JSON.stringify({ ok: true, command, workspaceRoot: result.workspaceRoot, workflow: result.workflow?.state ?? null }, null, 2));
        } else {
          printHumanInit(result, options);
        }
```

- [ ] **Step 8: Write failing doctor output tests**

In the existing CLI help test in `test/workflow.test.mjs`, replace the doctor JSON checks with:

```js
    const { stdout: doctor } = await execFileAsync(process.execPath, [cliPath, 'doctor'], { cwd: repoRoot, env });
    assert.match(doctor, /^loopx doctor: attention needed$/m);
    assert.match(doctor, /install: failed/);
    assert.match(doctor, /fix:/);
    assert.match(doctor, /loopx repair-install/);
    assert.match(doctor, /details: loopx doctor --json/);
    assert.throws(() => JSON.parse(doctor));

    const { stdout: doctorJson } = await execFileAsync(process.execPath, [cliPath, 'doctor', '--json'], { cwd: repoRoot, env });
    const parsedDoctor = JSON.parse(doctorJson);
    assert.equal(parsedDoctor.command, 'doctor');

    await execFileAsync(process.execPath, [cliPath, 'repair-install'], { cwd: repoRoot, env });
    const { stdout: afterDoctor } = await execFileAsync(process.execPath, [cliPath, 'doctor', '--json'], { cwd: repoRoot, env });
    const parsedAfterDoctor = JSON.parse(afterDoctor);
    assert.equal(parsedAfterDoctor.installCheck.ok, true);
```

- [ ] **Step 9: Run the doctor output test and confirm failure**

Run:

```bash
node --test --test-name-pattern "CLI exposes loopx runtime/debug commands and no public team command" test/workflow.test.mjs
```

Expected: fail because `loopx doctor` currently prints JSON by default and `loopx doctor --json` is not a distinct mode.

- [ ] **Step 10: Add doctor summary helpers**

In `src/cli.mjs`, add these helpers after `printHumanInit`:

```js
function countInstallConflicts(result) {
  return Object.values(result.installCheck?.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target.conflicts) ? target.conflicts.length : 0), 0);
}

function printHumanDoctor(result) {
  const ok = !result.mixedRuntimeRoots && result.installCheck?.ok === true;
  console.log(`loopx doctor: ${ok ? 'ok' : 'attention needed'}`);
  console.log(`workspace: ${result.loopxRoot ?? result.workspaceRoot ?? '(unknown)'}`);
  if (result.mixedRuntimeRoots) {
    console.log('runtime roots: mixed .loopx and .LoopX detected');
  } else {
    console.log('runtime roots: ok');
  }
  console.log(`install: ${result.installCheck?.ok === true ? 'ok' : 'failed'}`);
  const conflicts = countInstallConflicts(result);
  if (conflicts > 0) {
    console.log(`conflicts: ${conflicts}`);
  }
  if (result.hook) {
    console.log(`hooks: ${result.hook.enabled ? 'enabled' : 'disabled'}`);
  }
  if (!ok) {
    console.log('fix:');
    console.log('  loopx repair-install');
    console.log('  LOOPX_HOOKS=0 disables loopx hooks for the current process');
  }
  console.log('details: loopx doctor --json');
}
```

- [ ] **Step 11: Change `doctor` command output**

In the `case 'doctor'` block in `src/cli.mjs`, replace the `console.log(JSON.stringify(...))` line with:

```js
        const payload = { ok: !result.mixedRuntimeRoots && result.installCheck.ok, command, ...result };
        if (options.get('--json')) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          printHumanDoctor(payload);
        }
```

- [ ] **Step 12: Run task tests**

Run:

```bash
node --test --test-name-pattern "prints human init output|CLI exposes loopx runtime/debug commands and no public team command" test/workflow.test.mjs
```

Expected: both tests pass.

- [ ] **Step 13: Commit**

```bash
git add src/cli.mjs test/workflow.test.mjs
git commit -m "feat: add human cli onboarding output"
```

---

### Task 2: Remove Archive From Product Guidance

**Files:**
- Modify: `src/next-skill.mjs`
- Modify: `src/workflow.mjs`
- Modify: `scripts/codex-workflow-hook.mjs`
- Modify: `test/workflow.test.mjs`

- [ ] **Step 1: Replace the archive next-skill regression test**

In `test/workflow.test.mjs`, replace the test named `CLI payload adds the archive skill command after done approval` with this test:

```js
  it('does not recommend archive after approved review or done approval', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-no-archive-cli-next-'));
    const clarified = await clarifyStage(wd, 'no-archive-cli-next');
    await writeResolvedSpec(clarified.root, 'no-archive-cli-next');
    await approveStage(wd, 'no-archive-cli-next', { from: 'clarify', to: 'plan' });
    await planStage(wd, 'no-archive-cli-next', { adapter: createScriptedPlanAdapter() });
    await approveStage(wd, 'no-archive-cli-next', { from: 'plan', to: 'build' });
    await buildStage(wd, 'no-archive-cli-next', {
      adapter: createScriptedBuildAdapter(),
    });
    await approveStage(wd, 'no-archive-cli-next', { from: 'build', to: 'review' });
    await reviewStage(wd, 'no-archive-cli-next', {
      adapter: createScriptedReviewAdapter({ verdict: 'approve' }),
    });
    const reviewed = await readState(wd, 'no-archive-cli-next');
    const reviewPayload = withNextSkill({ ok: true }, reviewed);
    assert.equal(reviewPayload.next_skill_command, null);
    assert.equal(reviewPayload.next_skill_hint, null);
    assert.equal(reviewPayload.next_cli_command, 'loopx approve no-archive-cli-next --from review --to done');
    assert.equal(reviewPayload.next_cli_hint, 'Next CLI: loopx approve no-archive-cli-next --from review --to done');

    const done = await approveStage(wd, 'no-archive-cli-next', { from: 'review', to: 'done' });
    const payload = withNextSkill({ ok: true }, done.state);
    assert.equal(payload.next_skill_command, '$finish');
    assert.equal(payload.next_skill_hint, 'Next skill: $finish');
    assert.equal(payload.next_cli_command, null);
    assert.equal(payload.next_cli_hint, null);
  });
```

- [ ] **Step 2: Run the next-skill test and confirm failure**

Run:

```bash
node --test --test-name-pattern "does not recommend archive" test/workflow.test.mjs
```

Expected: fail because the current code returns `$archive <slug>` after review approval and done approval.

- [ ] **Step 3: Update next-step logic**

In `src/next-skill.mjs`, delete both branches that return `$archive ${state.slug}`.

Add this branch before the existing request-changes review branches in `nextCliCommand`:

```js
  if (state.current_stage === 'review'
    && state.review_verdict === 'approve'
    && state.pending_user_decision === 'review->done'
    && ['requested', 'approved'].includes(state.approval?.complete)) {
    return `loopx approve ${state.slug} --from review --to done`;
  }
```

Add this branch near the start of `nextSkillCommand`, after the clarify-ready branch:

```js
  if (state.current_stage === 'done'
    && state.completion_confirmed === true) {
    return '$finish';
  }
```

- [ ] **Step 4: Update recommended actions in workflow runtime**

In `src/workflow.mjs`, update `recommendedAction(state, legacy = false)`:

Replace the `state.review_verdict === 'approve'` branch with:

```js
      if (state.review_verdict === 'approve') {
        return state.approval.complete === APPROVAL_STATES.APPROVED
          ? 'Run $finish to complete branch disposition and learning audit.'
          : 'Approve review -> done, then run $finish to complete branch disposition and learning audit.';
      }
```

Replace the `STAGES.DONE` archive check with:

```js
      return 'Workflow is complete. Run $finish if branch disposition and learning audit have not been recorded.';
```

- [ ] **Step 5: Update review user message copy**

In `src/workflow.mjs`, update `nextCommandForRollbackTarget(slug, target)` for `target === 'none'`:

```js
  if (target === 'none') {
    return [
      'Next:',
      `loopx approve ${slug} --from review --to done`,
      '$finish',
    ].join('\n');
  }
```

In `reviewUserMessageZh`, replace the approve text:

```js
  const next = verdict === 'APPROVE'
    ? `下一步：批准 review -> done，然后执行 finish 完成分支处置和学习审计。\n${nextCommandForRollbackTarget(slug, 'none')}`
    : `下一步：按审查发现处理，并${rollbackTargetLabel(rollbackTarget)}。\n${nextCommandForRollbackTarget(slug, rollbackTarget)}`;
```

- [ ] **Step 6: Update initialized workspace product surface**

In `src/workflow.mjs`, update `buildWorkspaceReadme()`:

Remove this runtime command line:

```js
    '- `loopx archive <slug>`',
```

In `initWorkspace`, update the config object:

```js
    default_flow: ['clarify', 'plan', 'build', 'review', 'done'],
    preferred_surface: ['clarify', 'plan', 'build', 'review', 'autopilot'],
```

- [ ] **Step 7: Update hook advisory logic**

In `scripts/codex-workflow-hook.mjs`, remove both `nextSkill(state)` branches that return `$archive ${state.slug}`.

Add this branch after the clarify-ready branch:

```js
  if (state.current_stage === 'done'
    && state.completion_confirmed === true) {
    return '$finish';
  }
```

Update `nextCli(state)` with the same review-approved branch used in `src/next-skill.mjs`:

```js
  if (state.current_stage === 'review'
    && state.review_verdict === 'approve'
    && state.pending_user_decision === 'review->done'
    && ['requested', 'approved'].includes(state.approval?.complete)) {
    return `loopx approve ${state.slug} --from review --to done`;
  }
```

- [ ] **Step 8: Add workspace README/config regression**

In `test/workflow.test.mjs`, add this test near the init/status tests:

```js
  it('initializes workspace metadata without archive in the preferred product flow', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-init-no-archive-'));
    await initWorkspace(wd);

    const workspaceRoot = resolveWorkspaceRoot(wd);
    const config = JSON.parse(await readFile(join(workspaceRoot, 'config.json'), 'utf8'));
    assert.deepEqual(config.default_flow, ['clarify', 'plan', 'build', 'review', 'done']);
    assert.deepEqual(config.preferred_surface, ['clarify', 'plan', 'build', 'review', 'autopilot']);

    const readme = await readFile(join(workspaceRoot, 'README.md'), 'utf8');
    assert.match(readme, /clarify -> plan -> build -> review -> done/);
    assert.doesNotMatch(readme, /loopx archive/);
  });
```

- [ ] **Step 9: Run archive guidance tests**

Run:

```bash
node --test --test-name-pattern "does not recommend archive|initializes workspace metadata without archive" test/workflow.test.mjs
```

Expected: both tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/next-skill.mjs src/workflow.mjs scripts/codex-workflow-hook.mjs test/workflow.test.mjs
git commit -m "feat: remove archive from product guidance"
```

---

### Task 3: Add Installer Dry-Run, Opt-Out, And Human Summary

**Files:**
- Modify: `src/cli.mjs`
- Modify: `src/install-discovery.mjs`
- Modify: `scripts/install-skills.mjs`
- Test: `test/workflow.test.mjs`

- [ ] **Step 1: Write failing CLI dry-run test**

In `test/workflow.test.mjs`, add this test near the install tests:

```js
  it('prints install dry-run summary without writing skills or hooks', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-install-dry-run-home-'));
    const env = loopxEnv(home);

    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      'install-skills',
      '--target',
      'codex',
      '--dry-run',
    ], { cwd: repoRoot, env });

    assert.match(stdout, /^loopx install-skills dry run$/m);
    assert.match(stdout, /target: codex/);
    assert.match(stdout, /writes: none/);
    assert.match(stdout, /next: loopx install-skills --target codex --yes/);
    assert.equal(existsSync(join(home, '.agents', 'skills')), false);
    assert.equal(existsSync(join(home, '.codex', 'hooks', 'codex-workflow-hook.mjs')), false);

    const { stdout: json } = await execFileAsync(process.execPath, [
      cliPath,
      'install-skills',
      '--target',
      'codex',
      '--dry-run',
      '--json',
    ], { cwd: repoRoot, env });
    const parsed = JSON.parse(json);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.command, 'install-skills');
    assert.equal(parsed.dryRun, true);
    assert.deepEqual(parsed.targets, ['codex']);
  });
```

- [ ] **Step 2: Run dry-run test and confirm failure**

Run:

```bash
node --test --test-name-pattern "prints install dry-run summary" test/workflow.test.mjs
```

Expected: fail because `--dry-run` is not implemented.

- [ ] **Step 3: Export target inspection helper**

In `src/install-discovery.mjs`, add this function before `installSkillsForTargets`:

```js
export async function inspectInstallTargets(env = process.env, options = {}) {
  const requestedTargets = Array.isArray(options.targets) && options.targets.length > 0
    ? options.targets
    : ['codex', 'claude'];
  const results = {};
  for (const target of requestedTargets) {
    if (target === 'codex') {
      results.codex = await inspectInstallState(codexInstallEnv({
        ...env,
        LOOPX_INSTALL_CUSTOM_DIR: options.dir,
      }));
      continue;
    }
    if (target === 'claude') {
      results.claude = await inspectInstallState(claudeInstallEnv(env, options));
      continue;
    }
    throw new Error(`unknown_install_target:${target}`);
  }
  return {
    ok: true,
    dryRun: true,
    targets: requestedTargets,
    results,
  };
}
```

- [ ] **Step 4: Import inspection helper in CLI**

In `src/cli.mjs`, change the install import line:

```js
import { inspectInstallTargets, installBundledSkills, installSkillsForTargets } from './install-discovery.mjs';
```

If `installBundledSkills` is unused after this change, remove it from the import list:

```js
import { inspectInstallTargets, installSkillsForTargets } from './install-discovery.mjs';
```

- [ ] **Step 5: Add install summary helpers**

In `src/cli.mjs`, add these helpers after `printHumanDoctor`:

```js
function installTargetNames(result) {
  return Array.isArray(result.targets) && result.targets.length > 0 ? result.targets : Object.keys(result.results || {});
}

function countInstalledSkills(result) {
  return Object.values(result.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target.installed) ? target.installed.length : 0), 0);
}

function countInstallSkipped(result) {
  return Object.values(result.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target.skipped) ? target.skipped.length : 0), 0);
}

function printHumanInstall(result, { dryRun = false } = {}) {
  if (dryRun) {
    console.log('loopx install-skills dry run');
    for (const target of installTargetNames(result)) {
      console.log(`target: ${target}`);
    }
    console.log('skills: 16 bundled');
    console.log('writes: none');
    console.log(`next: loopx install-skills --target ${installTargetNames(result).join(',')} --yes`);
    return;
  }

  console.log(`loopx install-skills: ${result.ok === false ? 'attention needed' : 'ok'}`);
  console.log(`targets: ${installTargetNames(result).join(', ')}`);
  console.log(`installed skills: ${countInstalledSkills(result)}`);
  const conflicts = countInstallConflicts({ installCheck: result });
  console.log(`conflicts: ${conflicts}`);
  const skipped = countInstallSkipped(result);
  if (skipped > 0) {
    console.log(`skipped user-modified: ${skipped}`);
  }
  console.log('paths:');
  for (const target of installTargetNames(result)) {
    const inspection = result.results?.[target]?.inspection || result.results?.[target];
    if (inspection?.installedSkillsRoot) {
      console.log(`  ${target} skills: ${inspection.installedSkillsRoot}`);
    }
  }
  console.log('repair: loopx repair-install');
  console.log('disable hooks for one process: LOOPX_HOOKS=0');
  console.log('details: loopx install-skills --json');
}
```

- [ ] **Step 6: Wire install command dry-run and JSON output**

In `src/cli.mjs`, in `case 'install-skills'`, replace the install execution/output block with:

```js
        const env = {
          ...process.env,
          LOOPX_INSTALL_CWD: process.cwd(),
        };
        const result = options.get('--dry-run')
          ? await inspectInstallTargets(env, installOptions)
          : await installSkillsForTargets(env, installOptions);
        const payload = { ok: result.ok, command, ...result };
        if (options.get('--json')) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          printHumanInstall(payload, { dryRun: Boolean(options.get('--dry-run')) });
        }
        return;
```

- [ ] **Step 7: Write failing postinstall opt-out test**

In `test/workflow.test.mjs`, add:

```js
  it('lets postinstall opt out without writing user-level skills or hooks', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-postinstall-skip-home-'));
    const env = {
      ...loopxEnv(home),
      LOOPX_SKIP_POSTINSTALL: '1',
    };

    const { stdout } = await execFileAsync(process.execPath, [installScript], { cwd: repoRoot, env });
    assert.match(stdout, /loopx postinstall skipped/);
    assert.match(stdout, /LOOPX_SKIP_POSTINSTALL=1/);
    assert.equal(existsSync(join(home, '.agents', 'skills')), false);
    assert.equal(existsSync(join(home, '.claude', 'skills')), false);
    assert.equal(existsSync(join(home, '.codex', 'hooks', 'codex-workflow-hook.mjs')), false);
  });
```

- [ ] **Step 8: Run opt-out test and confirm failure**

Run:

```bash
node --test --test-name-pattern "lets postinstall opt out" test/workflow.test.mjs
```

Expected: fail because `scripts/install-skills.mjs` does not handle `LOOPX_SKIP_POSTINSTALL`.

- [ ] **Step 9: Update postinstall script**

In `scripts/install-skills.mjs`, replace the file with this implementation:

```js
#!/usr/bin/env node

import { installSkillsForTargets, verifyInstallTargets } from '../src/install-discovery.mjs';

function shouldSkipPostinstall(env = process.env) {
  return env.LOOPX_SKIP_POSTINSTALL === '1' || env.LOOPX_POSTINSTALL === '0';
}

function targetNames(result) {
  return Array.isArray(result.targets) && result.targets.length > 0 ? result.targets : Object.keys(result.results || {});
}

function count(result, key) {
  return Object.values(result.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target?.[key]) ? target[key].length : 0), 0);
}

function printSummary(result, { checkOnly = false } = {}) {
  console.log(`loopx ${checkOnly ? 'install check' : 'postinstall'}: ${result.ok === false ? 'attention needed' : 'ok'}`);
  console.log(`targets: ${targetNames(result).join(', ')}`);
  if (!checkOnly) {
    console.log(`installed skills: ${count(result, 'installed')}`);
  }
  console.log(`conflicts: ${count(result, 'conflicts')}`);
  console.log(`skipped user-modified: ${count(result, 'skipped')}`);
  console.log('repair: loopx repair-install');
  console.log('opt out: LOOPX_SKIP_POSTINSTALL=1');
  console.log('disable hooks for one process: LOOPX_HOOKS=0');
  console.log('details: node scripts/install-skills.mjs --json');
}

async function main() {
  if (shouldSkipPostinstall()) {
    console.log('loopx postinstall skipped: LOOPX_SKIP_POSTINSTALL=1 or LOOPX_POSTINSTALL=0');
    return;
  }

  const checkOnly = process.argv.includes('--check');
  const json = process.argv.includes('--json');
  const result = checkOnly ? await verifyInstallTargets(process.env) : await installSkillsForTargets(process.env);
  const ok = checkOnly ? result.ok : result.ok !== false;
  const payload = checkOnly ? result : { ok, targets: result.targets, results: result.results };
  if (json) {
    const stream = ok ? process.stdout : process.stderr;
    stream.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    printSummary(payload, { checkOnly });
  }
  if (!ok) {
    process.exitCode = 1;
  }
}

await main();
```

- [ ] **Step 10: Run installer tests**

Run:

```bash
node --test --test-name-pattern "prints install dry-run summary|lets postinstall opt out" test/workflow.test.mjs
```

Expected: both tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/cli.mjs src/install-discovery.mjs scripts/install-skills.mjs test/workflow.test.mjs
git commit -m "feat: improve install summary and dry run"
```

---

### Task 4: Document The New UX And Archive Relationship

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `test/skill-governance.test.mjs`
- Modify: `scripts/verify-skills.mjs`

- [ ] **Step 1: Write failing docs alignment assertions**

In `test/skill-governance.test.mjs`, inside `keeps public docs structurally valid and bilingual release docs aligned`, add these required strings after the existing required docs checks:

```js
    for (const required of [
      'Quick start',
      'Human output is the default',
      'loopx doctor --json',
      'loopx init --json',
      'loopx install-skills --dry-run',
      'LOOPX_SKIP_POSTINSTALL=1',
      'LOOPX_POSTINSTALL=0',
      'LOOPX_HOOKS=0',
      'Archive compatibility',
      'archive is not part of the public v1 finish flow',
    ]) {
      assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${required} missing from README.md`);
    }
    for (const required of [
      '快速开始',
      '默认输出面向人类',
      'loopx doctor --json',
      'loopx init --json',
      'loopx install-skills --dry-run',
      'LOOPX_SKIP_POSTINSTALL=1',
      'LOOPX_POSTINSTALL=0',
      'LOOPX_HOOKS=0',
      'Archive 兼容性',
      'archive 不属于公开 v1 finish 流程',
    ]) {
      assert.match(readmeZh, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${required} missing from README.zh-CN.md`);
    }
```

In `scripts/verify-skills.mjs`, in `assertPublicDocsAligned()`, add:

```js
  for (const required of [
    'Quick start',
    'Human output is the default',
    'loopx install-skills --dry-run',
    'LOOPX_SKIP_POSTINSTALL=1',
    'LOOPX_POSTINSTALL=0',
    'LOOPX_HOOKS=0',
    'Archive compatibility',
  ]) {
    assertContains(readme, required, 'README.md');
  }
  for (const required of [
    '快速开始',
    '默认输出面向人类',
    'loopx install-skills --dry-run',
    'LOOPX_SKIP_POSTINSTALL=1',
    'LOOPX_POSTINSTALL=0',
    'LOOPX_HOOKS=0',
    'Archive 兼容性',
  ]) {
    assertContains(readmeZh, required, 'README.zh-CN.md');
  }
```

- [ ] **Step 2: Run docs tests and confirm failure**

Run:

```bash
node --test --test-name-pattern "keeps public docs structurally valid" test/skill-governance.test.mjs
node scripts/verify-skills.mjs
```

Expected: fail because README files do not yet document quickstart, human defaults, installer opt-out, dry-run, and archive compatibility.

- [ ] **Step 3: Update English README quickstart and CLI behavior**

In `README.md`, after the recommended v1 flow block, add:

````markdown
## Quick start

```bash
loopx install-skills --target all --yes
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
```

Human output is the default for first-use commands such as `loopx init`, `loopx doctor`, and `loopx install-skills`. Use `--json` when an agent or script needs the complete runtime payload:

```bash
loopx init --slug my-feature --json
loopx doctor --json
loopx install-skills --target all --json
```
````

- [ ] **Step 4: Update English README install section**

In `README.md`, in the install section after the path list, add:

````markdown
To inspect without writing files:

```bash
loopx install-skills --target all --dry-run
```

To opt out during npm postinstall:

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

To disable loopx hooks for one process:

```bash
LOOPX_HOOKS=0 codex
```

Repair an interrupted or conflicted install with:

```bash
loopx repair-install
loopx doctor
```
````

- [ ] **Step 5: Update English README archive compatibility**

In `README.md`, after the paragraph that says `finish` is the terminal completion step, add:

```markdown
### Archive compatibility

`archive` is not part of the public v1 finish flow. Older runtime state may still contain archive fields or a hidden `loopx archive <slug>` compatibility command, but normal users should complete work through `finish` and the public finish audit commands above.
```

- [ ] **Step 6: Update Chinese README quickstart and CLI behavior**

In `README.zh-CN.md`, after the recommended v1 flow block, add:

````markdown
## 快速开始

```bash
loopx install-skills --target all --yes
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
```

默认输出面向人类，例如 `loopx init`、`loopx doctor` 和 `loopx install-skills`。当 agent 或脚本需要完整 runtime payload 时使用 `--json`：

```bash
loopx init --slug my-feature --json
loopx doctor --json
loopx install-skills --target all --json
```
````

- [ ] **Step 7: Update Chinese README install section**

In `README.zh-CN.md`, in the install section after the path list, add:

````markdown
只检查、不写文件：

```bash
loopx install-skills --target all --dry-run
```

npm postinstall 阶段跳过自动安装：

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

只在当前进程禁用 loopx hooks：

```bash
LOOPX_HOOKS=0 codex
```

修复中断或冲突的安装：

```bash
loopx repair-install
loopx doctor
```
````

- [ ] **Step 8: Update Chinese README archive compatibility**

In `README.zh-CN.md`, after the paragraph that says `finish` is the terminal completion step, add:

```markdown
### Archive 兼容性

archive 不属于公开 v1 finish 流程。旧 runtime state 仍可能包含 archive 字段，也可能通过隐藏的 `loopx archive <slug>` 兼容命令处理历史状态，但普通用户应通过 `finish` 和上面的公开 finish audit 命令完成工作。
```

- [ ] **Step 9: Update CLI command lists**

In both README files:

- Change `loopx init ...` to include `[--json]`.
- Change `loopx install-skills ...` to include `[--dry-run] [--json]`.
- Change `loopx doctor` to `loopx doctor [--json]`.
- Keep `loopx archive` absent from public CLI lists.

- [ ] **Step 10: Run docs tests**

Run:

```bash
node --test --test-name-pattern "keeps public docs structurally valid" test/skill-governance.test.mjs
node scripts/verify-skills.mjs
```

Expected: both commands pass.

- [ ] **Step 11: Commit**

```bash
git add README.md README.zh-CN.md test/skill-governance.test.mjs scripts/verify-skills.mjs
git commit -m "docs: document cli onboarding and install controls"
```

---

### Task 5: Tighten Published Skill Surface

**Files:**
- Modify: `package.json`
- Modify: `test/skill-governance.test.mjs`
- Modify: `scripts/verify-skills.mjs`

- [ ] **Step 1: Write failing package surface test**

In `test/skill-governance.test.mjs`, replace the test named `keeps deprecated local skills and plugin tests out of the npm package` with:

```js
  it('publishes only bundled root skills plus resolver', async () => {
    const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], { cwd: repoRoot });
    const [pack] = JSON.parse(stdout);
    const paths = pack.files.map((file) => file.path);
    const packagedSkillDirs = [...new Set(
      paths
        .filter((path) => path.startsWith('skills/') && path.endsWith('/SKILL.md'))
        .map((path) => path.split('/')[1]),
    )].sort();

    assert.deepEqual(packagedSkillDirs, [...LOOPX_BUNDLED_SKILLS].sort());
    assert.equal(paths.includes('skills/RESOLVER.md'), true);
    assert.equal(paths.some((path) => path.startsWith('skills/deepsearch/')), false);
    assert.equal(paths.includes('plugins/loopx/scripts/plugin-install.test.mjs'), false);
  });
```

- [ ] **Step 2: Run package surface test and confirm failure**

Run:

```bash
node --test --test-name-pattern "publishes only bundled root skills plus resolver" test/skill-governance.test.mjs
```

Expected: fail because `package.json` currently includes broad `skills/`, which publishes non-bundled local skill sources such as `skills/deepsearch/`.

- [ ] **Step 3: Replace broad package skill inclusion**

In `package.json`, replace:

```json
    "skills/",
```

with the explicit bundled surface:

```json
    "skills/RESOLVER.md",
    "skills/clarify/",
    "skills/debug/",
    "skills/doc-readability/",
    "skills/exec/",
    "skills/final-review/",
    "skills/finish/",
    "skills/fix-review/",
    "skills/go-style/",
    "skills/kratos/",
    "skills/plan/",
    "skills/refactor-plan/",
    "skills/review/",
    "skills/spec/",
    "skills/subagent-exec/",
    "skills/tdd/",
    "skills/verify/",
```

Keep `plugins/loopx/` in the package because the plugin mirror remains part of the published surface.

- [ ] **Step 4: Add release verifier package surface assertion**

In `scripts/verify-skills.mjs`, after the existing `assert.equal(packageJson.files.includes('scripts/claude-workflow-hook.mjs'), true, ...)`, add:

```js
assert.equal(packageJson.files.includes('skills/'), false, 'npm package must not include broad skills/ surface');
assert.equal(packageJson.files.includes('skills/RESOLVER.md'), true, 'npm package must include skills/RESOLVER.md');
for (const skillName of LOOPX_BUNDLED_SKILLS) {
  assert.equal(packageJson.files.includes(`skills/${skillName}/`), true, `npm package missing bundled skill ${skillName}`);
}
```

- [ ] **Step 5: Run package governance tests**

Run:

```bash
node --test --test-name-pattern "publishes only bundled root skills plus resolver|keeps a resolver" test/skill-governance.test.mjs
node scripts/verify-skills.mjs
npm pack --dry-run --json
```

Expected:

- Node tests pass.
- `node scripts/verify-skills.mjs` prints `ok: verified 16 loopx bundled skills`.
- `npm pack --dry-run --json` includes bundled skill directories and does not include `skills/deepsearch/`.

- [ ] **Step 6: Commit**

```bash
git add package.json test/skill-governance.test.mjs scripts/verify-skills.mjs
git commit -m "chore: publish only bundled skills"
```

---

### Task 6: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: all repository tests pass.

- [ ] **Step 2: Run release governance**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected:

```text
ok: verified 16 loopx bundled skills
```

- [ ] **Step 3: Smoke-test CLI human output**

Run:

```bash
node src/cli.mjs --help
node src/cli.mjs doctor
node src/cli.mjs doctor --json
node src/cli.mjs install-skills --target codex --dry-run
```

Expected:

- Help starts with `Quick start:`.
- Help does not include `loopx archive <slug>`.
- `doctor` prints human summary.
- `doctor --json` parses as JSON.
- install dry-run says `writes: none`.

- [ ] **Step 4: Confirm package surface**

Run:

```bash
npm pack --dry-run --json
```

Expected: JSON output does not contain `skills/deepsearch/`.

- [ ] **Step 5: Commit any verification-only test fixture updates**

If verification requires no file changes, skip this step. If a test fixture or README assertion had to be corrected during verification, commit only that scoped correction:

```bash
git add <changed-files>
git commit -m "fix: align cli onboarding verification"
```

## Self-Review

- **Spec coverage:** The plan covers all three requested classes: first-use CLI output (`init`, `doctor`, help), archive product relationship, and install/package surface.
- **Archive scope:** The plan removes archive from public guidance and recommendations while preserving hidden runtime compatibility. Full deletion of archival runtime code is intentionally left out because it would touch old spec-delta archival behavior, migration handling, and many existing tests.
- **Placeholder scan:** No step asks an implementer to invent missing behavior; all output contracts, tests, file paths, and command expectations are explicit.
- **Type consistency:** The plan consistently uses `--json`, `--dry-run`, `LOOPX_SKIP_POSTINSTALL`, `LOOPX_POSTINSTALL`, `LOOPX_HOOKS`, `$finish`, and `loopx approve <slug> --from review --to done`.
- **Design drift:** The plan follows the approved direction from the conversation and does not introduce a new workflow stage or automatic git operation.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-09-cli-onboarding-install-surface.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
