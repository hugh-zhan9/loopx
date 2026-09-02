import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function source(path) {
  return readFile(join(repoRoot, path), 'utf8');
}

test('plan2exec produces a document contract without selecting an execution runtime', async () => {
  const [plan, schema, reviewer] = await Promise.all([
    source('skills/plan2exec/SKILL.md'),
    source('skills/plan2exec/references/plan-schema.md'),
    source('skills/plan-reviewer/SKILL.md'),
  ]);

  assert.match(plan, /plan is a\s+document contract/i);
  assert.match(plan, /does not run or schedule the plan/i);
  assert.match(schema, /depends: \[P-001\]/);
  assert.match(schema, /^> writes:/m);
  assert.match(schema, /^> verify:/m);
  assert.match(schema, /Execution rules for the consuming agent/i);
  assert.doesNotMatch(schema, /selected_profile|loopx\.execution-graph/);
  assert.match(reviewer, /does not edit the plan/i);
});

test('exec delegates implementation and keeps integration under the controller', async () => {
  const exec = await source('skills/exec/SKILL.md');
  const normalized = exec.replace(/\s+/g, ' ');

  assert.match(normalized, /does not author feature code or tests/i);
  assert.match(normalized, /Do not spawn or wait for other agents/i);
  assert.match(normalized, /Pass explicit model and effort values through the host API to every worker and reviewer/i);
  assert.match(normalized, /base identity and either an isolated-workspace locator plus candidate ref, or a complete unapplied patch/i);
  assert.match(normalized, /Never let concurrent workers edit the controller workspace directly/i);
  assert.match(normalized, /Review and integrate parallel results one at a time/i);
  assert.match(normalized, /dispatch one serial leaf worker to reconcile/i);
  assert.match(normalized, /Route a new product.*decision to `clarify` or `spec`/i);
  assert.match(normalized, /run `Integration And Final Verification`/i);
  assert.match(normalized, /Do not commit, push, merge, discard work/i);
});
