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
