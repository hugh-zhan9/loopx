import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

import { LOOPX_BUNDLED_SKILLS, LOOPX_CANONICAL_WORKFLOW_SKILLS } from '../src/install-discovery.mjs';

const root = resolve(import.meta.dirname, '..');

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

test('canonical spec resources include design review without retired skill dependencies', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'loopx-spec-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const skillRoot = join(sandbox, 'skills', 'spec');
  await cp(join(root, 'skills', 'spec'), skillRoot, { recursive: true });
  await cp(join(root, 'skills', 'shared'), join(sandbox, 'skills', 'shared'), { recursive: true });
  await cp(join(root, 'skills', 'api-designer'), join(sandbox, 'skills', 'api-designer'), { recursive: true });

  const visited = new Set();
  async function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    // Template examples describe generated documents, not skill resource links.
    const text = (await readFile(path, 'utf8'))
      .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
      .replace(/`[^`\n]+`/g, '');
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const linkedPath = resolve(dirname(path), target);
      assert.ok(!relative(sandbox, linkedPath).startsWith('..'), `${path}: link escapes skill package`);
      await visit(linkedPath);
    }
  }
  await visit(join(skillRoot, 'SKILL.md'));
  for (const path of await markdownFiles(skillRoot)) {
    assert.ok(visited.has(path), `${relative(skillRoot, path)} cannot be discovered from SKILL.md`);
  }
});

test('canonical spec is published without trial or separate review entries', async () => {
  const canonical = await readFile(join(root, 'skills/spec/SKILL.md'), 'utf8');
  assert.match(canonical, /^name: spec$/m);
  assert.ok(LOOPX_CANONICAL_WORKFLOW_SKILLS.includes('spec'));
  assert.ok(LOOPX_BUNDLED_SKILLS.includes('spec'));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const retired of ['spec-v2', 'design-review', 'plan-reviewer']) {
    assert.ok(!LOOPX_BUNDLED_SKILLS.includes(retired));
    assert.ok(!pkg.files.includes(`skills/${retired}/`));
  }
});

test('read-only RPC candidate documents have navigable decisions and retained source coverage', async () => {
  const directory = join(root, 'evals/spec-v2/results/candidate');
  const documents = new Map();
  const decisionOwners = new Map();
  for (const path of await markdownFiles(directory)) {
    const text = await readFile(path, 'utf8');
    documents.set(path, text);
    for (const match of text.matchAll(/<a\s+id=["'](D-\d+)["']\s*><\/a>/g)) {
      assert.ok(!decisionOwners.has(match[1]), `${match[1]} has multiple maintained homes`);
      decisionOwners.set(match[1], path);
    }
  }
  assert.ok(decisionOwners.size > 0, 'the design needs implementation decision anchors');

  const linkedDecisions = new Set();
  for (const [path, text] of documents) {
    const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '').replace(/`[^`\n]+`/g, '');
    for (const match of prose.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const [file, fragment] = match[1].split('#');
      if (/^[a-z]+:/i.test(file)) continue;
      assert.ok(!file.startsWith('/'), 'collected document links must remain portable');
      const target = file ? resolve(dirname(path), decodeURIComponent(file)) : path;
      const targetText = await readFile(target, 'utf8');
      if (!fragment) continue;
      const id = decodeURIComponent(fragment);
      const anchors = [...targetText.matchAll(/<a\s+(?:id|name)=["']([^"']+)["']\s*><\/a>/g)]
        .map((entry) => entry[1]);
      // The fixture also exposes plain heading links (for example #acceptance).
      const headingCounts = new Map();
      for (const heading of targetText.matchAll(/^#{1,6}\s+(.+)$/gm)) {
        const slug = heading[1].toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-');
        const count = headingCounts.get(slug) ?? 0;
        headingCounts.set(slug, count + 1);
        anchors.push(count ? `${slug}-${count}` : slug);
      }
      assert.ok(anchors.includes(id), `${relative(directory, path)}: missing target ${match[1]}`);
      if (decisionOwners.has(id)) {
        assert.equal(target, decisionOwners.get(id), `${id} link must lead to its decision`);
        linkedDecisions.add(id);
      }
    }
  }
  assert.deepEqual([...linkedDecisions].sort(), [...decisionOwners.keys()].sort());
  const sourcePath = join(directory, 'source.md');
  assert.equal(documents.get(sourcePath), await readFile(join(root, 'evals/spec-v2/read-only-rpc.md'), 'utf8'));
  const sourceIds = new Set(documents.get(sourcePath).match(/\b(?:AC|TC)-\d+\b/g));
  const design = [...documents].filter(([path]) => path !== sourcePath).map(([, text]) => text).join('\n');
  for (const id of sourceIds) assert.ok(design.includes(id), `${id} is missing from the design`);
});
