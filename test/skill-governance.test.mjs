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

  it('keeps public docs structurally valid and bilingual release docs aligned', async () => {
    for (const relativePath of ['README.md', 'README.zh-CN.md']) {
      const text = await readFile(join(repoRoot, relativePath), 'utf8');
      assert.equal(text.endsWith('\n'), true, `${relativePath} missing final newline`);
      assert.equal(/^(<<<<<<<|=======|>>>>>>>)($| )/m.test(text), false, `${relativePath} contains merge conflict markers`);

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
      assert.deepEqual(fences, [], `${relativePath} has unclosed fenced blocks`);
    }

    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(join(repoRoot, 'README.zh-CN.md'), 'utf8');
    for (const command of [
      'loopx init',
      'loopx clarify',
      'loopx approve',
      'loopx plan',
      'loopx build',
      'loopx review',
      'loopx archive',
      'loopx autopilot',
      'loopx render',
      'loopx status',
      'loopx setup-context',
      'loopx doctor',
      'loopx migrate',
      'loopx repair-install',
      'node scripts/verify-skills.mjs',
    ]) {
      assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${command} missing from README.md`);
      assert.match(readmeZh, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${command} missing from README.zh-CN.md`);
    }
  });

  it('keeps workflow skill handoff commands unambiguous', async () => {
    const clarify = await readFile(join(repoRoot, 'skills', 'clarify', 'SKILL.md'), 'utf8');
    assert.match(clarify, /Default handoff after normal loopx clarify: `\$plan <slug>`/);
    assert.match(clarify, /Conditional artifact-pinned handoff: `\$plan --direct <spec-path>`/);
    assert.match(clarify, /Recommend `\$plan --direct <spec-path>` when the user explicitly wants to plan from a specific requirements artifact/);
    assert.match(clarify, /Do not use `\$plan --direct` to work around unclear workflow state/);
    assert.match(clarify, /For the normal loopx clarify happy path, prefer `\$plan <slug>`/);

    const plan = await readFile(join(repoRoot, 'skills', 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /Default build handoff after an approved plan package:/);
    assert.match(plan, /\$build \.loopx\/plans\/prd-<slug>\.md/);
    assert.match(plan, /Do not emit `\$build <slug>` as the primary handoff/);
    assert.match(plan, /HTML:\n\.loopx\/workflows\/<slug>\/view\/index\.html/);
    assert.match(plan, /derived HTML reading views/);
    assert.match(plan, /requirement-traceability\.md/);
    assert.match(plan, /source requirements are covered/);
    assert.match(plan, /plan-delegation-decision\.md/);
    assert.match(plan, /delegation decision is recorded/);
    assert.match(plan, /plan_delegation_actual_mode/);
    assert.match(plan, /Actual subagent startup must be authorized/);

    const build = await readFile(join(repoRoot, 'skills', 'build', 'SKILL.md'), 'utf8');
    assert.match(build, /Default review handoff after build readiness:/);
    assert.match(build, /\$review \.loopx\/workflows\/<slug>\/execution-record\.md/);
    assert.match(build, /Do not emit `\$review <slug>` as the primary skill handoff/);

    const review = await readFile(join(repoRoot, 'skills', 'review', 'SKILL.md'), 'utf8');
    assert.match(review, /Default implementation-fix handoff:/);
    assert.match(review, /\$build --from-review \.loopx\/workflows\/<slug>\/review-report\.md/);
    assert.match(review, /Next:\n\$archive <slug>/);
    assert.match(review, /Do not ask the user to run a separate `loopx approve <slug> --from review --to done` command/);
  });
});
