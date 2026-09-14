import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const source = (path) => readFile(join(root, path), 'utf8');

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

test('skill instructions and references contain no callable retired skills', async () => {
  const retired = /\$(?:issue|fix|code-darwin|verify|design-review|plan-reviewer|clarify-v2|spec-v2|review|finish|final-review|fix-review|subagent-exec|parallel-subagent-exec)(?![\w-])|skills\/(?:issue|fix|code-darwin|verify|design-review|plan-reviewer|clarify-v2|spec-v2|review|finish|final-review|fix-review|subagent-exec|parallel-subagent-exec)\/SKILL\.md/g;
  const findings = [];
  for (const path of await markdownFiles(join(root, 'skills'))) {
    const text = await readFile(path, 'utf8');
    for (const match of text.matchAll(retired)) findings.push(`${path}: ${match[0]}`);
  }
  assert.deepEqual(findings, []);
});

test('the refactor RFC can guide implementation while delegated exec retains its schema', async () => {
  const template = await source('skills/refactor-plan/REFACTOR_PLAN_TEMPLATE.md');
  const readiness = template.match(/^\*\*Ready for:\*\* (.+)$/m)?.[1];
  assert.ok(readiness, 'RFC must identify its next consumer');
  const consumers = [...readiness.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  assert.ok(consumers.includes('implementation when authorized'));
  assert.ok(!consumers.includes('plan2exec'), 'a second plan is not mandatory');
  assert.ok(!consumers.includes('exec'), 'an RFC without a slice graph cannot enter exec');
  const producer = await source('skills/plan2exec/references/plan-schema.md');
  const executor = await source('skills/exec/SKILL.md');
  const schema = producer.match(/^schema: (\S+)$/m)?.[1];
  assert.ok(schema);
  assert.ok(executor.includes(`schema: ${schema}`));
});

test('review inputs include the document that owns overview-only decisions', async () => {
  const review = await source('skills/spec/references/design-review.md');
  assert.ok(review.includes('概要设计.md'), 'preserve overview-only decisions before revision');
  for (const path of ['plan2exec/SKILL.md', 'plan2exec/references/plan-review.md', 'exec/SKILL.md']) {
    assert.ok((await source(`skills/${path}`)).includes('概要设计.md'), `${path} must consume linked overview decisions`);
  }
});

test('repair recovery has distinct admission states and content attribution', async () => {
  const debug = await source('skills/debug/SKILL.md');
  const reference = debug.match(/\]\((references\/existing-ledgers\.md)\)/)?.[1];
  assert.ok(reference, 'recovery must have a discoverable contract');
  const recovery = await source(`skills/debug/${reference}`);
  const states = [...recovery.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]);
  for (const state of ['ready_for_fix', 'in_progress', 'needs_scope_change', 'blocked', 'complete']) {
    assert.ok(states.includes(state), `${state} needs an entry rule`);
  }
  assert.match(recovery, /staged and unstaged/);
  assert.match(recovery, /untracked\s+contents/);
  assert.match(recovery, /exact equality/);
  assert.match(recovery, /uncheckpointed interruption is not automatically recoverable/);
  assert.doesNotMatch(debug, /set ledger metadata `status: blocked`.*revise the Fix Brief/);
});
