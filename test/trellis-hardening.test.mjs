import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import {
  classifyTemplateDrift,
  createTemplateBaseline,
  inspectTemplateGovernance,
  parseManagedBlocks,
  writeTemplateBaseline,
} from '../src/template-governance.mjs';
import { discoverLoopxContextArtifacts } from '../src/loopx-context-artifacts.mjs';
import { setupWorkspaceContext } from '../src/workspace-context.mjs';
import { clarifyStage } from '../src/workflow.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd());
const workflowHookScript = resolve(repoRoot, 'scripts/codex-workflow-hook.mjs');
const claudeWorkflowHookScript = resolve(repoRoot, 'scripts/claude-workflow-hook.mjs');
const removedSpecArtifactLinePattern = new RegExp(['spec', 'artifact:'].join(' '));
const removedTestCasesAdvisoryPattern = new RegExp(['test', 'cases:'].join(' '));

describe('loopx retained hardening', () => {
  it('classifies template drift without overwriting user changes', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-template-drift-'));
    const sourcePath = join(wd, 'registry', 'SKILL.md');
    const targetPath = join(wd, 'installed', 'SKILL.md');
    await mkdir(join(wd, 'registry'), { recursive: true });
    await mkdir(join(wd, 'installed'), { recursive: true });
    await writeFile(sourcePath, 'registry v1\n');
    await writeFile(targetPath, 'registry v1\n');

    const baseline = await createTemplateBaseline(wd, [{ path: targetPath, sourcePath, kind: 'skill' }]);
    assert.equal((await classifyTemplateDrift(baseline.items[0], { sourcePath, targetPath })).status, 'current');

    await writeFile(sourcePath, 'registry v2\n');
    assert.equal((await classifyTemplateDrift(baseline.items[0], { sourcePath, targetPath })).status, 'outdated-pristine');

    await writeFile(targetPath, 'user edit\n');
    assert.equal((await classifyTemplateDrift(baseline.items[0], { sourcePath, targetPath })).status, 'conflict');

    await writeTemplateBaseline(join(wd, '.loopx', 'template-hashes.json'), baseline);
    const inspected = await inspectTemplateGovernance(join(wd, '.loopx', 'template-hashes.json'), { cwd: wd });
    assert.ok(inspected.status);
  });

  it('tracks managed template blocks separately from user content', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-template-block-'));
    const targetPath = join(wd, 'installed', 'SKILL.md');
    await mkdir(join(wd, 'installed'), { recursive: true });
    await writeFile(targetPath, [
      'user note outside block',
      '<!-- loopx:managed:block skill-core -->',
      'registry v1',
      '<!-- /loopx:managed:block skill-core -->',
      '',
    ].join('\n'));

    const blocks = parseManagedBlocks(await readFile(targetPath, 'utf8'));
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].id, 'skill-core');
  });

  it('setup-context creates repo context docs and discovery finds specs and memory', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-context-'));
    const context = await setupWorkspaceContext(wd);
    assert.equal(context.status, 'complete');
    assert.equal(existsSync(join(wd, '.loopx', 'context', 'domain.md')), true);

    await mkdir(join(wd, 'docs', 'loopx', 'specs', 'billing'), { recursive: true });
    await writeFile(join(wd, 'docs', 'loopx', 'specs', 'billing', 'spec.md'), [
      '---',
      'applies_to:',
      '  - src/billing',
      '---',
      '# Billing Spec',
    ].join('\n'));
    await mkdir(join(wd, '.loopx', 'memory'), { recursive: true });
    await writeFile(join(wd, '.loopx', 'memory', 'MEMORY.md'), '# Memory\n');

    const artifacts = await discoverLoopxContextArtifacts(wd, { changedFiles: ['src/billing/invoice.mjs'] });
    assert.equal(artifacts.specFiles.length, 1);
    assert.equal(artifacts.specFiles[0].reason, 'applies_to_match');
    assert.equal(artifacts.memorySummary.path, '.loopx/memory/MEMORY.md');
  });

  it('workflow hooks recommend next skills without runtime command fallbacks', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-hook-'));
    const clarified = await clarifyStage(wd, 'hook-flow');
    const statePath = join(clarified.root, 'state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    await writeFile(statePath, `${JSON.stringify({
      ...state,
      clarify_current_round: 2,
      unresolved_ambiguity_count: 0,
      clarify_non_goals_resolved: true,
      clarify_decision_boundaries_resolved: true,
      clarify_pressure_pass_complete: true,
      stage_status: 'ready',
      handoff_decision: 'direct_to_plan',
    }, null, 2)}\n`);

    for (const hookScript of [workflowHookScript, claudeWorkflowHookScript]) {
      const { stdout } = await execFileAsync(
        process.execPath,
        [hookScript, '--payload', JSON.stringify({ cwd: wd, workflow: 'hook-flow' })],
        { cwd: wd },
      );
      assert.match(stdout, /<loopx-workflow-state>/);
      assert.match(stdout, /next skill: \$plan2exec .*\.loopx[/\\]intake[/\\]\d{4}-\d{2}-\d{2}-hook-flow/);
      assert.match(stdout, /intake package:/);
      assert.match(stdout, /requirements:/);
      assert.doesNotMatch(stdout, removedTestCasesAdvisoryPattern);
      assert.doesNotMatch(stdout, removedSpecArtifactLinePattern);
      assert.doesNotMatch(stdout, /next cli:/);
      assert.doesNotMatch(stdout, /loopx build|loopx approve/);
      assert.doesNotMatch(stdout, /runtime gates remain authoritative|implementation gate|authorization|build context|review context/);
    }
  });

  it('workflow hooks do not infer finish from historical state without an explicit workflow identity', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-hook-unrelated-git-'));
    const stateRoot = join(wd, '.loopx', 'workflows', 'historical-flow');
    await mkdir(stateRoot, { recursive: true });
    await writeFile(join(stateRoot, 'state.json'), `${JSON.stringify({
      slug: 'historical-flow',
      current_stage: 'done',
      stage_status: 'complete',
      completion_confirmed: true,
    }, null, 2)}\n`);

    for (const hookScript of [workflowHookScript, claudeWorkflowHookScript]) {
      const { stdout } = await execFileAsync(
        process.execPath,
        [hookScript, '--payload', JSON.stringify({ cwd: wd })],
        { cwd: wd },
      );
      assert.doesNotMatch(stdout, /next skill: \$finish/);

      const explicit = await execFileAsync(
        process.execPath,
        [hookScript, '--payload', JSON.stringify({ cwd: wd, workflow: 'historical-flow' })],
        { cwd: wd },
      );
      assert.match(explicit.stdout, /next skill: \$finish/);
    }
  });
});
