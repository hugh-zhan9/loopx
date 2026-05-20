import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { LOOPX_BUNDLED_SKILLS } from '../src/install-discovery.mjs';

const repoRoot = resolve(process.cwd());
const resolverPath = join(repoRoot, 'skills', 'RESOLVER.md');
const verifyScriptPath = join(repoRoot, 'scripts', 'verify-skills.mjs');

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

describe('loopx skill governance', () => {
  it('keeps a resolver and deterministic verifier for bundled skills', async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));

    assert.equal(existsSync(resolverPath), true, 'skills/RESOLVER.md must exist');
    assert.equal(existsSync(verifyScriptPath), true, 'scripts/verify-skills.mjs must exist');
    assert.equal(packageJson.files.includes('scripts/verify-skills.mjs'), true, 'npm package must include verify-skills.mjs');

    const resolver = await readFile(resolverPath, 'utf8');
    for (const skillName of LOOPX_BUNDLED_SKILLS) {
      assert.match(resolver, new RegExp(`skills/${skillName}/SKILL\\.md`), `${skillName} missing from resolver`);
    }
  });

  it('makes bundled skill frontmatter triggerable and bounded', async () => {
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
      assert.equal(pluginSkill, rootSkill, `${skillName} plugin mirror drifted`);
    }
  });
});
