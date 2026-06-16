import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const repoRoot = resolve(process.cwd());
const resolverPath = join(repoRoot, 'skills', 'RESOLVER.md');
const verifyScriptPath = join(repoRoot, 'scripts', 'verify-skills.mjs');
const removedRuntimeCommandPattern = /\bloopx\s+(?:approve|plan|build|review|archive|autopilot)\b/;

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return {};
  }
  const end = text.indexOf('\n---\n', 4);
  assert.notEqual(end, -1, 'frontmatter must close with ---');
  const fields = {};
  let inMetadata = false;
  for (const line of text.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (line === 'metadata:') {
      inMetadata = true;
      continue;
    }
    if (inMetadata && line.startsWith('  version:')) {
      fields['metadata.version'] = line.split(':', 2)[1].trim().replace(/^"|"$/g, '');
      continue;
    }
    if (separator === -1 || line.startsWith(' ')) {
      continue;
    }
    inMetadata = false;
    const key = line.slice(0, separator).trim();
    fields[key] = line.slice(separator + 1).trim().replace(/^"|"$/g, '');
  }
  return fields;
}

async function recursiveFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(relative(root, path));
      }
    }
  }
  await walk(root);
  return files.sort();
}

function assertNoRemovedRuntimeCommandExposure(text, label) {
  assert.doesNotMatch(text, removedRuntimeCommandPattern, `${label} should not expose removed runtime commands`);
}

function assertMarkdownStructure(text, label) {
  assert.equal(text.endsWith('\n'), true, `${label} missing final newline`);
  assert.equal(/^(<<<<<<<|=======|>>>>>>>)($| )/m.test(text), false, `${label} contains merge conflict markers`);
  const fences = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^(`{3,}|~{3,})/);
    if (!match) continue;
    const marker = match[1];
    if (fences.length > 0 && marker[0] === fences.at(-1)[0] && marker.length >= fences.at(-1).length) {
      fences.pop();
    } else {
      fences.push(marker);
    }
  }
  assert.deepEqual(fences, [], `${label} has unclosed fenced blocks`);
}

describe('loopx skill governance', () => {
  it('keeps bundled skill frontmatter triggerable and plugin mirrors byte-identical', async () => {
    const resolver = await readFile(resolverPath, 'utf8');
    for (const skillName of LOOPX_BUNDLED_SKILLS) {
      const rootSkillPath = join(repoRoot, 'skills', skillName, 'SKILL.md');
      const pluginSkillPath = join(repoRoot, 'plugins', 'loopx', 'skills', skillName, 'SKILL.md');
      const rootSkill = await readFile(rootSkillPath, 'utf8');
      const pluginSkill = await readFile(pluginSkillPath, 'utf8');
      const fields = parseFrontmatter(rootSkill);

      assert.equal(fields.name, skillName);
      assert.ok(fields.description?.length >= 40, `${skillName} description is too short`);
      assert.match(fields.description, /not for/i, `${skillName} description must include a Not for exclusion`);
      assert.ok(fields.when_to_use?.length >= 20, `${skillName} needs when_to_use trigger metadata`);
      assert.ok(fields['metadata.version'], `${skillName} needs metadata.version`);
      assert.match(resolver, new RegExp(`skills/${skillName}/SKILL\\.md`), `${skillName} missing from resolver`);
      assert.equal(pluginSkill, rootSkill, `${skillName} plugin mirror drifted`);

      const rootSkillDir = join(repoRoot, 'skills', skillName);
      const pluginSkillDir = join(repoRoot, 'plugins', 'loopx', 'skills', skillName);
      const rootFiles = await recursiveFiles(rootSkillDir);
      const pluginFiles = await recursiveFiles(pluginSkillDir);
      assert.deepEqual(pluginFiles, rootFiles, `${skillName} plugin mirror file list drifted`);
      for (const relativeFile of rootFiles) {
        const rootExtra = await readFile(join(rootSkillDir, relativeFile), 'utf8');
        const pluginExtra = await readFile(join(pluginSkillDir, relativeFile), 'utf8');
        assert.equal(pluginExtra, rootExtra, `${skillName}/${relativeFile} plugin mirror drifted`);
      }
    }
  });

  it('keeps package skill surface explicit and verifier packaged', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(existsSync(resolverPath), true, 'skills/RESOLVER.md must exist');
    assert.equal(existsSync(verifyScriptPath), true, 'scripts/verify-skills.mjs must exist');
    assert.equal(packageJson.files.includes('scripts/verify-skills.mjs'), true, 'npm package must include verify-skills.mjs');
    assert.equal(packageJson.files.includes('scripts/claude-workflow-hook.mjs'), true, 'npm package must include claude-workflow-hook.mjs');
    assert.equal(packageJson.files.includes('scripts/codex-stop-hook.mjs'), false, 'npm package must not include deleted codex stop hook');
    assert.equal(packageJson.files.includes('templates/spec.md'), true, 'npm package must include retained clarify spec template');
    assert.equal(packageJson.files.includes('templates/'), false, 'npm package must not include broad runtime templates surface');
    assert.equal(packageJson.files.includes('skills/'), false, 'npm package must not include broad skills/ surface');
    assert.deepEqual(
      packageJson.files.filter((path) => path.startsWith('skills/')).sort(),
      ['skills/RESOLVER.md', ...LOOPX_BUNDLED_SKILLS.map((skillName) => `skills/${skillName}/`)].sort(),
    );
  });

  it('keeps current public docs and guidance free of removed runtime commands', async () => {
    const publicPaths = [
      'README.md',
      'README.zh-CN.md',
      'docs/loopx/design/loopx-skill-suite-v1-design.md',
      'docs/loopx/specs/installation.md',
      'src/cli.mjs',
      'src/next-skill.mjs',
      'scripts/codex-workflow-hook.mjs',
      'scripts/claude-workflow-hook.mjs',
      'scripts/verify-skills.mjs',
    ];
    for (const relativePath of publicPaths) {
      const text = await readFile(join(repoRoot, relativePath), 'utf8');
      if (relativePath.endsWith('.md')) {
        assertMarkdownStructure(text, relativePath);
      }
      assertNoRemovedRuntimeCommandExposure(text, relativePath);
    }

    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
    for (const command of [
      'loopx init',
      'loopx clarify',
      'loopx render',
      'loopx status',
      'loopx next',
      'loopx setup-context',
      'loopx doctor',
      'loopx repair-install',
      'loopx install-skills',
      'node scripts/verify-skills.mjs',
    ]) {
      const pattern = new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      assert.match(readme, pattern, `${command} missing from README.md`);
      assert.match(readmeZh, pattern, `${command} missing from README.zh-CN.md`);
    }
    assert.match(readme, /clarify -> spec\? -> plan-to-exec -> \(exec \| subagent-exec\) -> review\/final-review -> fix-review\? -> finish/);
  });
});
