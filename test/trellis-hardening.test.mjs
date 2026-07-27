import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { discoverLoopxContextArtifacts } from '../src/loopx-context-artifacts.mjs';
import {
  classifyTemplateDrift,
  createTemplateBaseline,
  inspectTemplateGovernance,
  parseManagedBlocks,
  writeTemplateBaseline,
} from '../src/template-governance.mjs';
import { setupWorkspaceContext } from '../src/workspace-context.mjs';

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
    assert.ok((await inspectTemplateGovernance(join(wd, '.loopx', 'template-hashes.json'), { cwd: wd })).status);
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
});
