import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { LOOPX_BUNDLED_SKILLS, LOOPX_CANONICAL_WORKFLOW_SKILLS } from '../src/install-discovery.mjs';

const root = resolve(import.meta.dirname, '..');

test('canonical clarify is published without a second trial entry', async () => {
  const skill = await readFile(join(root, 'skills/clarify/SKILL.md'), 'utf8');
  assert.match(skill, /^name: clarify$/m);
  assert.ok(LOOPX_CANONICAL_WORKFLOW_SKILLS.includes('clarify'));
  assert.ok(LOOPX_BUNDLED_SKILLS.includes('clarify'));
  assert.ok(!LOOPX_BUNDLED_SKILLS.includes('clarify-v2'));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('skills/clarify/'));
  assert.ok(!pkg.files.some((path) => path === 'skills/' || path.startsWith('skills/clarify-v2')));
  // Question ordering and preservation of requirements are exercised by behavior drills.
  for (const field of ['requirements.md', 'clarification.md', 'AC-*', 'TC-*']) {
    assert.ok(skill.includes(field), `intake consumers still need ${field}`);
  }
});
